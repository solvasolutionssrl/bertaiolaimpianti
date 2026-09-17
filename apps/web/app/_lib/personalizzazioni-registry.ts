/**
 * Registro delle funzioni su misura (area "Personalizzazioni").
 *
 * L'area e' il contenitore, non la funzione: qualunque cliente puo' averla
 * accesa, e dentro ci si mettono i pezzi costruiti apposta per lui. Il modulo
 * per-tenant si chiama `personalizzazioni`; quali funzioni sono accese sta in
 * `tenant_modules.config.funzioni`, e le impostazioni di ognuna vivono sotto
 * la sua chiave nella stessa config.
 *
 * Per aggiungerne una servono tre cose: una voce qui, la sua pagina sotto
 * `/office/personalizzazioni/`, e la casella nel pannello super admin (che si
 * costruisce da sola da questo elenco).
 *
 * File client-safe: niente `server-only`, niente icone come oggetti. Le icone
 * si nominano e si risolvono dove servono, perche' un componente non
 * attraversa il confine fra server e client.
 */

export type PersonalizzazioneKey = 'export_paghe';

export type IconaPersonalizzazione = 'documento' | 'tabella' | 'calcolo';

export interface PersonalizzazioneDef {
  key: PersonalizzazioneKey;
  /** Come si chiama in menu. */
  label: string;
  /** Cosa fa, detto al super admin che decide se accenderla. */
  descrizione: string;
  href: string;
  icona: IconaPersonalizzazione;
}

export const PERSONALIZZAZIONI: readonly PersonalizzazioneDef[] = [
  {
    key: 'export_paghe',
    label: 'Export paghe',
    descrizione:
      'Prepara il file mensile delle presenze nel tracciato del programma paghe usato dal consulente del lavoro del cliente.',
    href: '/office/personalizzazioni/paghe',
    icona: 'tabella',
  },
];

export const CHIAVI_PERSONALIZZAZIONI = PERSONALIZZAZIONI.map((p) => p.key);

export function personalizzazione(key: string): PersonalizzazioneDef | undefined {
  return PERSONALIZZAZIONI.find((p) => p.key === key);
}

/** Le chiavi valide fra quelle salvate, scartando quelle che non esistono piu'. */
export function chiaviValide(salvate: unknown): PersonalizzazioneKey[] {
  if (!Array.isArray(salvate)) return [];
  return CHIAVI_PERSONALIZZAZIONI.filter((k) => salvate.includes(k));
}
