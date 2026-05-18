'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@impiantixplus/api/server';
import { requireTenantContext } from '@impiantixplus/api/tenant';
import { assertCanManageTenant } from '../../_components/role-gate';

const upsertSchema = z.object({
  priorita: z.enum(['bassa', 'media', 'alta', 'urgente']),
  response_minutes: z.coerce.number().int().positive(),
  close_minutes: z.coerce.number().int().positive(),
});

/**
 * UPSERT della policy SLA per il tenant corrente.
 * RLS: la policy `sla_policy_write` accetta solo owner/admin del tenant.
 * In più qui rinforziamo l'invariante: close_minutes >= response_minutes.
 */
export async function aggiornaSlaPolicy(input: z.infer<typeof upsertSchema>) {
  const ctx = await requireTenantContext();
  assertCanManageTenant(ctx);
  const parsed = upsertSchema.parse(input);

  if (parsed.close_minutes < parsed.response_minutes) {
    throw new Error(
      'I minuti di chiusura devono essere maggiori o uguali a quelli di risposta.',
    );
  }

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('sla_policy')
    .upsert(
      {
        tenant_id: ctx.tenantId,
        priorita: parsed.priorita,
        response_minutes: parsed.response_minutes,
        close_minutes: parsed.close_minutes,
      },
      { onConflict: 'tenant_id,priorita' },
    );
  if (error) throw new Error(error.message);

  // Audit
  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'sla_policy',
    entity_id: parsed.priorita,
    action: 'update',
    after_data: {
      response_minutes: parsed.response_minutes,
      close_minutes: parsed.close_minutes,
    },
  });

  revalidatePath('/office/impostazioni/sla');
}
