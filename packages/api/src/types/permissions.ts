import type { AppRole } from '../tenant';

export type PermissionArea =
  | 'commesse'
  | 'clienti'
  | 'ticket'
  | 'turni'
  | 'documenti'
  | 'utenti'
  | 'statistiche';

export const PERMISSION_AREAS: readonly PermissionArea[] = [
  'commesse',
  'clienti',
  'ticket',
  'turni',
  'documenti',
  'utenti',
  'statistiche',
] as const;

export const AREA_LABELS: Record<PermissionArea, string> = {
  commesse: 'Commesse',
  clienti: 'Clienti',
  ticket: 'Ticket',
  turni: 'Turni',
  documenti: 'Documenti',
  utenti: 'Utenti',
  statistiche: 'Statistiche',
};

export const PERMISSION_LEVELS: Record<PermissionArea, readonly string[]> = {
  commesse:    ['none', 'view', 'edit', 'full'],
  clienti:     ['none', 'view', 'edit', 'full'],
  ticket:      ['none', 'view', 'create', 'full'],
  turni:       ['none', 'own', 'team', 'approve'],
  documenti:   ['none', 'view', 'upload', 'full'],
  utenti:      ['none', 'view', 'invite', 'full'],
  statistiche: ['none', 'aggregati', 'dettaglio', 'export'],
};

export const LEVEL_LABELS: Record<string, string> = {
  none: 'Nessuno',
  view: 'Lettura',
  edit: 'Modifica',
  full: 'Completo',
  create: 'Crea',
  own: 'Propri',
  team: 'Team',
  approve: 'Approva',
  upload: 'Upload',
  invite: 'Invita',
  aggregati: 'Aggregati',
  dettaglio: 'Dettaglio',
  export: 'Export',
};

export type PermissionLevelMap = {
  commesse:    'none' | 'view' | 'edit' | 'full';
  clienti:     'none' | 'view' | 'edit' | 'full';
  ticket:      'none' | 'view' | 'create' | 'full';
  turni:       'none' | 'own' | 'team' | 'approve';
  documenti:   'none' | 'view' | 'upload' | 'full';
  utenti:      'none' | 'view' | 'invite' | 'full';
  statistiche: 'none' | 'aggregati' | 'dettaglio' | 'export';
};

export type UserPermissionOverrides = Partial<PermissionLevelMap>;
export type EffectivePermissions = PermissionLevelMap;

export type MobileShell = 'gestione' | 'campo';

export function getMobileShell(role: string): MobileShell {
  return ['owner', 'admin', 'office', 'capo'].includes(role) ? 'gestione' : 'campo';
}

export function getRoleDefaultPermissions(role: AppRole): EffectivePermissions {
  switch (role) {
    case 'owner':
      return { commesse: 'full', clienti: 'full', ticket: 'full', turni: 'approve', documenti: 'full', utenti: 'full', statistiche: 'export' };
    case 'admin':
      return { commesse: 'full', clienti: 'full', ticket: 'full', turni: 'approve', documenti: 'full', utenti: 'invite', statistiche: 'export' };
    case 'office':
      return { commesse: 'edit', clienti: 'edit', ticket: 'create', turni: 'own', documenti: 'upload', utenti: 'none', statistiche: 'aggregati' };
    case 'capo':
      return { commesse: 'edit', clienti: 'view', ticket: 'create', turni: 'team', documenti: 'upload', utenti: 'none', statistiche: 'aggregati' };
    case 'tecnico':
      return { commesse: 'view', clienti: 'none', ticket: 'none', turni: 'own', documenti: 'view', utenti: 'none', statistiche: 'none' };
    default:
      return { commesse: 'none', clienti: 'none', ticket: 'none', turni: 'none', documenti: 'none', utenti: 'none', statistiche: 'none' };
  }
}
