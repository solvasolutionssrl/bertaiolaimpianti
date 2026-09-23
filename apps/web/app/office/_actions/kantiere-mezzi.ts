'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import type { AppRole } from '@kommessa/api';
import { tenantHasModule } from '@/app/_lib/modules';
import { auditTenant } from '@/app/_actions/_lib/audit';

/**
 * Server actions per il parco mezzi (tabella `mezzi`).
 *
 * Gated: richiede il modulo `kantiere`. Solo `admin`/`office` possono
 * mutare. La tabella non e' nei tipi generati → `as never` su `.from()`.
 */

const MANAGE_ROLES = new Set<AppRole>(['admin', 'office']);

type OkResult = { ok: true } | { ok: false; error: string };

export type TipoMezzo = 'autocarro' | 'autovettura' | 'altro';

const TipoMezzoEnum = z.enum(['autocarro', 'autovettura', 'altro']);

async function guard() {
  const ctx = await requireTenantContext();
  if (!MANAGE_ROLES.has(ctx.role)) throw new Error('Solo admin/office possono gestire i mezzi');
  if (!(await tenantHasModule('kantiere'))) throw new Error('Modulo kantiere non attivo per questo tenant');
  return ctx;
}

// ── creaMezzo ──────────────────────────────────────────────────────────────

const CreaMezzoSchema = z.object({
  tipo: TipoMezzoEnum.default('autocarro'),
  targa: z.string().trim().min(1, 'La targa e\' obbligatoria').max(20),
  modello: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
});

export async function creaMezzo(input: unknown): Promise<OkResult> {
  const parsed = CreaMezzoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };

  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('mezzi' as never)
    .insert({
      tenant_id: ctx.tenantId,
      tipo: parsed.data.tipo,
      targa: parsed.data.targa.toUpperCase(),
      modello: parsed.data.modello ?? null,
      attivo: true,
      note: parsed.data.note ?? null,
    } as never);

  if (error) return { ok: false, error: error.message };
  await auditTenant(supabase, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'mezzo',
    action: 'mezzo.crea',
    after: { targa: parsed.data.targa.toUpperCase(), tipo: parsed.data.tipo },
  });
  revalidatePath('/office/kantiere/mezzi');
  return { ok: true };
}

// ── aggiornaMezzo ─────────────────────────────────────────────────────────

const AggiornaMezzoSchema = z.object({
  id: z.string().uuid(),
  tipo: TipoMezzoEnum.default('autocarro'),
  targa: z.string().trim().min(1, 'La targa e\' obbligatoria').max(20),
  modello: z.string().trim().max(120).optional(),
  attivo: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

export async function aggiornaMezzo(input: unknown): Promise<OkResult> {
  const parsed = AggiornaMezzoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };

  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('mezzi' as never)
    .update({
      tipo: parsed.data.tipo,
      targa: parsed.data.targa.toUpperCase(),
      modello: parsed.data.modello ?? null,
      attivo: parsed.data.attivo,
      note: parsed.data.note ?? null,
    } as never)
    .eq('id', parsed.data.id)
    .eq('tenant_id', ctx.tenantId);

  if (error) return { ok: false, error: error.message };
  await auditTenant(supabase, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'mezzo',
    entityId: parsed.data.id,
    action: 'mezzo.modifica',
    after: {
      targa: parsed.data.targa.toUpperCase(),
      tipo: parsed.data.tipo,
      attivo: parsed.data.attivo,
    },
  });
  revalidatePath('/office/kantiere/mezzi');
  return { ok: true };
}

// ── eliminaMezzo ──────────────────────────────────────────────────────────

export async function eliminaMezzo(input: unknown): Promise<OkResult> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }

  const supabase = createServerSupabase();
  // Com'era prima di sparire: dopo la delete non c'e' piu' modo di dire quale
  // mezzo fosse, e i km dei viaggi puntano proprio ai mezzi.
  const { data: primaRaw } = await supabase
    .from('mezzi' as never)
    .select('targa, tipo, modello, attivo')
    .eq('id', parsed.data.id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  const { error } = await supabase
    .from('mezzi' as never)
    .delete()
    .eq('id', parsed.data.id)
    .eq('tenant_id', ctx.tenantId);

  if (error) return { ok: false, error: error.message };
  await auditTenant(supabase, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'mezzo',
    entityId: parsed.data.id,
    action: 'mezzo.elimina',
    before: primaRaw ?? null,
  });
  revalidatePath('/office/kantiere/mezzi');
  return { ok: true };
}
