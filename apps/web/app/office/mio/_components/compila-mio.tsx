'use client';

import * as React from 'react';
import type { MiaGiornata } from '@/app/office/_lib/mia-giornata';
import { CompilaGiornataDialog, type DatiCompila, type ModoCompila } from '@/app/office/kantiere/_components/compila-giornata-dialog';

/** I dati del dialog «Compila giornata» ricavati dalla mia giornata (stessa mappa della pillola). */
export function datiCompilaDa(mia: MiaGiornata): DatiCompila {
  return {
    cantieri: mia.cantieri,
    sedi: mia.sedi,
    sediPerCantiere: mia.sediPerCantiere,
    mezzi: mia.mezzi,
    ultimoMezzoId: mia.ultimoMezzoId,
    modalitaLavoro: mia.modalitaLavoro,
    impostazioni: mia.impostazioni,
  };
}

/**
 * Il dialog da scrivania, montato una volta per pagina: chi vuole aprirlo
 * (una riga da ripartire, il tasto «Registra giornata») chiama `apri`.
 * Sempre e solo nei modi «miei»: `registra` e `scatola` senza dipendenteId.
 */
export function useCompilaMio(mia: MiaGiornata) {
  const [modo, setModo] = React.useState<ModoCompila | null>(null);
  const dati = React.useMemo(() => datiCompilaDa(mia), [mia]);
  const dialogo = (
    <CompilaGiornataDialog open={modo !== null} onOpenChange={(o) => !o && setModo(null)} modo={modo} dati={dati} />
  );
  return { apri: setModo, dialogo };
}
