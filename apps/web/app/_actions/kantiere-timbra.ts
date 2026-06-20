'use server';

import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { getTenantContext, type TenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import { prossimoTipoTimbratura } from '@kommessa/api/kantiere-ore';
import { puoTimbrarePer, targetTimbratura } from '@kommessa/api/kantiere';

type Ok = { ok: true; tipo: 'ingresso' | 'uscita'; ts: string };
type Result = Ok | { ok: false; error: string };

const GeoSchema = z.object({ lat: z.number(), lng: z.number() }).partial().optional();

// ── lookup token (pubblico, service) → target polimorfico + tenant ──────
async function risolviToken(token: string) {
  const svc = createServiceSupabase();
  const { data } = await svc
    .from('cantiere_qr' as never)
    .select('commessa_id, cantiere_id, tenant_id, attivo')
    .eq('token', token)
    .maybeSingle();
  return data as {
    commessa_id: string | null;
    cantiere_id: string | null;
    tenant_id: string;
    attivo: boolean;
  } | null;
}

type CtxOk = { ctx: TenantContext };
type CtxErr = { error: string };

// ── helper comune: contesto + dipendente corrente ───────────────────────
async function ctxConModulo(): Promise<CtxOk | CtxErr> {
  const ctx = await getTenantContext();
  if (!ctx) return { error: 'NON_AUTENTICATO' };
  if (!(await tenantHasModule('kantiere'))) return { error: 'MODULO_OFF' };
  return { ctx };
}

async function dipendenteDi(
  supabase: ReturnType<typeof createServerSupabase>,
  tenantId: string,
  userId: string,
): Promise<{ id: string; nome: string; cognome: string } | null> {
  const { data } = await supabase
    .from('dipendenti' as never)
    .select('id, nome, cognome')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { id: string; nome: string; cognome: string } | null) ?? null;
}

async function prossimoTipo(
  supabase: ReturnType<typeof createServerSupabase>,
  dipendenteId: string,
  target: { tipo: 'commessa' | 'cantiere'; id: string },
): Promise<'ingresso' | 'uscita'> {
  // timbrature di oggi (UTC day boundary va bene: confronto solo per ordinamento toggle)
  const inizioGiorno = new Date();
  inizioGiorno.setHours(0, 0, 0, 0);

  let rows: { tipo: 'ingresso' | 'uscita' }[] = [];
  if (target.tipo === 'commessa') {
    const { data } = await supabase
      .from('timbrature' as never)
      .select('tipo, ts')
      .eq('dipendente_id', dipendenteId)
      .eq('commessa_id', target.id)
      .gte('ts', inizioGiorno.toISOString())
      .order('ts', { ascending: true });
    rows = (data as { tipo: 'ingresso' | 'uscita' }[] | null) ?? [];
  } else {
    const { data } = await supabase
      .from('timbrature' as never)
      .select('tipo, ts')
      .eq('dipendente_id', dipendenteId)
      .eq('cantiere_id', target.id)
      .gte('ts', inizioGiorno.toISOString())
      .order('ts', { ascending: true });
    rows = (data as { tipo: 'ingresso' | 'uscita' }[] | null) ?? [];
  }
  return prossimoTipoTimbratura(rows);
}

// ── 1) timbra da QR (sé o, per il capo, un membro) ──────────────────────
const ViaggioSchema = z.object({
  sedeId: z.string().uuid(),
  durataStimataMin: z.number().int().nonnegative().nullable(),
  durataConfermataMin: z.number().int().nonnegative(),
  giustificazione: z.string().max(500).optional(),
  autista: z.boolean(),
  mezzoId: z.string().uuid().nullable().optional(),
});

const TimbraSchema = z.object({
  token: z.string().min(1),
  dipendenteId: z.string().uuid().optional(),
  geo: GeoSchema,
  viaggio: ViaggioSchema.optional(),
});

