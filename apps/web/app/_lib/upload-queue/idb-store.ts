/**
 * Wrapper IndexedDB minimale per la upload queue.
 *
 * DB: `kommessa-uploads`, store `jobs` (keyPath: id).
 * Niente librerie: una promise sull'open + helper get/put/delete.
 *
 * Sopravvive al refresh: i job non-terminal ricaricati al boot del
 * Provider torneranno automaticamente al worker.
 */

import type { UploadJob } from './types';

const DB_NAME = 'kommessa-uploads';
const DB_VERSION = 1;
const STORE_JOBS = 'jobs';

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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
    req.onblocked = () => reject(new Error('IDB blocked (close other tabs)'));
  });
  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE_JOBS, mode);
        const store = t.objectStore(STORE_JOBS);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IDB request failed'));
      }),
  );
}

export async function putJob(job: UploadJob): Promise<void> {
  await tx('readwrite', (s) => s.put(job));
}

export async function deleteJob(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
}

export async function getAllJobs(): Promise<UploadJob[]> {
  const list = await tx<UploadJob[]>('readonly', (s) => s.getAll());
  return list;
}

export async function clearAllJobs(): Promise<void> {
  await tx('readwrite', (s) => s.clear());
}
