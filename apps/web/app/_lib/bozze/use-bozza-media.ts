'use client';

/**
 * Media della creazione commessa: staging sulla bozza tramite la CODA
 * PERSISTENTE globale.
 *
 * ─── Perché è stato riscritto (30/07/2026) ────────────────────────────────
 * Prima questo hook usava `uploadMediaBatch`, un secondo motore di upload
 * indipendente dalla coda. Conseguenza: i file selezionati durante la creazione
 * di una commessa vivevano **solo nello state di React**. Lo scenario tipico del
 * cliente — in campo, crea la commessa al volo, allega due video, blocca il
 * telefono ed esce — perdeva i file non ancora caricati: la bozza sopravviveva,
 * i byte no.
 *
 * Ora ogni file entra nella coda persistente (blob su IndexedDB) appena viene
 * selezionato:
 *  - l'upload parte SUBITO, non alla pressione di "Crea commessa";
 *  - se l'app viene chiusa, alla riapertura la coda riprende da sola a caricare
 *    **sulla stessa bozza**, e l'utente finalizza quando vuole da "Da
 *    completare";
 *  - il legame commessa ↔ file non si perde mai.
 *
 * `finalizeMedia` attende che i job della bozza siano terminali prima di
 * materializzare la commessa: è la stessa attesa di prima, ma molto più corta
 * (gli upload sono partiti al momento della selezione) ed è ciò che garantisce
 * che nessun file arrivi *dopo* lo spostamento su cartella definitiva.
 *
 * Vedi `documentazione_generale/08_LOGICHE/Logiche_Upload_Media.md`.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useUploadQueue } from '../../_components/upload-queue-provider';
import { compressImage } from '../../office/commesse/nuova/_lib/compress-image';
import type { UploadProgressMap } from '../../office/commesse/nuova/_lib/upload-media';
import type { MediaFile } from '../../office/commesse/nuova/_components/media-attach-section';
import type { UploadJob } from '../upload-queue/types';

/** Segnaposto mentre il job è in preparazione (compressione). */
const IN_PREPARAZIONE = '__pending__';

const TERMINALI = ['done', 'failed', 'canceled'];

function eTerminale(j: UploadJob): boolean {
  return TERMINALI.includes(j.status);
}

function kindPerAllegato(k: MediaFile['kind']): 'foto' | 'video' | 'pdf_acquisito' {
  if (k === 'video') return 'video';
  if (k === 'pdf') return 'pdf_acquisito';
  return 'foto';
}

