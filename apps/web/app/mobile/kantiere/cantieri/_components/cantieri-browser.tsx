'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search, MapPin } from 'lucide-react';

import { titoloCase } from '@/app/mobile/_lib/display-case';
import { TurnoAttivoCard } from '../../_components/turno-attivo-card';
import type { TurnoAttivoMio } from '../../_lib/turno-attivo';

export interface CantiereItem {
  id: string;
  codice: string | null;
  nome: string | null;
  indirizzo: string | null;
  stato: string;
}

const STATO_LABEL: Record<string, string> = {
  attivo: 'Attivo',
  sospeso: 'Sospeso',
  chiuso: 'Chiuso',
};

export function CantieriBrowser({
  cantieri,
  turno,
}: {
  cantieri: CantiereItem[];
  turno: TurnoAttivoMio | null;
}) {
  const [q, setQ] = useState('');

  const filtrati = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return cantieri;
    return cantieri.filter((c) =>
      [c.nome, c.codice, c.indirizzo]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(needle)),
    );
  }, [q, cantieri]);

  return (
    <div className="flex flex-col gap-3">
      {/* Stato attivo (turno) — in alto, sopra la ricerca. Spazio per future
          notifiche. */}
      {turno && (
        <TurnoAttivoCard
          cantiereId={turno.cantiereId}
          cantiereNome={turno.cantiereNome}
          inizioTs={turno.inizioTs}
        />
      )}

      {/* Ricerca */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          inputMode="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca cantiere..."
          aria-label="Cerca cantiere"
          className="h-11 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/60 shadow-soft focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Lista */}
      {filtrati.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          {q.trim() ? 'Nessun cantiere trovato.' : 'Nessun cantiere disponibile.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtrati.map((c) => (
            <Link
              key={c.id}
              href={`/mobile/kantiere/cantieri/${c.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-soft active:scale-[0.99] transition-transform"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {titoloCase(c.nome ?? '') || c.codice || 'Cantiere'}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                  {c.codice ? <span className="font-mono">{c.codice}</span> : null}
                  {c.indirizzo ? (
                    <span className="inline-flex min-w-0 items-center gap-0.5">
                      <MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{c.indirizzo}</span>
                    </span>
                  ) : null}
                  <span>{STATO_LABEL[c.stato] ?? c.stato}</span>
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
