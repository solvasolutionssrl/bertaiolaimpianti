'use client';

import { useEffect } from 'react';

/**
 * Dove parte l'app installata.
 *
 * Il manifest ha UN `start_url`, e fino al 22/10/2026 era `/mobile`: chi
 * installava Kommessa su un computer si trovava la shell del telefono
 * (misurato su un utente ufficio di FPM, che «non vedeva piu' la
 * pianificazione»). Il server non puo' sapere se davanti c'e' un dito o un
 * mouse; il browser si'. Questa pagina non ha guscio e fa una cosa sola:
 * un puntatore «coarse» e' un telefono → `/mobile`; altrimenti → `/office`.
 * Poi il middleware porta ciascuno a casa sua (mestiere, cliente).
 *
 * ⭐ Il segnale e' `(pointer: coarse)`: non la larghezza (un telefono in
 * orizzontale inganna), non la stringa del browser (mente). Stessa regola del
 * popup «installa l'app», che su un computer non compare.
 */
export default function AvvioPage() {
  useEffect(() => {
    const telefono = window.matchMedia('(pointer: coarse)').matches;
    window.location.replace(telefono ? '/mobile' : '/office');
  }, []);
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#E0ECF5] text-sm text-slate-600">
      <p>Avvio in corso…</p>
    </main>
  );
}