export async function timbra(input: unknown): Promise<Result> {
  const parsed = TimbraSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  const r = await ctxConModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;

  const qr = await risolviToken(parsed.data.token);
  const target = qr ? targetTimbratura(qr) : null;
  if (!qr || !qr.attivo || !target) return { ok: false, error: 'QR_NON_VALIDO' };
  if (qr.tenant_id !== ctx.tenantId) return { ok: false, error: 'QR_ALTRO_TENANT' };

  const supabase = createServerSupabase();
  const me = await dipendenteDi(supabase, ctx.tenantId, ctx.userId);

  const bersaglioId = parsed.data.dipendenteId ?? me?.id;
  if (!bersaglioId) return { ok: false, error: 'NESSUN_DIPENDENTE' };

  // autorizzazione
  const self = !!me && bersaglioId === me.id;
  let capoSquadra = false;
  let bersaglioInSquadra = false;
  if (!self) {
    if (!me) return { ok: false, error: 'NON_CAPO' };
    if (target.tipo === 'commessa') {
      const { data: righe } = await supabase
        .from('commessa_squadra' as never)
        .select('dipendente_id, ruolo_commessa')
        .eq('commessa_id', target.id);
      const rows = (righe as { dipendente_id: string; ruolo_commessa: 'capo' | 'membro' }[]) ?? [];
      capoSquadra = rows.some((x) => x.dipendente_id === me.id && x.ruolo_commessa === 'capo');
      bersaglioInSquadra = rows.some((x) => x.dipendente_id === bersaglioId);
    } else {
      const { data: righe } = await supabase
        .from('cantiere_squadra' as never)
        .select('dipendente_id, ruolo')
        .eq('cantiere_id', target.id);
      const rows = (righe as { dipendente_id: string; ruolo: 'capo' | 'membro' }[]) ?? [];
      capoSquadra = rows.some((x) => x.dipendente_id === me.id && x.ruolo === 'capo');
      bersaglioInSquadra = rows.some((x) => x.dipendente_id === bersaglioId);
    }
  }
  if (!puoTimbrarePer({ self, capoSquadra, bersaglioInSquadra }))
    return { ok: false, error: 'NON_AUTORIZZATO' };

  const tipo = await prossimoTipo(supabase, bersaglioId, target);
  const ts = new Date().toISOString();

  // Il viaggio si registra solo per la timbratura PERSONALE su un cantiere.
  const viaggio =
    self && target.tipo === 'cantiere' && parsed.data.viaggio ? parsed.data.viaggio : null;

  // Validazione viaggio: giustificazione se ha corretto la stima + sede/mezzo
  // devono appartenere al tenant (la lettura RLS-scoped torna null altrimenti).
  if (viaggio) {
    const modificato =
      viaggio.durataStimataMin != null &&
      viaggio.durataConfermataMin !== viaggio.durataStimataMin;
    if (modificato && (viaggio.giustificazione ?? '').trim().length < 3) {
      return { ok: false, error: 'GIUSTIFICAZIONE_RICHIESTA' };
    }
    const { data: sedeOk } = await supabase
      .from('sedi' as never)
      .select('id')
      .eq('id', viaggio.sedeId)
      .maybeSingle();
    if (!sedeOk) return { ok: false, error: 'SEDE_NON_VALIDA' };
    if (viaggio.autista && viaggio.mezzoId) {
      const { data: mezzoOk } = await supabase
        .from('mezzi' as never)
        .select('id')
        .eq('id', viaggio.mezzoId)
        .maybeSingle();
      if (!mezzoOk) return { ok: false, error: 'MEZZO_NON_VALIDO' };
    }
  }

  const { data: inserita, error } = await supabase
    .from('timbrature' as never)
    .insert({
      tenant_id: ctx.tenantId,
      dipendente_id: bersaglioId,
      commessa_id: target.tipo === 'commessa' ? target.id : null,
      cantiere_id: target.tipo === 'cantiere' ? target.id : null,
      tipo,
      origine: self ? 'qr' : 'capo',
      ts,
      geo_lat: parsed.data.geo?.lat ?? null,
      geo_lng: parsed.data.geo?.lng ?? null,
      creato_da: ctx.userId,
    } as never)
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  // Tratta di viaggio collegata (andata = ingresso, ritorno = uscita).
  if (viaggio) {
    const timbraturaId = (inserita as { id: string }).id;
    const { error: errViaggio } = await supabase.from('timbratura_viaggio' as never).insert({
      tenant_id: ctx.tenantId,
      timbratura_id: timbraturaId,
      dipendente_id: bersaglioId,
      direzione: tipo === 'ingresso' ? 'andata' : 'ritorno',
      sede_id: viaggio.sedeId,
      durata_stimata_min: viaggio.durataStimataMin,
      durata_confermata_min: viaggio.durataConfermataMin,
      giustificazione: viaggio.giustificazione?.trim() || null,
      autista: viaggio.autista,
      mezzo_id: viaggio.autista ? viaggio.mezzoId ?? null : null,
    } as never);
    if (errViaggio) {
      // Compensazione: senza il viaggio la timbratura resta incoerente col flusso.
      await supabase.from('timbrature' as never).delete().eq('id', timbraturaId);
      return { ok: false, error: errViaggio.message };
    }
  }

  return { ok: true, tipo, ts };
}

// ── 2) cronometro (solo sé, senza QR) ───────────────────────────────────
const CronoSchema = z.object({
  commessaId: z.string().uuid(),
  azione: z.enum(['start', 'stop']),
  geo: GeoSchema,
});

export async function timbraCronometro(input: unknown): Promise<Result> {
  const parsed = CronoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  const r = await ctxConModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;
  const supabase = createServerSupabase();
  const me = await dipendenteDi(supabase, ctx.tenantId, ctx.userId);
  if (!me) return { ok: false, error: 'NESSUN_DIPENDENTE' };
  const tipo = parsed.data.azione === 'start' ? 'ingresso' : 'uscita';
  const ts = new Date().toISOString();
  const { error } = await supabase.from('timbrature' as never).insert({
    tenant_id: ctx.tenantId,
    dipendente_id: me.id,
    commessa_id: parsed.data.commessaId,
    tipo,
    origine: 'cronometro',
    ts,
    geo_lat: parsed.data.geo?.lat ?? null,
    geo_lng: parsed.data.geo?.lng ?? null,
    creato_da: ctx.userId,
  } as never);
  if (error) return { ok: false, error: error.message };
  return { ok: true, tipo, ts };
}

// ── 3) manuale (office/admin o capo) ────────────────────────────────────
const ManualeSchema = z.object({
  commessaId: z.string().uuid(),
  dipendenteId: z.string().uuid(),
  tipo: z.enum(['ingresso', 'uscita']),
  ts: z.string().min(1),
});

export async function timbraManuale(input: unknown): Promise<Result> {
  const parsed = ManualeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  const r = await ctxConModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;
  if (!['admin', 'office'].includes(ctx.role)) return { ok: false, error: 'FORBIDDEN' };
  const supabase = createServerSupabase();
  const { error } = await supabase.from('timbrature' as never).insert({
    tenant_id: ctx.tenantId,
    dipendente_id: parsed.data.dipendenteId,
    commessa_id: parsed.data.commessaId,
    tipo: parsed.data.tipo,
    origine: 'manuale',
    ts: parsed.data.ts,
    creato_da: ctx.userId,
  } as never);
  if (error) return { ok: false, error: error.message };
  return { ok: true, tipo: parsed.data.tipo, ts: parsed.data.ts };
}
