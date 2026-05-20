'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { createServiceSupabase } from '@impiantixplus/api/service';
import { requirePlatformAdmin } from '../_lib/guard';

/**
 * Server Actions per gestione tenant cross-tenant (solo platform admin).
 *
 * Usiamo SEMPRE `createServiceSupabase()` qui — bypass RLS deliberato:
 * 1. il guard `requirePlatformAdmin` ha già verificato l'identità SOLVA,
 * 2. la policy RLS `_platform_admin_read/write` dipende dal claim JWT
 *    che potrebbe non essere immediatamente fresh dopo l'aggiornamento
 *    di `users.is_platform_admin`. Service-role evita questo race.
 *
 * Tutte le mutazioni scrivono un audit_events con metadata.platform=true.
 */

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 12);
}

async function auditPlatform(opts: {
  actorUserId: string;
  actorEmail: string;
  tenantId: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  metadata?: Record<string, unknown>;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}) {
  const supabase = createServiceSupabase();
  await supabase.from('audit_events').insert({
    tenant_id: opts.tenantId,
    actor_user_id: opts.actorUserId,
    actor_role: 'owner', // placeholder: actor_role enum non ha 'platform_admin'
    entity_type: opts.entityType,
    entity_id: opts.entityId,
    action: opts.action,
    before_data: opts.before ?? null,
    after_data: opts.after ?? null,
    metadata: {
      ...(opts.metadata ?? {}),
      platform: true,
      actor_email: opts.actorEmail,
    } as Record<string, unknown>,
  } as never);
}

// ---------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------

const creaTenantSchema = z.object({
  nome: z.string().min(2).max(120),
  slug: z.string().min(2).max(12).regex(/^[A-Z0-9]+$/, 'Solo A-Z e 0-9, maiuscolo'),
  brand_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  logo_url: z.string().url().optional().nullable(),
  plan_id: z.string().uuid().optional().nullable(),
  storage_provider: z.enum(['supabase', 'nextcloud']).default('supabase'),
  storage_config: z.record(z.unknown()).default({}),
  inbound_email: z.string().email().optional().nullable(),
  owner_email: z.string().email(),
  owner_name: z.string().min(2).max(120),
});

export type CreaTenantInput = z.infer<typeof creaTenantSchema>;

export type CreaTenantResult =
  | { ok: true; tenantId: string; slug: string }
  | { ok: false; error: string };

