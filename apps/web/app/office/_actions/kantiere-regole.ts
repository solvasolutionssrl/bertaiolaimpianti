'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import type { AppRole } from '@kommessa/api';
import { tenantHasModule } from '@/app/_lib/modules';

/**
 * Server actions per le regole di maggiorazione ore (kantiere_regole_ore),
 * i loro ambiti (kantiere_regola_ambito) e il costo orario dei dipendenti.
 *
 * Gated: richiede il modulo `kantiere`. Solo `admin`/`office` possono
 * mutare. Le tabelle non sono nei tipi generati → `as never` su `.from()`.
 */

const MANAGE_ROLES = new Set<AppRole>(['admin', 'office']);

type OkResult = { ok: true } | { ok: false; error: string };
type CreaResult = { ok: true; id: string } | { ok: false; error: string };

const TIPI_REGOLA = [
  'soglia_giornaliera',
  'maggiorazione_straordinario',
  'maggiorazione_viaggio',
  'notturno',
  'festivo',
  'weekend',
  'personalizzata',
] as const;

async function guard() {
  const ctx = await requireTenantContext();
  if (!MANAGE_ROLES.has(ctx.role)) throw new Error('Solo admin/office possono gestire le regole');
  if (!(await tenantHasModule('kantiere'))) throw new Error('Modulo kantiere non attivo per questo tenant');
  return ctx;
}

/** Verifica che la regola appartenga al tenant. */
async function regolaDelTenant(
  supabase: ReturnType<typeof createServerSupabase>,
  tenantId: string,
  regolaId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('kantiere_regole_ore' as never)
    .select('id')
    .eq('id', regolaId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return Boolean(data);
}

// ── creaRegola ─────────────────────────────────────────────────────────────

const ORARIO_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const CondFields = {
  giorni_settimana: z.array(z.number().int().min(1).max(7)).nullable().optional(),
  ora_da: z.string().regex(ORARIO_RE).nullable().optional(),
  ora_a: z.string().regex(ORARIO_RE).nullable().optional(),
  festivo_match: z.enum(['qualsiasi', 'solo_festivo', 'solo_feriale']).optional(),
  applica_a: z.enum(['tutte', 'ordinario', 'straordinario']).optional(),
  a_turni: z.enum(['qualsiasi', 'si', 'no']).optional(),
};

const CreaSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  tipo: z.enum(TIPI_REGOLA),
  attiva: z.boolean().optional(),
  params: z.record(z.unknown()).optional(),
  maggiorazione_pct: z.number().min(-100).max(1000),
  priorita: z.number().int().min(0).max(10000).optional(),
  ...CondFields,
});

export async function creaRegola(input: unknown): Promise<CreaResult> {
  const parsed = CreaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };

  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('kantiere_regole_ore' as never)
    .insert({
      tenant_id: ctx.tenantId,
      nome: parsed.data.nome,
      tipo: parsed.data.tipo,
      attiva: parsed.data.attiva ?? true,
      params: parsed.data.params ?? {},
      maggiorazione_pct: parsed.data.maggiorazione_pct,
      priorita: parsed.data.priorita ?? 100,
      giorni_settimana: parsed.data.giorni_settimana ?? null,
      ora_da: parsed.data.ora_da ?? null,
      ora_a: parsed.data.ora_a ?? null,
      festivo_match: parsed.data.festivo_match ?? 'qualsiasi',
      applica_a: parsed.data.applica_a ?? 'tutte',
      a_turni: parsed.data.a_turni ?? 'qualsiasi',
    } as never)
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/ore-costi');
  return { ok: true, id: (data as { id: string }).id };
}

// ── aggiornaRegola ───────────────────────────────────────────────────────────

const AggiornaSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().trim().min(1).max(120).optional(),
  attiva: z.boolean().optional(),
  params: z.record(z.unknown()).optional(),
  maggiorazione_pct: z.number().min(-100).max(1000).optional(),
  priorita: z.number().int().min(0).max(10000).optional(),
  ...CondFields,
});

