/**
 * Wrapper IndexedDB minimale per la upload queue.
 *
 * DB: `kommessa-uploads`, due store:
 *   - `jobs`  → metadati del job (keyPath: id), **senza il blob**
 *   - `blobs` → il file vero e proprio (keyPath: id), scritto UNA SOLA VOLTA
 *
 * ─── Perché due store (correzione 30/07/2026) ─────────────────────────────
 * Prima c'era un unico store e il record conteneva `payload.fileBlob`. Siccome
 * `updateJob` persisteva a **ogni evento di progresso**, per un video da 300 MB
 * si aprivano decine di transazioni readwrite al secondo che riscrivevano il
 * blob intero: disk thrash, pressione di memoria e stalli dell'upload che
 * avrebbero dovuto sostenere. Separando i due store, i cambi di stato scrivono
 * poche centinaia di byte e il file si scrive una volta sola all'accodamento.
 *
 * L'upgrade da v1 è retrocompatibile: i vecchi record hanno ancora il blob
 * dentro `payload` e vengono letti comunque (vedi `getAllJobs`).
 */

import type { UploadJob } from './types';

const DB_NAME = 'kommessa-uploads';
const DB_VERSION = 2;
const STORE_JOBS = 'jobs';
const STORE_BLOBS = 'blobs';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_JOBS)) {
        const store = db.createObjectStore(STORE_JOBS, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
    req.onblocked = () => reject(new Error('IDB blocked (close other tabs)'));
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IDB request failed'));
      }),
  );
}

interface RecordBlob {
  id: string;
  blob: Blob;
}

/** Scrive i METADATI del job. Il blob non viene toccato. */
export async function putJob(job: UploadJob): Promise<void> {
  const { fileBlob: _scartato, ...payloadSenzaBlob } = job.payload;
  const record = { ...job, payload: payloadSenzaBlob };
  await tx(STORE_JOBS, 'readwrite', (s) => s.put(record));
}

/** Scrive il file. Da chiamare UNA volta sola, all'accodamento. */
export async function putBlob(id: string, blob: Blob): Promise<void> {
  await tx<IDBValidKey>(STORE_BLOBS, 'readwrite', (s) => s.put({ id, blob }));
}

export async function deleteJob(id: string): Promise<void> {
  await tx(STORE_JOBS, 'readwrite', (s) => s.delete(id));
  try {
    await tx(STORE_BLOBS, 'readwrite', (s) => s.delete(id));
  } catch {
    /* il blob potrebbe non esserci (record v1): non è un errore */
  }
}

/**
 * Ricarica i job persistiti riattaccando il blob.
 * I job il cui file non è più recuperabile vengono scartati (e ripuliti):
 * senza byte non c'è niente da caricare.
 */
export async function getAllJobs(): Promise<UploadJob[]> {
  const metadati = await tx<Array<UploadJob>>(STORE_JOBS, 'readonly', (s) =>
    s.getAll(),
  );
  let blobs: RecordBlob[] = [];
  try {
    blobs = await tx<RecordBlob[]>(STORE_BLOBS, 'readonly', (s) => s.getAll());
  } catch {
    blobs = [];
  }
  const perId = new Map(blobs.map((b) => [b.id, b.blob]));

  const validi: UploadJob[] = [];
  const orfani: string[] = [];
  for (const j of metadati) {
    // v1: il blob stava dentro payload. v2: sta nello store dedicato.
    const blob = j.payload?.fileBlob ?? perId.get(j.id);
    if (!blob) {
      orfani.push(j.id);
      continue;
    }
    validi.push({ ...j, payload: { ...j.payload, fileBlob: blob } });
  }
  for (const id of orfani) void deleteJob(id);
  return validi;
}

export async function clearAllJobs(): Promise<void> {
  await tx(STORE_JOBS, 'readwrite', (s) => s.clear());
  try {
    await tx(STORE_BLOBS, 'readwrite', (s) => s.clear());
  } catch {
    /* noop */
  }
}
