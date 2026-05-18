'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServiceSupabase } from '@impiantixplus/api/service';
import { requirePlatformAdmin } from '../_lib/guard';

const planSchema = z.object({
  code: z.string().min(2).max(40).regex(/^[a-z0-9_-]+$/),
  nome: z.string().min(2).max(120),
  descrizione: z.string().max(500).nullable().optional(),
  prezzo_mensile_eur: z.number().min(0),
  max_utenti: z.number().int().min(1),
  max_commesse_anno: z.number().int().min(1),
  max_storage_gb: z.number().int().min(1),
  max_tickets_mese: z.number().int().min(1),
  attivo: z.boolean().default(true),
  ordine: z.number().int().min(0).default(0),
});

export async function creaPiano(input: z.infer<typeof planSchema>) {
  const ctx = await requirePlatformAdmin();
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.message };
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from('plans')
    .insert(parsed.data as never)
    .select('id')
    .single();
  if (error || !data) return { ok: false as const, error: error?.message ?? 'errore' };

  await supabase.from('audit_events').insert({
    tenant_id: null,
    actor_user_id: ctx.userId,
    actor_role: 'owner',
    entity_type: 'plan',
    entity_id: data.id,
    action: 'create',
    after_data: parsed.data as Record<string, unknown>,
    metadata: { platform: true, actor_email: ctx.email } as Record<string, unknown>,
  } as never);

  revalidatePath('/admin/piani');
  return { ok: true as const, id: data.id };
}

export async function aggiornaPiano(
  id: string,
  input: Partial<z.infer<typeof planSchema>>,
) {
  const ctx = await requirePlatformAdmin();
  const supabase = createServiceSupabase();
  const { error } = await supabase
    .from('plans')
    .update(input as never)
    .eq('id', id);
  if (error) return { ok: false as const, error: error.message };

  await supabase.from('audit_events').insert({
    tenant_id: null,
    actor_user_id: ctx.userId,
    actor_role: 'owner',
    entity_type: 'plan',
    entity_id: id,
    action: 'update',
    after_data: input as Record<string, unknown>,
    metadata: { platform: true, actor_email: ctx.email } as Record<string, unknown>,
  } as never);

  revalidatePath('/admin/piani');
  return { ok: true as const };
}

export async function eliminaPiano(id: string) {
  const ctx = await requirePlatformAdmin();
  const supabase = createServiceSupabase();
  // soft delete: setta attivo=false (RESTRICT FK su tenants.plan_id)
  const { error } = await supabase
    .from('plans')
    .update({ attivo: false } as never)
    .eq('id', id);
  if (error) return { ok: false as const, error: error.message };

  await supabase.from('audit_events').insert({
    tenant_id: null,
    actor_user_id: ctx.userId,
    actor_role: 'owner',
    entity_type: 'plan',
    entity_id: id,
    action: 'archive',
    metadata: { platform: true, actor_email: ctx.email } as Record<string, unknown>,
  } as never);

  revalidatePath('/admin/piani');
  return { ok: true as const };
}