export async function creaTenant(
  input: CreaTenantInput,
): Promise<CreaTenantResult> {
  const ctx = await requirePlatformAdmin();
  const parsed = creaTenantSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join(' · '),
    };
  }
  const data = parsed.data;
  const supabase = createServiceSupabase();

  // 1. crea tenant
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .insert({
      nome: data.nome,
      slug: data.slug,
      brand_color: data.brand_color ?? null,
      logo_url: data.logo_url ?? null,
      plan_id: data.plan_id ?? null,
      storage_provider: data.storage_provider,
      storage_config: data.storage_config as never,
      // inbound_email: salvato in storage_config se la colonna non esiste
    } as never)
    .select('id, slug, nome')
    .single();

  if (tErr || !tenant) {
    return { ok: false, error: `Tenant non creato: ${tErr?.message ?? 'errore'}` };
  }

  // 2. invito owner via Auth Admin API
  const inviteRes = await supabase.auth.admin.inviteUserByEmail(data.owner_email, {
    data: {
      display_name: data.owner_name,
    },
  });

  if (inviteRes.error) {
    // tenant creato ma invito fallito — non rollback (l'admin può reinviare)
    await auditPlatform({
      actorUserId: ctx.userId,
      actorEmail: ctx.email,
      tenantId: tenant.id,
      entityType: 'tenant',
      entityId: tenant.id,
      action: 'create',
      after: { nome: data.nome, slug: data.slug, invite_failed: inviteRes.error.message },
    });
    return {
      ok: false,
      error: `Tenant creato ma invito owner fallito: ${inviteRes.error.message}`,
    };
  }

  const newAuthUserId = inviteRes.data.user?.id;

  // 3. propaga app_metadata sull'utente invitato (tenant_id + role=owner)
  if (newAuthUserId) {
    await supabase.auth.admin.updateUserById(newAuthUserId, {
      app_metadata: {
        tenant_id: tenant.id,
        tenant_slug: tenant.slug,
        role: 'owner',
      } as never,
    });

    // 4. crea profile in public.users (il trigger sync_user_claims propagherà i claim)
    await supabase.from('users').insert({
      id: newAuthUserId,
      tenant_id: tenant.id,
      role: 'owner',
      display_name: data.owner_name,
      attivo: true,
    } as never);
  }

  await auditPlatform({
    actorUserId: ctx.userId,
    actorEmail: ctx.email,
    tenantId: tenant.id,
    entityType: 'tenant',
    entityId: tenant.id,
    action: 'create',
    after: {
      nome: data.nome,
      slug: data.slug,
      plan_id: data.plan_id,
      owner_email: data.owner_email,
    },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/tenants');

  return { ok: true, tenantId: tenant.id, slug: tenant.slug };
}

// ---------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------

const aggiornaTenantSchema = z.object({
  tenantId: z.string().uuid(),
  nome: z.string().min(2).max(120).optional(),
  brand_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  logo_url: z.string().url().nullable().optional(),
  plan_id: z.string().uuid().nullable().optional(),
  storage_provider: z.enum(['supabase', 'nextcloud']).optional(),
  storage_config: z.record(z.unknown()).optional(),
  note_interne: z.string().max(5000).nullable().optional(),
});

export async function aggiornaTenant(input: z.infer<typeof aggiornaTenantSchema>) {
  const ctx = await requirePlatformAdmin();
  const parsed = aggiornaTenantSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.message };
  const { tenantId, ...patch } = parsed.data;
  const supabase = createServiceSupabase();

  const { data: before } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .maybeSingle();

  const { error } = await supabase
    .from('tenants')
    .update(patch as never)
    .eq('id', tenantId);
  if (error) return { ok: false as const, error: error.message };

  await auditPlatform({
    actorUserId: ctx.userId,
    actorEmail: ctx.email,
    tenantId,
    entityType: 'tenant',
    entityId: tenantId,
    action: 'update',
    before: (before ?? null) as Record<string, unknown> | null,
    after: patch as Record<string, unknown>,
  });

  revalidatePath('/admin/tenants');
  revalidatePath(`/admin/tenants/${tenantId}`);
  return { ok: true as const };
}

// ---------------------------------------------------------------------
// SOSPENDI / RIATTIVA
// ---------------------------------------------------------------------

export async function sospendiTenant(tenantId: string, motivo?: string) {
  const ctx = await requirePlatformAdmin();
  const supabase = createServiceSupabase();
  const { error } = await supabase
    .from('tenants')
    .update({
      sospeso: true,
      sospeso_motivo: motivo ?? null,
      sospeso_at: new Date().toISOString(),
    } as never)
    .eq('id', tenantId);
  if (error) return { ok: false as const, error: error.message };

  await auditPlatform({
    actorUserId: ctx.userId,
    actorEmail: ctx.email,
    tenantId,
    entityType: 'tenant',
    entityId: tenantId,
    action: 'suspend',
    after: { motivo },
  });

  revalidatePath('/admin/tenants');
  revalidatePath(`/admin/tenants/${tenantId}`);
  return { ok: true as const };
}

export async function riattivaTenant(tenantId: string) {
  const ctx = await requirePlatformAdmin();
  const supabase = createServiceSupabase();
  const { error } = await supabase
    .from('tenants')
    .update({
      sospeso: false,
      sospeso_motivo: null,
      sospeso_at: null,
    } as never)
    .eq('id', tenantId);
  if (error) return { ok: false as const, error: error.message };

  await auditPlatform({
    actorUserId: ctx.userId,
    actorEmail: ctx.email,
    tenantId,
    entityType: 'tenant',
    entityId: tenantId,
    action: 'reactivate',
  });

  revalidatePath('/admin/tenants');
  revalidatePath(`/admin/tenants/${tenantId}`);
  return { ok: true as const };
}

