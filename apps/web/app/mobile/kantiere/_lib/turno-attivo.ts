import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { titoloCase } from '@/app/mobile/_lib/display-case';

/**
 * Turno attivo del DIPENDENTE corrente = un ingresso su cantiere senza la
 * relativa uscita (ha timbrato l'arrivo ma non la fine giornata).
 *
 * Restituisce il turno aperto più recente (con cantiere + ora ingresso), o
 * `null` se non c'è nulla di aperto. Usato dalla landing Cantieri e dalla tab
 * Ore per mostrare lo stato "in corso" con contatore live.
 *
 * Server-only: legge il contesto tenant/utente. Il chiamante è già gated dal
 * layout Kantiere mobile.
 */
export interface TurnoAttivoMio {
  cantiereId: string;
  cantiereNome: string;
  /** ISO timestamp dell'ingresso ancora aperto. */
  inizioTs: string;
}

type TimbRow = {
  cantiere_id: string | null;
  tipo: 'ingresso' | 'uscita';
  ts: string;
};

export async function mioTurnoAttivo(): Promise<TurnoAttivoMio | null> {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  // Scheda dipendente collegata all'utente.
  const { data: dipRow } = await supabase
    .from('dipendenti' as never)
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('user_id', ctx.userId)
    .maybeSingle();
  const dipId = (dipRow as { id: string } | null)?.id;
  if (!dipId) return null;

  // Finestra ampia (20h) per coprire i turni iniziati in giornata.
  const since = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
  const { data: timbRaw } = await supabase
    .from('timbrature' as never)
    .select('cantiere_id, tipo, ts')
    .eq('tenant_id', ctx.tenantId)
    .eq('dipendente_id', dipId)
    .not('cantiere_id', 'is', null)
    .gte('ts', since)
    .order('ts', { ascending: true });

  const righe = (timbRaw as TimbRow[] | null) ?? [];

  // Per ogni cantiere, l'ingresso resta aperto finché non arriva un'uscita.
  const aperti = new Map<string, string>(); // cantiereId → inizioTs
  for (const t of righe) {
    if (!t.cantiere_id) continue;
    if (t.tipo === 'ingresso') aperti.set(t.cantiere_id, t.ts);
    else aperti.delete(t.cantiere_id);
  }
  if (aperti.size === 0) return null;

  // Turno aperto più recente.
  let best: { cantId: string; ts: string } | null = null;
  for (const [cantId, ts] of aperti) {
    if (!best || Date.parse(ts) > Date.parse(best.ts)) best = { cantId, ts };
  }
  if (!best) return null;

  const { data: cantRow } = await supabase
    .from('cantieri' as never)
    .select('nome, codice')
    .eq('id', best.cantId)
    .maybeSingle();
  const c = cantRow as { nome: string | null; codice: string | null } | null;

  return {
    cantiereId: best.cantId,
    cantiereNome: titoloCase(c?.nome || c?.codice || 'Cantiere'),
    inizioTs: best.ts,
  };
}
