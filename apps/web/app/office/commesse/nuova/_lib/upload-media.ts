import type { MediaFile } from '../_components/media-attach-section';
import { compressImage } from './compress-image';

export interface UploadMediaResult {
  id: string;
  name: string;
  ok: boolean;
  error?: string;
}

export type UploadProgressMap = Map<
  string,
  { pct: number; step: 'compressing' | 'uploading' | 'done' | 'error' }
>;

/**
 * Carica un batch di file media verso /api/upload/media.
 *
 * Strategia:
 *  - Immagini: compressione client-side (Canvas) poi upload parallelo max 3
 *  - Video: upload sequenziale (file grandi, evitiamo pressione di memoria)
 *  - Ogni file: 2 retry automatici su errore rete, backoff 2s / 5s
 *  - onProgress: chiamata con Map aggiornata ad ogni cambio stato
 */
export async function uploadMediaBatch(
  files: MediaFile[],
  commessaId: string,
  onProgress: (progress: UploadProgressMap) => void,
): Promise<UploadMediaResult[]> {
  const progress: UploadProgressMap = new Map(
    files.map((f) => [f.id, { pct: 0, step: 'compressing' as const }]),
  );
  const notify = () => onProgress(new Map(progress));

  const images = files.filter((f) => f.kind === 'image');
  const videos = files.filter((f) => f.kind === 'video');
  const results: UploadMediaResult[] = [];
  const compressed = new Map<string, File>();

  // Step 1: compress all images in parallel (fast, < 1s each)
  await Promise.all(
    images.map(async (mf) => {
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

  // Step 2: upload images with concurrency = 3
  await runConcurrent(
    images.map((mf) => async () => {
      const r = await uploadOneWithRetry(
        mf,
        compressed.get(mf.id) ?? mf.file,
        commessaId,
        (pct) => { progress.set(mf.id, { pct, step: 'uploading' }); notify(); },
      );
      progress.set(mf.id, { pct: 1, step: r.ok ? 'done' : 'error' });
      notify();
      results.push(r);
    }),
    3,
  );

  // Step 3: upload videos sequentially
  for (const mf of videos) {
    const r = await uploadOneWithRetry(
      mf,
      mf.file,
      commessaId,
      (pct) => { progress.set(mf.id, { pct, step: 'uploading' }); notify(); },
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
  onProgress: (pct: number) => void,
  maxRetries = 2,
): Promise<UploadMediaResult> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      onProgress(0);
      await new Promise<void>((r) => setTimeout(r, attempt === 1 ? 2000 : 5000));
    }
    try {
      await xhrUpload(file, commessaId, onProgress);
      return { id: mf.id, name: mf.file.name, ok: true };
    } catch (e) {
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

function xhrUpload(
  file: File,
  commessaId: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const params = new URLSearchParams({ commessaId, momento: 'sopralluogo' });
    xhr.open('POST', `/api/upload/media?${params.toString()}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
    xhr.timeout = 280_000; // 280s — sotto il limite Vercel 300s

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        let msg = `HTTP ${xhr.status}`;
        try {
          msg = (JSON.parse(xhr.responseText) as { error?: string }).error ?? msg;
        } catch { /* empty */ }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('Errore di rete durante upload'));
    xhr.ontimeout = () => reject(new Error('Upload scaduto — riprova con connessione migliore'));
    xhr.send(file);
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
