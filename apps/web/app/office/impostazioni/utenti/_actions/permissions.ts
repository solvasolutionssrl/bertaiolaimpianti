'use server';

import { revalidatePath } from 'next/cache';
import { requireTenantContext } from '@impiantixplus/api/tenant';
import { createServerSupabase } from '@impiantixplus/api/server';
import { assertCanManageTenant } from '../../_components/role-gate';
import type { UserPermissionOverrides } from '@impiantixplus/api/types';

export async function salvaPermessi(input: {
  userId: string;
  overrides: UserPermissionOverrides | null;
}) {
  const ctx = await requireTenantContext();
  assertCanManageTenant(ctx);

  // Verify target user belongs to same tenant
  const supabase = createServerSupabase();
  const { data: target, error: checkErr } = await supabase
    .from('users')
    .select('id, tenant_id')
    .eq('id', input.userId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (checkErr || !target) {
    throw new Error('Utente non trovato nel tenant.');
  }

  // `permissions` column added by migration 20260101002700 — cast until types are regenerated
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usersTable = supabase.from('users') as any;
  const { error } = await usersTable
    .update({ permissions: input.overrides ?? null })
    .eq('id', input.userId)
    .eq('tenant_id', ctx.tenantId);

  if (error) throw new Error(error.message);

  revalidatePath('/office/impostazioni/utenti');
}
