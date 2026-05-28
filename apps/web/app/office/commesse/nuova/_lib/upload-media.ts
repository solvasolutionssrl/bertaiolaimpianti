import type { MediaFile } from '../_components/media-attach-section';
import { compressImage } from './compress-image';
import type {
  CompletePartInfo,
  InitResponse,
} from '../../../../_lib/media-upload-types';

export interface UploadMediaResult {
  id: string;
  name: string;
  ok: boolean;
  error?: string;
  fileRefId?: string;
}

export type UploadProgressStep = 'compressing' | 'uploading' | 'processing' | 'done' | 'error';

export type UploadProgressMap = Map<
  string,
  { pct: number; step: UploadProgressStep }
>;

/**
 * Carica un batch di file media via R2 staging (Fase 1).
 *
 * Flusso per ciascun file:
 *   1. POST /api/upload/media/init  → presigned URL R2 (single PUT o multipart)
 *   2. PUT diretto su R2            → bypassa il limite 4.5 MB di Vercel
 *   3. POST /api/upload/media/[id]/complete → server marca uploaded
 *
 * Strategia batch:
 *  - Immagini: compressione client-side (Canvas) poi upload parallelo max 3
 *  - Video: upload sequenziale (file grandi, evita pressione di memoria/banda)
 *  - Ogni file: 2 retry automatici su errore rete, backoff 2s / 5s
 *  - signal: AbortSignal per cancel — ferma il file corrente, marca gli altri 'Annullato'
 *
 * Progress mapping:
 *   0–90%  = upload effettivo verso R2 (xhr.upload.onprogress)
 *  90–99%  = chiamata complete (server HEAD + completeMultipart)
 *    100%  = file_refs.status = 'uploaded'
 */
export async function uploadMediaBatch(
  files: MediaFile[],
  commessaId: string,
  onProgress: (progress: UploadProgressMap) => void,
  signal?: AbortSignal,
): Promise<UploadMediaResult[]> {
  const progress: UploadProgressMap = new Map(
    files.map((f) => [f.id, { pct: 0, step: 'compressing' as const }]),
  );
  const notify = () => onProgress(new Map(progress));

  const images = files.filter((f) => f.kind === 'image');
  const videos = files.filter((f) => f.kind === 'video');
  const results: UploadMediaResult[] = [];
  const compressed = new Map<string, File>();

  // Step 1: comprimi tutte le immagini in parallelo
  await Promise.all(
    images.map(async (mf) => {
      if (signal?.aborted) return;
      progress.set(mf.id, { pct: 0, step: 'compressing' });
      notify();
      const out = await compressImage(mf.file);
      compressed.set(mf.id, out);
      progress.set(mf.id, { pct: 0, step: 'uploading' });
      notify();
    }),
  );
  for (const mf of videos) {
    compressed.set(mf.id, mf.file);
    progress.set(mf.id, { pct: 0, step: 'uploading' });
  }
  notify();

  if (signal?.aborted) {
    files.forEach((mf) => progress.set(mf.id, { pct: 0, step: 'error' }));
    notify();
    return files.map((mf) => ({ id: mf.id, name: mf.file.name, ok: false, error: 'Annullato' }));
  }

  // Step 2: upload immagini (concorrenza = 3)
  await runConcurrent(
    images.map((mf) => async () => {
      if (signal?.aborted) {
        progress.set(mf.id, { pct: 0, step: 'error' });
        results.push({ id: mf.id, name: mf.file.name, ok: false, error: 'Annullato' });
        return;
      }
      const r = await uploadOneWithRetry(
        mf,
        compressed.get(mf.id) ?? mf.file,
        commessaId,
        (pct, step) => {
          progress.set(mf.id, { pct, step: step ?? 'uploading' });
          notify();
        },
        signal,
        2,
        mf.takenAt ? mf.takenAt.toISOString() : null,
      );
      progress.set(mf.id, { pct: 1, step: r.ok ? 'done' : 'error' });
      notify();
      results.push(r);
    }),
    3,
  );

  // Step 3: upload video in sequenza
  for (const mf of videos) {
    if (signal?.aborted) {
      progress.set(mf.id, { pct: 0, step: 'error' });
      results.push({ id: mf.id, name: mf.file.name, ok: false, error: 'Annullato' });
      continue;
    }
    const r = await uploadOneWithRetry(
      mf,
      mf.file,
      commessaId,
      (pct, step) => {
        progress.set(mf.id, { pct, step: step ?? 'uploading' });
        notify();
      },
      signal,
      2,
      mf.takenAt ? mf.takenAt.toISOString() : null,
    );
    progress.set(mf.id, { pct: 1, step: r.ok ? 'done' : 'error' });
    notify();
    results.push(r);
  }

  return results;
}

