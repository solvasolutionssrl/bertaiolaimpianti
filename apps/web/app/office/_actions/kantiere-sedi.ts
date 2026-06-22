'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import type { AppRole } from '@kommessa/api';
import { tenantHasModule } from '@/app/_lib/modules';

/**
 * Server actions per le sedi (luoghi di partenza/arrivo) del modulo Kantiere.
 *
 * Tabelle: `public.sedi`, `public.cantiere_sede`
 * Gated: richiede il modulo `kantiere`. Solo `admin`/`office` possono mutare.
 * Le tabelle non sono nei tipi generati → `as never` su `.from()`.
 */

const MANAGE_ROLES = new Set<AppRole>(['admin', 'office']);

const TIPO_SEDE = ['sede_principale', 'sede_secondaria', 'hotel', 'altro'] as const;

type OkResult = { ok: true } | { ok: false; error: string };
type CreaResult = { ok: true; id: string } | { ok: false; error: string };

async function guard() {
  const ctx = await requireTenantContext();
  if (!MANAGE_ROLES.has(ctx.role)) throw new Error('Solo admin/office possono gestire le sedi');
  if (!(await tenantHasModule('kantiere'))) throw new Error('Modulo kantiere non attivo per questo tenant');
  return ctx;
}

/** Verifica che la sede appartenga al tenant. */
async function sedeDelTenant(
  supabase: ReturnType<typeof createServerSupabase>,
  tenantId: string,
  sedeId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('sedi' as never)
    .select('id')
    .eq('id', sedeId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return Boolean(data);
}

// ── creaSede ──────────────────────────────────────────────────────────────────

const CreaSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  tipo: z.enum(TIPO_SEDE),
  indirizzo: z.string().trim().max(500).optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  note: z.string().trim().max(2000).optional(),
});

export async function creaSede(input: unknown): Promise<CreaResult> {
  const parsed = CreaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };

  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('sedi' as never)
    .insert({
      tenant_id: ctx.tenantId,
      nome: parsed.data.nome,
      tipo: parsed.data.tipo,
      indirizzo: parsed.data.indirizzo ?? null,
      lat: parsed.data.lat ?? null,
      lng: parsed.data.lng ?? null,
      note: parsed.data.note ?? null,
      is_default: false,
      attivo: true,
    } as never)
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/sedi');
  return { ok: true, id: (data as { id: string }).id };
}

// ── aggiornaSede ──────────────────────────────────────────────────────────────

const AggiornaSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().trim().min(1).max(200),
  tipo: z.enum(TIPO_SEDE),
  indirizzo: z.string().trim().max(500).optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  attivo: z.boolean(),
  note: z.string().trim().max(2000).optional(),
});

export async function aggiornaSede(input: unknown): Promise<OkResult> {
  const parsed = AggiornaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };

  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();
  if (!(await sedeDelTenant(supabase, ctx.tenantId, parsed.data.id))) {
    return { ok: false, error: 'Sede non trovata per questo tenant' };
  }

  const { error } = await supabase
    .from('sedi' as never)
    .update({
      nome: parsed.data.nome,
      tipo: parsed.data.tipo,
      indirizzo: parsed.data.indirizzo ?? null,
      lat: parsed.data.lat ?? null,
      lng: parsed.data.lng ?? null,
      attivo: parsed.data.attivo,
      note: parsed.data.note ?? null,
    } as never)
    .eq('id', parsed.data.id)
    .eq('tenant_id', ctx.tenantId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/sedi');
  return { ok: true };
}

// ── eliminaSede ───────────────────────────────────────────────────────────────

export async function eliminaSede(input: unknown): Promise<OkResult> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();
  if (!(await sedeDelTenant(supabase, ctx.tenantId, parsed.data.id))) {
    return { ok: false, error: 'Sede non trovata per questo tenant' };
  }

  const { error } = await supabase
    .from('sedi' as never)
    .delete()
    .eq('id', parsed.data.id)
    .eq('tenant_id', ctx.tenantId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/sedi');
  return { ok: true };
}

// ── impostaSedeDefault ────────────────────────────────────────────────────────

/**
 * Imposta una sede come default per il tenant.
 * Strategia transazionale-safe: prima azzera is_default su tutte le sedi del
 * tenant, poi lo setta sulla sede target. In Postgres non esiste ancora la
 * transazione nativa Supabase JS, ma l'ordine (reset poi set) garantisce che
 * non si superino mai contemporaneamente due default: il vincolo applicativo
 * è soddisfatto anche in caso di retry (idempotente).
 */
export async function impostaSedeDefault(input: unknown): Promise<OkResult> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();
  if (!(await sedeDelTenant(supabase, ctx.tenantId, parsed.data.id))) {
    return { ok: false, error: 'Sede non trovata per questo tenant' };
  }

  // 1. Azzera is_default su tutte le sedi del tenant
  const { error: resetErr } = await supabase
    .from('sedi' as never)
    .update({ is_default: false } as never)
    .eq('tenant_id', ctx.tenantId);
  if (resetErr) return { ok: false, error: `Reset default fallito: ${resetErr.message}` };

  // 2. Setta is_default sulla sede target
  const { error: setErr } = await supabase
    .from('sedi' as never)
    .update({ is_default: true } as never)
    .eq('id', parsed.data.id)
    .eq('tenant_id', ctx.tenantId);
  if (setErr) return { ok: false, error: `Impostazione default fallita: ${setErr.message}` };

  revalidatePath('/office/kantiere/sedi');
  return { ok: true };
}

// ── associaSedeCantiere ───────────────────────────────────────────────────────

const AssociaSchema = z.object({
  cantiereId: z.string().uuid(),
  sedeId: z.string().uuid(),
});

export async function associaSedeCantiere(input: unknown): Promise<OkResult> {
  const parsed = AssociaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };

  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();

  // Verifica che la sede appartenga al tenant
  if (!(await sedeDelTenant(supabase, ctx.tenantId, parsed.data.sedeId))) {
    return { ok: false, error: 'Sede non trovata per questo tenant' };
  }

  const { error } = await supabase
    .from('cantiere_sede' as never)
    .upsert({
      cantiere_id: parsed.data.cantiereId,
      sede_id: parsed.data.sedeId,
      tenant_id: ctx.tenantId,
    } as never, { onConflict: 'cantiere_id,sede_id' });

  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/sedi');
  return { ok: true };
}

// ── dissociaSedeCantiere ──────────────────────────────────────────────────────

export async function dissociaSedeCantiere(input: unknown): Promise<OkResult> {
  const parsed = AssociaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };

  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();

  const { error } = await supabase
    .from('cantiere_sede' as never)
    .delete()
    .eq('cantiere_id', parsed.data.cantiereId)
    .eq('sede_id', parsed.data.sedeId)
    .eq('tenant_id', ctx.tenantId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/sedi');
  return { ok: true };
}
