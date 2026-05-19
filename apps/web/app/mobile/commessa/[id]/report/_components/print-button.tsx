'use client';

import { Printer } from 'lucide-react';

/**
 * Bottone "Stampa / Salva PDF" — versione blueprint dentro l'Hero blu.
 *
 * Stilato per essere ben visibile sopra il Hero primary, con accent
 * arancio brand. Tap → dialog di stampa nativo del browser, che
 * permette di salvare come PDF.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent font-mono text-xs font-bold uppercase tracking-[0.14em] text-accent-foreground shadow-glow-brand transition-transform active:scale-[0.98]"
    >
      <Printer className="h-4 w-4" aria-hidden="true" />
      Stampa / Salva PDF
    </button>
  );
}
