'use client';

import * as React from 'react';
import {
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  RotateCcw,
  Video as VideoIcon,
  X,
} from 'lucide-react';
import { Button, cn } from '@kommessa/ui';

import { MAX_ATTEMPTS, type JobStatus, type UploadJob } from '../_lib/upload-queue/types';

/**
 * Riga di un upload, condivisa fra il pannello fluttuante (UploadTray) e la
 * pagina "Caricamenti".
 *
 * Codice colore (deciso 30/07/2026):
 *  - **blu** = file appena aggiunto, sta salendo adesso;
 *  - **ambra** = file ripreso da una sessione precedente (l'app era stata
 *    chiusa) oppure in attesa di ritentare — "ci sto tornando sopra";
 *  - **verde** = fatto;
 *  - **rosso** = fallito dopo tutti i tentativi.
 */

export type TonoUpload = 'blu' | 'ambra' | 'verde' | 'rosso';

export function tonoDelJob(job: UploadJob): TonoUpload {
  if (job.status === 'done') return 'verde';
  if (job.status === 'failed') return 'rosso';
  if (job.ripreso || job.attempt > 0) return 'ambra';
  return 'blu';
}

const CLASSI_ICONA: Record<TonoUpload, string> = {
  blu: 'bg-primary/10 text-primary',
  ambra: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  verde: 'bg-emerald-500/10 text-emerald-600',
  rosso: 'bg-destructive/10 text-destructive',
};

const CLASSI_BARRA: Record<TonoUpload, string> = {
  blu: 'bg-primary',
  ambra: 'bg-amber-500',
  verde: 'bg-emerald-500',
  rosso: 'bg-destructive',
};

const ETICHETTE: Record<JobStatus, string> = {
  queued: 'In coda',
  init: 'Preparo…',
  uploading: 'Carico',
  finalizing: 'Finalizzo…',
  done: 'Caricato',
  failed: 'Errore',
  canceled: 'Annullato',
};

export function UploadJobRow({
  job,
  onCancel,
  onRetry,
  onRemove,
  compatta = false,
}: {
  job: UploadJob;
  onCancel: () => void;
  onRetry: () => void;
  onRemove: () => void;
  /** true nel pannello fluttuante (spazio ridotto). */
  compatta?: boolean;
}) {
  const tono = tonoDelJob(job);
  const isVideo = (job.payload.fileMime ?? '').startsWith('video/');
  const isPdf = (job.payload.fileMime ?? '').includes('pdf');
  const pct =
    job.bytesTotal > 0
      ? Math.min(100, Math.floor((job.bytesUploaded / job.bytesTotal) * 100))
      : 0;
  const inCorso =
    job.status === 'uploading' ||
    job.status === 'finalizing' ||
    job.status === 'init';

  return (
    <li className={cn('flex items-start gap-2.5 px-3', compatta ? 'py-2.5' : 'py-3')}>
      <span
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
          CLASSI_ICONA[tono],
        )}
        aria-hidden="true"
      >
        {isVideo ? (
          <VideoIcon className="h-3.5 w-3.5" />
        ) : isPdf ? (
          <FileText className="h-3.5 w-3.5" />
        ) : (
          <ImageIcon className="h-3.5 w-3.5" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium" title={job.payload.fileName}>
          {job.payload.fileName}
        </p>
        <p
          className={cn(
            'mt-0.5 text-[10px] tabular-nums',
            tono === 'rosso' ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {job.ripreso && job.status !== 'done' ? 'Riprendo · ' : ''}
          {ETICHETTE[job.status]}
          {inCorso && job.status !== 'init'
            ? ` · ${pct}% · ${formattaByte(job.bytesUploaded)}/${formattaByte(job.bytesTotal)}`
            : ''}
          {job.status === 'queued' && job.attempt > 0
            ? ` · tentativo ${job.attempt + 1} di ${MAX_ATTEMPTS}`
            : ''}
        </p>

        {inCorso || (job.status === 'queued' && job.attempt > 0) ? (
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full transition-[width] duration-200',
                CLASSI_BARRA[tono],
              )}
              style={{ width: `${Math.max(2, pct)}%` }}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        ) : null}

        {job.status === 'failed' && job.lastError ? (
          <p
            className="mt-0.5 line-clamp-2 font-mono text-[10px] text-destructive/80"
            title={job.lastError}
          >
            {job.lastError}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-start gap-1">
        {(inCorso || job.status === 'queued') && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            onClick={onCancel}
            aria-label="Annulla upload"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
        {job.status === 'failed' && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-primary"
              onClick={onRetry}
              aria-label="Riprova upload"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground"
              onClick={onRemove}
              aria-label="Rimuovi dalla lista"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        {job.status === 'done' && (
          <CheckCircle2
            className="mt-1 h-4 w-4 text-emerald-600"
            aria-label="Completato"
          />
        )}
      </div>
    </li>
  );
}

export function formattaByte(n: number): string {
  if (!n || n <= 0) return '—';
  const unita = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < unita.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${unita[i]}`;
}
