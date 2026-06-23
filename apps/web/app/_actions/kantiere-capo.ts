'use server';

import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { getTenantContext, type TenantContext } from '@kommessa/api/tenant';
import { statoTurno, type StatoTurno } from '@kommessa/api/kantiere-ore';
import { romeDay, romeDayBoundsUtc } from '@kommessa/api/rome-time';
import { tenantHasModule } from '@/app/_lib/modules';
import { ricomputaRapportinoAuto } from './_lib/ricomputa-rapportino';

/**
 * Azioni "gestione squadra" del caposquadra: timbra per i membri (e per sé)
 * senza QR — ingresso/uscita/pausa/ripresa, singole o in blocco. Autorizzazione:
 * l'utente deve essere capo del cantiere e il bersaglio deve farne parte (o
 * essere lui stesso). Lo stato viene validato contro le timbrature reali, così
 * un membro che chiude da QR una pausa avviata dal capo non viene toccato due
 * volte. Le ore restano auto-derivate dalle timbrature (non si tocca il calcolo).
 */

type AzioneTimbra = 'inizio' | 'fine' | 'pausa' | 'ripresa';

const AZIONI_AMMESSE: Record<AzioneTimbra, StatoTurno[]> = {
  inizio: ['idle'],
  fine: ['lavoro', 'pausa'],
  pausa: ['lavoro'],
  ripresa: ['pausa'],
};

function azioneATimbra(a: AzioneTimbra): { tipo: 'ingresso' | 'uscita'; pausa: boolean } {
  switch (a) {
    case 'inizio':
      return { tipo: 'ingresso', pausa: false };
    case 'fine':
      return { tipo: 'uscita', pausa: false };
    case 'pausa':
      return { tipo: 'uscita', pausa: true };
    case 'ripresa':
      return { tipo: 'ingresso', pausa: true };
  }
}

type CtxOk = { ctx: TenantContext };
type CtxErr = { error: string };

async function ctxModulo(): Promise<CtxOk | CtxErr> {
  const ctx = await getTenantContext();
  if (!ctx) return { error: 'NON_AUTENTICATO' };
  if (!(await tenantHasModule('kantiere'))) return { error: 'MODULO_OFF' };
  return { ctx };
}

/** Carica meId + se sono capo del cantiere + gli id di tutta la squadra. */
async function caricaSquadra(
  supabase: ReturnType<typeof createServerSupabase>,
  ctx: TenantContext,
  cantiereId: string,
): Promise<{ meId: string; isCapo: boolean; squadIds: string[] } | null> {
  const { data: meRow } = await supabase
    .from('dipendenti' as never)
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('user_id', ctx.userId)
    .maybeSingle();
  const meId = (meRow as { id: string } | null)?.id;
  if (!meId) return null;

  const { data: rows } = await supabase
    .from('cantiere_squadra' as never)
    .select('dipendente_id, ruolo')
    .eq('tenant_id', ctx.tenantId)
    .eq('cantiere_id', cantiereId);
  const squad = (rows as { dipendente_id: string; ruolo: 'capo' | 'membro' }[] | null) ?? [];
  const isCapo = squad.some((x) => x.dipendente_id === meId && x.ruolo === 'capo');
  return { meId, isCapo, squadIds: squad.map((x) => x.dipendente_id) };
}

async function eventiOggi(
  supabase: ReturnType<typeof createServerSupabase>,
  dipendenteId: string,
  cantiereId: string,
): Promise<{ tipo: 'ingresso' | 'uscita'; ts: string; pausa: boolean | null }[]> {
  const { fromIso, toIso } = romeDayBoundsUtc(romeDay(new Date()));
  const { data } = await supabase
    .from('timbrature' as never)
    .select('tipo, ts, pausa')
    .eq('dipendente_id', dipendenteId)
    .eq('cantiere_id', cantiereId)
    .gte('ts', fromIso)
    .lt('ts', toIso)
    .order('ts', { ascending: true });
  return (data as { tipo: 'ingresso' | 'uscita'; ts: string; pausa: boolean | null }[] | null) ?? [];
}

