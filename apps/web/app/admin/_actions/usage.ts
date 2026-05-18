'use server';

import { revalidatePath } from 'next/cache';
import { createServiceSupabase } from '@impiantixplus/api/service';
import { requirePlatformAdmin } from '../_lib/guard';

/**
 * Rinfresca lo snapshot di usage per uno o tutti i tenant.
 *
 * Chiama l'RPC `aggiorna_usage_snapshot(p_tenant_id uuid)` con
 * NULL per ricalcolare tutti. La function è SECURITY DEFINER ma noi
 * usiamo comunque il service-role client per esecuzione lato server.
 */
export async function aggiornaUsageSnapshot(tenantId?: string | null) {
  await requirePlatformAdmin();
  const supabase = createServiceSupabase();
  const { error } = await supabase.rpc('aggiorna_usage_snapshot' as never, {
    p_tenant_id: tenantId ?? null,
  } as never);
  if (error) {
    return { ok: false as const, error: error.message };
  }
  revalidatePath('/admin');
  revalidatePath('/admin/tenants');
  if (tenantId) revalidatePath(`/admin/tenants/${tenantId}`);
  return { ok: true as const };
}
