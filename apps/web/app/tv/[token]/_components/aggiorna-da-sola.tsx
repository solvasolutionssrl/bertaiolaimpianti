'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

/** Ogni quanto la bacheca si riprende i dati. */
const OGNI_MS = 60_000;

/**
 * La bacheca si aggiorna da sola.
 *
 * Nessuno tocca un televisore: senza questo, l'ufficio vedrebbe la situazione
 * di stamattina per tutto il giorno — che è peggio di non vedere niente,
 * perché sembra aggiornata.
 *
 * ⚠️ Si ferma quando la pagina non è visibile, e si riprende al ritorno. Su uno
 * schermo acceso dodici ore sono settecento richieste al giorno per niente, e
 * quando la scheda torna in primo piano la prima cosa che serve è il dato
 * fresco, non quello di dieci minuti prima.
 */
export function AggiornaDaSola() {
  const router = useRouter();

  React.useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const avvia = () => {
      if (timer) return;
      timer = setInterval(() => router.refresh(), OGNI_MS);
    };
    const ferma = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    const alCambioVisibilita = () => {
      if (document.visibilityState === 'visible') {
        router.refresh();
        avvia();
      } else {
        ferma();
      }
    };

    if (document.visibilityState === 'visible') avvia();
    document.addEventListener('visibilitychange', alCambioVisibilita);
    return () => {
      ferma();
      document.removeEventListener('visibilitychange', alCambioVisibilita);
    };
  }, [router]);

  return null;
}
