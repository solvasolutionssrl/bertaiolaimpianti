'use client';

import { useCallback, useRef, useState } from 'react';

import type {
  CompletePartInfo,
  CompleteRequestBody,
  CompleteResponse,
  InitRequestBody,
  InitResponse,
  Momento,
} from './media-upload-types';

export type UploadPhase = 'idle' | 'init' | 'uploading' | 'finalizing' | 'done' | 'failed' | 'aborted';

export interface UploadState {
  phase: UploadPhase;
  progressPct: number; // 0..100, riferito alla fase 'uploading'
  bytesUploaded: number;
  bytesTotal: number;
  fileRefId: string | null;
  error: string | null;
}

export interface UploadInput {
  file: File;
  commessaId: string;
  momento?: Momento;
  voceId?: number | null;
  /** Override filename inviato a init (default: file.name). */
  filename?: string;
  geoLat?: number | null;
  geoLng?: number | null;
}

export interface UploadOptions {
  /** Concorrenza max per multipart (default 3). */
  multipartConcurrency?: number;
  /** Calcola SHA-256 solo se size ≤ questa soglia (default 100 MB). */
  sha256MaxBytes?: number;
}

const DEFAULT_SHA256_MAX = 100 * 1024 * 1024;

interface ActiveUploadRef {
  abort: AbortController;
  xhrs: Set<XMLHttpRequest>;
  fileRefId: string | null;
}

/**
 * Hook unico per upload media via R2 staging (Fase 1).
 *
 * Flusso interno:
 *   init → presigned URL(s) → PUT/multipart su R2 → complete
 *
 * Progress: si riferisce alla fase 'uploading'. Le fasi 'init' e 'finalizing'
 * sono rapide ma chi consuma può mostrare uno spinner extra se desidera.
 *
 * SHA-256 lato client: calcolato solo per file ≤ sha256MaxBytes (default 100 MB)
 * via crypto.subtle.digest. Per file maggiori si rimanda al worker di Fase 2.
 */