/**
 * Soft-delete: marca il tenant come sospeso con motivo "ELIMINATO".
 * Per ora NON cancelliamo realmente le righe (ON DELETE RESTRICT su FK
 * e per safety con dati produzione). L'admin può ripristinare via DB.
 */
export async function eliminaTenant(tenantId: string) {
  const ctx = await requirePlatformAdmin();
  const supabase = createServiceSupabase();
  const { error } = await supabase
    .from('tenants')
    .update({
      sospeso: true,
      sospeso_motivo: 'ELIMINATO',
      sospeso_at: new Date().toISOString(),
    } as never)
    .eq('id', tenantId);
  if (error) return { ok: false as const, error: error.message };

  await auditPlatform({
    actorUserId: ctx.userId,
    actorEmail: ctx.email,
    tenantId,
    entityType: 'tenant',
    entityId: tenantId,
    action: 'soft_delete',
  });

  revalidatePath('/admin/tenants');
  return { ok: true as const };
}

// ---------------------------------------------------------------------
// TEST CONNESSIONE STORAGE — probe pre-creazione
// ---------------------------------------------------------------------

const testStorageSchema = z.object({
  provider: z.enum(['supabase', 'nextcloud']),
  baseUrl: z.string().optional(),
  user: z.string().optional(),
  appPassword: z.string().optional(),
});

export type TestStorageInput = z.infer<typeof testStorageSchema>;
export type TestStorageResult =
  | { ok: true; latencyMs: number; detail: string }
  | { ok: false; error: string };

/**
 * Verifica live una config storage PRIMA di salvarla sul tenant.
 *
 * - supabase: nessun probe esterno (gestito), ritorna ok immediato
 * - nextcloud: PROPFIND su baseUrl con Basic Auth, timeout 5s
 *
 * Usato dal wizard "Nuovo tenant" step 2 e dal dettaglio tenant per
 * evitare di scoprire config sbagliate solo nella pagina Salute.
 */
export async function testaConnessioneStorage(
  input: TestStorageInput,
): Promise<TestStorageResult> {
  await requirePlatformAdmin();
  const parsed = testStorageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Input non valido' };
  }
  const data = parsed.data;

  if (data.provider === 'supabase') {
    return {
      ok: true,
      latencyMs: 0,
      detail: 'Bucket Supabase gestito — niente probe esterno richiesto',
    };
  }

  // Nextcloud probe
  if (!data.baseUrl || !data.user || !data.appPassword) {
    return {
      ok: false,
      error: 'Compila baseUrl + user + appPassword prima di testare',
    };
  }

  const start = Date.now();
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 5000);
  try {
    const auth =
      'Basic ' +
      Buffer.from(`${data.user}:${data.appPassword}`).toString('base64');
    const res = await fetch(data.baseUrl, {
      method: 'PROPFIND',
      headers: {
        Authorization: auth,
        Depth: '0',
        'Content-Type': 'application/xml',
      },
      signal: controller.signal,
    });
    clearTimeout(tid);
    const ms = Date.now() - start;
    if (res.status === 207 || res.status === 200) {
      return { ok: true, latencyMs: ms, detail: `WebDAV reachable (HTTP ${res.status})` };
    }
    if (res.status === 401) {
      return {
        ok: false,
        error: 'Credenziali rifiutate (HTTP 401). Verifica user + app-password.',
      };
    }
    if (res.status === 404) {
      return {
        ok: false,
        error: 'URL WebDAV non trovato (HTTP 404). Controlla baseUrl.',
      };
    }
    return { ok: false, error: `Risposta inattesa: HTTP ${res.status}` };
  } catch (e) {
    clearTimeout(tid);
    const msg = (e as Error).message ?? 'errore sconosciuto';
    if (msg.toLowerCase().includes('abort')) {
      return { ok: false, error: 'Timeout 5s — server non raggiungibile' };
    }
    return { ok: false, error: `Errore di rete: ${msg}` };
  }
}