export async function aggiornaRegola(input: unknown): Promise<OkResult> {
  const parsed = AggiornaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };

  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();
  if (!(await regolaDelTenant(supabase, ctx.tenantId, parsed.data.id))) {
    return { ok: false, error: 'Regola non trovata per questo tenant' };
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.nome !== undefined) patch.nome = parsed.data.nome;
  if (parsed.data.attiva !== undefined) patch.attiva = parsed.data.attiva;
  if (parsed.data.params !== undefined) patch.params = parsed.data.params;
  if (parsed.data.maggiorazione_pct !== undefined) patch.maggiorazione_pct = parsed.data.maggiorazione_pct;
  if (parsed.data.priorita !== undefined) patch.priorita = parsed.data.priorita;
  if (parsed.data.giorni_settimana !== undefined) patch.giorni_settimana = parsed.data.giorni_settimana;
  if (parsed.data.ora_da !== undefined) patch.ora_da = parsed.data.ora_da;
  if (parsed.data.ora_a !== undefined) patch.ora_a = parsed.data.ora_a;
  if (parsed.data.festivo_match !== undefined) patch.festivo_match = parsed.data.festivo_match;
  if (parsed.data.applica_a !== undefined) patch.applica_a = parsed.data.applica_a;
  if (parsed.data.a_turni !== undefined) patch.a_turni = parsed.data.a_turni;

  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabase
    .from('kantiere_regole_ore' as never)
    .update(patch as never)
    .eq('id', parsed.data.id)
    .eq('tenant_id', ctx.tenantId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/ore-costi');
  return { ok: true };
}

// ── eliminaRegola ────────────────────────────────────────────────────────────

export async function eliminaRegola(input: unknown): Promise<OkResult> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();
  // gli ambiti vengono cancellati a cascata (FK on delete cascade)
  const { error } = await supabase
    .from('kantiere_regole_ore' as never)
    .delete()
    .eq('id', parsed.data.id)
    .eq('tenant_id', ctx.tenantId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/ore-costi');
  return { ok: true };
}

// ── impostaAmbiti (delete-then-insert) ────────────────────────────────────────

const AmbitoSchema = z.object({
  tipo_target: z.enum(['tenant', 'dipendente', 'cantiere']),
  target_id: z.string().uuid().nullable(),
});

const ImpostaAmbitiSchema = z.object({
  regolaId: z.string().uuid(),
  ambiti: z.array(AmbitoSchema),
});

