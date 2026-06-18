'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';

const IdSchema = z.object({ commessaId: z.string().uuid() });
type Result = { ok: true; token: string } | { ok: false; error: string };

async function guard() {
  const ctx = await requireTenantContext();
  if (!['admin', 'office'].includes(ctx.role)) throw new Error('FORBIDDEN');
  if (!(await tenantHasModule('kantiere'))) throw new Error('MODULO_OFF');
  return ctx;
}

function nuovoToken(): string {
  return randomBytes(24).toString('base64url');
}

async function commessaDelTenant(
  supabase: ReturnType<typeof createServerSupabase>,
  tenantId: string,
  commessaId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('commesse')
    .select('id')
    .eq('id', commessaId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return Boolean(data);
}

export async function generaQrCommessa(input: unknown): Promise<Result> {
  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const supabase = createServerSupabase();
  if (!(await commessaDelTenant(supabase, ctx.tenantId, parsed.data.commessaId)))
    return { ok: false, error: 'COMMESSA_NON_TROVATA' };

  const { data: esistente } = await supabase
    .from('cantiere_qr' as never)
    .select('token')
    .eq('commessa_id', parsed.data.commessaId)
    .eq('attivo', true)
    .maybeSingle();
  if (esistente) return { ok: true, token: (esistente as { token: string }).token };

  const token = nuovoToken();
  const { error } = await supabase.from('cantiere_qr' as never).insert({
    tenant_id: ctx.tenantId,
    commessa_id: parsed.data.commessaId,
    token,
    created_by: ctx.userId,
  } as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/qr');
  return { ok: true, token };
}

export async function rigeneraQrCommessa(input: unknown): Promise<Result> {
  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const supabase = createServerSupabase();
  if (!(await commessaDelTenant(supabase, ctx.tenantId, parsed.data.commessaId)))
    return { ok: false, error: 'COMMESSA_NON_TROVATA' };

  await supabase
    .from('cantiere_qr' as never)
    .update({ attivo: false, revoked_at: new Date().toISOString() } as never)
    .eq('commessa_id', parsed.data.commessaId)
    .eq('attivo', true);

  const token = nuovoToken();
  const { error } = await supabase.from('cantiere_qr' as never).insert({
    tenant_id: ctx.tenantId,
    commessa_id: parsed.data.commessaId,
    token,
    created_by: ctx.userId,
  } as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/qr');
  return { ok: true, token };
}
