'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronRight, MapPin, Search, X } from 'lucide-react';

import { StatoLed } from '@impiantixplus/ui';
import type { StatoCommessa } from '@impiantixplus/api/types';

import { Stagger } from '../../_components/blueprint';

export interface BrowserRow {
  id: string;
  codice_interno: string;
  nome_cartella: string;
  stato: StatoCommessa;
  cliente_indirizzo_cantiere: string | null;
  data_apertura: string;
  cliente_nome: string | null;
  responsabile_nome: string | null;
}

const STATO_ORDER: StatoCommessa[] = [
  'in_corso',
  'aperta',
  'collaudo',
  'bozza',
  'completata',
  'archiviata',
];

const STATO_LABEL: Record<string, string> = {
  in_corso: 'In corso',
  aperta: 'Aperta',
  collaudo: 'Collaudo',
  bozza: 'Bozza',
  completata: 'Completata',
  archiviata: 'Archiviata',
};

/**
 * Lista commesse mobile in stile "app operativa":
 * - Search bar full-width
 * - Pills filtro stato scrollabili orizzontalmente
 * - Lista compatta — niente padding eccessivo
 *
 * Stato gestito interamente client-side (no URL params) per latenza zero.
 */
export function CommesseBrowser({
  rows,
  countByStato,
}: {
  rows: BrowserRow[];
  countByStato: Record<string, number>;
}) {
  const [query, setQuery] = React.useState('');
  const [statoFilter, setStatoFilter] = React.useState<StatoCommessa | 'all'>('all');

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statoFilter !== 'all' && r.stato !== statoFilter) return false;
      if (!q) return true;
      return (
        r.codice_interno.toLowerCase().includes(q) ||
        (r.cliente_nome ?? '').toLowerCase().includes(q) ||
        (r.cliente_indirizzo_cantiere ?? '').toLowerCase().includes(q) ||
        (r.responsabile_nome ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, query, statoFilter]);

  const statiAttivi = STATO_ORDER.filter((s) => countByStato[s]);

  return (
    <div className="flex flex-col gap-4">
      {/* Search bar */}
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          placeholder="Cerca codice, cliente, indirizzo…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Cerca commessa"
          className="h-11 w-full rounded-lg border border-border bg-card pl-9 pr-9 text-sm shadow-soft outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Cancella ricerca"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {/* Filter pills scrollable */}
      <div
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        <FilterPill
          active={statoFilter === 'all'}
          onClick={() => setStatoFilter('all')}
          label="Tutte"
          count={rows.length}
        />
        {statiAttivi.map((s) => (
          <FilterPill
            key={s}
            active={statoFilter === s}
            onClick={() => setStatoFilter(s)}
            label={STATO_LABEL[s] ?? s}
            count={countByStato[s] ?? 0}
            led={<StatoLed stato={s} />}
          />
        ))}
      </div>

      {/* Result count */}
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
        {filtered.length === 0
          ? 'Nessun risultato'
          : `${filtered.length} di ${rows.length} ${filtered.length === 1 ? 'commessa' : 'commesse'}`}
      </p>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
          <p className="text-sm font-medium text-foreground">Nessuna commessa</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Prova a cambiare ricerca o filtro</p>
        </div>
      ) : (
        <Stagger className="flex flex-col gap-1.5">
          {filtered.map((c) => (
            <CommessaRow key={c.id} c={c} />
          ))}
        </Stagger>
      )}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  count,
  led,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  led?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 transition-all active:scale-[0.96] ' +
        (active
          ? 'border-primary bg-primary text-primary-foreground shadow-soft'
          : 'border-border bg-card text-foreground hover:bg-muted/60')
      }
    >
      {led}
      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em]">{label}</span>
      <span
        className={
          'rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold tabular-nums ' +
          (active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground')
        }
      >
        {String(count).padStart(2, '0')}
      </span>
    </button>
  );
}

function CommessaRow({ c }: { c: BrowserRow }) {
  return (
    <Link
      href={`/mobile/commessa/${c.id}`}
      className="group flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-soft transition-all active:scale-[0.995] active:bg-muted"
    >
      <StatoLed stato={c.stato} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">
            {c.codice_interno}
          </span>
          {c.responsabile_nome ? (
            <span className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60">
              · {c.responsabile_nome}
            </span>
          ) : null}
        </div>
        <p className="truncate text-sm font-semibold tracking-tight text-foreground">
          {c.cliente_nome ?? c.nome_cartella}
        </p>
        {c.cliente_indirizzo_cantiere ? (
          <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            <MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{c.cliente_indirizzo_cantiere}</span>
          </p>
        ) : null}
      </div>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-active:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}
