'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServiceSupabase } from '@kommessa/api/service';
import { requirePlatformAdmin } from '../_lib/guard';
import { eCapacita, scriviCapacita } from '@kommessa/api/capacita';
import {
  RUOLI_ACCOUNT,
  faiNascereUnAccount,
} from '@/app/_actions/_lib/account-core';
import { auditPlatform } from '../_lib/audit-platform';

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
  username: z.string(),
  displayName: z.string(),
  role: z.enum(RUOLI_ACCOUNT),
  password: z.string().optional(),
  capoSquadra: z.boolean().optional(),
});

/**
 * Crea un account con nome utente e password, dal pannello di piattaforma.
 *
 * ⚠️ **Era la quinta copia, e la più pericolosa.** Faceva esattamente quello
 * che fa l'ufficio — alias `.local`, password dettata a voce — ma **senza
 * scrivere `must_change_password`**: l'account restava per sempre sulla
 * password letta al telefono. Adesso passa dal nucleo condiviso, che quel
 * campo lo scrive sempre.
 *
 * Le regole su nome utente e password non sono più qui: stanno in
 * `@kommessa/api/identita`, dove le legge anche il risolutore del login.
 */
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

  const esito = await faiNascereUnAccount(
    {
      tenantId: parsed.data.tenantId,
      tenantSlug: tenant.slug,
      displayName: parsed.data.displayName,
      role: parsed.data.role,
      ingresso: {
        tipo: 'utente',
        username: parsed.data.username,
        password: parsed.data.password,
      },
      capoSquadra: parsed.data.capoSquadra,
    },
    { userId: ctx.userId, role: 'admin' },
  );
  if (!esito.ok) return { ok: false, error: esito.error };

  revalidatePath(`/admin/tenants/${parsed.data.tenantId}`);
  revalidatePath('/admin/utenti');
  return {
    ok: true,
    loginEmail: esito.data.emailAuth,
    password: esito.data.password ?? '',
    userId: esito.data.userId,
  };
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

  // ⚠️ Chi riceve una password da qualcun altro deve cambiarla al primo
  // ingresso: e' la stessa regola di `reimpostaAccesso` lato ufficio, che qui
  // mancava. Senza, una password consegnata a voce dal pannello restava quella
  // per sempre.
  //
  // ⚠️ DOPO il cambio, mai prima: se il cambio fallisce, alzare il cancello
  // obbligherebbe la persona a scegliere una password nuova per un account la
  // cui password non e' cambiata. L'ordine e' lo stesso di `/cambia-password`.
  const { error: errCancello } = await supabase
    .from('users')
    .update({ must_change_password: true, password_changed_at: null } as never)
    .eq('id', parsed.data.userId);
  if (errCancello) {
    console.error('[admin/utenti] password cambiata ma cancello non rialzato:', errCancello.message);
  }

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
  role: z.enum(RUOLI_ACCOUNT),
});

/** Invita per email dal pannello di piattaforma. Stesso nucleo dell'ufficio. */
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

  const appUrl =
    (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  const esito = await faiNascereUnAccount(
    {
      tenantId: parsed.data.tenantId,
      tenantSlug: tenant.slug,
      displayName: parsed.data.displayName,
      role: parsed.data.role,
      ingresso: {
        tipo: 'invito',
        email: parsed.data.email,
        redirectTo: `${appUrl}/auth/callback?next=/accetta-invito`,
      },
    },
    { userId: ctx.userId, role: 'admin' },
  );
  if (!esito.ok) return { ok: false as const, error: esito.error };

  revalidatePath(`/admin/tenants/${parsed.data.tenantId}`);
  revalidatePath('/admin/utenti');
  return { ok: true as const };
}

export async function cambiaRuoloTenantUser(userId: string, role: string) {
  const ctx = await requirePlatformAdmin();
  // ⚠️ Accettava QUALUNQUE stringa e la scriveva in `users.role` e nei claim:
  // un refuso diventava un ruolo inesistente, e `current_role()` nelle policy
  // RLS non corrispondeva a niente — cioè l'utente non vedeva più nulla,
  // senza nessun errore.
  if (!(RUOLI_ACCOUNT as readonly string[]).includes(role)) {
    return { ok: false as const, error: `Ruolo non riconosciuto: ${role}` };
  }
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

/**
 * Dare o togliere un potere a una persona, dal pannello di piattaforma.
 *
 * Lo stesso gesto che l'ufficio fa da `/office/impostazioni/utenti`, qui
 * disponibile al supporto: quando un cliente telefona dicendo «Mauro non
 * riesce a creare i lavori», si risolve senza impersonare nessuno.
 */
export async function impostaPotereUtente(input: {
  userId: string;
  capacita: string;
  acceso: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const attore = await requirePlatformAdmin();
  if (!eCapacita(input?.capacita)) return { ok: false, error: 'Potere non riconosciuto.' };

  const svc = createServiceSupabase();
  const { data: target } = await svc
    .from('users')
    .select('id, tenant_id, role, display_name, permissions')
    .eq('id', input.userId)
    .maybeSingle();
  if (!target) return { ok: false, error: 'Utente non trovato.' };
  const t = target as {
    tenant_id: string | null;
    role: string;
    display_name: string | null;
    permissions: unknown;
  };
  if (t.role === 'admin' || t.role === 'office') {
    return {
      ok: false,
      error: 'Chi è in ufficio o amministra può già farlo: si cambia il ruolo, non il potere.',
    };
  }

  const nuovo = scriviCapacita(t.permissions, input.capacita, input.acceso === true);
  const { error } = await svc
    .from('users')
    .update({ permissions: nuovo } as never)
    .eq('id', input.userId);
  if (error) return { ok: false, error: error.message };

  await auditPlatform({
    tenantId: t.tenant_id,
    actorUserId: attore.userId,
    actorEmail: attore.email,
    entityType: 'utente',
    entityId: input.userId,
    action: input.acceso ? 'potere.concedi' : 'potere.revoca',
    before: { permissions: t.permissions } as Record<string, unknown>,
    after: { permissions: nuovo } as Record<string, unknown>,
    metadata: { capacita: input.capacita, persona: t.display_name ?? null },
  });

  revalidatePath(`/admin/tenants/${t.tenant_id ?? ''}`);
  return { ok: true };
}
