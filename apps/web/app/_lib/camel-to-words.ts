/**
 * Spezza una stringa CamelCase in parole separate da spazio.
 * Usato per mostrare "human-readable" la descrizione cartella che
 * internamente resta CamelCase (no spazi, compatibile con path Nextcloud).
 *
 * Esempi:
 *  - "SistemazioneBagno"           → "Sistemazione Bagno"
 *  - "ImpiantoGasStabilimento"     → "Impianto Gas Stabilimento"
 *  - "AttivitaAgriCampeggio"       → "Attivita Agri Campeggio"
 *  - "ABCD"                         → "ABCD"  (tutte maiuscole consecutive: lasciate)
 *  - "PompaDiCalore"               → "Pompa Di Calore"
 *
 * NB: la versione "internal" resta sempre CamelCase compatta nel DB
 * (nome_cartella, descrizione_ai_finale). Questa funzione fa solo display.
 */
export function camelCaseToWords(camel: string): string {
  if (!camel) return camel;
  return camel
    // Inserisci spazio fra una minuscola/numero e una maiuscola che segue.
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    // Inserisci spazio fra una sequenza di maiuscole e l'inizio di una
    // parola "Title case" (es. "ABCDef" → "ABC Def").
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
}
