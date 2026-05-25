import 'server-only';

import { createServerSupabase } from '@kommessa/api/server';

/**
 * Avvisi computati on-the-fly dai dati. Non sono righe in `notifiche`
 * (quelle sono eventi storici), sono check derivati che "lampeggiano"
 * finché la condizione è vera.
 *
 * Tipologie supportate (config per-tenant in `tenant_alert_settings`):
 *  - commessa_ferma            — nessuna attività da N giorni
 *  - sopralluogo_no_foto       — commessa aperta senza foto sopralluogo
 *  - todo_scaduti              — TODO con scadenza passata, ancora aperto
 *  - todo_urgenti_non_assegnati — TODO urgente/alta senza assegnatario
 *  - dico_scadenza             — DICO in scadenza ≤ N giorni
 *  - fasi_in_attesa            — commessa_voci in da_iniziare da > N giorni
 *
 * Severity: 'info' | 'warning' | 'critical' — usata per colore/sort UI.
 */

export type AlertType =
  | 'commessa_ferma'
  | 'sopralluogo_no_foto'
  | 'todo_scaduti'
  | 'todo_urgenti_non_assegnati'
  | 'dico_scadenza'
  | 'fasi_in_attesa';

export interface AlertItem {
  type: AlertType;
  severity: 'info' | 'warning' | 'critical';
  /** Titolo breve per la card. */
  title: string;
  /** Descrizione 1 frase. */
  description: string;
  /** Path commessa o entità da cui è scattato l'alert. */
  href: string | null;
  /** Riferimento testuale (es. codice commessa). */
  ref: string | null;
  /** Timestamp ISO dell'evento "scatenante" (per sort cronologico). */
  ts: string;
}

export interface AlertSetting {
  alert_type: AlertType;
  enabled: boolean;
  threshold_days: number;
}

export const ALERT_DEFAULTS: Record<
  AlertType,
  { enabled: boolean; threshold_days: number; label: string; description: string }
> = {
  commessa_ferma: {
    enabled: true,
    threshold_days: 5,
    label: 'Commessa ferma',
    description: 'Commesse aperte/in corso senza attività (upload, intervento, cambio stato) da N giorni.',
  },
  sopralluogo_no_foto: {
    enabled: true,
    threshold_days: 3,
    label: 'Sopralluogo senza foto',
    description: 'Commesse aperte da più di N giorni senza nessuna foto sopralluogo caricata.',
  },
  todo_scaduti: {
    enabled: true,
    threshold_days: 0,
    label: 'TODO scaduti',
    description: 'TODO ancora aperti con scadenza passata. Soglia = 0 (immediato).',
  },
  todo_urgenti_non_assegnati: {
    enabled: true,
    threshold_days: 0,
    label: 'TODO urgenti senza assegnatario',
    description: 'TODO con priorità urgente o alta che non hanno un assegnatario.',
  },
  dico_scadenza: {
    enabled: true,
    threshold_days: 7,
    label: 'DICO in scadenza',
    description: 'Commesse con DICO in scadenza entro N giorni.',
  },
  fasi_in_attesa: {
    enabled: true,
    threshold_days: 7,
    label: 'Fasi in attesa',
    description: 'Voci di una commessa rimaste "da iniziare" per più di N giorni.',
  },
};

const ALL_TYPES: AlertType[] = Object.keys(ALERT_DEFAULTS) as AlertType[];

export async function loadAlertSettings(
  tenantId: string,
): Promise<Record<AlertType, AlertSetting>> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from('tenant_alert_settings' as never)
    .select('alert_type, enabled, threshold_days')
    .eq('tenant_id', tenantId);
  const byType = new Map<AlertType, AlertSetting>(
    ((data ?? []) as Array<{
      alert_type: AlertType;
      enabled: boolean;
      threshold_days: number | null;
    }>).map((r) => [
      r.alert_type,
      {
        alert_type: r.alert_type,
        enabled: r.enabled,
        threshold_days:
          r.threshold_days ?? ALERT_DEFAULTS[r.alert_type].threshold_days,
      },
    ]),
  );
  const out = {} as Record<AlertType, AlertSetting>;
  for (const t of ALL_TYPES) {
    out[t] = byType.get(t) ?? {
      alert_type: t,
      enabled: ALERT_DEFAULTS[t].enabled,
      threshold_days: ALERT_DEFAULTS[t].threshold_days,
    };
  }
  return out;
}

