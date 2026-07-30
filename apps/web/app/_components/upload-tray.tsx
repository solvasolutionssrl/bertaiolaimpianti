'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Loader2,
  RotateCw,
} from 'lucide-react';
import { cn } from '@kommessa/ui';

import { useUploadQueueOptional } from './upload-queue-provider';
import { UploadJobRow } from './upload-job-row';

/**
 * Pannello fluttuante degli upload.
 *
 * ─── Scelte 30/07/2026 ────────────────────────────────────────────────────
 *  - **Colore per stato**: blu = file nuovo che sta salendo, **ambra** = file
 *    ripreso da una sessione precedente o in attesa di ritentare, verde = fatto,
 *    rosso = fallito. Serve a far capire a colpo d'occhio che l'app "sta
 *    tornando sopra" a roba lasciata a metà.
 *  - **Niente più avviso "mantieni l'app aperta"**: non si chiede all'utente di
 *    fare da babysitter. Se chiude, i job restano su IndexedDB e ripartono da
 *    soli alla riapertura — ed è questo che il pannello dice.
 *  - **Non sparisce se ci sono errori**: prima l'afterglow nascondeva anche i
 *    falliti, che diventavano irraggiungibili.
 */

const AFTERGLOW_MS = 5_000;

export function UploadTray() {
  const ctx = useUploadQueueOptional();
  const pathname = usePathname();
  const isMobilePwa = (pathname ?? '').startsWith('/mobile');
  const [expanded, setExpanded] = React.useState(true);
  const [hideAt, setHideAt] = React.useState<number | null>(null);

  const activeCount = ctx?.activeCount ?? 0;
  const jobs = React.useMemo(() => ctx?.jobs ?? [], [ctx?.jobs]);
  const falliti = React.useMemo(
    () => jobs.filter((j) => j.status === 'failed'),
    [jobs],
  );

  // Afterglow: si nasconde solo se è andato tutto bene. Con dei falliti il
  // pannello resta, altrimenti l'utente non ha più modo di ritentare.
  React.useEffect(() => {
    if (!ctx) return;
    if (activeCount > 0 || falliti.length > 0) {
      setHideAt(null);
      return;
    }
    const qualcosaFatto = jobs.some((j) => j.status === 'done');
    setHideAt(qualcosaFatto ? Date.now() + AFTERGLOW_MS : null);
  }, [ctx, activeCount, falliti.length, jobs]);

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
  const { cancel, retry, remove, ripresiCount } = ctx;

  const visible =
    activeCount > 0 ||
    falliti.length > 0 ||
    (hideAt !== null && Date.now() < hideAt && jobs.length > 0);
  if (!visible) return null;

  const inCorso = jobs.filter(
    (j) =>
      j.status === 'queued' ||
      j.status === 'init' ||
      j.status === 'uploading' ||
      j.status === 'finalizing',
  );
  const fatti = jobs.filter((j) => j.status === 'done');

  const totalLoaded = jobs.reduce((acc, j) => acc + j.bytesUploaded, 0);
  const totalSize = jobs.reduce((acc, j) => acc + j.bytesTotal, 0);
  const pctTotale = totalSize > 0 ? Math.floor((totalLoaded / totalSize) * 100) : 0;

  // Ambra quando stiamo riprendendo roba lasciata a metà: è lo stato che
  // l'utente deve riconoscere al volo.
  const inRipresa = ripresiCount > 0 && activeCount > 0;

  return (
    <div
      role="region"
      aria-label="Caricamenti"
      className={cn(
        'pointer-events-auto fixed z-50 w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-card shadow-xl ring-1 ring-black/5',
        inRipresa ? 'border-amber-400/50' : 'border-border',
        isMobilePwa
          ? 'bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2'
          : 'bottom-4 right-4',
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2 border-b px-3 py-2 text-left transition-colors',
          inRipresa
            ? 'border-amber-400/40 bg-amber-50 hover:bg-amber-100/70 dark:bg-amber-950/30'
            : 'border-border bg-muted/40 hover:bg-muted/60',
        )}
        aria-expanded={expanded}
      >
        {activeCount > 0 ? (
          inRipresa ? (
            <RotateCw className="h-4 w-4 animate-spin text-amber-600 dark:text-amber-400" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )
        ) : falliti.length > 0 ? (
          <AlertTriangle className="h-4 w-4 text-destructive" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        )}
        <span className="flex-1 text-sm font-medium">
          {activeCount > 0
            ? inRipresa
              ? `Riprendo ${ripresiCount} file…${pctTotale > 0 ? ` ${pctTotale}%` : ''}`
              : `Carico ${activeCount} file…${pctTotale > 0 ? ` ${pctTotale}%` : ''}`
            : falliti.length > 0
              ? `${falliti.length} da riprovare`
              : `${fatti.length} caricati`}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {expanded && (
        <ul className="max-h-[40vh] divide-y divide-border overflow-y-auto">
          {[...inCorso, ...falliti, ...fatti.slice(-3)].map((job) => (
            <UploadJobRow
              key={job.id}
              job={job}
              compatta
              onCancel={() => cancel(job.id)}
              onRetry={() => retry(job.id)}
              onRemove={() => remove(job.id)}
            />
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-3 py-1.5">
        <p className="text-[10px] leading-tight text-muted-foreground">
          {inRipresa
            ? 'Ripresi da prima. Puoi continuare a lavorare.'
            : 'Puoi chiudere l’app: riprendono da soli.'}
        </p>
        {isMobilePwa ? (
          <Link
            href="/mobile/caricamenti"
            className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold text-primary"
          >
            Vedi tutti
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
