/**
 * Testi della landing pubblica del QR cantiere.
 *
 * La landing è IDENTICA per ogni cantiere di un tenant: cambiano solo il nome
 * azienda e il nome del cantiere (presi automaticamente da DB). Il super admin
 * può personalizzare il solo sottotitolo (`tenants.landing_tagline`); se vuoto
 * si usa `LANDING_TAGLINE_DEFAULT`.
 *
 * Il blocco "cos'è Kantiere" e il riferimento Solva sono costanti di prodotto,
 * uguali per tutti i tenant (non gestibili dal singolo cliente).
 */

/** Sottotitolo di default sotto il nome azienda (override per-tenant in DB). */
export const LANDING_TAGLINE_DEFAULT =
  'Sistema digitale per la gestione delle presenze e degli accessi al cantiere.';

/** Frase pubblicitaria che spiega in una riga cosa fa il servizio. */
export const LANDING_PITCH =
  'Kantiere digitalizza presenze, ore e accessi di cantiere: timbrature da QR, rapportini automatici e report pronti per l’ufficio.';

/** Riga di firma prodotto / riferimento Solva. */
export const LANDING_FIRMA = 'Kantiere è un prodotto Solva Suite, di Solva Solutions.';
