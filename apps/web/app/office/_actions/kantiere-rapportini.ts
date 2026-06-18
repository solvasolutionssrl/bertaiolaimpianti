'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';

type Result = { ok: true } | { ok: false; error: string };

async function guard() {
  const ctx = await requireTenantContext();
  if (!['admin', 'office'].includes(ctx.role)) throw new Error('FORBIDDEN');
  if (!(await tenantHasModule('kantiere'))) throw new Error('MODULO_OFF');
  return ctx;
}

export async function approvaRapportino(input: unknown): Promise<Result> {
  const parsed = z.object({ rapportinoId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  const ctx = await guard();
  const supabase = createServerSupabase();

  const { data: row, error: fetchError } = await supabase
    .from('rapportini' as never)
    .select('id, stato')
    .eq('id', parsed.data.rapportinoId)
    .eq('tenant_id', ctx.tenantId)
    .single();
  if (fetchError || !row) return { ok: false, error: 'NON_TROVATO' };
  if ((row as { stato: string }).stato !== 'inviato') return { ok: false, error: 'STATO_NON_VALIDO' };

  const { error } = await supabase
    .from('rapportini' as never)
    .update({
      stato: 'approvato',
      approvato_da: ctx.userId,
      approvato_at: new Date().toISOString(),
    } as never)
    .eq('id', parsed.data.rapportinoId)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/rapportini');
  return { ok: true };
}

export async function respingiRapportino(input: unknown): Promise<Result> {
  const parsed = z
    .object({ rapportinoId: z.string().uuid(), motivo: z.string().min(1).max(500) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  const ctx = await guard();
  const supabase = createServerSupabase();

  const { data: row, error: fetchError } = await supabase
    .from('rapportini' as never)
    .select('id, stato')
    .eq('id', parsed.data.rapportinoId)
    .eq('tenant_id', ctx.tenantId)
    .single();
  if (fetchError || !row) return { ok: false, error: 'NON_TROVATO' };
  if ((row as { stato: string }).stato !== 'inviato') return { ok: false, error: 'STATO_NON_VALIDO' };

  const { error } = await supabase
    .from('rapportini' as never)
    .update({
      stato: 'respinto',
      respinto_motivo: parsed.data.motivo,
      approvato_da: null,
      approvato_at: null,
    } as never)
    .eq('id', parsed.data.rapportinoId)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/rapportini');
  return { ok: true };
}

export async function riapriRapportino(input: unknown): Promise<Result> {
  const parsed = z.object({ rapportinoId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  const ctx = await guard();
  const supabase = createServerSupabase();

  const { data: row, error: fetchError } = await supabase
    .from('rapportini' as never)
    .select('id, stato')
    .eq('id', parsed.data.rapportinoId)
    .eq('tenant_id', ctx.tenantId)
    .single();
  if (fetchError || !row) return { ok: false, error: 'NON_TROVATO' };
  if (!['approvato', 'respinto'].includes((row as { stato: string }).stato))
    return { ok: false, error: 'STATO_NON_VALIDO' };

  const { error } = await supabase
    .from('rapportini' as never)
    .update({
      stato: 'bozza',
      inviato_da: null,
      inviato_at: null,
      approvato_da: null,
      approvato_at: null,
      respinto_motivo: null,
    } as never)
    .eq('id', parsed.data.rapportinoId)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/rapportini');
  return { ok: true };
}
