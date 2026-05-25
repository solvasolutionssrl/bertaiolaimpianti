'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServiceSupabase } from '@kommessa/api/service';
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
    app_metadata: { platform_admin: true, role: 'admin' } as never,
  });

  await supabase.from('users').insert({
    id: uid,
    tenant_id: null,
    role: 'admin',
    display_name: parsed.data.displayName,
    is_platform_admin: true,
    attivo: true,
  } as never);

  await supabase.from('audit_events').insert({
    tenant_id: null,
    actor_user_id: ctx.userId,
    actor_role: 'admin',
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
    actor_role: 'admin',
    entity_type: 'user',
    entity_id: authId,
    action: 'password_reset',
    metadata: { platform: true, actor_email: ctx.email } as Record<string, unknown>,
  } as never);

  return { ok: true as const, link: link.data.properties?.action_link ?? null };
}

// ─── Elimina utente (hard delete) ────────────────────────────────────
//
// Rimuove l'utente sia da `auth.users` (Supabase Auth) che da
// `public.users` (riga applicativa). Pattern di sicurezza:
//   1. L'utente deve essere PRIMA disattivato (`attivo=false`). Questo
//      è un freno cognitivo per evitare delete accidentali — la UI fa
//      "disattiva, poi conferma eliminazione".
//   2. Non si può eliminare se stessi.
//   3. FK con ON DELETE SET NULL su created_by/uploaded_by/ecc. fanno
//      sì che lo storico (commesse, todo, foto) sopravviva con autore=null.
//   4. La riga in public.users viene cancellata via cascade dalla
//      delete su auth.users (constraint `users_id_fkey` ON DELETE CASCADE).
//      Se per qualche motivo la cascade non parte, facciamo cleanup
//      esplicito best-effort.
//
// Audit con action='delete' su entity_type='user'.

export async function eliminaUserGlobal(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requirePlatformAdmin();
  if (userId === ctx.userId) {
    return { ok: false, error: 'Non puoi eliminare te stesso' };
  }
  const supabase = createServiceSupabase();

  // 1. Verifica che esista e sia disattivato
  const { data: u } = await supabase
    .from('users')
    .select('id, tenant_id, attivo, display_name, is_platform_admin')
    .eq('id', userId)
    .maybeSingle();
  if (!u) return { ok: false, error: 'Utente non trovato' };
  if (u.attivo) {
    return {
      ok: false,
      error: 'Disattiva prima l\'utente, poi elimina (sicurezza)',
    };
  }

  // 2. Elimina da auth.users — il cascade su public.users dovrebbe scattare
  const del = await supabase.auth.admin.deleteUser(userId);
  if (del.error) {
    return { ok: false, error: `Delete auth fallita: ${del.error.message}` };
  }

  // 3. Cleanup difensivo public.users (se cascade non scattata)
  await supabase.from('users').delete().eq('id', userId);

  // 4. Audit (l'entity_id è ormai orfano, ma serve per il log)
  await supabase.from('audit_events').insert({
    tenant_id: u.tenant_id ?? null,
    actor_user_id: ctx.userId,
    actor_role: 'admin',
    entity_type: 'user',
    entity_id: userId,
    action: 'delete',
    before_data: {
      display_name: u.display_name,
      is_platform_admin: u.is_platform_admin,
    } as Record<string, unknown>,
    metadata: {
      platform: true,
      actor_email: ctx.email,
    } as Record<string, unknown>,
  } as never);

  revalidatePath(`/admin/tenants/${u.tenant_id}`);
  revalidatePath('/admin/utenti');
  return { ok: true };
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
    actor_role: 'admin',
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
    actor_role: 'admin',
    entity_type: 'user',
    entity_id: userId,
    action: 'activate',
    metadata: { platform: true, actor_email: ctx.email } as Record<string, unknown>,
  } as never);

  revalidatePath('/admin/utenti');
  return { ok: true as const };
}

// ─── Crea utente "manuale" (no email, no invito) ────────────────────
//
// Pattern: il super-admin SOLVA crea l'utente assegnato a un tenant
// fornendo manualmente username + password. Il sistema costruisce
// un'email sintetica (`<username>@<tenant_slug>.kommessa.local`) che
// serve solo come identificatore di login — il suffisso `.local`
// è RFC-reserved e NON viene mai consegnato a nessun SMTP, quindi
// niente rischio di bounce o accidentale invio email.
//
// `email_confirm: true` evita il flow di conferma email di Supabase.
// L'utente può loggarsi immediatamente con la coppia (email, password)
// stampata a video per il SA.

const creaManualeSchema = z.object({
  tenantId: z.string().uuid(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9._-]+$/, 'Solo lettere minuscole, numeri, ".", "-", "_"'),
  displayName: z.string().trim().min(2).max(120),
  role: z.enum(['admin', 'office', 'tecnico']),
  password: z.string().min(8).max(72),
});

