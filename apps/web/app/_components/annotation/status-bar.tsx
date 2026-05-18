'use client';

/**
 * StatusBar — riga 40px in basso al canvas.
 *
 * Mostra (in ordine di priorità):
 *  - stato salvataggio: "Salvato 12s fa" / "Modifiche non salvate" / "Salvataggio…" / errore
 *  - info pagina/zoom (PDF) o dimensioni (foto)
 *  - lock info (chi sta editando se non sono io)
 *  - toggle autosave (se onToggleAutoSave passato)
 */

import * as React from 'react';
import { Loader2, CheckCircle2, AlertTriangle, Save, Lock } from 'lucide-react';

import type { SaveStatus } from './types';

export interface AnnotationStatusBarProps {
  status: SaveStatus;
  pageInfo?: string; // "Pag 3 di 12" o "1280×960px"
  zoomInfo?: string; // "100%"
  autoSave?: boolean;
  onToggleAutoSave?: () => void;
  lockedByOther?: { displayName: string; remainingSec: number } | null;
}

export function AnnotationStatusBar(props: AnnotationStatusBarProps) {
  const { status, pageInfo, zoomInfo, autoSave, onToggleAutoSave, lockedByOther } =
    props;
  const [, tick] = React.useReducer((n: number) => n + 1, 0);

  // Re-render ogni 5s per aggiornare "Salvato Ns fa"
  React.useEffect(() => {
    if (status.kind !== 'saved') return;
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, [status]);

  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-t border-slate-800 bg-slate-900 px-3 text-xs text-slate-300">
      <div className="flex min-w-0 items-center gap-2">
        <StatusPill status={status} />
        {lockedByOther ? (
          <span className="hidden items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300 sm:inline-flex">
            <Lock className="h-3 w-3" aria-hidden="true" />
            {lockedByOther.displayName} sta modificando ·{' '}
            {Math.ceil(lockedByOther.remainingSec / 60)}m
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3 text-slate-400">
        {pageInfo ? <span className="hidden sm:inline">{pageInfo}</span> : null}
        {zoomInfo ? <span className="hidden sm:inline">{zoomInfo}</span> : null}
        {onToggleAutoSave ? (
          <button
            type="button"
            onClick={onToggleAutoSave}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-slate-800"
            aria-pressed={!!autoSave}
            title={autoSave ? 'Disattiva auto-save' : 'Attiva auto-save'}
          >
            <span
              className={[
                'inline-block h-2 w-2 rounded-full',
                autoSave ? 'bg-emerald-400' : 'bg-slate-500',
              ].join(' ')}
            />
            Auto-save {autoSave ? 'on' : 'off'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: SaveStatus }) {
  switch (status.kind) {
    case 'idle':
      return (
        <span className="inline-flex items-center gap-1.5 text-slate-400">
          <span className="h-2 w-2 rounded-full bg-slate-500" />
          Tutto salvato
        </span>
      );
    case 'dirty':
      return (
        <span className="inline-flex items-center gap-1.5 text-amber-300">
          <Save className="h-3 w-3" aria-hidden="true" />
          Modifiche non salvate
        </span>
      );
    case 'saving':
      return (
        <span className="inline-flex items-center gap-1.5 text-slate-200">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          Salvataggio…
        </span>
      );
    case 'saved': {
      const sec = Math.max(1, Math.round((Date.now() - status.at) / 1000));
      const label =
        sec < 60
          ? `${sec}s fa`
          : sec < 3600
            ? `${Math.round(sec / 60)} min fa`
            : 'qualche tempo fa';
      return (
        <span className="inline-flex items-center gap-1.5 text-emerald-300">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          Salvato {label}
        </span>
      );
    }
    case 'error':
      return (
        <span className="inline-flex items-center gap-1.5 text-destructive">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          {status.message}
        </span>
      );
  }
}