/** Applica un'azione a un dipendente solo se lo stato attuale la consente. */
async function applicaAzione(
  supabase: ReturnType<typeof createServerSupabase>,
  ctx: TenantContext,
  cantiereId: string,
  dipendenteId: string,
  azione: AzioneTimbra,
  self: boolean,
): Promise<{ toccato: boolean; error?: string }> {
  const eventi = await eventiOggi(supabase, dipendenteId, cantiereId);
  const info = statoTurno(eventi);
  if (!AZIONI_AMMESSE[azione].includes(info.stato)) return { toccato: false };

  const { tipo, pausa } = azioneATimbra(azione);
  const ts = new Date().toISOString();
  const { error } = await supabase.from('timbrature' as never).insert({
    tenant_id: ctx.tenantId,
    dipendente_id: dipendenteId,
    cantiere_id: cantiereId,
    commessa_id: null,
    tipo,
    pausa,
    origine: self ? 'qr' : 'capo',
    ts,
    creato_da: ctx.userId,
  } as never);
  if (error) return { toccato: false, error: error.message };

  try {
    await ricomputaRapportinoAuto(supabase, ctx.tenantId, dipendenteId, romeDay(new Date(ts)));
  } catch {
    // best-effort
  }
  return { toccato: true };
}

// ── azione su un singolo membro ─────────────────────────────────────────
const TimbraMembroSchema = z.object({
  cantiereId: z.string().uuid(),
  dipendenteId: z.string().uuid(),
  azione: z.enum(['inizio', 'fine', 'pausa', 'ripresa']),
});

export async function timbraMembro(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = TimbraMembroSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  const r = await ctxModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;
  const supabase = createServerSupabase();

  const sq = await caricaSquadra(supabase, ctx, parsed.data.cantiereId);
  if (!sq) return { ok: false, error: 'NESSUN_DIPENDENTE' };
  const self = parsed.data.dipendenteId === sq.meId;
  const inSquad = sq.squadIds.includes(parsed.data.dipendenteId);
  if (!(self || (sq.isCapo && inSquad))) return { ok: false, error: 'NON_AUTORIZZATO' };

  const res = await applicaAzione(
    supabase,
    ctx,
    parsed.data.cantiereId,
    parsed.data.dipendenteId,
    parsed.data.azione,
    self,
  );
  if (res.error) return { ok: false, error: res.error };
  if (!res.toccato) return { ok: false, error: 'AZIONE_NON_VALIDA' };
  return { ok: true };
}

// ── azione in blocco sulla squadra del cantiere ─────────────────────────
const BulkSchema = z.object({
  cantiereId: z.string().uuid(),
  azione: z.enum(['pausa', 'ripresa', 'fine']),
  /** Sottoinsieme opzionale; se assente, tutta la squadra del cantiere. */
  dipendenteIds: z.array(z.string().uuid()).optional(),
});

export async function timbraMembriBulk(
  input: unknown,
): Promise<{ ok: true; toccati: number; saltati: number } | { ok: false; error: string }> {
  const parsed = BulkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  const r = await ctxModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;
  const supabase = createServerSupabase();

  const sq = await caricaSquadra(supabase, ctx, parsed.data.cantiereId);
  if (!sq) return { ok: false, error: 'NESSUN_DIPENDENTE' };
  if (!sq.isCapo) return { ok: false, error: 'NON_AUTORIZZATO' };

  const targets = parsed.data.dipendenteIds?.length
    ? parsed.data.dipendenteIds.filter((id) => sq.squadIds.includes(id))
    : sq.squadIds;

  let toccati = 0;
  let saltati = 0;
  for (const id of targets) {
    const self = id === sq.meId;
    const res = await applicaAzione(supabase, ctx, parsed.data.cantiereId, id, parsed.data.azione, self);
    if (res.toccato) toccati += 1;
    else saltati += 1;
  }
  return { ok: true, toccati, saltati };
}
