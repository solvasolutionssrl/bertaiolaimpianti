import 'server-only';

import { createServerSupabase } from '@impiantixplus/api/server';

export interface TurnoRow {
  id: string;
  user_id: string;
  user_name: string | null;
  commessa_id: string;
  commessa_codice: string;
  start_at: string;
  end_at: string | null;
  duration_minutes: number | null;
}

export interface SettimanaRange {
  from: Date;
  to: Date;
}

/**
 * Restituisce {from, to} che identificano la settimana (lun→dom) che
 * contiene la data passata. Tempo: from = 00:00 lun, to = 00:00 lun
 * successivo (exclusive upper bound).
 */
export function settimanaRange(d: Date): SettimanaRange {
  const ref = new Date(d);
  ref.setHours(0, 0, 0, 0);
  const dow = (ref.getDay() + 6) % 7; // lun = 0
  const from = new Date(ref);
  from.setDate(ref.getDate() - dow);
  const to = new Date(from);
  to.setDate(from.getDate() + 7);
  return { from, to };
}

export interface FetchTurniInput {
  from: Date;
  to: Date;
  userId?: string | null;
  commessaId?: string | null;
}

export async function fetchInterventi(
  input: FetchTurniInput,
): Promise<TurnoRow[]> {
  const supabase = createServerSupabase();

  let q = supabase
    .from('interventi')
    .select(
      `
        id, user_id, start_at, end_at, duration_minutes, commessa_id,
        utente:users!interventi_user_id_fkey ( display_name ),
        commessa:commesse!inner ( codice_interno )
      `,
    )
    .gte('start_at', input.from.toISOString())
    .lt('start_at', input.to.toISOString())
    .order('start_at', { ascending: true })
    .limit(2000);

  if (input.userId) q = q.eq('user_id', input.userId);
  if (input.commessaId) q = q.eq('commessa_id', input.commessaId);

  const { data, error } = await q;
  if (error) {
    console.error('[fetchInterventi]', error);
    return [];
  }
  return ((data as any[]) ?? []).map((r) => {
    const utente = Array.isArray(r.utente) ? r.utente[0] : r.utente;
    const commessa = Array.isArray(r.commessa) ? r.commessa[0] : r.commessa;
    return {
      id: r.id,
      user_id: r.user_id,
      user_name: utente?.display_name ?? null,
      commessa_id: r.commessa_id,
      commessa_codice: commessa?.codice_interno ?? '—',
      start_at: r.start_at,
      end_at: r.end_at,
      duration_minutes: r.duration_minutes,
    };
  });
}

export interface UtenteOpt {
  id: string;
  display_name: string;
}

export async function fetchUtentiTenant(): Promise<UtenteOpt[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('users')
    .select('id, display_name')
    .eq('attivo', true)
    .order('display_name', { ascending: true })
    .limit(200);
  if (error) {
    console.error('[fetchUtentiTenant]', error);
    return [];
  }
  return ((data as any[]) ?? []).map((r) => ({
    id: r.id,
    display_name: r.display_name ?? r.id.slice(0, 8),
  }));
}

export interface CommessaOpt {
  id: string;
  codice_interno: string;
}

export async function fetchCommesseTenant(): Promise<CommessaOpt[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('commesse')
    .select('id, codice_interno')
    .order('data_apertura', { ascending: false })
    .limit(500);
  if (error) {
    console.error('[fetchCommesseTenant]', error);
    return [];
  }
  return ((data as any[]) ?? []).map((r) => ({
    id: r.id,
    codice_interno: r.codice_interno,
  }));
}

/* ---------- aggregati lato server (Js) ---------- */

export interface FoglioOreRow {
  user_id: string;
  user_name: string;
  /** Array length 7 (lun→dom), minuti totali per giorno. */
  giorni: number[];
  totale: number;
}

/**
 * Aggrega gli interventi della settimana in righe utente × 7 giorni.
 * Interventi ancora aperti (end_at null) usano la durata "running" al
 * momento dell'aggregazione.
 */
export function aggregaFoglioOre(
  rows: TurnoRow[],
  from: Date,
): FoglioOreRow[] {
  const byUser = new Map<string, FoglioOreRow>();
  const fromMs = from.getTime();

  for (const r of rows) {
    if (!byUser.has(r.user_id)) {
      byUser.set(r.user_id, {
        user_id: r.user_id,
        user_name: r.user_name ?? r.user_id.slice(0, 8),
        giorni: [0, 0, 0, 0, 0, 0, 0],
        totale: 0,
      });
    }
    const row = byUser.get(r.user_id)!;
    const startMs = new Date(r.start_at).getTime();
    const endMs = r.end_at ? new Date(r.end_at).getTime() : Date.now();
    const dur =
      r.duration_minutes != null
        ? r.duration_minutes
        : Math.max(0, Math.round((endMs - startMs) / 60000));
    // Indice giorno: differenza giorni rispetto a from (lun)
    const dayIdx = Math.min(
      6,
      Math.max(
        0,
        Math.floor((startMs - fromMs) / (24 * 3_600_000)),
      ),
    );
    row.giorni[dayIdx] = (row.giorni[dayIdx] ?? 0) + dur;
    row.totale += dur;
  }

  return Array.from(byUser.values()).sort((a, b) =>
    a.user_name.localeCompare(b.user_name),
  );
}

export interface OrePerCommessaRow {
  commessa_id: string;
  commessa_codice: string;
  minuti_totali: number;
  utenti_count: number;
}

export function aggregaOrePerCommessa(rows: TurnoRow[]): OrePerCommessaRow[] {
  const byCommessa = new Map<
    string,
    { codice: string; minuti: number; utenti: Set<string> }
  >();
  for (const r of rows) {
    if (!byCommessa.has(r.commessa_id)) {
      byCommessa.set(r.commessa_id, {
        codice: r.commessa_codice,
        minuti: 0,
        utenti: new Set(),
      });
    }
    const agg = byCommessa.get(r.commessa_id)!;
    const startMs = new Date(r.start_at).getTime();
    const endMs = r.end_at ? new Date(r.end_at).getTime() : Date.now();
    const dur =
      r.duration_minutes != null
        ? r.duration_minutes
        : Math.max(0, Math.round((endMs - startMs) / 60000));
    agg.minuti += dur;
    agg.utenti.add(r.user_id);
  }
  return Array.from(byCommessa.entries())
    .map(([id, v]) => ({
      commessa_id: id,
      commessa_codice: v.codice,
      minuti_totali: v.minuti,
      utenti_count: v.utenti.size,
    }))
    .sort((a, b) => b.minuti_totali - a.minuti_totali);
}

export function formatDurataMin(m: number): string {
  if (m <= 0) return '—';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm.toString().padStart(2, '0')}m`;
}
