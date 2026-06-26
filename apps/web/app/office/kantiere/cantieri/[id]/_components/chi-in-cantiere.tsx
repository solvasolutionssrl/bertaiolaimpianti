'use client';

import { Coffee, HardHat, Users2 } from 'lucide-react';
import { fmtOra } from '@/app/office/_lib/format';

export interface PresenteRow {
  dipendenteId: string;
  nome: string;
  stato: 'lavoro' | 'pausa';
  da: string | null;
}

/**
 * Lista live dei dipendenti attualmente in cantiere (turno aperto = lavoro,
 * oppure in pausa pranzo). Calcolata server-side dalle timbrature di oggi.
 */
export function ChiInCantiere({ presenti }: { presenti: PresenteRow[] }) {
  if (presenti.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-6 text-center text-sm italic text-muted-foreground">
        Nessuno in cantiere ora.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {presenti.map((p) => {
        const inPausa = p.stato === 'pausa';
        return (
          <li
            key={p.dipendenteId}
            className={`flex items-center gap-2.5 rounded-md border px-2.5 py-1.5 ${
              inPausa
                ? 'border-amber-200/60 bg-amber-50/40 dark:border-amber-900/30 dark:bg-amber-950/20'
                : 'border-emerald-200/60 bg-emerald-50/40 dark:border-emerald-900/30 dark:bg-emerald-950/20'
            }`}
          >
            {inPausa ? (
              <Coffee className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
            ) : (
              <HardHat className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
            )}
            <span className="flex-1 truncate text-sm font-medium">{p.nome}</span>
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                inPausa
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              }`}
            >
              {inPausa ? 'In pausa' : 'Al lavoro'}
            </span>
            {p.da ? (
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                dalle {fmtOra(p.da)}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Header con icona usato nelle sezioni: piccola etichetta + chip colorato. */
export function SezioneHeader({
  icon,
  titolo,
  accent = 'blue',
  right,
}: {
  icon: 'persone' | React.ReactNode;
  titolo: string;
  accent?: 'blue' | 'amber' | 'emerald';
  right?: React.ReactNode;
}) {
  const accentCls: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  };
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-md ${accentCls[accent]}`}>
          {icon === 'persone' ? <Users2 className="h-4 w-4" aria-hidden="true" /> : icon}
        </span>
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {titolo}
        </h2>
      </div>
      {right}
    </div>
  );
}
