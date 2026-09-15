/**
 * Domain types — stay aligned with supabase/migrations/*.sql.
 * Generate the canonical `database.generated.ts` via `pnpm supabase:types`
 * after applying migrations; these aliases give human-friendly names.
 */

export type StatoCommessa =
  | 'bozza'
  | 'aperta'
  | 'in_corso'
  | 'collaudo'
  | 'completata'
  | 'archiviata';

export type MomentoFoto = 'sopralluogo' | 'in_corso' | 'finale';

export type StorageProviderName = 'supabase' | 'nextcloud';