async function uploadOneWithRetry(
  mf: MediaFile,
  file: File,
  commessaId: string,
  onProgress: (pct: number, step?: UploadProgressStep) => void,
  signal?: AbortSignal,
  maxRetries = 2,
  takenAtIso?: string | null,
): Promise<UploadMediaResult> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      return { id: mf.id, name: mf.file.name, ok: false, error: 'Annullato' };
    }
    if (attempt > 0) {
      onProgress(0, 'uploading');
      await new Promise<void>((res, rej) => {
        const t = setTimeout(res, attempt === 1 ? 2000 : 5000);
        signal?.addEventListener('abort', () => { clearTimeout(t); rej(new Error('Annullato')); }, { once: true });
      }).catch(() => null);
      if (signal?.aborted) {
        return { id: mf.id, name: mf.file.name, ok: false, error: 'Annullato' };
      }
    }
    try {
      const fileRefId = await r2Upload(
        file,
        commessaId,
        onProgress,
        signal,
        takenAtIso ?? null,
      );
      return { id: mf.id, name: mf.file.name, ok: true, fileRefId };
    } catch (e) {
      const isAbort = e instanceof DOMException && e.name === 'AbortError';
      if (isAbort) {
        return { id: mf.id, name: mf.file.name, ok: false, error: 'Annullato' };
      }
      if (attempt === maxRetries) {
        return {
          id: mf.id,
          name: mf.file.name,
          ok: false,
          error: e instanceof Error ? e.message : 'Upload fallito',
        };
      }
    }
  }
  return { id: mf.id, name: mf.file.name, ok: false, error: 'Unexpected' };
}

/**
 * Esegue il flusso init → PUT/multipart su R2 → complete per un singolo file.
 * Ritorna il fileRefId al successo.
 */
async function r2Upload(
  file: File,
  commessaId: string,
  onProgress: (pct: number, step?: UploadProgressStep) => void,
  signal?: AbortSignal,
  takenAtIso?: string | null,
): Promise<string> {
  // 1. init
  const initRes = await fetch('/api/upload/media/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commessaId,
      momento: 'sopralluogo',
      filename: file.name,
      mime: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      takenAtIso: takenAtIso ?? null,
    }),
    signal,
  });
  if (!initRes.ok) {
    const t = await initRes.text();
    throw new Error(`init ${initRes.status}: ${t.slice(0, 200)}`);
  }
  const init = (await initRes.json()) as InitResponse;

  // 2. upload su R2
  const completedParts: CompletePartInfo[] = [];
  try {
    if (init.mode === 'single') {
      await putToR2(file, init.uploadUrl, signal, (loaded) => {
        onProgress((loaded / file.size) * 0.9, 'uploading');
      });
    } else {
      const partSize = init.partSize;
      const parts = init.parts;
      const loaded = new Array<number>(parts.length).fill(0);
      const reportProgress = () => {
        const sum = loaded.reduce((a, b) => a + b, 0);
        onProgress((sum / file.size) * 0.9, 'uploading');
      };
      let nextIdx = 0;
      const concurrency = 3;
      const runWorker = async () => {
        while (true) {
          if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
          const idx = nextIdx++;
          if (idx >= parts.length) return;
          const part = parts[idx]!;
          const start = idx * partSize;
          const end = Math.min(start + partSize, file.size);
          const blob = file.slice(start, end);
          const etag = await putPartToR2(blob, part.url, signal, (l) => {
            loaded[idx] = l;
            reportProgress();
          });
          completedParts.push({ partNumber: part.partNumber, etag });
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(concurrency, parts.length) }, runWorker),
      );
    }
  } catch (e) {
    // Best-effort abort lato server (idempotente)
    fetch(`/api/upload/media/${init.fileRefId}/abort`, {
      method: 'POST',
      keepalive: true,
    }).catch(() => {});
    throw e;
  }

  // 3. complete
  onProgress(0.92, 'processing');
  const completeRes = await fetch(`/api/upload/media/${init.fileRefId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parts: init.mode === 'multipart' ? completedParts : undefined,
    }),
    signal,
  });
  if (!completeRes.ok) {
    const t = await completeRes.text();
    throw new Error(`complete ${completeRes.status}: ${t.slice(0, 200)}`);
  }
  onProgress(1, 'done');
  return init.fileRefId;
}

function putToR2(
  file: Blob,
  url: string,
  signal: AbortSignal | undefined,
  onProgress: (loaded: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    signal?.addEventListener('abort', onAbort);

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(ev.loaded);
    };
    xhr.onload = () => {
      signal?.removeEventListener('abort', onAbort);
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`R2 PUT ${xhr.status}: ${xhr.responseText.slice(0, 200)}`));
    };
    xhr.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new Error('R2 PUT network error'));
    };
    xhr.onabort = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('aborted', 'AbortError'));
    };

    xhr.open('PUT', url, true);
    if (file.type) xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}

function putPartToR2(
  blob: Blob,
  url: string,
  signal: AbortSignal | undefined,
  onProgress: (loaded: number) => void,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    signal?.addEventListener('abort', onAbort);

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(ev.loaded);
    };
    xhr.onload = () => {
      signal?.removeEventListener('abort', onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = (xhr.getResponseHeader('etag') ?? '').replace(/^"|"$/g, '');
        if (!etag) {
          reject(new Error('R2 part: ETag mancante (CORS ExposeHeaders["ETag"]?)'));
          return;
        }
        resolve(etag);
      } else {
        reject(new Error(`R2 part ${xhr.status}: ${xhr.responseText.slice(0, 200)}`));
      }
    };
    xhr.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new Error('R2 part network error'));
    };
    xhr.onabort = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('aborted', 'AbortError'));
    };

    xhr.open('PUT', url, true);
    xhr.send(blob);
  });
}

async function runConcurrent(
  tasks: Array<() => Promise<void>>,
  limit: number,
): Promise<void> {
  const queue = [...tasks];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      if (task) await task();
    }
  });
  await Promise.all(workers);
}
