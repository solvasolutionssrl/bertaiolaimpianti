/**
 * A che punto del lavoro è stato scattato un media.
 *
 * ## Perché un vocabolario per tre parole
 *
 * Perché le tre parole erano scritte in quattro posti con tre rese diverse:
 * il modulo sul telefono diceva «Fine», il filtro in ufficio «Finali», la
 * galleria «Finali», e la didascalia sotto ogni foto mostrava **il valore
 * grezzo del database in minuscolo** — `in_corso` a schermo, sotto gli occhi
 * del cliente. Tre resi della stessa colonna significano che la quarta volta
 * che qualcuno la mostra ne inventa una quarta.
 *
 * Il campo si chiamava «Momento», che non voleva dire niente per chi lo
 * compila. Adesso si chiama **Fase lavori**.
 *
 * ⚠️ I valori — `sopralluogo`, `in_corso`, `finale` — sono un enum Postgres
 * (`momento_foto`) e **non si toccano**: sono scritti su 346 righe e
 * decidono la sottocartella su Nextcloud (`Foto/Sopralluogo`, `Foto/In
 * corso`, `Foto/Finali`). Qui si cambia solo come si leggono.
 */

export const FASI_LAVORI = ['sopralluogo', 'in_corso', 'finale'] as const;
export type FaseLavori = (typeof FASI_LAVORI)[number];

/** Come la chiamiamo nella colonna del database. Non cambiarlo. */
export const FASE_PREDEFINITA: FaseLavori = 'in_corso';

const ETICHETTE: Record<FaseLavori, string> = {
  sopralluogo: 'Sopralluogo',
  in_corso: 'In corso',
  finale: 'Fine lavori',
};

/** Se una stringa qualsiasi è una fase che conosciamo. */
export function eFaseLavori(valore: unknown): valore is FaseLavori {
  return typeof valore === 'string' && (FASI_LAVORI as readonly string[]).includes(valore);
}

/**
 * Come si scrive a schermo. **Non solleva mai e non mostra mai il valore
 * grezzo**: un dato che non riconosciamo diventa un trattino, non
 * `in_corso_v2` sotto gli occhi di un cliente.
 */
export function etichettaFase(valore: unknown): string {
  return eFaseLavori(valore) ? ETICHETTE[valore] : '—';
}

/** Le tre voci in ordine di lavoro, per un selettore. */
export const VOCI_FASE_LAVORI: ReadonlyArray<{ valore: FaseLavori; etichetta: string }> =
  FASI_LAVORI.map((f) => ({ valore: f, etichetta: ETICHETTE[f] }));

/** Le stesse voci più «Tutte», per un filtro. */
export const VOCI_FILTRO_FASE: ReadonlyArray<{ valore: string; etichetta: string }> = [
  { valore: '', etichetta: 'Tutte' },
  ...VOCI_FASE_LAVORI.map((v) => ({ valore: v.valore as string, etichetta: v.etichetta })),
];

/**
 * In che ordine si mostrano: come si svolge il lavoro, non in alfabetico.
 * Un dato ignoto va in fondo, non in mezzo.
 */
export function pesoFase(valore: unknown): number {
  const i = eFaseLavori(valore) ? FASI_LAVORI.indexOf(valore) : -1;
  return i < 0 ? FASI_LAVORI.length : i;
}
