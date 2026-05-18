'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServiceSupabase } from '@impiantixplus/api/service';
import { requirePlatformAdmin } from '../_lib/guard';

/**
 * Override quote per singolo tenant.
 * `null` = usa il default del plan (tenant_quotas.<col> = NULL).
 */
const aggiornaQuoteSchema = z.object({
  tenantId: z.string().uuid(),
  max_utenti: z.number().int().min(0).nullable().optional(),
  max_commesse_anno: z.number().int().min(0).nullable().optional(),
  max_storage_gb: z.number().int().min(0).nullable().optional(),
  max_tickets_mese: z.number().int().min(0).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export async function aggiornaQuote(input: z.infer<typeof aggiornaQuoteSchema>) {
  const ctx = await requirePlatformAdmin();
  const parsed = aggiornaQuoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.message };
  const { tenantId, ...patch } = parsed.data;
  const supabase = createServiceSupabase();

  // upsert (PK = tenant_id)
  const { error } = await supabase
    .from('tenant_quotas')
    .upsert(
      {
        tenant_id: tenantId,
        ...patch,
        updated_by: ctx.userId,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: 'tenant_id' },
    );
  if (error) return { ok: false as const, error: error.message };

  await supabase.from('audit_events').insert({
    tenant_id: tenantId,
    actor_user_id: ctx.userId,
    actor_role: 'owner',
    entity_type: 'tenant_quota',
    entity_id: tenantId,
    action: 'update',
    after_data: patch as Record<string, unknown>,
    metadata: { platform: true, actor_email: ctx.email } as Record<string, unknown>,
  } as never);

  revalidatePath(`/admin/tenants/${tenantId}`);
  return { ok: true as const };
}

export async function cambiaPiano(tenantId: string, planId: string) {
  const ctx = await requirePlatformAdmin();
  const supabase = createServiceSupabase();
  const { error } = await supabase
    .from('tenants')
    .update({ plan_id: planId } as never)
    .eq('id', tenantId);
  if (error) return { ok: false as const, error: error.message };

  await supabase.from('audit_events').insert({
    tenant_id: tenantId,
    actor_user_id: ctx.userId,
    actor_role: 'owner',
    entity_type: 'tenant',
    entity_id: tenantId,
    action: 'plan_change',
    after_data: { plan_id: planId } as Record<string, unknown>,
    metadata: { platform: true, actor_email: ctx.email } as Record<string, unknown>,
  } as never);

  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath('/admin/tenants');
  return { ok: true as const };
}
