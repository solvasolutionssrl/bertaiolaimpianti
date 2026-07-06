'use client';

import * as React from 'react';
import { Search, ChevronDown, Check, X, Building2 } from 'lucide-react';
import type { CantiereLite } from '../page';

/**
 * Multi-select "cantieri collegati" per il form Sedi (desktop office).
 *
 * Sostituisce il muro di chip (tutti i 190 cantieri a schermo): un campo con
 * dropdown INLINE (non a schermata intera, niente modale) + ricerca interna +
 * lista dei primi risultati (scroll oltre ~7). I cantieri selezionati restano
 * come chip rimovibili sopra. Presentazionale: `onToggle(id, eraSelezionato)`.
 *
 * Ricerca a TOKEN cross-campo (come nella PWA): ogni parola della query deve
 * comparire in [nome, codice cliente, codice interno, cliente]. Così "fincantieri
 * monf" trova "Fincantieri … Monfalcone" anche con le parole in campi diversi.
 */

function matchCantiere(c: CantiereLite, needle: string): boolean {
  if (!needle) return true;
  const hay = [c.nome, c.codice_commessa, c.codice, c.cliente_nome]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return needle
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
}

interface Props {
  cantieri: CantiereLite[];
  selectedIds: string[];
  onToggle: (id: string, currentlySelected: boolean) => void;
  disabled?: boolean;
}

export function CantieriCollegatiSelect({ cantieri, selectedIds, onToggle, disabled }: Props) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);
  const byId = React.useMemo(() => new Map(cantieri.map((c) => [c.id, c])), [cantieri]);

  const filtrati = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cantieri.filter((c) => matchCantiere(c, needle));
  }, [q, cantieri]);

  // Chiude su click fuori.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  React.useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
  }, [open]);

  const chips = selectedIds
    .map((id) => byId.get(id))
    .filter((c): c is CantiereLite => Boolean(c));

  return (
    <div ref={wrapRef} className="relative w-full min-w-0">
      {/* Chip dei cantieri collegati (rimovibili) */}
      {chips.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span
              key={c.id}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-1 pl-2.5 pr-1 text-xs font-medium text-primary"
            >
              <span className="truncate">{c.nome}</span>
              <button
                type="button"
                onClick={() => onToggle(c.id, true)}
                disabled={disabled}
                aria-label={`Scollega ${c.nome}`}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-primary/70 hover:bg-primary/20 hover:text-primary disabled:opacity-50"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Trigger: apre il dropdown inline */}
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
      >
        <span className="inline-flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
          {chips.length > 0
            ? `${chips.length} ${chips.length === 1 ? 'cantiere collegato' : 'cantieri collegati'} · aggiungi o rimuovi`
            : 'Collega uno o più cantieri…'}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown INLINE assoluto: si sovrappone al contenuto sotto (non allunga
          il form). Ricerca in cima + lista che scorre oltre ~7 righe. */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cerca per nome, cliente o codice…"
                aria-label="Cerca cantiere"
                className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <ul className="max-h-[17rem] overflow-y-auto py-1">
            {filtrati.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                {q.trim() ? 'Nessun cantiere trovato.' : 'Nessun cantiere disponibile.'}
              </li>
            ) : (
              filtrati.map((c) => {
                const on = selectedSet.has(c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onToggle(c.id, on)}
                      className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left transition-colors ${
                        on ? 'bg-primary/5' : 'hover:bg-muted/60'
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground">{c.nome}</span>
                        {(c.codice_commessa || c.cliente_nome) && (
                          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            {c.codice_commessa && (
                              <span className="font-mono font-semibold text-primary">
                                {c.codice_commessa}
                              </span>
                            )}
                            {c.cliente_nome && <span className="truncate">{c.cliente_nome}</span>}
                          </span>
                        )}
                      </span>
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          on ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
                        }`}
                        aria-hidden="true"
                      >
                        {on && <Check className="h-3 w-3" />}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
