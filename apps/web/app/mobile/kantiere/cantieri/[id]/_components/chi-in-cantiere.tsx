'use client';

import * as React from 'react';
import { ChevronDown, UserCheck } from 'lucide-react';

import type { DettaglioPresenza, StatoPresenza } from '../../../_lib/presenze-types';
import { DettaglioPresenzaView, StatoBadgePresenza } from '../../../_components/dettaglio-presenza';

export type PersonaDentro = {
  dipId: string;
  nome: string;
  stato: Extract<StatoPresenza, 'lavoro' | 'pausa'>;
  /** Sottotitolo "dalle 09:16" / "in pausa dalle 12:00", o null. */
  sub: string | null;
  dettaglio: DettaglioPresenza;
};

/**
 * Vista office/admin: chi sta lavorando (o è in pausa) in questo cantiere ORA.
 * Tap su una persona → timbrature di oggi + stato (come la riga presenze desktop).
 */
export function ChiInCantiere({ persone }: { persone: PersonaDentro[] }) {
  const [aperto, setAperto] = React.useState<string | null>(null);

  const nLavoro = persone.filter((p) => p.stato === 'lavoro').length;
  const nPausa = persone.filter((p) => p.stato === 'pausa').length;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
          In cantiere ora
        </p>
        {persone.length > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            {nLavoro} al lavoro{nPausa > 0 ? ` · ${nPausa} in pausa` : ''}
          </span>
        ) : null}
      </div>

      {persone.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Nessuno sta lavorando qui in questo momento.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {persone.map((p) => {
            const isOpen = aperto === p.dipId;
            return (
              <li key={p.dipId} className="overflow-hidden rounded-lg border border-border/70 bg-background">
                <button
                  type="button"
                  onClick={() => setAperto(isOpen ? null : p.dipId)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.nome}</span>
                    {p.sub ? (
                      <span className="block truncate text-[11px] text-muted-foreground">{p.sub}</span>
                    ) : null}
                  </span>
                  <StatoBadgePresenza stato={p.stato} />
                  <ChevronDown
                    className={
                      'h-4 w-4 shrink-0 text-muted-foreground transition-transform ' +
                      (isOpen ? 'rotate-180' : '')
                    }
                    aria-hidden="true"
                  />
                </button>
                {isOpen ? (
                  <div className="px-3 pb-2">
                    <DettaglioPresenzaView d={p.dettaglio} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
