'use client';

import * as React from 'react';

import {
  jobDaAvviare,
  prossimoRisveglioMs,
  esitoTentativoFallito,
} from '@kommessa/api/upload-queue-policy';

import {
  deleteJob,
  getAllJobs,
  putBlob,
  putJob,
} from '../_lib/upload-queue/idb-store';
import { notifyAbortToServer, runUpload } from '../_lib/upload-queue/engine';
import {
  type JobStatus,
  type UploadJob,
  type UploadJobPayload,
} from '../_lib/upload-queue/types';

/**
 * UploadQueueProvider: coda persistente per gli upload media R2.
 *
 * Caratteristiche:
 *  - Persistenza IndexedDB: i job (file compreso) sopravvivono alla chiusura
 *    dell'app. Alla riapertura ripartono da soli.
 *  - Vita oltre la pagina: l'upload continua quando l'utente naviga in app.
 *  - Concorrenza limitata, retry con backoff esponenziale reale.
 *  - Abort granulare via AbortController per job.
 *
 * ─── Correzioni 30/07/2026 ────────────────────────────────────────────────
 *  - la scelta dei job da avviare vive in `@kommessa/api/upload-queue-policy`
 *    (pura, unit-testata) e **rispetta `nextAttemptAt`**: prima il filtro lo
 *    ignorava e i retry ripartivano all'istante, bruciando i 5 tentativi in
 *    pochi secondi;
 *  - il dispatch dei job non avviene più dentro l'updater di `setJobs`
 *    (side effect in un reducer): lo stato è specchiato in un ref;
 *  - il progresso è accettato solo dal tentativo corrente (token di
 *    generazione) e `bytesUploaded` viene azzerato a ogni nuovo tentativo;
 *  - IndexedDB non viene più scritto a ogni tick di progresso.
 *
 * Non gestisce ancora la ripresa di un multipart già parziale: alla riapertura
 * il file riparte da zero (il legame con la commessa però non si perde mai).
 *
 * Vedi `documentazione_generale/08_LOGICHE/Logiche_Upload_Media.md`.
 */

/** Job contemporanei. I video scendono a 2 per non saturare la rete mobile. */
const MAX_CONCURRENT = 3;
const MAX_CONCURRENT_VIDEO = 2;
/** Parti multipart in volo per singolo job. */
const PARTI_PARALLELE = 3;
const PARTI_PARALLELE_VIDEO = 2;

interface UploadQueueContextValue {
  jobs: UploadJob[];
  enqueue(payload: UploadJobPayload): string;
  cancel(jobId: string): void;
  retry(jobId: string): void;
  remove(jobId: string): void;
  /** Numero di job non terminali (queued + init + uploading + finalizing). */
  activeCount: number;
  /** Job ripescati da una sessione precedente e non ancora completati. */
  ripresiCount: number;
}

const UploadQueueContext = React.createContext<UploadQueueContextValue | null>(null);

const TERMINAL: ReadonlyArray<JobStatus> = ['done', 'failed', 'canceled'];

function isTerminal(s: JobStatus): boolean {
  return TERMINAL.includes(s);
}

