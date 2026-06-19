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

const CreaSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  tipo: z.enum(TIPI_REGOLA),
  attiva: z.boolean().optional(),
  params: z.record(z.unknown()).optional(),
  maggiorazione_pct: z.number().min(-100).max(1000),
  priorita: z.number().int().min(0).max(10000).optional(),
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

const REGOLE_DEFAULT: {
  nome: string;
  tipo: (typeof TIPI_REGOLA)[number];
  maggiorazione_pct: number;
  priorita: number;
  params: Record<string, unknown>;
}[] = [
  { nome: 'Soglia ordinario giornaliero', tipo: 'soglia_giornaliera', maggiorazione_pct: 0, priorita: 100, params: { soglia_ore: 8 } },
  { nome: 'Maggiorazione straordinario', tipo: 'maggiorazione_straordinario', maggiorazione_pct: 25, priorita: 100, params: {} },
  { nome: 'Maggiorazione viaggio', tipo: 'maggiorazione_viaggio', maggiorazione_pct: 15, priorita: 100, params: {} },
  { nome: 'Notturno', tipo: 'notturno', maggiorazione_pct: 30, priorita: 100, params: { inizio: '22:00', fine: '06:00' } },
  { nome: 'Festivo', tipo: 'festivo', maggiorazione_pct: 50, priorita: 100, params: {} },
  { nome: 'Weekend', tipo: 'weekend', maggiorazione_pct: 50, priorita: 100, params: {} },
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
