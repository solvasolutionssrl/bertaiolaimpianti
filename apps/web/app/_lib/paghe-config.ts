import 'server-only';

import { createServerSupabase } from '@kommessa/api/server';
import {
  REGOLE_DEFAULT,
  regoleConfigurate,
  type RegoleCausali,
} from '@kommessa/api/paghe-mappatura';
import type { CausaleEssePaghe } from '@kommessa/api/paghe-causali';

import { leggiConfigFunzione } from './personalizzazioni';

/**
 * Impostazioni dell'export verso il programma paghe (modulo `paghe`).
 *
 * Ogni cliente ha il suo consulente del lavoro, quindi il codice ditta e le
 * corrispondenze fra eventi e causali non stanno nel codice: vivono nella
 * config del modulo e si cambiano dalla pagina, senza rilascio.
 *
 * Lettore difensivo come gli altri: se la riga o una chiave non c'e', si
 * torna al valore di partenza invece di rompere la pagina. Il codice ditta fa
 * eccezione e resta vuoto di proposito: non esiste un valore ragionevole da
 * indovinare, e un file consegnato alla ditta sbagliata sarebbe peggio di un
 * file non generato.
 */

type Supa = ReturnType<typeof createServerSupabase>;

export interface ConfigPaghe {
  /** Codice ditta assegnato dallo Studio, comprensivo del gruppo. */
  codiceDitta: string;
  /** Nome del programma di rilevazione scritto nell'intestazione del file. */
  programmaPresenze: string;
  /** Quale programma paghe usa il consulente: oggi ne trattiamo uno solo. */
  fornitore: string;
  regole: RegoleCausali;
  /**
   * Causali aperte dal cliente oltre a quelle importate dallo Studio. La
   * tabella delle causali cambia nel tempo: aggiungerne una non deve
   * richiedere un rilascio.
   */
  causaliExtra: CausaleEssePaghe[];
}

export const CONFIG_PAGHE_VUOTA: ConfigPaghe = {
  codiceDitta: '',
  programmaPresenze: 'Kommessa',
  fornitore: 'essepaghe',
  regole: REGOLE_DEFAULT,
  causaliExtra: [],
};

function testo(valore: unknown, predefinito: string): string {
  return typeof valore === 'string' && valore.trim() ? valore.trim() : predefinito;
}

function causaliExtraDa(valore: unknown): CausaleEssePaghe[] {
  if (!Array.isArray(valore)) return [];
  return valore
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({
      codice: testo(c.codice, '').toUpperCase(),
      descrizione: testo(c.descrizione, ''),
      famiglia: c.famiglia === 'straordinario' ? ('straordinario' as const) : ('evento' as const),
      record: c.record === '12' ? ('12' as const) : ('14' as const),
      // "Va comunicata a periodo" non e' "il consulente la impone a periodo":
      // l'obbligo lo dichiara lo Studio, non chi aggiunge la voce.
      obbligatorioRecord12: false,
      // Una causale aggiunta a mano serve a questo cliente: sta in cima.
      frequente: true,
    }))
    .filter((c) => c.codice.length >= 2 && c.codice.length <= 4 && c.descrizione);
}

/** Normalizza la config grezza del modulo. Puro: si prova senza database. */
export function configPagheDa(config: Record<string, unknown>): ConfigPaghe {
  const regoleSalvate = config['regole_causali'];
  return {
    codiceDitta: testo(config['codice_ditta'], ''),
    programmaPresenze: testo(config['programma_presenze'], 'Kommessa'),
    fornitore: testo(config['fornitore'], 'essepaghe'),
    regole: regoleConfigurate(
      regoleSalvate && typeof regoleSalvate === 'object' && !Array.isArray(regoleSalvate)
        ? (regoleSalvate as Partial<RegoleCausali>)
        : null,
    ),
    causaliExtra: causaliExtraDa(config['causali_extra']),
  };
}

export async function leggiConfigPaghe(
  supabase: Supa,
  tenantId: string,
): Promise<ConfigPaghe> {
  // Le impostazioni stanno sotto la chiave della funzione, dentro la config
  // dell'area: cosi' due funzioni su misura dello stesso cliente non si
  // pestano i piedi.
  const config = await leggiConfigFunzione(supabase, tenantId, 'export_paghe');
  return configPagheDa(config);
}
