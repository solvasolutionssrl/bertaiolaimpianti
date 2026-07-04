'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { Search, ChevronDown, MapPin, User, Check, X } from 'lucide-react';

import { Portal } from '@/app/mobile/_components/portal';
import { titoloCase } from '@/app/mobile/_lib/display-case';
import {
  codiceCantiereMostrato,
  categoriaLabel,
  categoriaTono,
} from '@/app/_lib/cantiere-categoria';

/**
 * Pacchetto ricerca cantiere riusabile ovunque serva SCEGLIERE un cantiere
 * (dialog ore a mano, avvio turno, cambio cantiere). Due esportazioni:
 *
 *  - `CantiereSearchList` — casella di ricerca + lista filtrata (codice cliente,
 *    codice interno, nome, cliente, indirizzo — come la tab Cantieri). Presentazionale:
 *    chiama `onPick(id)`. Riusata da tutti i fogli.
 *  - `CantierePicker` — controllo da FORM: un pulsante-trigger (nessun autofocus,
 *    quindi niente lista che si apre da sola) che apre un FOGLIO full-screen (Portal
 *    su body) con la `CantiereSearchList`. Sostituisce le vecchie `<select>`.
 *
 * NB sul bug focus (iPhone): la vecchia `<select>` era il primo elemento focusabile
 * del dialog → Radix la focalizzava all'apertura, spalancando la lista. Qui il primo
 * focusabile è un semplice BOTTONE: la ricerca (con tastiera) si apre solo al tap.
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

// ── lista di ricerca (condivisa) ─────────────────────────────────────────────

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

  // Il focus va dato SOLO qui dentro (foglio aperto da un tap dell'utente),
  // mai da un dialog che si apre: così la tastiera compare quando serve.
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
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Ricerca */}
      <div className="px-4 pb-2 pt-1">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca per codice, cliente, nome, indirizzo..."
            aria-label="Cerca cantiere"
            className="h-12 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/60 shadow-soft focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {q.trim() ? (
          <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
            {filtrati.length} {filtrati.length === 1 ? 'risultato' : 'risultati'}
          </p>
        ) : null}
      </div>

      {/* Lista */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {filtrati.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
            {q.trim() ? 'Nessun cantiere trovato.' : emptyLabel}
          </div>
        ) : (
          <ul className="space-y-2">
            {filtrati.map((c) => {
              const codice = codiceCantiereMostrato(c);
              const attivo = selectedId === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onPick(c.id)}
                    className={[
                      'flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left shadow-soft transition-transform active:scale-[0.99]',
                      attivo
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:bg-muted/40',
                    ].join(' ')}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {titoloCase(c.nome ?? '') || codice || 'Cantiere'}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                        {c.cliente_nome ? (
                          <span className="inline-flex min-w-0 items-center gap-0.5">
                            <User className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">{titoloCase(c.cliente_nome)}</span>
                          </span>
                        ) : null}
                        {c.categoria ? (
                          <span
                            className={`rounded-full border px-1.5 py-px text-[10px] font-medium ${categoriaTono(c.categoria)}`}
                          >
                            {categoriaLabel(c.categoria)}
                          </span>
                        ) : null}
                        {c.indirizzo ? (
                          <span className="inline-flex min-w-0 items-center gap-0.5">
                            <MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">{c.indirizzo}</span>
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                      {codice ? (
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary">
                          {codice}
                        </span>
                      ) : null}
                      {attivo ? (
                        <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                      ) : null}
                    </span>
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
  /** Barra azioni sticky in fondo (es. "Avvia turno su X"). */
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
      <div className="fixed inset-0 z-[80] flex flex-col bg-background" role="dialog" aria-modal="true">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted active:scale-95"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        </header>

        <CantiereSearchList cantieri={cantieri} selectedId={selectedId} onPick={onPick} />

        {footer ? (
          <div className="sticky bottom-0 border-t border-border bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
            {footer}
          </div>
        ) : null}
      </div>
    </Portal>
  );
}

// ── controllo da FORM (trigger + combobox INLINE) ────────────────────────────
// NB: inline (non Portal) di proposito. Il picker è usato ANCHE dentro un Radix
// Dialog (dialog "ore a mano"): un foglio in Portal starebbe FUORI dal dialog →
// Radix lo chiuderebbe al tap e ruberebbe il focus alla ricerca. Inline sta
// dentro lo scope del dialog → nessun conflitto. I flussi standalone
// (Inizia/Cambia turno) usano invece `CantiereSearchSheet` (nessun dialog padre).

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

  // Chiudi al click fuori (dentro il dialog: document mousedown funziona).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
      >
        <span className="min-w-0 flex-1">
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
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="mt-1.5 flex max-h-[55vh] min-h-[12rem] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <CantiereSearchList
            cantieri={cantieri}
            selectedId={value}
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
