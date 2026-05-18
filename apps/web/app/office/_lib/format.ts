/**
 * Helper di formattazione per la UI (lingua: it-IT).
 */

export function fmtData(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function fmtDataOra(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function fmtOra(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function fmtBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: 'Creazione',
  update: 'Modifica',
  delete: 'Eliminazione',
  status_change: 'Cambio stato',
  upload: 'Caricamento',
  assign: 'Assegnazione',
  convert: 'Conversione',
};
const AUDIT_ENTITY_LABELS: Record<string, string> = {
  commessa: 'commessa',
  ticket: 'ticket',
  cliente: 'cliente',
  file_ref: 'file',
  commessa_voce: 'fase',
};

export function descriviAuditEvent(e: {
  entity_type: string;
  entity_id: string;
  action: string;
  metadata?: Record<string, unknown> | null;
}): string {
  const azione = AUDIT_ACTION_LABELS[e.action] ?? e.action;
  const entita = AUDIT_ENTITY_LABELS[e.entity_type] ?? e.entity_type;
  return `${azione} ${entita} ${e.entity_id}`;
}
