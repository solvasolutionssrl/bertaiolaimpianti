'use client';

/**
 * Hook di bozza commessa offline-first.
 *
 * - Verita' locale in IndexedDB: ogni `save()` scrive subito (no perdita su
 *   chiusura/refresh, anche offline).
 * - Sync server in background (debounce ~2s) via PUT /api/bozze/[id]; se
 *   offline, riprova al ritorno della connessione.
 * - La bozza nasce solo al PRIMO CONTENUTO REALE: `save()` con payload vuoto
 *   non crea nulla.
 * - `finalize()` fa prima un flush sincrono (così il server ha l'ultimo
 *   stato) e poi chiama la server action finalizzaBozza.
 *
 * Il chiamante (form office / PWA) possiede lo stato del form e invoca
 * `save(payloadCorrente)` a ogni modifica significativa.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { finalizzaBozza, type FinalizzaBozzaResult } from '../../_actions/finalizza-bozza';
import { getBozza, putBozza, deleteBozza } from './idb-store';
import type { BozzaPayload, LocalBozza } from './types';

const SYNC_DEBOUNCE_MS = 2000;

export type BozzaSyncState = 'idle' | 'pending' | 'synced' | 'offline' | 'error';

export interface UseBozzaDraft {
  bozzaId: string;
  numeroBozza: number | null;
  /** true quando il caricamento iniziale (resume) è completo. */
  ready: boolean;
  /** Payload della bozza ripresa (null se è una bozza nuova). */
  loadedPayload: BozzaPayload | null;
  syncState: BozzaSyncState;
  save: (payload: BozzaPayload) => void;
  finalize: (payload: BozzaPayload) => Promise<FinalizzaBozzaResult>;
  discard: () => Promise<void>;
}

/** Genera un UUID v4 (crypto nativa, disponibile in tutti i browser target). */
function newId(): string {
  return crypto.randomUUID();
}

/** La bozza ha contenuto reale degno di essere salvato? */
export function hasContenutoReale(p: BozzaPayload): boolean {
  if (!p) return false;
  if (p.descrizioneFinale && p.descrizioneFinale.trim()) return true;
  if (p.noteIniziali && p.noteIniziali.trim()) return true;
  if (p.indirizzoCantiere && p.indirizzoCantiere.trim()) return true;
  if (p.clienteId) return true;
  if (p.clienteNew?.ragione_sociale && p.clienteNew.ragione_sociale.trim()) return true;
  if (Array.isArray(p.voci) && p.voci.length > 0) return true;
  if (Array.isArray(p.referenti) && p.referenti.length > 0) return true;
  return false;
}

export function useBozzaDraft(options?: { bozzaId?: string }): UseBozzaDraft {
  const resumeId = options?.bozzaId;
  const [bozzaId] = useState<string>(() => resumeId ?? newId());
  const [numeroBozza, setNumeroBozza] = useState<number | null>(null);
  const [ready, setReady] = useState<boolean>(!resumeId);
  const [loadedPayload, setLoadedPayload] = useState<BozzaPayload | null>(null);
  const [syncState, setSyncState] = useState<BozzaSyncState>('idle');

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPayloadRef = useRef<BozzaPayload | null>(null);
  const createdRef = useRef<boolean>(false); // la bozza è già stata materializzata?

  // --- Resume: carica la bozza esistente da IndexedDB ---
  useEffect(() => {
    if (!resumeId) return;
    let alive = true;
    void (async () => {
      const local = await getBozza(resumeId);
      if (!alive) return;
      if (local) {
        createdRef.current = true;
        setNumeroBozza(local.numeroBozza);
        setLoadedPayload(local.payload);
        latestPayloadRef.current = local.payload;
      }
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [resumeId]);

  // --- Sync server (debounced) ---
  const pushToServer = useCallback(
    async (payload: BozzaPayload) => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setSyncState('offline');
        return;
      }
      try {
        const res = await fetch(`/api/bozze/${bozzaId}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ payload }),
        });
        if (!res.ok) {
          setSyncState('error');
          return;
        }
        const json = (await res.json()) as { numeroBozza?: number | null };
        if (typeof json.numeroBozza === 'number') setNumeroBozza(json.numeroBozza);
        // Marca synced in IDB.
        const local = await getBozza(bozzaId);
        if (local) {
          await putBozza({ ...local, dirty: false, lastSyncedAt: Date.now() });
        }
        setSyncState('synced');
      } catch {
        setSyncState('error');
      }
    },
    [bozzaId],
  );

  const scheduleSync = useCallback(
    (payload: BozzaPayload) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setSyncState('pending');
      timerRef.current = setTimeout(() => {
        void pushToServer(payload);
      }, SYNC_DEBOUNCE_MS);
    },
    [pushToServer],
  );

  // --- save(): persistenza locale immediata + sync schedulato ---
  const save = useCallback(
    (payload: BozzaPayload) => {
      latestPayloadRef.current = payload;
      // Niente bozze vuote: crea solo al primo contenuto reale.
      if (!createdRef.current && !hasContenutoReale(payload)) return;
      createdRef.current = true;

      const local: LocalBozza = {
        id: bozzaId,
        numeroBozza,
        payload,
        updatedAt: Date.now(),
        lastSyncedAt: null,
        dirty: true,
      };
      void putBozza(local);
      scheduleSync(payload);
    },
    [bozzaId, numeroBozza, scheduleSync],
  );

  // --- Flush al ritorno della connessione ---
  useEffect(() => {
    function onOnline() {
      const p = latestPayloadRef.current;
      if (p && createdRef.current) void pushToServer(p);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', onOnline);
      return () => window.removeEventListener('online', onOnline);
    }
    return undefined;
  }, [pushToServer]);

  // --- finalize(): flush sincrono poi server action ---
  const finalize = useCallback(
    async (payload: BozzaPayload): Promise<FinalizzaBozzaResult> => {
      if (timerRef.current) clearTimeout(timerRef.current);
      latestPayloadRef.current = payload;
      createdRef.current = true;
      // La finalizzazione richiede il server (codice gapless + cartelle cloud).
      // Offline: la bozza è già salvata in locale, l'utente riprova online.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return {
          ok: false,
          error:
            'Sei offline. La bozza è salvata sul dispositivo: crea la commessa appena torni online.',
        };
      }
      // Persisti localmente e spingi al server in modo bloccante: la
      // finalizzazione legge il payload dal server.
      await putBozza({
        id: bozzaId,
        numeroBozza,
        payload,
        updatedAt: Date.now(),
        lastSyncedAt: null,
        dirty: true,
      });
      await pushToServer(payload);
      const res = await finalizzaBozza(bozzaId);
      if (res.ok) {
        await deleteBozza(bozzaId);
      }
      return res;
    },
    [bozzaId, numeroBozza, pushToServer],
  );

  // --- discard(): elimina locale + server ---
  const discard = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await deleteBozza(bozzaId);
    if (createdRef.current) {
      await fetch(`/api/bozze/${bozzaId}`, { method: 'DELETE' }).catch(() => {});
    }
  }, [bozzaId]);

  // Cleanup timer su unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    bozzaId,
    numeroBozza,
    ready,
    loadedPayload,
    syncState,
    save,
    finalize,
    discard,
  };
}
