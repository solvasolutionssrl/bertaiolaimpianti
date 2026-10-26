/**
 * Dove va disegnata la **linea di rilascio** mentre si trascina una card.
 *
 * Perche' esiste: prima l'unico segnale era un anello attorno alla riga sotto
 * il puntatore. Un anello dice *quale* riga, non **dove** finira' la card, e
 * con un riordino le due cose non coincidono: trascinando verso il basso
 * l'elemento si ferma DOPO la riga puntata, verso l'alto PRIMA. Chi guardava
 * doveva lasciare e vedere com'era andata.
 *
 * ⚠️ La direzione e' la parte che si inverte senza accorgersene, per questo
 * sta qui, pura e provata, e non dentro una `className`.
 */

/** Il bordo della riga puntata su cui disegnare la linea. */
export type LatoRilascio = 'sopra' | 'sotto';

/**
 * Riordino di una lista: l'elemento `da` viene spostato all'indice `a`.
 *
 * Scendendo (`da < a`) finisce **dopo** la riga `a`, perche' tutte quelle in
 * mezzo risalgono di uno. Salendo (`da > a`) finisce **prima**.
 */
export function latoRilascioRiordino(da: number, a: number): LatoRilascio | null {
  if (!Number.isInteger(da) || !Number.isInteger(a) || da === a) return null;
  return da < a ? 'sotto' : 'sopra';
}

/**
 * Inserimento di qualcosa che non sta nella lista (la pausa pranzo): non c'e'
 * un `da`, conta solo in quale meta' della riga si trova il puntatore.
 */
export function latoRilascioInserimento(nellaMetaBassa: boolean): LatoRilascio {
  return nellaMetaBassa ? 'sotto' : 'sopra';
}

/**
 * L'indice finale di un riordino, per sapere **quale riga** ha appena cambiato
 * posto (si accende un attimo, cosi' si vede dov'e' finita).
 */
export function indiceDopoRiordino(lunghezza: number, da: number, a: number): number {
  if (lunghezza <= 0) return 0;
  const limite = (n: number) => Math.min(Math.max(n, 0), lunghezza - 1);
  return limite(a);
}
