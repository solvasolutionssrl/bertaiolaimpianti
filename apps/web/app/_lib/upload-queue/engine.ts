/**
 * Engine di upload R2: init → PUT/multipart → complete.
 *
 * Estratto dalla logica di useChunkedUpload e generalizzato per essere
 * invocato dal worker della UploadQueue (background, non legato a un
 * componente React). Mantiene esattamente le stesse contractual API
 * verso il server (init, complete, abort).
 */

import type {
  CompletePartInfo,
  CompleteRequestBody,
  CompleteResponse,
  InitRequestBody,
  InitResponse,
} from '../media-upload-types';

const DEFAULT_SHA256_MAX = 100 * 1024 * 1024; // 100 MB
const DEFAULT_CONCURRENCY = 3;

export interface RunUploadOptions {
  /** Concorrenza per i part upload multipart. */
  multipartConcurrency?: number;
  /** Calcola SHA-256 client se size ≤ questa soglia. */
  sha256MaxBytes?: number;
  /** AbortController esterno: il chiamante può cancellare il job. */
  abort: AbortController;
  /** Callback bytes caricati totali (per il progress). */
  onProgress: (bytesUploaded: number) => void;
  /** Callback quando il server emette il fileRefId (init OK). */
  onFileRefId: (fileRefId: string) => void;
  /** Callback transizione di fase (per UI). */
  onPhase: (phase: 'init' | 'uploading' | 'finalizing') => void;
}

export interface RunUploadResult {
  fileRefId: string;
  sizeBytes: number;
}

export interface UploadInputForEngine {
  file: Blob;
  fileName: string;
  fileMime: string;
  fileSize: number;
  commessaId: string;
  momento?: 'sopralluogo' | 'in_corso' | 'finale' | null;
  voceId?: number | null;
  riunioneId?: string | null;
  kind?: 'foto' | 'video' | 'pdf_acquisito' | null;
  geoLat?: number | null;
  geoLng?: number | null;
  takenAtIso?: string | null;
}

/**
 * Esegue un singolo upload end-to-end. Idempotente lato server:
 * un retry chiama di nuovo /init (nuovo fileRefId) — il server tollera.
 * Per riprese vere di multipart già parziale si vedrà in iterazione 2.
 */
export async function runUpload(
  input: UploadInputForEngine,
  options: RunUploadOptions,
): Promise<RunUploadResult> {
  const concurrency = Math.max(1, options.multipartConcurrency ?? DEFAULT_CONCURRENCY);
  const sha256MaxBytes = options.sha256MaxBytes ?? DEFAULT_SHA256_MAX;
  const { abort, onProgress, onFileRefId, onPhase } = options;

  const xhrs = new Set<XMLHttpRequest>();
  const cleanup = () => {
    for (const xhr of xhrs) {
      try {
        xhr.abort();
      } catch {}
    }
    xhrs.clear();
  };
  abort.signal.addEventListener('abort', cleanup, { once: true });

  // 1) INIT
  onPhase('init');
  const initBody: InitRequestBody & {
    riunioneId?: string | null;
    kind?: 'foto' | 'video' | 'pdf_acquisito' | null;
    takenAtIso?: string | null;
  } = {
    commessaId: input.commessaId,
    momento: input.momento ?? undefined,
    voceId: input.voceId ?? null,
    filename: input.fileName,
    mime: input.fileMime || 'application/octet-stream',
    sizeBytes: input.fileSize,
    geoLat: input.geoLat ?? null,
    geoLng: input.geoLng ?? null,
    riunioneId: input.riunioneId ?? null,
    kind: input.kind ?? null,
    takenAtIso: input.takenAtIso ?? null,
  };
  const initRes = await fetch('/api/upload/media/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(initBody),
    signal: abort.signal,
  });
  if (!initRes.ok) {
    const t = await initRes.text();
    throw new Error(`init ${initRes.status}: ${t.slice(0, 200)}`);
  }
  const init = (await initRes.json()) as InitResponse;
  onFileRefId(init.fileRefId);

  // 2) UPLOAD
  onPhase('uploading');
  const completedParts: CompletePartInfo[] = [];

  if (init.mode === 'single') {
    await uploadSinglePut(
      input.file,
      init.uploadUrl,
      abort.signal,
      xhrs,
      (loaded) => onProgress(loaded),
    );
  } else {
    const partSize = init.partSize;
    const parts = init.parts;
    const perPartLoaded = new Array<number>(parts.length).fill(0);

    const reportProgress = () => {
      const sum = perPartLoaded.reduce((a, b) => a + b, 0);
      onProgress(sum);
    };

    let nextIdx = 0;
    const runWorker = async () => {
      while (true) {
        if (abort.signal.aborted) {
          throw new DOMException('aborted', 'AbortError');
        }
        const idx = nextIdx++;
        if (idx >= parts.length) return;
        const part = parts[idx]!;
        const start = idx * partSize;
        const end = Math.min(start + partSize, input.fileSize);
        const blob = input.file.slice(start, end);
        const etag = await uploadPart(
          part.url,
          blob,
          abort.signal,
          xhrs,
          (loaded) => {
            perPartLoaded[idx] = loaded;
            reportProgress();
          },
        );
        completedParts.push({ partNumber: part.partNumber, etag });
      }
    };

    const workers = Array.from(
      { length: Math.min(concurrency, parts.length) },
      runWorker,
    );
    await Promise.all(workers);
  }

  // 3) FINALIZE: SHA-256 client se size piccolo, poi /complete.
  onPhase('finalizing');
  onProgress(input.fileSize);
  let sha256Hex: string | undefined;
  if (input.fileSize <= sha256MaxBytes) {
    sha256Hex = await sha256OfBlob(input.file);
  }

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
    throw new Error(`complete ${completeRes.status}: ${t.slice(0, 200)}`);
  }
  const completed = (await completeRes.json()) as CompleteResponse;

  return { fileRefId: completed.fileRefId, sizeBytes: completed.sizeBytes };
}

/** Notifica al server che un job è fallito/cancellato — best-effort. */
export function notifyAbortToServer(fileRefId: string): void {
  fetch(`/api/upload/media/${fileRefId}/abort`, {
    method: 'POST',
    keepalive: true,
  }).catch(() => {});
}

// --------------------------------------------------------------------------
// XHR helpers (estratti dall'hook originale)
// --------------------------------------------------------------------------

function uploadSinglePut(
  blob: Blob,
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
        reject(
          new Error(
            `R2 PUT ${xhr.status}: ${(xhr.responseText ?? '').slice(0, 200)}`,
          ),
        );
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
    if (blob.type) xhr.setRequestHeader('Content-Type', blob.type);
    xhr.send(blob);
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
          reject(new Error('R2 part: ETag mancante (verifica CORS ExposeHeaders)'));
          return;
        }
        resolve(etag);
      } else {
        reject(
          new Error(
            `R2 part ${xhr.status}: ${(xhr.responseText ?? '').slice(0, 200)}`,
          ),
        );
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

async function sha256OfBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hashBuf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
