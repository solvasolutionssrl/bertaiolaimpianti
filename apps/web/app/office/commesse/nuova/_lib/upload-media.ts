import type { MediaFile } from '../_components/media-attach-section';
import { compressImage } from './compress-image';

export interface UploadMediaResult {
  id: string;
  name: string;
  ok: boolean;
  error?: string;
}

export type UploadProgressStep = 'compressing' | 'uploading' | 'processing' | 'done' | 'error';

export type UploadProgressMap = Map<
  string,
  { pct: number; step: UploadProgressStep }
>;

/**
 * Carica un batch di file media verso /api/upload/media.
 *
 * Strategia:
 *  - Immagini: compressione client-side (Canvas) poi upload parallelo max 3
 *  - Video: upload sequenziale (file grandi, evitiamo pressione di memoria)
 *  - Ogni file: 2 retry automatici su errore rete, backoff 2s / 5s
 *  - signal: AbortSignal per cancel — ferma il file corrente e marca gli altri come 'error'
 *
 * Progress bifasico per video:
 *  0–80% = browser → Vercel (upload.onprogress)
 *  80–99% = Vercel → Nextcloud streaming (server processing)
 *  100%   = risposta server ricevuta (onload 2xx)
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
): Promise<UploadMediaResult> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      return { id: mf.id, name: mf.file.name, ok: false, error: 'Annullato' };
    }
    if (attempt > 0) {
      onProgress(0, 'uploading');
      // backoff interrompibile se arriva abort
      await new Promise<void>((res, rej) => {
        const t = setTimeout(res, attempt === 1 ? 2000 : 5000);
        signal?.addEventListener('abort', () => { clearTimeout(t); rej(new Error('Annullato')); }, { once: true });
      }).catch(() => null);
      if (signal?.aborted) {
        return { id: mf.id, name: mf.file.name, ok: false, error: 'Annullato' };
      }
    }
    try {
      await xhrUpload(file, commessaId, onProgress, signal);
      return { id: mf.id, name: mf.file.name, ok: true };
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

function xhrUpload(
  file: File,
  commessaId: string,
  onProgress: (pct: number, step?: UploadProgressStep) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const isVideo = file.type.startsWith('video/');
    const params = new URLSearchParams({ commessaId, momento: 'sopralluogo' });

    xhr.open('POST', `/api/upload/media?${params.toString()}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
    // Fallback content-length: alcuni proxy Vercel strippano il header,
    // il server lo usa come fallback per Content-Length su Nextcloud PUT.
    xhr.setRequestHeader('X-File-Size', String(file.size));

    // Timeout separato per video: su LTE 5 Mbps un video da 300 MB
    // impiega ~480s solo per l'invio → il vecchio 280s causava timeout sistematici.
    // Per video: 900s (15 min) coprono file fino a ~500 MB anche su rete lenta.
    // Per immagini già compresse: 120s è abbondante.
    xhr.timeout = isVideo ? 900_000 : 120_000;

    // Progress BIFASICO:
    //   0→80%  = browser invia a Vercel (upload.onprogress)
    //  80→99%  = Vercel streamma su Nextcloud (processing, nessun progresso misurabile)
    //    100%  = server risponde 2xx
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress((e.loaded / e.total) * 0.8, 'uploading');
      }
    };
    // Il browser ha finito di inviare → server sta elaborando
    xhr.upload.onload = () => {
      onProgress(0.85, 'processing');
    };

    xhr.onload = () => {
      signal?.removeEventListener('abort', abortHandler);
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
    xhr.ontimeout = () =>
      reject(
        new Error(
          isVideo
            ? 'Video troppo grande o connessione troppo lenta — prova in WiFi o riduci la qualità (Impostazioni → Fotocamera → Alta efficienza)'
            : 'Upload scaduto — riprova con connessione migliore',
        ),
      );

    const abortHandler = () => {
      xhr.abort();
      reject(new DOMException('Upload annullato', 'AbortError'));
    };
    signal?.addEventListener('abort', abortHandler, { once: true });
    xhr.onabort = () => {
      signal?.removeEventListener('abort', abortHandler);
      reject(new DOMException('Upload annullato', 'AbortError'));
    };

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