// ---------------------------------------------------------------------
// IMPERSONATE — JWT shadow vero
// ---------------------------------------------------------------------

/**
 * Impersonation JWT-shadow: il platform admin "diventa" tecnicamente un
 * utente del tenant, con un vero JWT firmato dal target. RLS, Realtime,
 * Storage e Edge Functions vedono il target — non c'è più discrepanza
 * tra cookie e token come nella v1.
 *
 * Flusso:
 *   1. Salva la sessione admin corrente in cookie `shadow_admin` (refresh_token)
 *   2. Genera magic-link via Auth Admin API per l'utente target
 *   3. `verifyOtp` server-side → scrive nuovi cookie `sb-*-auth-token` (target)
 *   4. Audit event con actor=admin, on_behalf_of=target
 *   5. Redirect a /office (l'utente è ora il target a tutti gli effetti)
 *
 * `endImpersonation` legge `shadow_admin`, chiama `refreshSession` con quel
 * refresh_token → ripristina i cookie admin.
 */
export async function impersonateUser(opts: {
  tenantId: string;
  targetUserId?: string; // se omesso, prende l'owner del tenant
}) {
  const ctx = await requirePlatformAdmin();
  const { cookies } = await import('next/headers');
  const { createServerSupabase } = await import('@impiantixplus/api/server');
  const cookieStore = cookies();

  const svc = createServiceSupabase();

  // 1. Risolve tenant + target user
  const { data: tenant } = await svc
    .from('tenants')
    .select('id, slug, nome')
    .eq('id', opts.tenantId)
    .maybeSingle();
  if (!tenant) return { ok: false as const, error: 'Tenant non trovato' };

  let targetUserId = opts.targetUserId ?? null;
  if (!targetUserId) {
    const { data: owner } = await svc
      .from('users')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('role', 'owner')
      .eq('attivo', true)
      .limit(1)
      .maybeSingle();
    targetUserId = owner?.id ?? null;
  }
  if (!targetUserId) {
    return { ok: false as const, error: 'Nessun owner attivo nel tenant' };
  }

  // Email del target (serve per generateLink)
  const targetAuthRes = await svc.auth.admin.getUserById(targetUserId);
  const targetEmail = targetAuthRes.data.user?.email ?? null;
  const targetMeta = (targetAuthRes.data.user?.user_metadata ?? {}) as Record<
    string,
    unknown
  >;
  const targetName = (targetMeta.display_name as string | undefined) ?? targetEmail;
  if (!targetEmail) {
    return { ok: false as const, error: 'Target user senza email' };
  }

  // 2. Salva sessione admin corrente come shadow (refresh_token basta)
  const ssrAdmin = createServerSupabase();
  const { data: adminSession } = await ssrAdmin.auth.getSession();
  if (!adminSession.session?.refresh_token) {
    return { ok: false as const, error: 'Sessione admin non leggibile' };
  }

  cookieStore.set({
    name: 'shadow_admin',
    value: JSON.stringify({
      refresh_token: adminSession.session.refresh_token,
      admin_email: ctx.email,
      admin_user_id: ctx.userId,
      target_email: targetEmail,
      target_user_id: targetUserId,
      tenant_label: `${tenant.nome} (${tenant.slug})`,
      started_at: new Date().toISOString(),
    }),
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 4, // 4h max
  });

  // 3. Genera magic-link e verifica server-side → swap dei cookie sb-*
  const linkRes = await svc.auth.admin.generateLink({
    type: 'magiclink',
    email: targetEmail,
  });
  if (linkRes.error || !linkRes.data?.properties?.hashed_token) {
    return {
      ok: false as const,
      error: `generateLink fallito: ${linkRes.error?.message ?? 'no hashed_token'}`,
    };
  }
  const hashedToken = linkRes.data.properties.hashed_token;

  // Usa il client SSR (stessa cookie adapter) per verificare l'OTP:
  // verifyOtp scrive automaticamente i nuovi cookie sb-*-auth-token via adapter
  const ssrSwap = createServerSupabase();
  const verifyRes = await ssrSwap.auth.verifyOtp({
    type: 'magiclink',
    token_hash: hashedToken,
  });
  if (verifyRes.error || !verifyRes.data.session) {
    return {
      ok: false as const,
      error: `verifyOtp fallito: ${verifyRes.error?.message ?? 'no session'}`,
    };
  }

  // Label visibile (non-httpOnly) per il banner client
  cookieStore.set({
    name: 'impersonating_label',
    value: `${targetName} · ${tenant.nome}`,
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 4,
  });

  // 4. Audit (con service-role, prima del redirect)
  await auditPlatform({
    actorUserId: ctx.userId,
    actorEmail: ctx.email,
    tenantId: tenant.id,
    entityType: 'user',
    entityId: targetUserId,
    action: 'impersonate_start',
    metadata: {
      target_email: targetEmail,
      target_user_id: targetUserId,
      mode: 'jwt_shadow',
    },
  });

  redirect('/office');
}

