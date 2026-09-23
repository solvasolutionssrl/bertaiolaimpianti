/**
 * La pausa pranzo: quanto dura, e come si arrotonda.
 *
 * Nasce perche' le stesse tre scelte erano scritte a mano in CINQUE posti
 * diversi (QR, fine turno da app, Registra giornata, Modifica giornata,
 * Correggi giornata dell'ufficio), e uno dei cinque offriva anche 90 minuti.
 * Cinque definizioni della stessa cosa sono cinque occasioni di divergere.
 *
 * Modulo puro: niente React, niente database. Lo usano sia le pagine sia le
 * server action, cosi' il valore che la persona vede e quello che il server
 * accetta non possono piu' scollarsi.
 */

/** Le durate tipiche: coprono da sole quasi tutti i casi reali. */
export const PAUSE_RAPIDE_MIN = [30, 45, 60] as const;

/**
 * Il passo dell'arrotondamento. Una pausa si dichiara a memoria, a fine
 * giornata: il minuto esatto e' una precisione finta, e cinque minuti sono
 * la grana piu' fine che abbia un senso reale.
 */
export const PAUSA_PASSO_MIN = 5;

/**
 * Minimo e massimo accettati. Sono gli stessi limiti che gia' avevano gli
 * schemi di «Modifica giornata» e «Correggi giornata»: gli altri due punti
 * accettavano solo 30, 45 o 60 ed e' proprio il vincolo che si sta togliendo.
 */
export const PAUSA_MINIMA_MIN = 5;
export const PAUSA_MASSIMA_MIN = 240;

/**
 * Porta un valore scritto a mano al multiplo di cinque piu' vicino, dentro i
 * limiti ammessi.
 *
 * Lo zero passa: in «Registra giornata» significa «nessuna pausa», che e' una
 * risposta legittima e diversa da «non lo so».
 */
export function arrotondaPausaMin(minuti: number): number {
  if (!Number.isFinite(minuti) || minuti <= 0) return 0;
  const passo = Math.round(minuti / PAUSA_PASSO_MIN) * PAUSA_PASSO_MIN;
  if (passo < PAUSA_MINIMA_MIN) return PAUSA_MINIMA_MIN;
  if (passo > PAUSA_MASSIMA_MIN) return PAUSA_MASSIMA_MIN;
  return passo;
}

/**
 * true se l'arrotondamento ha davvero cambiato il numero scritto: serve a
 * dirlo alla persona SOLO quando e' successo, invece di avvisarla sempre.
 */
export function pausaArrotondata(scritto: number): boolean {
  if (!Number.isFinite(scritto) || scritto <= 0) return false;
  return arrotondaPausaMin(scritto) !== scritto;
}

/** «45 min», «1 h», «1 h 30 min»: come si legge una durata di pausa. */
export function etichettaPausa(minuti: number): string {
  if (minuti <= 0) return 'Nessuna';
  const ore = Math.floor(minuti / 60);
  const min = minuti % 60;
  if (ore === 0) return `${min} min`;
  return min === 0 ? `${ore} h` : `${ore} h ${min} min`;
}
