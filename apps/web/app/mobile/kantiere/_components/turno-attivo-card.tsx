'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Utensils } from 'lucide-react';

export interface TurnoAttivoCardProps {
  cantiereId: string;
  cantiereNome: string;
  /** ISO timestamp dell'inizio turno. */
  inizioTs: string;
  /** true se il turno è aperto ma in pausa pranzo. */
  inPausa?: boolean;
  /** ISO dell'inizio pausa in corso, o null. */
  inizioPausaTs?: string | null;
}

function ora(ts: string): string {
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
 * Card "turno in corso" / "in pausa": il dipendente ha un turno aperto.
 * Verde se sta lavorando, giallo se in pausa pranzo. Tappando si apre la
 * scheda del cantiere, dove può avviare/terminare la pausa pranzo o chiudere
 * il turno (anche a un orario scelto, se è uscito dimenticando di scansionare).
 */
export function TurnoAttivoCard({
  cantiereId,
  cantiereNome,
  inizioTs,
  inPausa = false,
  inizioPausaTs = null,
}: TurnoAttivoCardProps) {
  // Seed DETERMINISTICO (inizio turno, uguale su server e client) per evitare
  // il mismatch di hydration: `Date.now()` nell'initializer darebbe orari
  // diversi tra SSR e client → React rifà il render (flash). Dopo il mount
  // l'effect passa al tempo reale, così il contatore resta live.
  const [now, setNow] = useState(() => Date.parse(inizioTs));

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const trascorso = formatTrascorso(now - Date.parse(inizioTs));

  // Palette in base allo stato.
  const c = inPausa
    ? {
        ring: 'border-amber-400/50',
        bg: 'bg-gradient-to-br from-amber-50 via-amber-50/70 to-transparent',
        dot: 'bg-amber-500',
        tag: 'text-amber-700',
        chip: 'bg-amber-500/15 text-amber-800',
        sub: 'text-amber-800/80',
        chevron: 'text-amber-700/70',
      }
    : {
        ring: 'border-emerald-500/30',
        bg: 'bg-gradient-to-br from-emerald-50 via-emerald-50/70 to-transparent',
        dot: 'bg-emerald-500',
        tag: 'text-emerald-700',
        chip: 'bg-emerald-500/15 text-emerald-800',
        sub: 'text-emerald-800/80',
        chevron: 'text-emerald-700/70',
      };

  return (
    <Link
      href={`/mobile/kantiere/cantieri/${cantiereId}`}
      className={`block rounded-2xl border ${c.ring} ${c.bg} p-3.5 shadow-soft active:scale-[0.99] transition-transform`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="relative flex h-2.5 w-2.5">
            {!inPausa && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/70" />
            )}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${c.dot}`} />
          </span>
          <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.16em] ${c.tag}`}>
            {inPausa && <Utensils className="h-3 w-3" strokeWidth={2.5} />}
            {inPausa ? 'In pausa pranzo' : 'Turno in corso'}
          </span>
        </span>
        {!inPausa && (
          <span className={`rounded-full px-2 py-0.5 font-mono text-xs font-semibold tabular-nums ${c.chip}`}>
            {trascorso}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-tight text-foreground">
            {cantiereNome}
          </p>
          <p className={`mt-0.5 text-xs ${c.sub}`}>
            {inPausa
              ? `In pausa dalle ${inizioPausaTs ? ora(inizioPausaTs) : '--:--'} · tocca per riprendere o terminare.`
              : `Timbrato alle ${ora(inizioTs)} · tocca per pausa o fine turno.`}
          </p>
        </div>
        <ChevronRight className={`h-4 w-4 shrink-0 ${c.chevron}`} aria-hidden="true" />
      </div>
    </Link>
  );
}
