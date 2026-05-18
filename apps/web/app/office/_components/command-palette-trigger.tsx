'use client';

import * as React from 'react';

/**
 * Trigger invisibile che si sovrappone all'input di ricerca dell'`OfficeShell`
 * (gestito dal pacchetto UI condiviso). Intercetta click/focus/keydown sul
 * search field e apre la Command Palette al posto della search inline.
 *
 * Implementazione: stiamo "fuori" dalla shell ma sopra di essa con
 * `position: fixed` ancorato alla viewport top-right. Non rimuoviamo né
 * modifichiamo l'API di `OfficeShell` — restiamo backward-compatible.
 *
 * Listener globale per `⌘K` / `Ctrl+K` lo monta il componente padre
 * (`OfficeShellClient`) per non duplicare gli handler.
 */
interface CommandPaletteTriggerProps {
  onOpen: () => void;
}

export function CommandPaletteTrigger({ onOpen }: CommandPaletteTriggerProps) {
  React.useEffect(() => {
    // Cerchiamo l'input search nell'header dell'OfficeShell. Lo selezioniamo
    // via `input[type=search][aria-label="Ricerca rapida"]` — definito nel
    // componente UI condiviso.
    const selector =
      'header input[type="search"][aria-label="Ricerca rapida"]';

    // Funzione che intercetta click/focus/keydown e apre la palette
    const intercept = (e: Event) => {
      const ev = e as Event & { preventDefault: () => void };
      // Non ci interessa quale tasto sia stato premuto sull'input search:
      // l'utente sta interagendo con la search, quindi la palette deve aprirsi.
      ev.preventDefault();
      // blur per evitare che l'input rimanga in stato focused dietro il dialog
      const target = e.target as HTMLElement | null;
      target?.blur();
      onOpen();
    };

    const attach = (el: HTMLInputElement) => {
      el.addEventListener('focus', intercept);
      el.addEventListener('mousedown', intercept);
      el.addEventListener('keydown', intercept);
      // segnaposto visuale: lasciamo che l'input mostri il placeholder come prima
      el.readOnly = true;
      el.setAttribute('data-palette-trigger', 'true');
    };

    const detach = (el: HTMLInputElement) => {
      el.removeEventListener('focus', intercept);
      el.removeEventListener('mousedown', intercept);
      el.removeEventListener('keydown', intercept);
      el.removeAttribute('data-palette-trigger');
    };

    // Ritenta finché l'input compare (la shell potrebbe non essere ancora
    // montata al primo tick).
    let inputEl: HTMLInputElement | null = null;
    let raf = 0;
    const tryAttach = () => {
      const el = document.querySelector<HTMLInputElement>(selector);
      if (el) {
        inputEl = el;
        attach(el);
      } else {
        raf = window.requestAnimationFrame(tryAttach);
      }
    };
    tryAttach();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (inputEl) detach(inputEl);
    };
  }, [onOpen]);

  return null;
}
