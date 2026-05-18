'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServiceSupabase } from '@impiantixplus/api/service';
import { requirePlatformAdmin } from '../_lib/guard';

/**
 * Invita un nuovo platform admin SOLVA (tenant_id = NULL).
 * Setta `is_platform_admin=true` + `platform_admin=true` nel JWT claim.
 */
export async function invitaPlatformAdmin(email: string, displayName: string) {
  const ctx = await requirePlatformAdmin();
  const parsed = z
    .object({ email: z.string().email(), displayName: z.string().min(2) })
    .safeParse({ email, displayName });
  if (!parsed.success) return { ok: false as const, error: parsed.error.message };

  const supabase = createServiceSupabase();

  const invite = await supabase.auth.admin.inviteUserByEmail(parsed.data.email, {
    data: { display_name: parsed.data.displayName },
  });
  if (invite.error) return { ok: false as const, error: invite.error.message };
  const uid = invite.data.user?.id;
  if (!uid) return { ok: false as const, error: 'auth id mancante' };

  await supabase.auth.admin.updateUserById(uid, {
    app_metadata: { platform_admin: true, role: 'owner' } as never,
  });

  await supabase.from('users').insert({
    id: uid,
    tenant_id: null,
    role: 'owner',
    display_name: parsed.data.displayName,
    is_platform_admin: true,
    attivo: true,
  } as never);

  await supabase.from('audit_events').insert({
    tenant_id: null,
    actor_user_id: ctx.userId,
    actor_role: 'owner',
    entity_type: 'platform_admin',
    entity_id: uid,
    action: 'invite',
    after_data: { email: parsed.data.email } as Record<string, unknown>,
    metadata: { platform: true, actor_email: ctx.email } as Record<string, unknown>,
  } as never);

  revalidatePath('/admin/utenti');
  return { ok: true as const };
}

/** Invia un magic link / reset password (Supabase `generateLink`). */
export async function resetPasswordUser(authId: string) {
  const ctx = await requirePlatformAdmin();
  const supabase = createServiceSupabase();

  // recupera l'email da auth.users via service-role
  const { data, error } = await supabase.auth.admin.getUserById(authId);
  if (error || !data.user?.email) {
    return { ok: false as const, error: error?.message ?? 'utente non trovato' };
  }
  const link = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: data.user.email,
  });
  if (link.error) return { ok: false as const, error: link.error.message };

  await supabase.from('audit_events').insert({
    tenant_id: null,
    actor_user_id: ctx.userId,
    actor_role: 'owner',
    entity_type: 'user',
    entity_id: authId,
    action: 'password_reset',
    metadata: { platform: true, actor_email: ctx.email } as Record<string, unknown>,
  } as never);

  return { ok: true as const, link: link.data.properties?.action_link ?? null };
}

export async function disattivaUserGlobal(userId: string) {
  const ctx = await requirePlatformAdmin();
  const supabase = createServiceSupabase();
  const { error } = await supabase
    .from('users')
    .update({ attivo: false } as never)
    .eq('id', userId);
  if (error) return { ok: false as const, error: error.message };

  await supabase.from('audit_events').insert({
    tenant_id: null,
    actor_user_id: ctx.userId,
    actor_role: 'owner',
    entity_type: 'user',
    entity_id: userId,
    action: 'deactivate',
    metadata: { platform: true, actor_email: ctx.email } as Record<string, unknown>,
  } as never);

  revalidatePath('/admin/utenti');
  return { ok: true as const };
}

export async function attivaUserGlobal(userId: string) {
  const ctx = await requirePlatformAdmin();
  const supabase = createServiceSupabase();
  const { error } = await supabase
    .from('users')
    .update({ attivo: true } as never)
    .eq('id', userId);
  if (error) return { ok: false as const, error: error.message };

  await supabase.from('audit_events').insert({
    tenant_id: null,
    actor_user_id: ctx.userId,
    actor_role: 'owner',
    entity_type: 'user',
    entity_id: userId,
    action: 'activate',
    metadata: { platform: true, actor_email: ctx.email } as Record<string, unknown>,
  } as never);

  revalidatePath('/admin/utenti');
  return { ok: true as const };
}

const invitaTenantUserSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(2).max(120),
  role: z.enum(['owner', 'admin', 'office', 'capo', 'tecnico']),
});

export async function invitaUtenteTenant(input: z.infer<typeof invitaTenantUserSchema>) {
  const ctx = await requirePlatformAdmin();
  const parsed = invitaTenantUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.message };
  const supabase = createServiceSupabase();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('slug')
    .eq('id', parsed.data.tenantId)
    .maybeSingle();
  if (!tenant) return { ok: false as const, error: 'Tenant non trovato' };

  const invite = await supabase.auth.admin.inviteUserByEmail(parsed.data.email, {
    data: { display_name: parsed.data.displayName },
  });
  if (invite.error) return { ok: false as const, error: invite.error.message };
  const uid = invite.data.user?.id;
  if (!uid) return { ok: false as const, error: 'auth id mancante' };

  await supabase.auth.admin.updateUserById(uid, {
    app_metadata: {
      tenant_id: parsed.data.tenantId,
      tenant_slug: tenant.slug,
      role: parsed.data.role,
    } as never,
  });

  await supabase.from('users').insert({
    id: uid,
    tenant_id: parsed.data.tenantId,
    role: parsed.data.role,
    display_name: parsed.data.displayName,
    attivo: true,
  } as never);

  await supabase.from('audit_events').insert({
    tenant_id: parsed.data.tenantId,
    actor_user_id: ctx.userId,
    actor_role: 'owner',
    entity_type: 'user',
    entity_id: uid,
    action: 'invite',
    after_data: {
      email: parsed.data.email,
      role: parsed.data.role,
    } as Record<string, unknown>,
    metadata: { platform: true, actor_email: ctx.email } as Record<string, unknown>,
  } as never);

  revalidatePath(`/admin/tenants/${parsed.data.tenantId}`);
  revalidatePath('/admin/utenti');
  return { ok: true as const };
}

export async function cambiaRuoloTenantUser(userId: string, role: string) {
  const ctx = await requirePlatformAdmin();
  const supabase = createServiceSupabase();
  const { data: u } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', userId)
    .maybeSingle();

  const { error } = await supabase
    .from('users')
    .update({ role: role as never } as never)
    .eq('id', userId);
  if (error) return { ok: false as const, error: error.message };

  // sync claim
  await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { role } as never,
  });

  await supabase.from('audit_events').insert({
    tenant_id: u?.tenant_id ?? null,
    actor_user_id: ctx.userId,
    actor_role: 'owner',
    entity_type: 'user',
    entity_id: userId,
    action: 'role_change',
    after_data: { role } as Record<string, unknown>,
    metadata: { platform: true, actor_email: ctx.email } as Record<string, unknown>,
  } as never);

  if (u?.tenant_id) revalidatePath(`/admin/tenants/${u.tenant_id}`);
  revalidatePath('/admin/utenti');
  return { ok: true as const };
}
