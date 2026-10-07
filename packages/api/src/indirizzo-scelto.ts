/**
 * **Cosa resta scritto nel campo «Indirizzo» quando si sceglie un
 * suggerimento della mappa.**
 *
 * ## Il difetto che questa regola toglie
 *
 * I suggerimenti servono a non avere lo stesso paese scritto in quattro modi
 * («Valeggio» / «Valeggio s/M» / «VALEGGIO SUL MINCIO»), che rende poi inutile
 * qualunque raggruppamento per comune.
 *
 * Ma Photon e Nominatim, **quando la via non la trovano, restituiscono
 * volentieri il comune**. Chi aveva scritto «Via Roma 12 Valeggio» e sceglieva
 * quel suggerimento si ritrovava nel campo «Valeggio sul Mincio»: la via
 * spariva, e con lei l'unica cosa che serve a chi ci deve andare.
 *
 * ⭐ **Un suggerimento non deve mai rendere il campo meno preciso di com'era.**
 *
 * ## Perche' una funzione e non tre righe nel componente
 *
 * Perche' la condizione «il suggerimento ha una via» dipende da cosa risponde
 * un servizio esterno quel giorno, e un difetto che si riproduce solo quando
 * OpenStreetMap non conosce una strada non si prova a mano. Qui la regola si
 * prova senza rete.
 */

export interface SceltaIndirizzo {
  /** Quello che la persona ha battuto nel campo. */
  scritto: string;
  /** L'etichetta completa del suggerimento scelto. */
  etichetta: string;
  /**
   * La via del suggerimento, se ne ha una.
   *
   * ⚠️ Assente = il suggerimento e' un **paese**, non un indirizzo.
   */
  via?: string | null;
}

/**
 * L'indirizzo da scrivere nel campo dopo la scelta.
 *
 * - il suggerimento ha una via → vince lui (e' la forma normalizzata)
 * - non ce l'ha, ma qualcosa era scritto → resta cio' che era scritto
 * - non ce l'ha e il campo era vuoto → meglio il paese che niente
 */
export function indirizzoDopoScelta(s: SceltaIndirizzo): string {
  const scritto = (s.scritto ?? '').trim();
  const etichetta = (s.etichetta ?? '').trim();
  const via = (s.via ?? '').trim();

  if (via) return etichetta || scritto;
  return scritto || etichetta;
}

/**
 * Il comune da scrivere nel campo «Città».
 *
 * ⚠️ Una citta' battuta a mano **non si sovrascrive mai**: chi l'ha scritta
 * sapeva cosa stava facendo, e il provider a volte restituisce la frazione o
 * il capoluogo di provincia al posto del comune.
 */
export function cittaDopoScelta(opt: {
  scritta: string;
  dalProvider?: string | null;
}): string {
  const scritta = (opt.scritta ?? '').trim();
  if (scritta) return opt.scritta;
  return (opt.dalProvider ?? '').trim() || opt.scritta;
}
