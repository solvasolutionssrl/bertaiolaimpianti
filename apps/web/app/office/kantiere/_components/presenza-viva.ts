'use client';

import * as React from 'react';

import { minutiPresenza } from '@kommessa/api/presenza-viva';

import type { TimbroGiornataVista } from '@/app/_lib/timbro/vista';

/**
 * I minuti di PRESENZA di una giornata ancora aperta, che scorrono.
 *
 * ⚠️ Serve perche' chi ha solo passato il badge non ha nessuna timbratura sui
 * cantieri: `useTotaleGiornata` conta quelle, e quindi diceva **0:00** a uno
 * che era al lavoro dalle 07:40. Zero era vero per le ore *attribuite* e
 * falso per chiunque guardasse la riga.
 *
 * ⚠️ Vale anche **in pausa e a giornata finita ma non ripartita**: quando la
 * persona timbra l'inizio della pausa l'intervallo si chiude, lo stato passa a
 * «da ripartire» e il tempo tornava a **0:00** — cioe' la stessa bugia di
 * prima, un passo piu' in la'. Finche' le ore non sono sui cantieri si mostra
 * la presenza: viva se l'intervallo e' aperto, ferma se e' chiuso.
 *
 * ⚠️ Niente `Date.now()` nell'inizializzatore di `useState`: server e browser
 * darebbero due alberi diversi e l'idratazione salterebbe.
 */
export function usePresenzaViva(timbro: TimbroGiornataVista | null | undefined): number | null {
  const aperta = !!timbro && (timbro.stato === 'presenza_aperta' || timbro.fineIso === null);
  const [ora, setOra] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!aperta) return;
    setOra(Date.now());
    const id = setInterval(() => setOra(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [aperta]);
  if (!timbro) return null;
  if (aperta && ora === null) return null;
  const da = timbro.inizioIso ?? timbro.timbri.find((t) => !t.scartato)?.ts ?? null;
  // ⭐ Il conto sta in un posto solo: lo fa anche la card «Chi c'è adesso» del
  // cruscotto, e due formule divergenti darebbero due ore diverse per la
  // stessa persona nella stessa applicazione.
  return minutiPresenza({
    aperta,
    inizioMs: da ? Date.parse(da) : null,
    pausaTimbrataMin: timbro.pausaTimbrataMin ?? 0,
    nettoMin: timbro.nettoMin,
    oraMs: ora ?? 0,
  });
}
