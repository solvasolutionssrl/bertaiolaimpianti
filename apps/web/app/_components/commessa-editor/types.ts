/**
 * Tipi condivisi dell'editor commessa (desktop pagina + wizard mobile).
 *
 * I media NON sono qui: si gestiscono dalla tab "Media" esistente.
 * Le tipologie/voci NON sono nel value: si aggiungono via
 * AggiungiTipologieDialog (commit immediato + provisioning cartelle).
 */

export const STATI_COMMESSA = [
  'bozza',
  'aperta',
  'in_corso',
  'collaudo',
  'completata',
  'archiviata',
] as const;

export type StatoCommessaValue = (typeof STATI_COMMESSA)[number];

export const STATO_LABEL: Record<StatoCommessaValue, string> = {
  bozza: 'Bozza',
  aperta: 'Non presa',
  in_corso: 'In corso',
  collaudo: 'In collaudo',
  completata: 'Completata',
  archiviata: 'Archiviata',
};

export interface ReferenteValue {
  nome: string;
  ruolo: string;
  telefono: string;
  email: string;
}

export interface CommessaEditorValue {
  descrizioneFinale: string;
  indirizzoCantiere: string;
  noteIniziali: string;
  isCritica: boolean;
  stato: StatoCommessaValue;
  responsabileId: string | null;
  referenti: ReferenteValue[];
}

export interface ResponsabileOption {
  id: string;
  display_name: string | null;
}
