'use client';

import * as React from 'react';

import { commessaSoloLettura } from '@kommessa/api/stato-lavoro';

import { useConfirm } from './confirm-provider';

/**
 * «Questa commessa e' chiusa: aggiungo lo stesso?»
 *
 * Su una commessa completata o archiviata si puo' sempre aggiungere roba —
 * foto, documenti, attivita'. Il server non lo impedisce, e non deve: le foto
 * arrivano anche dal Comando iOS e dalle API, dove un popup non esiste e un
 * rifiuto romperebbe quelle strade in silenzio.
 *
 * Quello che serve e' un attimo di attenzione dove c'e' una persona davanti:
 * una domanda sola, prima di scrivere. Vale per le **aggiunte**, non per la
 * consultazione ne' per le modifiche a roba gia' presente.
 *
 * Su una commessa aperta non chiede niente e non monta nulla: torna `true`
 * subito, cosi' il chiamante puo' usarlo sempre senza scrivere due strade.
 */
export function useConfermaCommessaChiusa(
  stato: string | null | undefined,
  nome?: string | null,
): () => Promise<boolean> {
  const confirm = useConfirm();
  const chiusa = commessaSoloLettura(stato);
  const archiviata = stato === 'archiviata';

  return React.useCallback(async () => {
    if (!chiusa) return true;
    const soggetto = nome?.trim() ? `"${nome.trim()}"` : 'Questa commessa';
    return confirm({
      title: 'La commessa è chiusa',
      description: `${soggetto} è ${archiviata ? 'archiviata' : 'completata'}. Aggiungo comunque?`,
      confirmLabel: 'Aggiungi comunque',
    });
  }, [chiusa, archiviata, nome, confirm]);
}
