'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useUploadQueue } from '../_components/upload-queue-provider';
import type { Momento } from './media-upload-types';
import type { JobStatus } from './upload-queue/types';

export type UploadPhase = 'idle' | 'init' | 'uploading' | 'finalizing' | 'done' | 'failed' | 'aborted';

export interface UploadState {
  phase: UploadPhase;
  progressPct: number; // 0..100
  bytesUploaded: number;
  bytesTotal: number;
  fileRefId: string | null;
  error: string | null;
}

export interface UploadInput {
  file: File;
  commessaId: string;
  momento?: Momento;
  voceId?: number | null;
  filename?: string;
  geoLat?: number | null;
  geoLng?: number | null;
  // Variant allegato riunione
  riunioneId?: string | null;
  kind?: 'foto' | 'video' | 'pdf_acquisito' | null;
}

export interface UploadOptions {
  multipartConcurrency?: number;
  sha256MaxBytes?: number;
}

const INITIAL_STATE: UploadState = {
  phase: 'idle',
  progressPct: 0,
  bytesUploaded: 0,
  bytesTotal: 0,
  fileRefId: null,
  error: null,
};

const STATUS_TO_PHASE: Record<JobStatus, UploadPhase> = {
  queued: 'init',
  init: 'init',
  uploading: 'uploading',
  finalizing: 'finalizing',
  done: 'done',
  failed: 'failed',
  canceled: 'aborted',
};

/**
 * Hook back-compat: delega l'upload alla UploadQueue globale ma espone
 * la stessa API che usavano `scatto-form`, `add-media-section` ecc.
 *
 * Differenza chiave: l'upload sopravvive al cambio pagina (la queue è
 * nel provider montato in layout.tsx). Quando il componente che ha
 * chiamato upload() si smonta a metà, la Promise viene risolta solo se
 * il job è già done. Per casi che richiedono la conferma del completion
 * conviene osservare la queue direttamente con `useUploadQueue()`.
 */
export function useChunkedUpload(_options: UploadOptions = {}) {
  const queue = useUploadQueue();
  const [jobId, setJobId] = useState<string | null>(null);
  const [state, setState] = useState<UploadState>(INITIAL_STATE);
  // Promise pending per ogni upload(): risolta quando il job finisce.
  const pendingResolveRef = useRef<{
    resolve: (r: { fileRefId: string; sizeBytes: number }) => void;
    reject: (e: Error) => void;
    jobId: string;
  } | null>(null);

  // Trova il job corrente nella queue e aggiorna lo state.
  const currentJob = useMemo(
    () => (jobId ? queue.jobs.find((j) => j.id === jobId) ?? null : null),
    [jobId, queue.jobs],
  );

  useEffect(() => {
    if (!currentJob) return;
    const pct =
      currentJob.bytesTotal > 0
        ? Math.floor((currentJob.bytesUploaded / currentJob.bytesTotal) * 100)
        : 0;
    setState({
      phase: STATUS_TO_PHASE[currentJob.status],
      progressPct: pct,
      bytesUploaded: currentJob.bytesUploaded,
      bytesTotal: currentJob.bytesTotal,
      fileRefId: currentJob.fileRefId,
      error: currentJob.lastError,
    });

    // Risolvi la promise pending sui terminal status.
    const pending = pendingResolveRef.current;
    if (pending && pending.jobId === currentJob.id) {
      if (currentJob.status === 'done' && currentJob.fileRefId) {
        pending.resolve({
          fileRefId: currentJob.fileRefId,
          sizeBytes: currentJob.bytesTotal,
        });
        pendingResolveRef.current = null;
      } else if (currentJob.status === 'failed') {
        pending.reject(new Error(currentJob.lastError ?? 'Upload fallito'));
        pendingResolveRef.current = null;
      } else if (currentJob.status === 'canceled') {
        pending.reject(new Error('Upload annullato'));
        pendingResolveRef.current = null;
      }
    }
  }, [currentJob]);

  const upload = useCallback(
    (input: UploadInput): Promise<{ fileRefId: string; sizeBytes: number }> => {
      const id = queue.enqueue({
        fileBlob: input.file,
        fileName: input.filename ?? input.file.name,
        fileMime: input.file.type || 'application/octet-stream',
        fileSize: input.file.size,
        commessaId: input.commessaId,
        momento: input.momento ?? null,
        voceId: input.voceId ?? null,
        riunioneId: input.riunioneId ?? null,
        kind: input.kind ?? null,
        geoLat: input.geoLat ?? null,
        geoLng: input.geoLng ?? null,
      });
      setJobId(id);
      setState({
        phase: 'init',
        progressPct: 0,
        bytesUploaded: 0,
        bytesTotal: input.file.size,
        fileRefId: null,
        error: null,
      });
      return new Promise<{ fileRefId: string; sizeBytes: number }>(
        (resolve, reject) => {
          pendingResolveRef.current = { resolve, reject, jobId: id };
        },
      );
    },
    [queue],
  );

  const cancel = useCallback(async () => {
    if (!jobId) return;
    queue.cancel(jobId);
  }, [jobId, queue]);

  return { state, upload, cancel };
}