/**
 * Calcola tutti gli alert attivi del tenant. Rispetta i toggle in
 * tenant_alert_settings. Ritorna array unico ordinato per severity.
 */
export async function computeAlerts(tenantId: string): Promise<AlertItem[]> {
  const supabase = createServerSupabase();
  const settings = await loadAlertSettings(tenantId);
  const out: AlertItem[] = [];
  const now = new Date();
  const nowIso = now.toISOString();

  // ─── commessa_ferma ────────────────────────────────────────────────
  if (settings.commessa_ferma.enabled) {
    const days = settings.commessa_ferma.threshold_days;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('commesse')
      .select('id, codice_interno, updated_at, nome_cartella')
      .in('stato', ['aperta', 'in_corso'])
      .lt('updated_at', cutoff)
      .limit(50);
    for (const c of (data ?? []) as Array<{
      id: string;
      codice_interno: string;
      updated_at: string;
      nome_cartella: string;
    }>) {
      const giorni = Math.floor(
        (now.getTime() - new Date(c.updated_at).getTime()) / 86_400_000,
      );
      out.push({
        type: 'commessa_ferma',
        severity: giorni > days * 2 ? 'critical' : 'warning',
        title: `Commessa ferma da ${giorni} giorni`,
        description: `${c.codice_interno} · ${c.nome_cartella} non ha attività da ${giorni} giorni.`,
        href: `/office/commesse/${c.id}`,
        ref: c.codice_interno,
        ts: c.updated_at,
      });
    }
  }

  // ─── sopralluogo_no_foto ──────────────────────────────────────────
  if (settings.sopralluogo_no_foto.enabled) {
    const days = settings.sopralluogo_no_foto.threshold_days;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data: aperte } = await supabase
      .from('commesse')
      .select('id, codice_interno, nome_cartella, data_apertura')
      .in('stato', ['aperta', 'in_corso'])
      .lt('data_apertura', cutoff)
      .limit(100);
    const ids = ((aperte ?? []) as Array<{ id: string }>).map((c) => c.id);
    if (ids.length > 0) {
      const { data: fotoCount } = await supabase
        .from('file_refs')
        .select('commessa_id, mime, momento')
        .in('commessa_id', ids)
        .eq('momento', 'sopralluogo')
        .like('mime', 'image/%');
      const haveFoto = new Set(
        ((fotoCount ?? []) as Array<{ commessa_id: string }>).map(
          (r) => r.commessa_id,
        ),
      );
      for (const c of (aperte ?? []) as Array<{
        id: string;
        codice_interno: string;
        nome_cartella: string;
        data_apertura: string;
      }>) {
        if (haveFoto.has(c.id)) continue;
        out.push({
          type: 'sopralluogo_no_foto',
          severity: 'warning',
          title: 'Sopralluogo senza foto',
          description: `${c.codice_interno} · ${c.nome_cartella} aperta da più di ${days} giorni, nessuna foto sopralluogo.`,
          href: `/office/commesse/${c.id}/foto`,
          ref: c.codice_interno,
          ts: c.data_apertura,
        });
      }
    }
  }

  // ─── todo_scaduti ──────────────────────────────────────────────────
  if (settings.todo_scaduti.enabled) {
    const { data } = await supabase
      .from('commessa_todo' as never)
      .select(
        `id, titolo, scadenza_at, priorita, commessa_id,
         commessa:commesse!commessa_todo_commessa_id_fkey ( codice_interno )`,
      )
      .in('stato', ['aperto', 'in_corso'])
      .lt('scadenza_at', nowIso)
      .limit(50);
    for (const t of (data ?? []) as Array<any>) {
      const comm = Array.isArray(t.commessa) ? t.commessa[0] : t.commessa;
      const giorni = Math.floor(
        (now.getTime() - new Date(t.scadenza_at).getTime()) / 86_400_000,
      );
      out.push({
        type: 'todo_scaduti',
        severity: t.priorita === 'urgente' ? 'critical' : 'warning',
        title: `TODO scaduto da ${giorni} ${giorni === 1 ? 'giorno' : 'giorni'}`,
        description: `${t.titolo} — ${comm?.codice_interno ?? ''}`,
        href: `/office/commesse/${t.commessa_id}/lavori`,
        ref: comm?.codice_interno ?? null,
        ts: t.scadenza_at,
      });
    }
  }

  // ─── todo_urgenti_non_assegnati ────────────────────────────────────
  if (settings.todo_urgenti_non_assegnati.enabled) {
    const { data } = await supabase
      .from('commessa_todo' as never)
      .select(
        `id, titolo, priorita, created_at, commessa_id,
         commessa:commesse!commessa_todo_commessa_id_fkey ( codice_interno )`,
      )
      .in('stato', ['aperto', 'in_corso'])
      .in('priorita', ['urgente', 'alta'])
      .is('assegnato_a', null)
      .limit(50);
    for (const t of (data ?? []) as Array<any>) {
      const comm = Array.isArray(t.commessa) ? t.commessa[0] : t.commessa;
      out.push({
        type: 'todo_urgenti_non_assegnati',
        severity: t.priorita === 'urgente' ? 'critical' : 'warning',
        title: `TODO ${t.priorita} senza assegnatario`,
        description: `${t.titolo} — ${comm?.codice_interno ?? ''}`,
        href: `/office/commesse/${t.commessa_id}/lavori`,
        ref: comm?.codice_interno ?? null,
        ts: t.created_at,
      });
    }
  }

  // ─── dico_scadenza ────────────────────────────────────────────────
  if (settings.dico_scadenza.enabled) {
    const days = settings.dico_scadenza.threshold_days;
    const limit = new Date(
      now.getTime() + days * 24 * 60 * 60 * 1000,
    ).toISOString();
    // Cerchiamo via file_refs con mime application/pdf + filename like %dico%
    // come heuristic. Se schema specifico esiste useremo quello.
    // Fallback: skip per ora — alert "future" computed se serve.
  }

  // ─── fasi_in_attesa ───────────────────────────────────────────────
  if (settings.fasi_in_attesa.enabled) {
    const days = settings.fasi_in_attesa.threshold_days;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('commessa_voci')
      .select(
        `commessa_id, voce_id, stato, updated_at,
         commessa:commesse!inner ( id, codice_interno, stato ),
         voce:voci_catalogo ( nome )`,
      )
      .eq('stato', 'da_iniziare')
      .lt('updated_at', cutoff)
      .limit(50);
    for (const r of (data ?? []) as Array<any>) {
      const comm = Array.isArray(r.commessa) ? r.commessa[0] : r.commessa;
      if (!comm) continue;
      if (!['aperta', 'in_corso'].includes(comm.stato)) continue;
      const v = Array.isArray(r.voce) ? r.voce[0] : r.voce;
      const giorni = Math.floor(
        (now.getTime() - new Date(r.updated_at).getTime()) / 86_400_000,
      );
      out.push({
        type: 'fasi_in_attesa',
        severity: 'info',
        title: `Fase ferma da ${giorni} giorni`,
        description: `${comm.codice_interno} · ${v?.nome ?? 'voce'} in attesa.`,
        href: `/office/commesse/${comm.id}/fasi`,
        ref: comm.codice_interno,
        ts: r.updated_at,
      });
    }
  }

  // Ordina per severity poi per ts (più recente prima)
  const sevOrder: Record<AlertItem['severity'], number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  out.sort((a, b) => {
    if (a.severity !== b.severity) return sevOrder[a.severity] - sevOrder[b.severity];
    return a.ts < b.ts ? 1 : -1;
  });
  return out;
}