function eVideo(job: UploadJob): boolean {
  return (job.payload.fileMime ?? '').startsWith('video/');
}

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function UploadQueueProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = React.useState<UploadJob[]>([]);
  /**
   * Specchio sincrono dello stato: il pump deve poter leggere la lista
   * aggiornata SENZA passare da un updater di setJobs (che deve restare puro).
   */
  const jobsRef = React.useRef<UploadJob[]>([]);
  const abortersRef = React.useRef<Map<string, AbortController>>(new Map());
  /** Job già dispatchati al worker, per non avviarli due volte. */
  const runningRef = React.useRef<Set<string>>(new Set());
  /** Tentativo corrente per job: il progresso di un tentativo morto è ignorato. */
  const generazioneRef = React.useRef<Map<string, number>>(new Map());
  const pumpTimerRef = React.useRef<number | null>(null);
  const wakeLockRef = React.useRef<{ release: () => Promise<void> } | null>(null);
  const sessionDoneRef = React.useRef(0);
  const prevActiveRef = React.useRef(0);

  // ---- Scrittura di stato (ref + React) -------------------------------------
  const scriviJobs = React.useCallback(
    (aggiorna: (prev: UploadJob[]) => UploadJob[]) => {
      const next = aggiorna(jobsRef.current);
      jobsRef.current = next;
      setJobs(next);
      return next;
    },
    [],
  );

  /**
   * @param persisti false per gli aggiornamenti ad alta frequenza (progresso):
   * scrivere su IDB a ogni tick era una delle cause degli stalli.
   */
  const updateJob = React.useCallback(
    (id: string, patch: Partial<UploadJob>, persisti = true) => {
      const next = scriviJobs((prev) =>
        prev.map((j) => (j.id === id ? { ...j, ...patch, updatedAt: Date.now() } : j)),
      );
      const target = next.find((j) => j.id === id);
      if (!target) return;
      if (isTerminal(target.status)) void deleteJob(id);
      else if (persisti) void putJob(target);
    },
    [scriviJobs],
  );

  // ---- Esecuzione di un singolo job -----------------------------------------
  const startJobRef = React.useRef<(job: UploadJob) => Promise<void>>();

  // ---- Pump del worker pool -------------------------------------------------
  const pump = React.useCallback(() => {
    const ora = Date.now();
    const correnti = jobsRef.current;
    // I video pesano: se ce n'è uno in ballo si stringe la concorrenza.
    const ciSonoVideo = correnti.some(
      (j) => !isTerminal(j.status) && eVideo(j),
    );
    const daAvviare = jobDaAvviare({
      jobs: correnti,
      ora,
      maxConcorrenti: ciSonoVideo ? MAX_CONCURRENT_VIDEO : MAX_CONCURRENT,
      inEsecuzione: runningRef.current,
    });

    for (const id of daAvviare) {
      const job = jobsRef.current.find((j) => j.id === id);
      if (!job) continue;
      runningRef.current.add(id);
      void startJobRef.current?.(job);
    }

    // Risveglio per i retry in attesa di backoff.
    const fra = prossimoRisveglioMs(jobsRef.current, ora);
    if (fra != null) {
      if (pumpTimerRef.current) window.clearTimeout(pumpTimerRef.current);
      pumpTimerRef.current = window.setTimeout(() => {
        pumpTimerRef.current = null;
        pump();
      }, fra);
    }
  }, []);

  const startJob = React.useCallback(
    async (job: UploadJob) => {
      const controller = new AbortController();
      abortersRef.current.set(job.id, controller);

      // Token di generazione: solo il tentativo corrente può scrivere progresso.
      const generazione = (generazioneRef.current.get(job.id) ?? 0) + 1;
      generazioneRef.current.set(job.id, generazione);
      const mioTurno = () => generazioneRef.current.get(job.id) === generazione;

      // Ogni tentativo riparte da zero byte: senza questo la barra "salta
      // indietro" invece di ricominciare in modo leggibile.
      updateJob(job.id, {
        status: 'init',
        bytesUploaded: 0,
        lastError: null,
        nextAttemptAt: null,
      });

      const video = eVideo(job);

      try {
        const result = await runUpload(
          {
            file: job.payload.fileBlob,
            fileName: job.payload.fileName,
            fileMime: job.payload.fileMime,
            fileSize: job.payload.fileSize,
            commessaId: job.payload.commessaId ?? null,
            bozzaId: job.payload.bozzaId ?? null,
            momento: job.payload.momento,
            voceId: job.payload.voceId,
            riunioneId: job.payload.riunioneId,
            kind: job.payload.kind,
            geoLat: job.payload.geoLat,
            geoLng: job.payload.geoLng,
            takenAtIso: job.payload.takenAtIso,
            // Presente = tentativo precedente interrotto (o sessione chiusa):
            // l'engine prova a riprendere le parti già su R2.
            ripresaFileRefId: job.fileRefId,
          },
          {
            abort: controller,
            multipartConcurrency: video ? PARTI_PARALLELE_VIDEO : PARTI_PARALLELE,
            onProgress: (loaded) => {
              if (!mioTurno()) return;
              updateJob(job.id, { bytesUploaded: loaded }, false);
            },
            onFileRefId: (fileRefId) => {
              if (!mioTurno()) return;
              updateJob(job.id, { fileRefId });
            },
            onPhase: (phase) => {
              if (!mioTurno()) return;
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
        sessionDoneRef.current += 1;
      } catch (e) {
        const annullato = controller.signal.aborted;
        const msg = e instanceof Error ? e.message : String(e);
        // Stato aggiornato: `job` è lo snapshot di quando il pump l'ha scelto.
        const corrente = jobsRef.current.find((j) => j.id === job.id) ?? job;
        const esito = esitoTentativoFallito({
          tentativiFatti: corrente.attempt,
          annullato,
          ora: Date.now(),
        });

        // Il multipart su R2 si butta via SOLO quando non serve più: annullo
        // dell'utente o tentativi esauriti. Se invece ci sarà un altro giro, si
        // conserva il fileRefId così il prossimo tentativo **riprende** le parti
        // già caricate invece di rifare tutto da zero (fondamentale sui video).
        const riprendibile = esito.status === 'queued';
        if (!riprendibile && corrente.fileRefId) {
          notifyAbortToServer(corrente.fileRefId);
        }

        updateJob(job.id, {
          status: esito.status,
          attempt: esito.attempt,
          nextAttemptAt: esito.nextAttemptAt,
          fileRefId: riprendibile ? corrente.fileRefId : null,
          lastError:
            esito.status === 'canceled' ? 'Annullato dall’utente' : msg,
        });
      } finally {
        abortersRef.current.delete(job.id);
        runningRef.current.delete(job.id);
        pump();
      }
    },
    [pump, updateJob],
  );

  startJobRef.current = startJob;

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
      scriviJobs((prev) => [...prev, job]);
      // Il file si scrive UNA volta: da qui in poi solo metadati.
      void putBlob(job.id, payload.fileBlob);
      void putJob(job);
      setTimeout(pump, 0);
      return job.id;
    },
    [pump, scriviJobs],
  );

  const cancel = React.useCallback(
    (jobId: string) => {
      const ctrl = abortersRef.current.get(jobId);
      if (ctrl) ctrl.abort();
      if (!runningRef.current.has(jobId)) {
        const target = jobsRef.current.find((j) => j.id === jobId);
        if (target && !isTerminal(target.status)) {
          updateJob(jobId, {
            status: 'canceled',
            lastError: 'Annullato dall’utente',
          });
        }
      }
    },
    [updateJob],
  );

  const retry = React.useCallback(
    (jobId: string) => {
      const job = jobsRef.current.find((j) => j.id === jobId);
      if (!job) return;
      updateJob(jobId, {
        status: 'queued',
        attempt: 0,
        nextAttemptAt: null,
        lastError: null,
        bytesUploaded: 0,
        fileRefId: null,
      });
      setTimeout(pump, 0);
    },
    [pump, updateJob],
  );

  const remove = React.useCallback(
    (jobId: string) => {
      scriviJobs((prev) => prev.filter((j) => j.id !== jobId));
      void deleteJob(jobId);
    },
    [scriviJobs],
  );

  // ---- Boot: ricarica da IndexedDB ------------------------------------------
  React.useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const persisted = await getAllJobs();
        if (!mounted) return;
        // Tornano in coda i job non terminali **e quelli falliti**.
        //
        // Prima i falliti restavano rossi finché l'utente non li ritoccava a
        // mano: chi ha chiuso l'app in cantiere non lo fa mai, e i file
        // restavano lì per settimane (misurato: file di giugno ancora fermi ad
        // agosto). Riaprire l'app è il momento giusto per ritentare — di solito
        // si è tornati sotto una rete decente. I tentativi ripartono da zero,
        // quindi il tetto resta cinque **per sessione**, non all'infinito.
        //
        // NB: `fileRefId` si CONSERVA — è la chiave con cui l'engine chiede a
        // R2 quali parti sono già arrivate e riprende da lì invece che da zero.
        const restored = persisted
          .filter((j) => !isTerminal(j.status) || j.status === 'failed')
          .map((j) => ({
            ...j,
            status: 'queued' as JobStatus,
            bytesUploaded: 0,
            nextAttemptAt: null,
            attempt: 0,
            lastError: null,
            ripreso: true,
          }));
        if (restored.length > 0) {
          scriviJobs((prev) => [...prev, ...restored]);
          setTimeout(pump, 0);
        }
      } catch (e) {
        if (typeof window !== 'undefined') {
          // eslint-disable-next-line no-console
          console.warn('[upload-queue] IDB unavailable, no persistence', e);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [pump, scriviJobs]);

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
        e.returnValue = '';
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

  const ripresiCount = jobs.filter(
    (j) => j.ripreso === true && !isTerminal(j.status),
  ).length;

  // ---- Wake Lock schermo mentre ci sono upload attivi ------------------------
  React.useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const wl: any = (navigator as any).wakeLock;
    if (!wl || typeof wl.request !== 'function') return;

    let cancelled = false;

    const acquire = async () => {
      if (wakeLockRef.current || cancelled) return;
      try {
        const sentinel = await wl.request('screen');
        if (cancelled) {
          await sentinel.release?.();
          return;
        }
        wakeLockRef.current = sentinel;
        sentinel.addEventListener?.('release', () => {
          if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
        });
      } catch {
        /* permesso negato o non supportato */
      }
    };

    const release = async () => {
      const wlk = wakeLockRef.current;
      if (!wlk) return;
      wakeLockRef.current = null;
      try {
        await wlk.release?.();
      } catch {
        /* ignore */
      }
    };

    if (activeCount > 0) void acquire();
    else void release();

    const onVisible = () => {
      if (document.visibilityState === 'visible' && activeCount > 0) {
        void acquire();
        // Tornando in primo piano dopo una sospensione iOS, i job possono
        // essere rimasti fermi: una spinta al pump li rimette in moto.
        pump();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [activeCount, pump]);

  // ---- Notifica push aggregata "Caricamento completato" ---------------------
  React.useEffect(() => {
    const prev = prevActiveRef.current;
    prevActiveRef.current = activeCount;
    if (prev > 0 && activeCount === 0 && sessionDoneRef.current > 0) {
      const count = sessionDoneRef.current;
      sessionDoneRef.current = 0;
      void fetch('/api/upload/notify-batch-done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, label: 'media' }),
        keepalive: true,
      }).catch(() => {});
    }
  }, [activeCount]);

  const value: UploadQueueContextValue = {
    jobs,
    enqueue,
    cancel,
    retry,
    remove,
    activeCount,
    ripresiCount,
  };

  return (
    <UploadQueueContext.Provider value={value}>
      {children}
    </UploadQueueContext.Provider>
  );
}

/** Hook di accesso alla queue. */
export function useUploadQueue(): UploadQueueContextValue {
  const ctx = React.useContext(UploadQueueContext);
  if (!ctx) {
    throw new Error('useUploadQueue: missing UploadQueueProvider');
  }
  return ctx;
}

/** Variante "safe" che ritorna null fuori dal Provider. */
export function useUploadQueueOptional(): UploadQueueContextValue | null {
  return React.useContext(UploadQueueContext);
}
