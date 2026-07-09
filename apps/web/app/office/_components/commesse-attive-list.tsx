'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { StatoBadge } from '@kommessa/ui';
import { Search, X } from 'lucide-react';
import type { CommessaAttivaRow } from '../_lib/queries';

/**
 * Elenco compatto ricercabile delle commesse in lavorazione (dashboard, colonna
 * destra). NON usa una card per riga: è una lista densa con le info principali
 * (codice, cliente, oggetto, stato). Ricerca a token cross-campo.
 */
export function CommesseAttiveList({ rows }: { rows: CommessaAttivaRow[] }) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return rows;
    return rows.filter((r) => {
      const hay = [r.codice_interno, r.cliente_nome ?? '', r.titolo]
        .join(' ')
        .toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [q, rows]);

  return (
    <div className="flex flex-col">
      {/* Search (sticky in cima alla lista) */}
      <div className="border-b border-border p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            inputMode="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca codice, cliente, oggetto…"
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-8 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label="Pulisci ricerca"
              className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Lista */}
      <div className="max-h-[30rem] divide-y divide-border overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {rows.length === 0
              ? 'Nessuna commessa in lavorazione.'
              : 'Nessun risultato per la ricerca.'}
          </p>
        ) : (
          filtered.map((c) => (
            <Link
              key={c.id}
              href={`/office/commesse/${c.id}`}
              className="flex items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-muted/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-primary">
                    {c.codice_interno}
                  </span>
                  <span className="truncate text-sm font-medium">
                    {c.cliente_nome ?? '—'}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {c.titolo}
                </p>
              </div>
              <StatoBadge
                stato={c.stato as never}
                className="mt-0.5 h-5 shrink-0 px-2 text-[10px]"
              />
            </Link>
          ))
        )}
      </div>

      {/* Footer conteggio */}
      <div className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        {filtered.length === rows.length
          ? `${rows.length} commess${rows.length === 1 ? 'a' : 'e'}`
          : `${filtered.length} di ${rows.length}`}
      </div>
    </div>
  );
}