export async function impostaAmbiti(input: unknown): Promise<OkResult> {
  const parsed = ImpostaAmbitiSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };

  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();
  if (!(await regolaDelTenant(supabase, ctx.tenantId, parsed.data.regolaId))) {
    return { ok: false, error: 'Regola non trovata per questo tenant' };
  }

  // Reset ambiti correnti
  const { error: delError } = await supabase
    .from('kantiere_regola_ambito' as never)
    .delete()
    .eq('regola_id', parsed.data.regolaId)
    .eq('tenant_id', ctx.tenantId);
  if (delError) return { ok: false, error: `Reset ambiti fallito: ${delError.message}` };

  // Dedup logico: tenant non porta target_id; gli altri richiedono target_id.
  const seen = new Set<string>();
  const righe: { regola_id: string; tenant_id: string; tipo_target: string; target_id: string | null }[] = [];
  for (const a of parsed.data.ambiti) {
    const targetId = a.tipo_target === 'tenant' ? null : a.target_id;
    if (a.tipo_target !== 'tenant' && !targetId) continue; // ambito incompleto
    const key = `${a.tipo_target}|${targetId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    righe.push({
      regola_id: parsed.data.regolaId,
      tenant_id: ctx.tenantId,
      tipo_target: a.tipo_target,
      target_id: targetId,
    });
  }

  if (righe.length > 0) {
    const { error: insError } = await supabase
      .from('kantiere_regola_ambito' as never)
      .insert(righe as never);
    if (insError) return { ok: false, error: `Inserimento ambiti fallito: ${insError.message}` };
  }

  revalidatePath('/office/kantiere/ore-costi');
  return { ok: true };
}

// ── assicuraRegoleDefault (idempotente) ───────────────────────────────────────

type RegolaDefault = {
  nome: string;
  tipo: (typeof TIPI_REGOLA)[number];
  maggiorazione_pct: number;
  priorita: number;
  params: Record<string, unknown>;
  giorni_settimana: number[] | null;
  ora_da: string | null;
  ora_a: string | null;
  festivo_match: 'qualsiasi' | 'solo_festivo' | 'solo_feriale';
  applica_a: 'tutte' | 'ordinario' | 'straordinario';
  a_turni: 'qualsiasi' | 'si' | 'no';
};

function rdef(p: Partial<RegolaDefault> & Pick<RegolaDefault, 'nome' | 'tipo' | 'maggiorazione_pct'>): RegolaDefault {
  return {
    priorita: 100,
    params: {},
    giorni_settimana: null,
    ora_da: null,
    ora_a: null,
    festivo_match: 'qualsiasi',
    applica_a: 'tutte',
    a_turni: 'qualsiasi',
    ...p,
  };
}

// Default per i NUOVI tenant (set coerente col motore a condizioni). FPM è già
// popolato con la tabella CCNL completa via seed dedicato.
const REGOLE_DEFAULT: RegolaDefault[] = [
  rdef({ nome: 'Straordinario prime 2 ore', tipo: 'maggiorazione_straordinario', maggiorazione_pct: 25, applica_a: 'straordinario', params: { tier: 'prime2' } }),
  rdef({ nome: 'Straordinario ore successive', tipo: 'maggiorazione_straordinario', maggiorazione_pct: 30, applica_a: 'straordinario', params: { tier: 'successive' } }),
  rdef({ nome: 'Festivo', tipo: 'festivo', maggiorazione_pct: 50, festivo_match: 'solo_festivo' }),
  rdef({ nome: 'Sabato', tipo: 'festivo', maggiorazione_pct: 50, giorni_settimana: [6] }),
  rdef({ nome: 'Maggiorazione viaggio', tipo: 'maggiorazione_viaggio', maggiorazione_pct: 15 }),
];

/**
 * Idempotente: se il tenant non ha ALCUNA regola, inserisce il set di
 * default (tutte tenant-scoped, cioè senza ambiti espliciti). Chiamata al
 * primo caricamento della tab Regole.
 */
export async function assicuraRegoleDefault(): Promise<OkResult> {
  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();
  const { count, error: countError } = await supabase
    .from('kantiere_regole_ore' as never)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId);

  if (countError) return { ok: false, error: countError.message };
  if ((count ?? 0) > 0) return { ok: true }; // già seedato

  const righe = REGOLE_DEFAULT.map((r) => ({
    tenant_id: ctx.tenantId,
    nome: r.nome,
    tipo: r.tipo,
    attiva: true,
    params: r.params,
    maggiorazione_pct: r.maggiorazione_pct,
    priorita: r.priorita,
    giorni_settimana: r.giorni_settimana,
    ora_da: r.ora_da,
    ora_a: r.ora_a,
    festivo_match: r.festivo_match,
    applica_a: r.applica_a,
    a_turni: r.a_turni,
  }));

  const { error } = await supabase
    .from('kantiere_regole_ore' as never)
    .insert(righe as never);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/ore-costi');
  return { ok: true };
}

// ── aggiornaCostoOrarioDipendente ─────────────────────────────────────────────

const CostoSchema = z.object({
  dipendenteId: z.string().uuid(),
  costo: z.number().min(0).max(999999).nullable(),
});

export async function aggiornaCostoOrarioDipendente(input: unknown): Promise<OkResult> {
  const parsed = CostoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };

  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('dipendenti' as never)
    .update({ costo_orario: parsed.data.costo } as never)
    .eq('id', parsed.data.dipendenteId)
    .eq('tenant_id', ctx.tenantId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/ore-costi');
  return { ok: true };
}
