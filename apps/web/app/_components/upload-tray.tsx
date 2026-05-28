'use client';

import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Video as VideoIcon,
  X,
} from 'lucide-react';
import { Button, cn } from '@kommessa/ui';

import {
  useUploadQueueOptional,
} from './upload-queue-provider';
import type { JobStatus, UploadJob } from '../_lib/upload-queue/types';

/**
 * Pannello fluttuante in basso a destra che mostra gli upload attivi.
 *
 * Compare solo quando ci sono job non-terminali, e resta per 5s in
 * "afterglow" dopo che tutti sono done — poi sparisce. Espandibile.
 */

const AFTERGLOW_MS = 5_000;

export function UploadTray() {
  const ctx = useUploadQueueOptional();
  const [expanded, setExpanded] = React.useState(true);
  const [hideAt, setHideAt] = React.useState<number | null>(null);

  // Trigger afterglow quando l'activeCount diventa 0 e ci sono job done.
  React.useEffect(() => {
    if (!ctx) return;
    if (ctx.activeCount > 0) {
      setHideAt(null);
      return;
    }
    const hasRecentDone = ctx.jobs.some((j) => j.status === 'done');
    const hasError = ctx.jobs.some((j) => j.status === 'failed');
    if (hasRecentDone || hasError) {
      setHideAt(Date.now() + AFTERGLOW_MS);
    } else {
      setHideAt(null);
    }
  }, [ctx?.activeCount, ctx?.jobs, ctx]);

  // Tick per nascondere il tray quando l'afterglow scade.
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    if (hideAt == null) return;
    const ms = hideAt - Date.now();
    if (ms <= 0) {
      force();
      return;
    }
    const t = setTimeout(force, ms);
    return () => clearTimeout(t);
  }, [hideAt]);

  if (!ctx) return null;
  const { jobs, activeCount, cancel, retry, remove } = ctx;

  const visible =
    activeCount > 0 ||
    (hideAt !== null && Date.now() < hideAt && jobs.length > 0);
  if (!visible) return null;

  const inProgress = jobs.filter(
    (j) =>
      j.status === 'queued' ||
      j.status === 'init' ||
      j.status === 'uploading' ||
      j.status === 'finalizing',
  );
  const failed = jobs.filter((j) => j.status === 'failed');
  const done = jobs.filter((j) => j.status === 'done');

  const totalLoaded = jobs.reduce((acc, j) => acc + j.bytesUploaded, 0);
  const totalSize = jobs.reduce((acc, j) => acc + j.bytesTotal, 0);
  const pctTotal = totalSize > 0 ? Math.floor((totalLoaded / totalSize) * 100) : 0;

  return (
    <div
      role="region"
      aria-label="Upload in corso"
      className="pointer-events-auto fixed bottom-4 right-4 z-50 w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-xl ring-1 ring-black/5"
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-left transition-colors hover:bg-muted/60"
        aria-expanded={expanded}
      >
        {activeCount > 0 ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : failed.length > 0 ? (
          <AlertTriangle className="h-4 w-4 text-amber-600" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        )}
        <span className="flex-1 text-sm font-medium">
          {activeCount > 0
            ? `Carico ${activeCount} file…${pctTotal > 0 ? ` ${pctTotal}%` : ''}`
            : failed.length > 0
              ? `${failed.length} upload con errori`
              : `${done.length} upload completati`}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {/* Lista jobs */}
      {expanded && (
        <ul className="max-h-[40vh] divide-y divide-border overflow-y-auto">
          {[...inProgress, ...failed, ...done.slice(-3)].map((job) => (
            <JobRow
              key={job.id}
              job={job}
              onCancel={() => cancel(job.id)}
              onRetry={() => retry(job.id)}
              onRemove={() => remove(job.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function JobRow({
  job,
  onCancel,
  onRetry,
  onRemove,
}: {
  job: UploadJob;
  onCancel: () => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const isVideo = job.payload.fileMime.startsWith('video/');
  const pct =
    job.bytesTotal > 0 ? Math.floor((job.bytesUploaded / job.bytesTotal) * 100) : 0;
  const label = LABELS[job.status];

  return (
    <li className="flex items-start gap-2.5 px-3 py-2.5">
      <span
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
          job.status === 'done'
            ? 'bg-emerald-500/10 text-emerald-600'
            : job.status === 'failed'
              ? 'bg-destructive/10 text-destructive'
              : 'bg-primary/10 text-primary',
        )}
        aria-hidden="true"
      >
        {isVideo ? (
          <VideoIcon className="h-3.5 w-3.5" />
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
            job.status === 'failed'
              ? 'text-destructive'
              : 'text-muted-foreground',
          )}
        >
          {label}
          {job.status === 'uploading' || job.status === 'finalizing'
            ? ` · ${pct}% · ${formatBytes(job.bytesUploaded)}/${formatBytes(job.bytesTotal)}`
            : ''}
          {job.status === 'queued' && job.attempt > 0
            ? ` · tentativo ${job.attempt + 1}/${5}`
            : ''}
        </p>

        {/* Progress bar (solo se stiamo caricando) */}
        {(job.status === 'uploading' ||
          job.status === 'finalizing' ||
          job.status === 'init') && (
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-200"
              style={{ width: `${Math.max(2, pct)}%` }}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        )}

        {/* Errore */}
        {job.status === 'failed' && job.lastError ? (
          <p
            className="mt-0.5 line-clamp-2 font-mono text-[10px] text-destructive/80"
            title={job.lastError}
          >
            {job.lastError}
          </p>
        ) : null}
      </div>

      {/* Azioni */}
      <div className="flex shrink-0 items-start gap-1">
        {(job.status === 'init' ||
          job.status === 'uploading' ||
          job.status === 'finalizing' ||
          job.status === 'queued') && (
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

const LABELS: Record<JobStatus, string> = {
  queued: 'In coda',
  init: 'Preparo upload…',
  uploading: 'Carico',
  finalizing: 'Finalizzo…',
  done: 'Caricato',
  failed: 'Errore',
  canceled: 'Annullato',
};

function formatBytes(n: number): string {
  if (!n || n <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
