/**
 * Helper di formattazione per la UI (lingua: it-IT).
 */

export function fmtData(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('it-IT', {
      timeZone: 'Europe/Rome',
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
      timeZone: 'Europe/Rome',
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
      timeZone: 'Europe/Rome',
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
  // TODO / Riunione
  'commessa.todo.crea': 'Creato task',
  'commessa.todo.aggiorna': 'Modificato task',
  'commessa.todo.completa': 'Completato task',
  'commessa.todo.stato': 'Cambio stato task',
  'commessa.todo.elimina': 'Eliminato task',
  'commessa.riunione.crea': 'Creata riunione',
  'commessa.riunione.elimina': 'Eliminata riunione',
  'commessa.riunione.materializza_todo': 'Task generati da una riunione',
  // Stato commessa
  'commessa.stato.cambiato': 'Cambio stato commessa',
  'commessa.critica.toggle': 'Toggle critica',
  // Tecnici
  'commessa.tecnico.assign': 'Assegnato tecnico',
  'commessa.tecnico.unassign': 'Rimosso tecnico',
  // Accessi e poteri (07/10/2026)
  'account.crea': 'Creato un accesso',
  'account.reimposta_password': 'Data una password nuova',
  'account.password_scelta': 'Ha scelto la sua password',
  'potere.concedi': 'Dato il potere di capo squadra',
  'potere.revoca': 'Tolto il potere di capo squadra',
  'funzione.accendi': 'Accesa una funzione',
  'funzione.spegni': 'Spenta una funzione',
  // Collegamenti per il cliente (06/10/2026)
  'link_pubblico.crea': 'Creato un collegamento per il cliente',
  'link_pubblico.revoca': 'Spento il collegamento per il cliente',
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
  const md = e.metadata ?? {};

  // Action namespacate (es. "commessa.todo.crea"): la label è già
  // self-explanatory, aggiungiamo dettagli da metadata se sensati.
  if (e.action.includes('.')) {
    const titolo = (md as { titolo?: string }).titolo;
    const fromTo =
      (md as { from_stato?: string; to_stato?: string }).to_stato &&
      `${(md as any).from_stato ?? '?'} → ${(md as any).to_stato}`;
    const count = (md as { count?: number }).count;
    const dettaglio = titolo ?? fromTo ?? (count ? `${count} TODO` : null);
    return dettaglio ? `${azione}: ${dettaglio}` : azione;
  }

  // Action legacy (create/update/...): manteniamo la forma vecchia.
  const entita = AUDIT_ENTITY_LABELS[e.entity_type] ?? e.entity_type;
  return `${azione} ${entita} ${e.entity_id}`;
}