export function useChunkedUpload(options: UploadOptions = {}) {
  const concurrency = Math.max(1, options.multipartConcurrency ?? 3);
  const sha256MaxBytes = options.sha256MaxBytes ?? DEFAULT_SHA256_MAX;

  const [state, setState] = useState<UploadState>({
    phase: 'idle',
    progressPct: 0,
    bytesUploaded: 0,
    bytesTotal: 0,
    fileRefId: null,
    error: null,
  });

  const activeRef = useRef<ActiveUploadRef | null>(null);

  const cancel = useCallback(async () => {
    const active = activeRef.current;
    if (!active) return;
    active.abort.abort();
    for (const xhr of active.xhrs) {
      try {
        xhr.abort();
      } catch {}
    }
    if (active.fileRefId) {
      // Best-effort: avvisa il server (idempotente)
      fetch(`/api/upload/media/${active.fileRefId}/abort`, {
        method: 'POST',
        keepalive: true,
      }).catch(() => {});
    }
    setState((s) => ({ ...s, phase: 'aborted', error: 'Annullato dall\'utente' }));
  }, []);

  const upload = useCallback(
    async (input: UploadInput): Promise<{ fileRefId: string; sizeBytes: number }> => {
      const file = input.file;
      const sizeBytes = file.size;

      const abort = new AbortController();
      const active: ActiveUploadRef = { abort, xhrs: new Set(), fileRefId: null };
      activeRef.current = active;

      setState({
        phase: 'init',
        progressPct: 0,
        bytesUploaded: 0,
        bytesTotal: sizeBytes,
        fileRefId: null,
        error: null,
      });

      try {
        // 1. INIT
        const initBody: InitRequestBody = {
          commessaId: input.commessaId,
          momento: input.momento,
          voceId: input.voceId ?? null,
          filename: input.filename ?? file.name,
          mime: file.type || 'application/octet-stream',
          sizeBytes,
          geoLat: input.geoLat ?? null,
          geoLng: input.geoLng ?? null,
        };

        const initRes = await fetch('/api/upload/media/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(initBody),
          signal: abort.signal,
        });
        if (!initRes.ok) {
          const t = await initRes.text();
          throw new Error(`init failed (${initRes.status}): ${t.slice(0, 200)}`);
        }
        const init = (await initRes.json()) as InitResponse;
        active.fileRefId = init.fileRefId;
        setState((s) => ({ ...s, fileRefId: init.fileRefId, phase: 'uploading' }));

        // 2. UPLOAD
        const completedParts: CompletePartInfo[] = [];
        if (init.mode === 'single') {
          await uploadSinglePut(file, init.uploadUrl, abort.signal, active.xhrs, (loaded) => {
            setState((s) => ({
              ...s,
              bytesUploaded: loaded,
              progressPct: Math.floor((loaded / sizeBytes) * 100),
            }));
          });
        } else {
          // multipart: carica i pezzi in parallelo (concurrency)
          const partSize = init.partSize;
          const parts = init.parts;
          const perPartLoaded = new Array<number>(parts.length).fill(0);

          const reportProgress = () => {
            const sum = perPartLoaded.reduce((a, b) => a + b, 0);
            setState((s) => ({
              ...s,
              bytesUploaded: sum,
              progressPct: Math.floor((sum / sizeBytes) * 100),
            }));
          };

          let nextIdx = 0;
          const runWorker = async () => {
            while (true) {
              if (abort.signal.aborted) throw new DOMException('aborted', 'AbortError');
              const idx = nextIdx++;
              if (idx >= parts.length) return;
              const part = parts[idx]!;
              const start = idx * partSize;
              const end = Math.min(start + partSize, sizeBytes);
              const blob = file.slice(start, end);
              const etag = await uploadPart(part.url, blob, abort.signal, active.xhrs, (loaded) => {
                perPartLoaded[idx] = loaded;
                reportProgress();
              });
              completedParts.push({ partNumber: part.partNumber, etag });
            }
          };

          const workers = Array.from({ length: Math.min(concurrency, parts.length) }, runWorker);
          await Promise.all(workers);
        }

        // 3. SHA-256 (opzionale)
        setState((s) => ({ ...s, phase: 'finalizing', progressPct: 100 }));
        let sha256Hex: string | undefined;
        if (sizeBytes <= sha256MaxBytes) {
          sha256Hex = await sha256OfFile(file);
        }

        // 4. COMPLETE
        const completeBody: CompleteRequestBody = {
          sha256Hex,
          parts: init.mode === 'multipart' ? completedParts : undefined,
        };
        const completeRes = await fetch(`/api/upload/media/${init.fileRefId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(completeBody),
          signal: abort.signal,
        });
        if (!completeRes.ok) {
          const t = await completeRes.text();
          throw new Error(`complete failed (${completeRes.status}): ${t.slice(0, 200)}`);
        }
        const completed = (await completeRes.json()) as CompleteResponse;

        setState({
          phase: 'done',
          progressPct: 100,
          bytesUploaded: completed.sizeBytes,
          bytesTotal: completed.sizeBytes,
          fileRefId: completed.fileRefId,
          error: null,
        });

        activeRef.current = null;
        return { fileRefId: completed.fileRefId, sizeBytes: completed.sizeBytes };
      } catch (e) {
        const aborted = abort.signal.aborted;
        const msg = e instanceof Error ? e.message : 'errore sconosciuto';
        if (aborted) {
          // abort già notificato in cancel()
          throw new Error('Upload annullato');
        }
        // Best-effort abort lato server se abbiamo già un fileRefId
        if (active.fileRefId) {
          fetch(`/api/upload/media/${active.fileRefId}/abort`, {
            method: 'POST',
            keepalive: true,
          }).catch(() => {});
        }
        setState((s) => ({ ...s, phase: 'failed', error: msg }));
        activeRef.current = null;
        throw e;
      }
    },
    [concurrency, sha256MaxBytes],
  );

  return { state, upload, cancel };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uploadSinglePut(
  file: Blob,
  url: string,
  signal: AbortSignal,
  xhrs: Set<XMLHttpRequest>,
  onProgress: (loaded: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhrs.add(xhr);

    const onAbort = () => xhr.abort();
    signal.addEventListener('abort', onAbort);

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(ev.loaded);
    };
    xhr.onload = () => {
      xhrs.delete(xhr);
      signal.removeEventListener('abort', onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = (xhr.getResponseHeader('etag') ?? '').replace(/^"|"$/g, '');
        resolve(etag);
      } else {
        reject(new Error(`R2 PUT ${xhr.status}: ${xhr.responseText.slice(0, 200)}`));
      }
    };
    xhr.onerror = () => {
      xhrs.delete(xhr);
      signal.removeEventListener('abort', onAbort);
      reject(new Error('R2 PUT network error'));
    };
    xhr.onabort = () => {
      xhrs.delete(xhr);
      signal.removeEventListener('abort', onAbort);
      reject(new DOMException('aborted', 'AbortError'));
    };

    xhr.open('PUT', url, true);
    if (file.type) xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}

function uploadPart(
  url: string,
  blob: Blob,
  signal: AbortSignal,
  xhrs: Set<XMLHttpRequest>,
  onProgress: (loaded: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhrs.add(xhr);

    const onAbort = () => xhr.abort();
    signal.addEventListener('abort', onAbort);

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(ev.loaded);
    };
    xhr.onload = () => {
      xhrs.delete(xhr);
      signal.removeEventListener('abort', onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = (xhr.getResponseHeader('etag') ?? '').replace(/^"|"$/g, '');
        if (!etag) {
          reject(new Error('R2 part upload: ETag mancante (verifica CORS ExposeHeaders)'));
          return;
        }
        resolve(etag);
      } else {
        reject(new Error(`R2 part ${xhr.status}: ${xhr.responseText.slice(0, 200)}`));
      }
    };
    xhr.onerror = () => {
      xhrs.delete(xhr);
      signal.removeEventListener('abort', onAbort);
      reject(new Error('R2 part network error'));
    };
    xhr.onabort = () => {
      xhrs.delete(xhr);
      signal.removeEventListener('abort', onAbort);
      reject(new DOMException('aborted', 'AbortError'));
    };

    xhr.open('PUT', url, true);
    xhr.send(blob);
  });
}

async function sha256OfFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hashBuf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
