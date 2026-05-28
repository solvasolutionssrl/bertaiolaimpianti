'use client';

import * as React from 'react';

import {
  deleteJob,
  getAllJobs,
  putJob,
} from '../_lib/upload-queue/idb-store';
import { notifyAbortToServer, runUpload } from '../_lib/upload-queue/engine';
import {
  MAX_ATTEMPTS,
  RETRY_DELAYS_MS,
  type JobStatus,
  type UploadJob,
  type UploadJobPayload,
} from '../_lib/upload-queue/types';

/**
 * UploadQueueProvider: queue persistente per gli upload media R2.
 *
 * Caratteristiche:
 *  - Persistenza IndexedDB: i job sopravvivono al refresh.
 *  - Vita oltre la pagina: l'upload continua quando l'utente naviga in app.
 *  - Concorrenza 3, retry esponenziale (fino a MAX_ATTEMPTS).
 *  - Abort granulare via AbortController per job.
 *  - "warning beforeunload" se ci sono upload in corso.
 *
 * Non gestisce ancora la ripresa cross-session di multipart già parziale:
 * un refresh durante un multipart fa ripartire l'upload da zero (il server
 * rilascia il vecchio fileRefId al cleanup di 24h).
 */

const MAX_CONCURRENT = 3;

interface UploadQueueContextValue {
  jobs: UploadJob[];
  enqueue(payload: UploadJobPayload): string;
  cancel(jobId: string): void;
  retry(jobId: string): void;
  remove(jobId: string): void;
  /** Numero di job non terminali (queued + init + uploading + finalizing). */
  activeCount: number;
}

const UploadQueueContext = React.createContext<UploadQueueContextValue | null>(null);

const TERMINAL: ReadonlyArray<JobStatus> = ['done', 'failed', 'canceled'];

