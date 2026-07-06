'use client';

import * as React from 'react';
import { ChevronDown, Car, UserCheck, Utensils, CircleDot } from 'lucide-react';

import {
  TimbratureRiepilogo,
  type TimbraturaInput,
} from '@/app/office/kantiere/_components/timbrature-riepilogo';
import type { ViaggioTratta } from '@/app/office/kantiere/rapportini/_components/rapportini-client';
import type { StatoPresenza } from '../../_lib/presenze-types';

export type PersonaGiorno = {
  dipId: string;
  nome: string;
  stato: StatoPresenza;
  oreLabel: string;
  cantNome: string | null;
  timbrature: TimbraturaInput[];
  viaggi: ViaggioTratta[];
};

function minToColon(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

function StatoBadge({ stato }: { stato: StatoPresenza }) {
  if (stato === 'lavoro') {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40">
        <UserCheck className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  if (stato === 'pausa') {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/40">
        <Utensils className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <CircleDot className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

/**
 * Lista "presenze del giorno" del cruscotto office: una riga per persona,
 * espandibile al dettaglio ricco (timeline timbrature con ORIGINE via
 * `TimbratureRiepilogo` + sezione VIAGGIO sede↔cantiere). Vale per oggi e per
 * i giorni passati (consultazione storico).
 */
export function PresenzeGiorno({ persone }: { persone: PersonaGiorno[] }) {
  const [aperto, setAperto] = React.useState<string | null>(null);

  if (persone.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        Nessuna presenza registrata in questo giorno.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {persone.map((p) => {
        const isOpen = aperto === p.dipId;
        return (
          <div key={p.dipId} className="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
            <button
              type="button"
              onClick={() => setAperto(isOpen ? null : p.dipId)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-transform active:scale-[0.99]"
            >
              <StatoBadge stato={p.stato} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.nome}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {p.cantNome ? p.cantNome : 'Presenza'} · {p.oreLabel}
                  {p.stato === 'lavoro' ? ' · in cantiere' : p.stato === 'pausa' ? ' · in pausa' : ''}
                </span>
              </span>
              <ChevronDown
                className={
                  'h-4 w-4 shrink-0 text-muted-foreground transition-transform ' + (isOpen ? 'rotate-180' : '')
                }
                aria-hidden="true"
              />
            </button>
            {isOpen ? (
              <div className="space-y-3 px-4 pb-3">
                <TimbratureRiepilogo timbrature={p.timbrature} />

                {p.viaggi.length > 0 ? (
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Viaggio
                    </p>
                    <ul className="space-y-1">
                      {p.viaggi.map((v, i) => {
                        // Switch cantiere→cantiere: origine = cantiere di partenza.
                        const da = v.daCantiere || (v.direzione === 'andata' ? v.sede : v.cantiere || 'cantiere');
                        const a = v.direzione === 'andata' ? v.cantiere || 'cantiere' : v.sede;
                        return (
                          <li
                            key={i}
                            className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-sky-200/70 bg-sky-50/60 px-2.5 py-1.5 text-xs"
                          >
                            <Car className="h-3 w-3 shrink-0 text-sky-600" aria-hidden="true" />
                            <span className="font-medium capitalize text-sky-900">{v.direzione}</span>
                            <span className="text-sky-800">
                              {da} <span className="text-sky-400">→</span> {a}
                            </span>
                            <span className="ml-auto tabular-nums font-medium text-sky-700">
                              {v.autista && v.km > 0 ? `${Math.round(v.km)} km · ` : ''}
                              {minToColon(v.minuti)}
                            </span>
                            <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                              {v.autista ? 'autista' : 'passeggero'}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
