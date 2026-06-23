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
  /** ISO timestamp dell'inizio turno (primo ingresso ancora aperto). */
  inizioTs: string;
  /** true se il turno è aperto ma il dipendente è in pausa pranzo. */
  inPausa: boolean;
  /** ISO dell'inizio pausa in corso, o null. */
  inizioPausaTs: string | null;
}

type TimbRow = {
  cantiere_id: string | null;
  tipo: 'ingresso' | 'uscita';
  ts: string;
  pausa: boolean | null;
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
    .select('cantiere_id, tipo, ts, pausa')
    .eq('tenant_id', ctx.tenantId)
    .eq('dipendente_id', dipId)
    .not('cantiere_id', 'is', null)
    .gte('ts', since)
    .order('ts', { ascending: true });

  const righe = (timbRaw as TimbRow[] | null) ?? [];

  // Per ogni cantiere il turno resta aperto finché non arriva un'uscita di
  // FINE turno. L'uscita di pausa lo mantiene aperto (ma "in pausa").
  type StatoCant = { inizioTs: string; inPausa: boolean; inizioPausaTs: string | null };
  const aperti = new Map<string, StatoCant>();
  for (const t of righe) {
    if (!t.cantiere_id) continue;
    const cur = aperti.get(t.cantiere_id);
    if (t.tipo === 'ingresso') {
      if (!cur) aperti.set(t.cantiere_id, { inizioTs: t.ts, inPausa: false, inizioPausaTs: null });
      else {
        cur.inPausa = false; // ripresa dopo pausa
        cur.inizioPausaTs = null;
      }
    } else if (t.pausa) {
      if (cur) {
        cur.inPausa = true;
        cur.inizioPausaTs = t.ts;
      }
    } else {
      aperti.delete(t.cantiere_id); // fine turno
    }
  }
  if (aperti.size === 0) return null;

  // Turno aperto più recente (per inizioTs).
  let best: { cantId: string; s: StatoCant } | null = null;
  for (const [cantId, s] of aperti) {
    if (!best || Date.parse(s.inizioTs) > Date.parse(best.s.inizioTs)) best = { cantId, s };
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
    inizioTs: best.s.inizioTs,
    inPausa: best.s.inPausa,
    inizioPausaTs: best.s.inizioPausaTs,
  };
}
