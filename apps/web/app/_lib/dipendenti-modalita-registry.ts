/**
 * Il vocabolario di «come lavora una persona», **senza `server-only`**.
 *
 * Sta a parte dal lettore (`dipendenti-modalita.ts`) per lo stesso motivo per
 * cui `tenant-features-registry` sta a parte da `tenant-features`: il modulo
 * che legge dal database non puo' essere importato da un componente client, e
 * le etichette servono proprio li', nel modulo dei Dipendenti.
 */

export type ModalitaLavoro = 'ufficio' | 'esterno';

/** Il comportamento di sempre: nessuno cambia quando la colonna arriva. */
export const MODALITA_PREDEFINITA: ModalitaLavoro = 'esterno';

export const MODALITA_LAVORO: readonly ModalitaLavoro[] = ['esterno', 'ufficio'];

/** Come si chiama a schermo. */
export const LABEL_MODALITA: Record<ModalitaLavoro, string> = {
  ufficio: 'Prevalenza ufficio',
  esterno: 'Attività esterne',
};

/**
 * Cosa cambia davvero, detto all'ufficio che deve scegliere. Non «dove sta la
 * persona», ma cosa le chiede il telefono: e' l'unica cosa che questo campo fa.
 */
export const SPIEGA_MODALITA: Record<ModalitaLavoro, string> = {
  ufficio: 'L’app non chiede cantiere né viaggio',
  esterno: 'L’app chiede cantiere, partenza e chilometri',
};

export function normalizzaModalita(v: unknown): ModalitaLavoro {
  return v === 'ufficio' ? 'ufficio' : MODALITA_PREDEFINITA;
}
