'use client';

import * as React from 'react';
import { LogIn, LogOut, ChevronDown } from 'lucide-react';

import type { DettaglioPresenza } from '../../_lib/presenze-types';
import { DettaglioPresenzaView } from '../../_components/dettaglio-presenza';

export type RigaUltima = {
  id: string;
  tipo: 'ingresso' | 'uscita';
  oraLabel: string;
  dipNome: string;
  cantNome: string | null;
  /** Stato "di oggi" del dipendente, mostrato all'espansione della riga. */
  dettaglio: DettaglioPresenza;
};

export function UltimeTimbrature({ righe }: { righe: RigaUltima[] }) {
  const [aperto, setAperto] = React.useState<string | null>(null);

  if (righe.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        Nessuna timbratura registrata.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {righe.map((t) => {
        const ingresso = t.tipo === 'ingresso';
        const isOpen = aperto === t.id;
        return (
          <div key={t.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
            <button
              type="button"
              onClick={() => setAperto(isOpen ? null : t.id)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-transform active:scale-[0.99]"
            >
              <span
                className={
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ' +
                  (ingresso
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40'
                    : 'bg-muted text-muted-foreground')
                }
              >
                {ingresso ? <LogIn className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{t.dipNome}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {ingresso ? 'Ingresso' : 'Uscita'}
                  {t.cantNome ? ` · ${t.cantNome}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                {t.oraLabel}
              </span>
              <ChevronDown
                className={
                  'h-4 w-4 shrink-0 text-muted-foreground transition-transform ' +
                  (isOpen ? 'rotate-180' : '')
                }
                aria-hidden="true"
              />
            </button>
            {isOpen ? (
              <div className="px-4 pb-3">
                <DettaglioPresenzaView d={t.dettaglio} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