export function useBozzaMedia(bozzaId: string, flush: () => Promise<void>) {
  const queue = useUploadQueue();

  /** mediaId → jobId (o IN_PREPARAZIONE finché non è accodato). */
  const jobPerMedia = useRef<Map<string, string>>(new Map());
  /** Specchio dei job per leggerli dentro le callback async. */
  const jobsRef = useRef<UploadJob[]>(queue.jobs);
  useEffect(() => {
    jobsRef.current = queue.jobs;
  }, [queue.jobs]);

  const accoda = useCallback(
    (media: MediaFile, blob: Blob | File) => {
      const jobId = queue.enqueue({
        fileBlob: blob,
        fileName: (blob as File).name || media.file.name,
        fileMime: blob.type || media.file.type || 'application/octet-stream',
        fileSize: blob.size,
        bozzaId,
        kind: kindPerAllegato(media.kind),
        takenAtIso: media.takenAt ? media.takenAt.toISOString() : null,
      });
      jobPerMedia.current.set(media.id, jobId);
    },
    [bozzaId, queue],
  );

  /**
   * Accoda i file non ancora presi in carico. Idempotente: chiamabile da un
   * effect a ogni cambio della lista.
   */
  const stage = useCallback(
    (files: MediaFile[], enabled: boolean) => {
      if (!enabled) return;
      const nuovi = files.filter((f) => !jobPerMedia.current.has(f.id));
      if (nuovi.length === 0) return;
      // Prenotazione immediata: l'effect può rientrare prima che la parte
      // async abbia finito, e non vogliamo accodare due volte lo stesso file.
      nuovi.forEach((f) => jobPerMedia.current.set(f.id, IN_PREPARAZIONE));

      void (async () => {
        try {
          await flush(); // la bozza deve esistere lato server prima di /init
          // Prima i file che non vanno compressi: partono all'istante.
          for (const f of nuovi.filter((x) => x.kind !== 'image')) {
            accoda(f, f.file);
          }
          for (const f of nuovi.filter((x) => x.kind === 'image')) {
            accoda(f, await compressImage(f.file));
          }
        } catch {
          // Rilascia la prenotazione: al prossimo giro si riprova.
          nuovi.forEach((f) => {
            if (jobPerMedia.current.get(f.id) === IN_PREPARAZIONE) {
              jobPerMedia.current.delete(f.id);
            }
          });
        }
      })();
    },
    [accoda, flush],
  );

  /**
   * Attende che i job dei file indicati siano terminali.
   * Un job in attesa di backoff viene rilanciato subito: l'utente ha appena
   * premuto "Crea commessa", non ha senso fargli aspettare 30s di attesa
   * esponenziale.
   */
  const attendiTerminali = useCallback(
    async (mediaIds: string[]) => {
      for (;;) {
        const attesi = mediaIds
          .map((id) => jobPerMedia.current.get(id))
          .filter((v): v is string => Boolean(v));
        const inPreparazione = attesi.some((v) => v === IN_PREPARAZIONE);
        const jobs = jobsRef.current.filter((j) => attesi.includes(j.id));
        const inCorso = jobs.filter((j) => !eTerminale(j));
        if (!inPreparazione && inCorso.length === 0) return;
        for (const j of inCorso) {
          if (j.status === 'queued' && j.nextAttemptAt && j.nextAttemptAt > Date.now()) {
            queue.retry(j.id);
          }
        }
        await new Promise((r) => setTimeout(r, 250));
      }
    },
    [queue],
  );

  const finalizeMedia = useCallback(
    async (
      files: MediaFile[],
    ): Promise<{ keep: string[]; results: Array<{ name: string; ok: boolean }> }> => {
      // I file aggiunti all'ultimo istante potrebbero non essere ancora in coda.
      stage(files, true);
      await attendiTerminali(files.map((f) => f.id));

      const keep: string[] = [];
      const results: Array<{ name: string; ok: boolean }> = [];
      for (const f of files) {
        const jobId = jobPerMedia.current.get(f.id);
        const job = jobId ? jobsRef.current.find((j) => j.id === jobId) : undefined;
        const ok = Boolean(job && job.status === 'done' && job.fileRefId);
        if (ok) keep.push(job!.fileRefId as string);
        results.push({ name: f.file.name, ok });
      }
      return { keep, results };
    },
    [attendiTerminali, stage],
  );

  /** Progresso per mediaId, nella forma attesa dalla MediaAttachSection. */
  const progress: UploadProgressMap = useMemo(() => {
    const mappa: UploadProgressMap = new Map();
    for (const [mediaId, jobId] of jobPerMedia.current.entries()) {
      if (jobId === IN_PREPARAZIONE) {
        mappa.set(mediaId, { pct: 0, step: 'compressing' });
        continue;
      }
      const job = queue.jobs.find((j) => j.id === jobId);
      if (!job) continue;
      const pct =
        job.bytesTotal > 0
          ? Math.floor((job.bytesUploaded / job.bytesTotal) * 100)
          : 0;
      if (job.status === 'done') mappa.set(mediaId, { pct: 100, step: 'done' });
      else if (job.status === 'failed' || job.status === 'canceled') {
        mappa.set(mediaId, { pct, step: 'error' });
      } else if (job.status === 'finalizing') {
        mappa.set(mediaId, { pct: 100, step: 'processing' });
      } else {
        mappa.set(mediaId, { pct, step: 'uploading' });
      }
    }
    return mappa;
  }, [queue.jobs]);

  const uploading = useMemo(() => {
    const ids = new Set(jobPerMedia.current.values());
    return queue.jobs.some((j) => ids.has(j.id) && !eTerminale(j));
  }, [queue.jobs]);

  return { progress, uploading, stage, finalizeMedia };
}
