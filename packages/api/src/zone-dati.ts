/**
 * Zone dei dati: «mie» e «dei dipendenti» (24/10/2026).
 *
 * Chi ha ruolo ufficio o amministratore e ha anche una scheda dipendente
 * (il «boss» che timbra) vede nella stessa pagina le SUE cose e quelle dei
 * colleghi. Le due zone devono chiamarsi sempre allo stesso modo, in ogni
 * superficie: questo e' il vocabolario. Le parole sono fisse, non
 * concordano con il genere (come «Creato da», vedi `assegnazione`).
 */

/** Il segno accanto al nome di chi guarda, nelle liste che contengono anche lui. */
export const TAG_TU = 'tu';

/** Le zone che parlano di chi guarda. */
export const ZONA_MIA = {
  giornata: 'La mia giornata',
  ore: 'Le mie ore',
  spese: 'Le mie spese',
  richieste: 'Le mie richieste',
  settimana: 'La mia settimana',
} as const;

/** Le zone che parlano degli altri. */
export const ZONA_DIPENDENTI = {
  /** Titolo di sezione. */
  titolo: 'Dipendenti',
  /** Sottotitolo, dove la sezione sta sotto una zona «mia». */
  sottotitolo: 'le giornate degli altri, da sistemare e da controllare',
  /** Un elenco o un totale che comprende tutte le persone, chi guarda compreso. */
  tutti: 'Tutti i dipendenti',
  /** Quando anche chi guarda e' nell'elenco. */
  compresoTu: 'tu compreso',
} as const;

/** La riga, la card o la spesa appartiene a chi guarda? */
export function eMio(mioDipendenteId: string | null | undefined, dipendenteId: string | null | undefined): boolean {
  return !!mioDipendenteId && mioDipendenteId === dipendenteId;
}