export async function creaUtenteManuale(
  input: z.infer<typeof creaManualeSchema>,
): Promise<
  | { ok: true; loginEmail: string; password: string; userId: string }
  | { ok: false; error: string }
> {
  const ctx = await requirePlatformAdmin();
  const parsed = creaManualeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'Input non valido' };
  }
  const supabase = createServiceSupabase();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('slug, sospeso')
    .eq('id', parsed.data.tenantId)
    .maybeSingle();
  if (!tenant) return { ok: false, error: 'Tenant non trovato' };
  if (tenant.sospeso) return { ok: false, error: 'Tenant sospeso' };

  // Email sintetica — login identifier, mai consegnata.
  const loginEmail = `${parsed.data.username}@${tenant.slug}.kommessa.local`;

  // Verifica collisione (Supabase non fa upsert su email)
  const { data: existsCheck } = await supabase
    .from('users')
    .select('id')
    .eq('id', '00000000-0000-0000-0000-000000000000') // dummy se serve, ma controllo via admin API
    .maybeSingle();
  void existsCheck;

  const created = await supabase.auth.admin.createUser({
    email: loginEmail,
    password: parsed.data.password,
    email_confirm: true, // skip flow di conferma — l'utente può loggare subito
    user_metadata: { display_name: parsed.data.displayName },
    app_metadata: {
      tenant_id: parsed.data.tenantId,
      tenant_slug: tenant.slug,
      role: parsed.data.role,
      manual_account: true, // flag per distinguere dagli invitati via email
    } as never,
  });
  if (created.error) {
    const msg = created.error.message;
    if (msg.toLowerCase().includes('already')) {
      return { ok: false, error: `Username "${parsed.data.username}" già usato in questo tenant` };
    }
    return { ok: false, error: msg };
  }
  const uid = created.data.user?.id;
  if (!uid) return { ok: false, error: 'auth id mancante' };

  // Riga applicativa
  const { error: insErr } = await supabase.from('users').insert({
    id: uid,
    tenant_id: parsed.data.tenantId,
    role: parsed.data.role,
    display_name: parsed.data.displayName,
    attivo: true,
  } as never);
  if (insErr) {
    // Best-effort cleanup
    try {
      await supabase.auth.admin.deleteUser(uid);
    } catch {
      /* swallow */
    }
    return { ok: false, error: `Insert users fallita: ${insErr.message}` };
  }

  await supabase.from('audit_events').insert({
    tenant_id: parsed.data.tenantId,
    actor_user_id: ctx.userId,
    actor_role: 'admin',
    entity_type: 'user',
    entity_id: uid,
    action: 'create_manual',
    after_data: {
      login_email: loginEmail,
      role: parsed.data.role,
      display_name: parsed.data.displayName,
    } as Record<string, unknown>,
    metadata: {
      platform: true,
      actor_email: ctx.email,
      mode: 'manual',
    } as Record<string, unknown>,
  } as never);

  revalidatePath(`/admin/tenants/${parsed.data.tenantId}`);
  revalidatePath('/admin/utenti');
  return { ok: true, loginEmail, password: parsed.data.password, userId: uid };
}

// ─── Imposta password manualmente (no email) ────────────────────────
//
// Pattern: il cliente perde la password, chiama il SA che gliela
// rigenera al volo (manuale o auto-gen) e gliela comunica fuori canale.
// Differente da `resetPasswordUser` che invia magic link via email.

const setPasswordSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(8).max(72),
});

export async function impostaPasswordManuale(
  input: z.infer<typeof setPasswordSchema>,
): Promise<{ ok: true; password: string } | { ok: false; error: string }> {
  const ctx = await requirePlatformAdmin();
  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'Input non valido' };
  }
  const supabase = createServiceSupabase();

  // Verifica esistenza utente (e ricava tenant per audit)
  const { data: u } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', parsed.data.userId)
    .maybeSingle();
  if (!u) return { ok: false, error: 'Utente non trovato' };

  const upd = await supabase.auth.admin.updateUserById(parsed.data.userId, {
    password: parsed.data.password,
  });
  if (upd.error) return { ok: false, error: upd.error.message };

  await supabase.from('audit_events').insert({
    tenant_id: u.tenant_id ?? null,
    actor_user_id: ctx.userId,
    actor_role: 'admin',
    entity_type: 'user',
    entity_id: parsed.data.userId,
    action: 'password_set_manual',
    metadata: {
      platform: true,
      actor_email: ctx.email,
      mode: 'manual',
    } as Record<string, unknown>,
  } as never);

  return { ok: true, password: parsed.data.password };
}

const invitaTenantUserSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(2).max(120),
  role: z.enum(['admin', 'office', 'tecnico']),
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
    actor_role: 'admin',
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
    actor_role: 'admin',
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
