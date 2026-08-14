'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

/**
 * Riporta alla home dopo qualche secondo, dicendolo.
 *
 * ─── Perché (11/08/2026) ───────────────────────────────────────────────────
 * Finita la creazione di una commessa l'utente restava sulla schermata di
 * riepilogo senza sapere che fare: "a volte si perde". Il ritorno automatico
 * chiude il giro da solo.
 *
 * Due accortezze, perché un rimando a tempo può essere fastidioso quanto
 * l'assenza di rimando:
 *  - il conto alla rovescia è **visibile**, non un salto a sorpresa;
 *  - **al primo tocco si annulla**. Chi sta allungando il dito verso "Apri
 *    commessa" o "Scatta foto" non se lo vede sfilare via.
 */
export function RitornoAutomatico({
  secondi = 3,
  verso = '/mobile',
  etichetta = 'Torno alla home',
}: {
  secondi?: number;
  verso?: string;
  etichetta?: string;
}) {
  const router = useRouter();
  const [restano, setRestano] = React.useState(secondi);
  const [attivo, setAttivo] = React.useState(true);

  React.useEffect(() => {
    if (!attivo) return;
    if (restano <= 0) {
      router.push(verso);
      return;
    }
    const t = window.setTimeout(() => setRestano((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [attivo, restano, router, verso]);

  // Qualunque tocco sullo schermo ferma il conto: l'utente ha ripreso in mano
  // la situazione, non serve più portarlo da nessuna parte.
  React.useEffect(() => {
    if (!attivo) return;
    const ferma = () => setAttivo(false);
    window.addEventListener('pointerdown', ferma, { capture: true, once: true });
    return () => window.removeEventListener('pointerdown', ferma, { capture: true });
  }, [attivo]);

  if (!attivo) return null;

  return (
    <p className="text-center text-xs text-muted-foreground" aria-live="polite">
      {etichetta} fra {restano}…{' '}
      <button
        type="button"
        onClick={() => setAttivo(false)}
        className="font-medium text-foreground underline underline-offset-2"
      >
        resta qui
      </button>
    </p>
  );
}
