'use client';

import * as React from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@kommessa/ui';
import { minutiDaTesto, testoDaMinuti } from '@kommessa/api/ore-testo';

/**
 * Il campo delle ore «furbo» (24/10/2026): si scrive come viene («7:30»,
 * «7,5», «730», «7h30», «90m», «8»), si legge in H:MM, e a zero non mostra
 * niente da cancellare. I due tasti muovono di un passo. Il valore vive in
 * minuti, come nel resto del dialog.
 */
export function OreInput({
  minuti,
  onChange,
  passo,
  max,
  disabled,
  ariaLabel = 'Ore',
  className,
  pieno = false,
}: {
  minuti: number;
  onChange: (m: number) => void;
  passo: number;
  /** Tetto in minuti (scatola, chiusura): oltre non si va. */
  max?: number;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  /** Occupa tutta la larghezza disponibile (nei moduli a due colonne). */
  pieno?: boolean;
}) {
  const [testo, setTesto] = React.useState<string | null>(null); // null = non in modifica
  const [errore, setErrore] = React.useState(false);
  const tetto = max != null && Number.isFinite(max) ? Math.max(0, max) : Infinity;
  const fissa = (m: number) => onChange(Math.min(tetto, Math.max(0, Math.round(m))));
  const conferma = () => {
    if (testo === null) return;
    const m = minutiDaTesto(testo);
    if (m === null) {
      setErrore(true);
      return;
    }
    setErrore(false);
    fissa(m);
    setTesto(null);
  };
  // Mentre si scrive, come e' stato letto: «0,30» e' 18 minuti, non mezz'ora.
  // Sta sotto il campo, in sovrimpressione, cosi' la riga non si sposta.
  const letto = testo !== null && testo.trim() !== '' && !/^\d{1,2}:\d{2}$/.test(testo.trim()) ? minutiDaTesto(testo) : null;
  return (
    <div className={pieno ? 'relative flex w-full' : 'relative inline-flex'}>
    <div className={cn('inline-flex h-10', pieno && 'w-full', 'items-stretch overflow-hidden rounded-md border border-input bg-background', errore && 'border-destructive', className)}>
      <button type="button" tabIndex={-1} aria-label="Meno" disabled={disabled || minuti <= 0} onClick={() => fissa(minuti - passo)} className="w-8 shrink-0 border-r border-input text-muted-foreground hover:bg-muted/60 disabled:opacity-40">
        <Minus className="mx-auto h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        aria-invalid={errore || undefined}
        placeholder="0:00"
        value={testo ?? testoDaMinuti(minuti)}
        disabled={disabled}
        onFocus={(e) => {
          setTesto(testoDaMinuti(minuti));
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setTesto(e.target.value);
          if (errore) setErrore(false);
        }}
        onBlur={conferma}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            conferma();
            e.currentTarget.blur();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setTesto(null);
            fissa(minuti + passo);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setTesto(null);
            fissa(minuti - passo);
          } else if (e.key === 'Escape') {
            setTesto(null);
            setErrore(false);
          }
        }}
        title={errore ? 'Scrivere le ore come 7:30' : 'Ore e minuti, ad esempio 7:30 (vale anche 7,5 = sette ore e mezza)'}
        className="w-[4.5rem] min-w-0 bg-transparent px-1 text-center text-sm font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
      />
      <button type="button" tabIndex={-1} aria-label="Più" disabled={disabled || minuti >= tetto} onClick={() => fissa(minuti + passo)} className="w-8 shrink-0 border-l border-input text-muted-foreground hover:bg-muted/60 disabled:opacity-40">
        <Plus className="mx-auto h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
    {letto !== null ? (
      <span
        aria-live="polite"
        className="pointer-events-none absolute left-1/2 top-full z-10 mt-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-background shadow"
      >
        = {testoDaMinuti(letto) || '0:00'}
      </span>
    ) : null}
    </div>
  );
}
