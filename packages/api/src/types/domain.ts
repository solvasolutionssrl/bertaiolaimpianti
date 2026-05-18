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

export type StatoTicket = 'aperto' | 'in_lavorazione' | 'attesa_cliente' | 'chiuso';

export type PrioritaTicket = 'bassa' | 'media' | 'alta' | 'urgente';

export type TicketSource = 'manual' | 'email' | 'portal_cliente' | 'imported_from_freshdesk';

export type StatoFase = 'da_iniziare' | 'in_corso' | 'completata' | 'bloccata';

export type CategoriaVoce =
  | 'sempre_attiva'
  | 'impiantistica'
  | 'ventilazione'
  | 'documentazione'
  | 'tubazioni'
  | 'montaggi'
  | 'allacci'
  | 'supporto'
  | 'alimentazione';

export type MomentoFoto = 'sopralluogo' | 'in_corso' | 'finale';

export type StorageProviderName = 'supabase' | 'nextcloud';

export interface CommessaSummary {
  id: string;
  codiceInterno: string;
  nomeCartella: string;
  cliente: { id: string; nome: string };
  stato: StatoCommessa;
  responsabile: { id: string; nome: string } | null;
  dataApertura: string;
  fotoCount: number;
  fasiTotali: number;
  fasiCompletate: number;
}
