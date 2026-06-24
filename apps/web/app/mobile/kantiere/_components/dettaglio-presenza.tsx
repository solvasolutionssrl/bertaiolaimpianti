'use client';

import { LogIn, LogOut } from 'lucide-react';

import type { DettaglioPresenza, StatoPresenza } from '../_lib/presenze-types';

const STATO: Record<StatoPresenza, { label: string; badge: string; dot: string }> = {
  lavoro: {
    label: 'Al lavoro',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  pausa: {
    label: 'In pausa pranzo',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  idle: {
    label: 'Uscito',
    badge: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground/50',
  },
};

export function StatoBadgePresenza({ stato }: { stato: StatoPresenza }) {
  const s = STATO[stato];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.label}
    </span>
  );
}

/** Mirror della riga presenze desktop: stato + ore + coppie ingresso/uscita di oggi. */
export function DettaglioPresenzaView({ d }: { d: DettaglioPresenza }) {
  return (
    <div className="mt-2 space-y-2 border-t border-border pt-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <StatoBadgePresenza stato={d.stato} />
        <span className="text-muted-foreground">
          Oggi: <span className="font-medium tabular-nums text-foreground">{d.oreLavorate}</span>
        </span>
      </div>
      {d.coppie.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nessuna timbratura oggi.</p>
      ) : (
        <ul className="space-y-1">
          {d.coppie.map((c, i) => (
            <li key={i} className="flex items-center gap-2 text-xs tabular-nums">
              <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300">
                <LogIn className="h-3 w-3" aria-hidden="true" />
                {c.ingresso}
              </span>
              <span className="text-muted-foreground">→</span>
              {c.uscita ? (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <LogOut className="h-3 w-3" aria-hidden="true" />
                  {c.uscita}
                </span>
              ) : (
                <span className="font-medium text-emerald-600">in corso</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