/**
 * Legacy: vecchia API che impersonava solo per tenant (cookie + banner).
 * Mantiene la stessa firma usata da `header-actions.tsx`. Ora delega al
 * vero JWT shadow puntando all'owner.
 */
export async function impersonate(tenantId: string) {
  return impersonateUser({ tenantId });
}

export async function endImpersonation() {
  const { cookies } = await import('next/headers');
  const { createServerSupabase } = await import('@impiantixplus/api/server');
  const cookieStore = cookies();

  const shadowRaw = cookieStore.get('shadow_admin')?.value;
  if (!shadowRaw) {
    // Nessuno shadow → niente da ripristinare. Solo cleanup banner + go home.
    cookieStore.delete('impersonating_tenant_id');
    cookieStore.delete('impersonating_tenant_label');
    cookieStore.delete('impersonating_label');
    redirect('/admin');
  }

  let shadow: {
    refresh_token: string;
    admin_email: string;
    admin_user_id: string;
    target_user_id?: string;
    tenant_label?: string;
  };
  try {
    shadow = JSON.parse(shadowRaw);
  } catch {
    cookieStore.delete('shadow_admin');
    cookieStore.delete('impersonating_label');
    redirect('/admin');
  }

  // Ripristina sessione admin: refreshSession con il refresh_token salvato.
  // L'adapter SSR riscriverà i cookie sb-*-auth-token con la sessione admin.
  const ssr = createServerSupabase();
  const refreshRes = await ssr.auth.refreshSession({
    refresh_token: shadow.refresh_token,
  });

  // Audit cross-tenant (service-role bypassa RLS — l'admin potrebbe non
  // avere più una sessione utile a leggere `tenants` ai fini policy).
  const svc = createServiceSupabase();
  await svc.from('audit_events').insert({
    tenant_id: null,
    actor_user_id: shadow.admin_user_id,
    actor_role: 'owner', // placeholder enum
    entity_type: 'user',
    entity_id: shadow.target_user_id ?? null,
    action: 'impersonate_end',
    metadata: {
      platform: true,
      actor_email: shadow.admin_email,
      mode: 'jwt_shadow',
      restore_ok: !refreshRes.error,
    } as Record<string, unknown>,
  } as never);

  cookieStore.delete('shadow_admin');
  cookieStore.delete('impersonating_label');
  // legacy cleanup, se presenti
  cookieStore.delete('impersonating_tenant_id');
  cookieStore.delete('impersonating_tenant_label');

  if (refreshRes.error) {
    // refresh fallito (token scaduto): forzo logout pulito
    await ssr.auth.signOut();
    redirect('/login?reason=shadow_expired');
  }

  redirect('/admin');
}
