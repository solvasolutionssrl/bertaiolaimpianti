'use client';

import * as React from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Due cose che mancavano quando si clicca una voce di menu.
 *
 * **Il segno che il click è arrivato.** Con le pagine che si costruiscono sul
 * server, fra il click e il cambio di schermata passa un attimo in cui non
 * succede niente di visibile. Chi lavora pensa di aver mancato il bersaglio e
 * clicca di nuovo. La barretta in alto compare subito e dice: ho sentito.
 *
 * **Il recupero se non parte.** Ogni tanto la navigazione resta appesa: si
 * clicca e la pagina non cambia più, finché non si ricarica a mano. Qui, se
 * dopo qualche secondo siamo ancora fermi dov'eravamo, si ricarica da soli
 * andando all'indirizzo giusto. Peggio della lentezza c'è solo restare
 * bloccati senza capire perché.
 *
 * La barra non compare per le attese brevi (sotto un terzo di secondo):
 * lampeggerebbe a ogni click e diventerebbe fastidiosa.
 */

/** Dopo quanto rinunciamo e ricarichiamo la pagina di forza. */
const ATTESA_MASSIMA_MS = 10_000;
/** Sotto questa soglia non mostriamo niente: sarebbe un lampo. */
const PRIMA_DI_MOSTRARE_MS = 300;

function navigabile(a: HTMLAnchorElement, e: MouseEvent): boolean {
  if (e.defaultPrevented || e.button !== 0) return false;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (a.target && a.target !== '_self') return false;
  if (a.hasAttribute('download')) return false;
  const href = a.getAttribute('href') ?? '';
  // Solo percorsi interni. Niente àncore, niente mailto/tel, niente altri siti.
  if (!href.startsWith('/') || href.startsWith('//')) return false;
  return true;
}

export function NavigazioneSicura() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [inViaggio, setInViaggio] = React.useState(false);

  // Dove stiamo andando e da quando. In un ref: cambiarlo non deve ridisegnare.
  const meta = React.useRef<{ verso: string; da: string } | null>(null);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a');
      if (!(a instanceof HTMLAnchorElement) || !navigabile(a, e)) return;
      const verso = a.getAttribute('href')!;
      // Click sulla pagina in cui siamo già: non c'è niente da aspettare.
      if (verso === window.location.pathname + window.location.search) return;
      meta.current = { verso, da: window.location.pathname };
      setInViaggio(true);
    };
    // In cattura: così lo vediamo anche se qualcuno ferma la propagazione.
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // Arrivati: la barra sparisce. Dipende anche dai parametri, perché fra due
  // filtri della stessa pagina il percorso non cambia.
  React.useEffect(() => {
    meta.current = null;
    setInViaggio(false);
  }, [pathname, searchParams]);

  // La rete di sicurezza.
  React.useEffect(() => {
    if (!inViaggio) return;
    const timer = window.setTimeout(() => {
      const m = meta.current;
      if (!m) return;
      // Se nel frattempo ci siamo mossi, va bene così.
      if (window.location.pathname !== m.da) return;
      // Scheda in secondo piano: il browser rallenta tutto, non è un blocco.
      if (document.visibilityState !== 'visible') return;
      window.location.href = m.verso;
    }, ATTESA_MASSIMA_MS);
    return () => window.clearTimeout(timer);
  }, [inViaggio]);

  // Ritardo prima di mostrare: le navigazioni veloci non devono lampeggiare.
  const [visibile, setVisibile] = React.useState(false);
  React.useEffect(() => {
    if (!inViaggio) {
      setVisibile(false);
      return;
    }
    const t = window.setTimeout(() => setVisibile(true), PRIMA_DI_MOSTRARE_MS);
    return () => window.clearTimeout(t);
  }, [inViaggio]);

  if (!visibile) return null;

  return (
    <div
      // Appiglio per il banco di prova.
      data-attesa-navigazione=""
      role="status"
      aria-label="Sto aprendo la pagina"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-transparent"
    >
      <div className="h-full w-1/3 animate-barra-avanzamento rounded-full bg-accent" />
    </div>
  );
}
