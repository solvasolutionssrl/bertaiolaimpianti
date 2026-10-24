/**
 * Come si legge un mezzo a schermo, e dove sta nell'elenco.
 *
 * Dal 24/10/2026 fra i mezzi di ogni cliente c'e' la voce «Auto personale»:
 * la sceglie chi viaggia con la propria auto, cosi' i chilometri restano
 * tracciati per il rimborso. E' una riga vera in `mezzi` (quindi compare da
 * se' in tutte le tendine e le tratte la citano come qualunque altro mezzo),
 * marcata dalla colonna `personale` e riconoscibile dalla targa segnaposto,
 * che il server non lascia cambiare.
 *
 * ⚠️ Le tendine mostrano la targa: scritta cosi' com'e' si leggerebbe
 * «AUTO PERSONALE», che grida. `etichettaMezzo` la rende in italiano senza
 * bisogno che ogni query si porti dietro la colonna `personale`.
 */

export const TARGA_AUTO_PERSONALE = 'AUTO PERSONALE';
export const ETICHETTA_AUTO_PERSONALE = 'Auto personale';

export interface MezzoLite {
  id: string;
  targa: string;
  modello?: string | null;
  personale?: boolean | null;
}

/** Vero per la voce di sistema, dalla colonna o dalla targa segnaposto. */
export function eAutoPersonale(m: Pick<MezzoLite, 'targa' | 'personale'>): boolean {
  return m.personale === true || m.targa?.trim().toUpperCase() === TARGA_AUTO_PERSONALE;
}

/** Il nome del mezzo come si legge: targa, oppure «Auto personale». */
export function etichettaMezzo(m: MezzoLite): string {
  return eAutoPersonale(m) ? ETICHETTA_AUTO_PERSONALE : m.targa;
}

/** Targa e modello, dove c'e' spazio per entrambi. */
export function etichettaMezzoEstesa(m: MezzoLite): string {
  if (eAutoPersonale(m)) return ETICHETTA_AUTO_PERSONALE;
  return m.modello?.trim() ? `${m.targa} · ${m.modello.trim()}` : m.targa;
}

/** L'auto personale sta in fondo: prima i mezzi dell'azienda, in ordine di targa. */
export function ordinaMezzi<T extends MezzoLite>(mezzi: readonly T[]): T[] {
  return [...mezzi].sort((a, b) => {
    const pa = eAutoPersonale(a) ? 1 : 0;
    const pb = eAutoPersonale(b) ? 1 : 0;
    return pa - pb || a.targa.localeCompare(b.targa, 'it', { numeric: true });
  });
}
