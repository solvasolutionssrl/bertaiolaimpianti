import * as React from 'react';

/**
 * Ref-count dei fogli full-screen aperti (nuova ricevuta / dettaglio spesa).
 * Mentre almeno uno è aperto, la shell Kantiere nasconde gli elementi fissi in
 * alto a destra (campanella + pill "＋ Spesa") che altrimenti coprirebbero la X
 * di chiusura del foglio. Attiva `html[data-sheet-open]` → CSS in globals.
 */
let aperti = 0;

function applica() {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  if (aperti > 0) el.setAttribute('data-sheet-open', '');
  else el.removeAttribute('data-sheet-open');
}

export function useSheetOpen(open: boolean): void {
  React.useEffect(() => {
    if (!open) return;
    aperti += 1;
    applica();
    return () => {
      aperti = Math.max(0, aperti - 1);
      applica();
    };
  }, [open]);
}
