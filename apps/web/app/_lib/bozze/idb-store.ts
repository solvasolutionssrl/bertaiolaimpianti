/**
 * Wrapper IndexedDB per le bozze commessa.
 *
 * DB dedicato `kommessa-bozze`, store `bozze` (keyPath: id) — separato dal
 * DB della upload queue (`kommessa-uploads`) per non doverne coordinare la
 * versione. E' la verita' locale: l'utente lavora sempre contro IndexedDB,
 * il server e' un mirror sincronizzato in background.
 *
 * SSR-safe: ogni funzione no-op/[] se `indexedDB` non esiste (server).
 */

import type { LocalBozza } from './types';

const DB_NAME = 'kommessa-bozze';
const DB_VERSION = 1;
const STORE = 'bozze';

let dbPromise: Promise<IDBDatabase> | null = null;

function hasIDB(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
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
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IDB request failed'));
      }),
  );
}

export async function putBozza(bozza: LocalBozza): Promise<void> {
  if (!hasIDB()) return;
  await tx('readwrite', (s) => s.put(bozza));
}

export async function getBozza(id: string): Promise<LocalBozza | null> {
  if (!hasIDB()) return null;
  const b = await tx<LocalBozza | undefined>('readonly', (s) => s.get(id));
  return b ?? null;
}

export async function deleteBozza(id: string): Promise<void> {
  if (!hasIDB()) return;
  await tx('readwrite', (s) => s.delete(id));
}

export async function getAllBozze(): Promise<LocalBozza[]> {
  if (!hasIDB()) return [];
  const list = await tx<LocalBozza[]>('readonly', (s) => s.getAll());
  return list ?? [];
}
