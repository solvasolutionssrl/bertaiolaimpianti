'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

import { Portal } from '@/app/mobile/_components/portal';
import { titoloCase } from '@/app/mobile/_lib/display-case';
import {
  codiceCantiereMostrato,
  categoriaLabel,
  categoriaTono,
} from '@/app/_lib/cantiere-categoria';

/**
 * Pacchetto ricerca cantiere riusabile ovunque serva SCEGLIERE un cantiere
 * (dialog ore a mano, avvio turno, cambio cantiere). Tre esportazioni:
 *
 *  - `CantiereSearchList` — casella di ricerca + lista filtrata (codice cliente,
 *    codice interno, nome, cliente, indirizzo). Card COMPATTE (2 righe, font
 *    piccolo) così ne stanno di più del solito. Presentazionale: `onPick(id)`.
 *  - `CantiereSearchSheet` — foglio full-screen in Portal (flussi standalone).
 *  - `CantierePicker` — controllo da FORM: bottone-trigger + pannello dropdown
 *    INLINE (dentro il dialog: niente Portal annidato che Radix chiuderebbe).
 *
 * REGOLE ANTI-OVERFLOW (il bug del "form gigante"): la lista scrolla SOLO in
 * verticale (`overflow-y-auto overflow-x-hidden`); tutta la catena ha `min-w-0`
 * e i testi troncano → nessuna card più larga del contenitore. L'altezza del
 * pannello è DEFINITA (`h-...`, non `max-h`) perché a `flex-1 overflow` serve un
 * antenato con altezza definita.
 */

export interface PickerCantiere {
  id: string;
  codice: string | null;
  codice_commessa: string | null;
  nome: string | null;
  cliente_nome: string | null;
  indirizzo: string | null;
  categoria: string | null;
}

function matchCantiere(c: PickerCantiere, needle: string): boolean {
  if (!needle) return true;
  return [c.nome, c.codice_commessa, c.codice, c.cliente_nome, c.indirizzo]
    .filter(Boolean)
    .some((v) => (v as string).toLowerCase().includes(needle));
}

// ── lista di ricerca (condivisa) — card COMPATTE ─────────────────────────────

export function CantiereSearchList({
  cantieri,
  selectedId,
  onPick,
  autoFocus = true,
  emptyLabel = 'Nessun cantiere disponibile.',
}: {
  cantieri: PickerCantiere[];
  selectedId?: string | null;
  onPick: (id: string) => void;
  autoFocus?: boolean;
  emptyLabel?: string;
}) {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  const filtrati = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cantieri.filter((c) => matchCantiere(c, needle));
  }, [q, cantieri]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      {/* Ricerca (font 16px = niente auto-zoom iOS) */}
      <div className="shrink-0 px-3 pb-2 pt-1">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca codice, cliente, nome..."
            aria-label="Cerca cantiere"
            className="h-11 w-full min-w-0 rounded-lg border border-border bg-background pl-8 pr-2.5 text-base text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Lista: scroll SOLO verticale (x bloccato) */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3">
        {filtrati.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            {q.trim() ? 'Nessun cantiere trovato.' : emptyLabel}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {filtrati.map((c) => {
              const codice = codiceCantiereMostrato(c);
              const attivo = selectedId === c.id;
              return (
                <li key={c.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onPick(c.id)}
                    className={[
                      'flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
                      attivo
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card active:bg-muted/50',
                    ].join(' ')}
                  >
                    <span className="min-w-0 flex-1 overflow-hidden">
                      <span className="block truncate text-[13px] font-medium leading-tight text-foreground">
                        {titoloCase(c.nome ?? '') || codice || 'Cantiere'}
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-tight text-muted-foreground">
                        {codice ? (
                          <span className="shrink-0 font-mono font-semibold text-primary">{codice}</span>
                        ) : null}
                        {c.cliente_nome ? (
                          <span className="min-w-0 truncate">
                            {codice ? '· ' : ''}
                            {titoloCase(c.cliente_nome)}
                          </span>
                        ) : null}
                        {c.categoria ? (
                          <span
                            className={`shrink-0 rounded-full border px-1 py-px text-[9px] font-medium ${categoriaTono(c.categoria)}`}
                          >
                            {categoriaLabel(c.categoria)}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    {attivo ? <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── foglio full-screen (Portal) ──────────────────────────────────────────────

export function CantiereSearchSheet({
  open,
  title = 'Scegli cantiere',
  cantieri,
  selectedId,
  onPick,
  onClose,
  footer,
}: {
  open: boolean;
  title?: string;
  cantieri: PickerCantiere[];
  selectedId?: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[80] flex flex-col overflow-hidden bg-background"
        role="dialog"
        aria-modal="true"
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted active:scale-95"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">{title}</h2>
        </header>

        <div className="min-h-0 flex-1">
          <CantiereSearchList cantieri={cantieri} selectedId={selectedId} onPick={onPick} />
        </div>

        {footer ? (
          <div className="shrink-0 border-t border-border bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
      </div>
    </Portal>
  );
}

// ── controllo da FORM (trigger + dropdown INLINE) ────────────────────────────

export function CantierePicker({
  cantieri,
  value,
  onChange,
  placeholder = 'Scegli cantiere',
  disabled = false,
}: {
  cantieri: PickerCantiere[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = value ? cantieri.find((c) => c.id === value) ?? null : null;
  const codice = selected ? codiceCantiereMostrato(selected) : null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative w-full min-w-0">
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
      >
        <span className="min-w-0 flex-1 overflow-hidden">
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium text-foreground">
                {titoloCase(selected.nome ?? '') || codice || 'Cantiere'}
              </span>
              {codice ? (
                <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
                  {codice}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown ASSOLUTO: si sovrappone ai campi sotto (non allunga il dialog).
          Altezza DEFINITA (~4 card poi scorre) — non max-h, che romperebbe il
          flex-1+scroll interno. z-30 per stare sopra i campi seguenti. */}
      {open ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-1.5 h-72 w-full min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <CantiereSearchList
            cantieri={cantieri}
            selectedId={value}
            autoFocus={false}
            onPick={(id) => {
              onChange(id);
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
