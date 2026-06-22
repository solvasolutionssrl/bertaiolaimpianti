'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface TurnoAttivoCardProps {
  cantiereId: string;
  cantiereNome: string;
  /** ISO timestamp dell'ingresso ancora aperto. */
  inizioTs: string;
}

function oraIngresso(ts: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

function formatTrascorso(ms: number): string {
  const totMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totMin / 60);
  const m = totMin % 60;
  if (h === 0) return `${m}min`;
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

/**
 * Card "turno in corso": il dipendente ha timbrato l'ingresso ma non l'uscita.
 * Pallino verde pulsante, ora di ingresso, contatore ore live, promemoria di
 * timbrare l'uscita. Tappabile → scheda cantiere. Compatta.
 */
export function TurnoAttivoCard({ cantiereId, cantiereNome, inizioTs }: TurnoAttivoCardProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const trascorso = formatTrascorso(now - Date.parse(inizioTs));

  return (
    <Link
      href={`/mobile/kantiere/cantieri/${cantiereId}`}
      className="block rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-50 via-emerald-50/70 to-transparent p-3.5 shadow-soft active:scale-[0.99] transition-transform"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
            Turno in corso
          </span>
        </span>
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-emerald-800">
          {trascorso}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-tight text-foreground">
            {cantiereNome}
          </p>
          <p className="mt-0.5 text-xs text-emerald-800/80">
            Timbrato alle {oraIngresso(inizioTs)} · ricordati di timbrare l&apos;uscita a fine giornata.
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-emerald-700/70" aria-hidden="true" />
      </div>
    </Link>
  );
}
