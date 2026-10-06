/**
 * ⚠️ Qui c'era un sistema di permessi a **sette aree per quattro livelli**:
 * `PERMISSION_AREAS`, `AREA_LABELS`, `PERMISSION_LEVELS`, `LEVEL_LABELS`,
 * `PermissionLevelMap`, `UserPermissionOverrides`, `EffectivePermissions`,
 * `getRoleDefaultPermissions`. Nove export, zero riferimenti in tutto il
 * repository, e **zero utenti su cinquantaquattro** che lo avessero compilato.
 *
 * Non era codice morto e basta: c'era un pannello a scorrimento nell'elenco
 * utenti che lo mostrava, e chi lo compilava credeva di aver chiuso una porta.
 * Sostituito il 07/10/2026 da `@kommessa/api/capacita`, che ha **una voce
 * sola** e un posto che la legge.
 *
 * Restano qui sotto solo le cose vive: quale guscio dell'app vede una persona.
 */

export type MobileShell = 'gestione' | 'campo' | 'kantiere' | 'full';

export function getMobileShell(role: string): MobileShell {
  // 'gestione' = chi gestisce il tenant (admin/office); il resto va in 'campo'.
  return ['admin', 'office'].includes(role) ? 'gestione' : 'campo';
}

/** Esperienza mobile per-tenant (`tenants.app_mode`). Default 'kommessa'. */
export type AppMode = 'kommessa' | 'kantiere' | 'full';

/**
 * Risolve la shell mobile combinando l'`app_mode` del tenant e il ruolo utente.
 *
 *  - `kommessa` → `getMobileShell(role)` (gestione/campo) — percorso INVARIATO,
 *    identico al comportamento storico (Bertaiola resta intatta).
 *  - `kantiere` → `'kantiere'` (PWA solo Kantiere).
 *  - `full`     → `getMobileShell(role)` ma il layout inietta le voci Kantiere
 *    (la shell base resta gestione/campo, con uno slot Kantiere in più).
 */
export function risolviMobileShell({
  appMode,
  role,
}: {
  appMode: AppMode;
  role: string;
}): MobileShell {
  if (appMode === 'kantiere') return 'kantiere';
  // 'kommessa' e 'full' partono dalla shell storica per-ruolo.
  // Per 'full' il bottom-nav aggiunge l'entry Kantiere senza cambiare il resto.
  return getMobileShell(role);
}
