/**
 * Moduli applicativi attivabili per tenant.
 *
 * - `base`       : il prodotto attuale (commesse, foto, ticketing, ecc.).
 *                  Sempre attivo per ogni tenant — NON ha una riga in tabella.
 * - `kantiere`   : Tesserino Digitale (dipendenti, squadre, presenze/ore, QR).
 *                  Opzionale: attivo solo se esiste una riga `attivo=true`.
 * - `dipendenti` : Gestione del personale (pianificazione settimanale, ferie e
 *                  permessi). Sotto-flag in `tenant_modules.config`:
 *                  `pianificazione_attiva`, `ferie_attiva`.
 *                  Opzionale: attivo solo se esiste una riga `attivo=true`.
 * - `integrazione`: ponte verso il gestionale del cliente (ERP esterno).
 *                  Quale gestionale e come si sincronizza sta in
 *                  `tenant_modules.config`: `sistema`, `sinc_manuale`,
 *                  `auto_push`. Il codice di Kommessa resta neutro — il
 *                  dialetto dell'ERP vive solo nell'agente di sync.
 *                  Opzionale: attivo solo se esiste una riga `attivo=true`.
 */
export type ModuleCode = 'base' | 'kantiere' | 'dipendenti' | 'integrazione';

export const MODULE_CODES: ModuleCode[] = [
  'base',
  'kantiere',
  'dipendenti',
  'integrazione',
];

/** Moduli che richiedono una riga esplicita in `tenant_modules` per attivarsi. */
export const OPTIONAL_MODULE_CODES: Exclude<ModuleCode, 'base'>[] = [
  'kantiere',
  'dipendenti',
  'integrazione',
];

export interface TenantModuleRow {
  module_code: string;
  attivo: boolean;
}

/**
 * `base` è sempre attivo. Gli altri moduli sono attivi solo se in `rows`
 * esiste una riga con quel `module_code` e `attivo=true`.
 */
export function isModuleActive(
  rows: TenantModuleRow[],
  code: ModuleCode,
): boolean {
  if (code === 'base') return true;
  return rows.some((r) => r.module_code === code && r.attivo);
}