function isTerminal(s: JobStatus): boolean {
  return TERMINAL.includes(s);
}

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function UploadQueueProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = React.useState<UploadJob[]>([]);
  // Map dei controller AbortController per ogni job attivo.
  const abortersRef = React.useRef<Map<string, AbortController>>(new Map());
  // Per evitare doppio dispatch al worker dello stesso job.
  const runningRef = React.useRef<Set<string>>(new Set());
  // Timer per il pump del worker pool.
  const pumpTimerRef = React.useRef<number | null>(null);

  // ---- Persistenza helpers --------------------------------------------------
  const updateJob = React.useCallback(
    (id: string, patch: Partial<UploadJob>) => {
      setJobs((prev) => {
        const next = prev.map((j) =>
          j.id === id ? { ...j, ...patch, updatedAt: Date.now() } : j,
        );
        const target = next.find((j) => j.id === id);
        if (target) {
          // Persistenza: cancella record IDB per i terminali, altrimenti put.
          if (isTerminal(target.status)) {
            void deleteJob(id);
          } else {
            void putJob(target);
          }
        }
        return next;
      });
    },
    [],
  );

  // ---- Pump del worker pool -------------------------------------------------
  const pump = React.useCallback(() => {
    setJobs((prev) => {
      const active = prev.filter(
        (j) => j.status === 'init' || j.status === 'uploading' || j.status === 'finalizing',
      ).length;
      if (active >= MAX_CONCURRENT) return prev;

      const now = Date.now();
      // Job in coda: queued OR (failed in retry pending con nextAttemptAt scaduto)
      const candidates = prev.filter((j) => {
        if (runningRef.current.has(j.id)) return false;
        if (j.status === 'queued') return true;
        return false;
      });

      const slotsLeft = MAX_CONCURRENT - active;
      const toStart = candidates.slice(0, slotsLeft);

      for (const job of toStart) {
        runningRef.current.add(job.id);
        void startJob(job);
      }

      // Schedule il prossimo pump se ci sono job in pending-retry futuri
      const nextPending = prev
        .filter((j) => j.status === 'queued' && j.nextAttemptAt && j.nextAttemptAt > now)
        .map((j) => j.nextAttemptAt as number);
      if (nextPending.length > 0) {
        const soonest = Math.min(...nextPending);
        const delay = Math.max(50, soonest - now + 10);
        if (pumpTimerRef.current) window.clearTimeout(pumpTimerRef.current);
        pumpTimerRef.current = window.setTimeout(pump, delay);
      }
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Esecuzione singolo job ----------------------------------------------
  const startJob = React.useCallback(
    async (job: UploadJob) => {
      const controller = new AbortController();
      abortersRef.current.set(job.id, controller);
      updateJob(job.id, {
        status: 'init',
        lastError: null,
        nextAttemptAt: null,
      });

      try {
        const result = await runUpload(
          {
            file: job.payload.fileBlob,
            fileName: job.payload.fileName,
            fileMime: job.payload.fileMime,
            fileSize: job.payload.fileSize,
            commessaId: job.payload.commessaId,
            momento: job.payload.momento,
            voceId: job.payload.voceId,
            riunioneId: job.payload.riunioneId,
            kind: job.payload.kind,
            geoLat: job.payload.geoLat,
            geoLng: job.payload.geoLng,
          },
          {
            abort: controller,
            onProgress: (loaded) => updateJob(job.id, { bytesUploaded: loaded }),
            onFileRefId: (fileRefId) => updateJob(job.id, { fileRefId }),
            onPhase: (phase) => {
              const map: Record<typeof phase, JobStatus> = {
                init: 'init',
                uploading: 'uploading',
                finalizing: 'finalizing',
              };
              updateJob(job.id, { status: map[phase] });
            },
          },
        );
        updateJob(job.id, {
          status: 'done',
          bytesUploaded: result.sizeBytes,
          bytesTotal: result.sizeBytes,
          fileRefId: result.fileRefId,
          lastError: null,
        });
      } catch (e) {
        const aborted = controller.signal.aborted;
        const msg = e instanceof Error ? e.message : String(e);
        const currentAttempt = job.attempt + 1;
        // Se è un abort esplicito dell'utente, niente retry.
        if (aborted) {
          updateJob(job.id, {
            status: 'canceled',
            lastError: 'Annullato dall\'utente',
            attempt: currentAttempt,
          });
        } else if (currentAttempt >= MAX_ATTEMPTS) {
          // Esauriti i tentativi.
          updateJob(job.id, {
            status: 'failed',
            lastError: msg,
            attempt: currentAttempt,
          });
          // Notifica al server che il file ref può essere abbandonato
          if (job.fileRefId) notifyAbortToServer(job.fileRefId);
        } else {
          // Retry pending: schedula il prossimo tentativo.
          const delay =
            RETRY_DELAYS_MS[Math.min(currentAttempt - 1, RETRY_DELAYS_MS.length - 1)] ??
            60_000;
          updateJob(job.id, {
            status: 'queued',
            attempt: currentAttempt,
            nextAttemptAt: Date.now() + delay,
            lastError: msg,
          });
        }
      } finally {
        abortersRef.current.delete(job.id);
        runningRef.current.delete(job.id);
        pump();
      }
    },
    [pump, updateJob],
  );

  // ---- API pubblica ---------------------------------------------------------
  const enqueue = React.useCallback(
    (payload: UploadJobPayload): string => {
      const job: UploadJob = {
        id: genId(),
        status: 'queued',
        payload,
        fileRefId: null,
        bytesUploaded: 0,
        bytesTotal: payload.fileSize,
        attempt: 0,
        nextAttemptAt: null,
        lastError: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setJobs((prev) => [...prev, job]);
      void putJob(job);
      // Avvia worker pump nel prossimo tick (così lo state ha aggiornato).
      setTimeout(pump, 0);
      return job.id;
    },
    [pump],
  );

  const cancel = React.useCallback(
    (jobId: string) => {
      const ctrl = abortersRef.current.get(jobId);
      if (ctrl) ctrl.abort();
      // Se il job non è in run (era queued), forza canceled subito.
      setJobs((prev) => {
        const target = prev.find((j) => j.id === jobId);
        if (target && !runningRef.current.has(jobId) && !isTerminal(target.status)) {
          // Marca come canceled in stato locale + IDB.
          const next = prev.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  status: 'canceled' as JobStatus,
                  lastError: 'Annullato dall\'utente',
                  updatedAt: Date.now(),
                }
              : j,
          );
          void deleteJob(jobId);
          return next;
        }
        return prev;
      });
    },
    [],
  );

  const retry = React.useCallback(
    (jobId: string) => {
      setJobs((prev) => {
        const job = prev.find((j) => j.id === jobId);
        if (!job) return prev;
        // Reset stato per un nuovo tentativo manuale.
        const next = prev.map((j) =>
          j.id === jobId
            ? {
                ...j,
                status: 'queued' as JobStatus,
                attempt: 0,
                nextAttemptAt: null,
                lastError: null,
                bytesUploaded: 0,
                fileRefId: null,
                updatedAt: Date.now(),
              }
            : j,
        );
        const target = next.find((j) => j.id === jobId);
        if (target) void putJob(target);
        setTimeout(pump, 0);
        return next;
      });
    },
    [pump],
  );

  const remove = React.useCallback((jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    void deleteJob(jobId);
  }, []);

  // ---- Boot: ricarica IDB ---------------------------------------------------
  React.useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const persisted = await getAllJobs();
        if (!mounted) return;
        // I job non-terminali tornano in coda (forziamo a queued, l'engine
        // riprenderà da capo con un nuovo init — accettabile per ora).
        const restored = persisted
          .filter((j) => !isTerminal(j.status))
          .map((j) => ({
            ...j,
            status: 'queued' as JobStatus,
            bytesUploaded: 0,
            fileRefId: null,
            nextAttemptAt: null,
          }));
        if (restored.length > 0) {
          setJobs((prev) => [...prev, ...restored]);
          setTimeout(pump, 0);
        }
      } catch (e) {
        // IDB non disponibile (mode privato Safari?) → degrade silenzioso
        // gli upload continueranno a funzionare ma senza ripresa post-refresh.
        if (typeof window !== 'undefined') {
          // eslint-disable-next-line no-console
          console.warn('[upload-queue] IDB unavailable, no persistence', e);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [pump]);

  // ---- Warning beforeunload --------------------------------------------------
  React.useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const hasActive = jobs.some(
        (j) =>
          j.status === 'init' ||
          j.status === 'uploading' ||
          j.status === 'finalizing',
      );
      if (hasActive) {
        e.preventDefault();
        e.returnValue = ''; // prompt browser standard
        return '';
      }
      return undefined;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [jobs]);

  const activeCount = jobs.filter(
    (j) =>
      j.status === 'queued' ||
      j.status === 'init' ||
      j.status === 'uploading' ||
      j.status === 'finalizing',
  ).length;

  const value: UploadQueueContextValue = {
    jobs,
    enqueue,
    cancel,
    retry,
    remove,
    activeCount,
  };

  return (
    <UploadQueueContext.Provider value={value}>
      {children}
    </UploadQueueContext.Provider>
  );
}

/** Hook di accesso alla queue. Ritorna null se fuori dal Provider. */
export function useUploadQueue(): UploadQueueContextValue {
  const ctx = React.useContext(UploadQueueContext);
  if (!ctx) {
    throw new Error('useUploadQueue: missing UploadQueueProvider');
  }
  return ctx;
}

/** Variante "safe" che ritorna null fuori dal Provider (per componenti
 *  che possono essere usati anche prima del mount del Provider). */
export function useUploadQueueOptional(): UploadQueueContextValue | null {
  return React.useContext(UploadQueueContext);
}
