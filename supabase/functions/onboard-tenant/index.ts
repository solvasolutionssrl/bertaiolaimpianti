// =====================================================================
// onboard-tenant — funzione admin che provisiona un nuovo tenant.
//
// Richiede: header `x-admin-secret` = ONBOARDING_ADMIN_SECRET
// (questa è una funzione "out-of-band" usata solo dai SOLVA admin per
// creare un nuovo tenant del SaaS impiantiXplus).
//
// Body:
//   {
//     slug: string,                       // es. "ROS"
//     nome: string,                       // es. "Rossi Impianti SRL"
//     brandColor?: string,
//     logoUrl?: string,
//     plan?: 'pilot'|'base'|'pro'|'enterprise',
//     storageProvider: 'supabase'|'nextcloud',
//     storageConfig?: object,
//     admin: { email: string, displayName: string }
//   }
//
// Effetti:
//   1. INSERT tenants
//   2. Storage provisioning:
//      - supabase → assicura bucket privato `<slug>-files`
//      - nextcloud → crea cartella root /<slug>/ (richiede credenziali in storageConfig)
//   3. Crea utente auth (signInWithOtp / invite) con ruolo `owner`
//   4. Insert public.users con tenant_id + role=owner
//   5. Invia email di setup all'admin (link magic-link / reset password)
//
// Spec: Roadmap_Sprint.md (Sprint 0/1), CLAUDE.md (multitenant da day 1).
// =====================================================================

import { errorResponse, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/supabase.ts';

interface OnboardRequest {
  slug: string;
  nome: string;
  brandColor?: string;
  logoUrl?: string;
  plan?: 'pilot' | 'base' | 'pro' | 'enterprise';
  storageProvider: 'supabase' | 'nextcloud';
  storageConfig?: Record<string, unknown>;
  admin: { email: string; displayName: string };
}

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');

  const expected = Deno.env.get('ONBOARDING_ADMIN_SECRET');
  const got = req.headers.get('x-admin-secret');
  if (!expected || got !== expected) return errorResponse(401, 'Invalid admin secret');

  let body: OnboardRequest;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }
  if (!body.slug || !body.nome || !body.storageProvider || !body.admin?.email) {
    return errorResponse(400, 'slug, nome, storageProvider, admin.email required');
  }

  const slug = body.slug.trim().toUpperCase();
  const admin = serviceClient();

  // 1) INSERT tenant ------------------------------------------------------
  const storageConfig = body.storageConfig ?? (body.storageProvider === 'supabase'
    ? { bucket: `${slug.toLowerCase()}-files` }
    : {});
  const { data: tenant, error: tErr } = await admin
    .from('tenants')
    .insert({
      slug,
      nome: body.nome,
      brand_color: body.brandColor ?? null,
      logo_url: body.logoUrl ?? null,
      plan: body.plan ?? 'pilot',
      storage_provider: body.storageProvider,
      storage_config: storageConfig,
    })
    .select('*')
    .single();
  if (tErr || !tenant) {
    if (tErr?.message?.includes('duplicate')) {
      return errorResponse(409, `Tenant slug ${slug} già esistente`);
    }
    return errorResponse(500, 'tenant_insert_failed', tErr?.message);
  }

  // 2) Storage provisioning ----------------------------------------------
  try {
    if (body.storageProvider === 'supabase') {
      const bucket = (storageConfig.bucket as string) ?? `${slug.toLowerCase()}-files`;
      await ensureSupabaseBucket(admin, bucket);
    } else if (body.storageProvider === 'nextcloud') {
      // Per nextcloud serve già un service account configurato.
      // Qui creiamo solo la root /<slug>/ via WebDAV se le credenziali ci sono.
      await ensureNextcloudRoot(storageConfig, slug);
    }
  } catch (e) {
    console.error('[onboard-tenant] storage provisioning failed', e);
    // Non rollback: l'admin può ripetere il provisioning.
  }

  // 3) Crea utente auth (invite via magic link) --------------------------
  let createdUserId: string | null = null;
  try {
    const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(
      body.admin.email,
      {
        data: {
          tenant_id: tenant.id,
          tenant_slug: slug,
          role: 'owner',
          display_name: body.admin.displayName,
        },
      },
    );
    if (invErr) throw invErr;
    createdUserId = invited.user?.id ?? null;
  } catch (e) {
    console.error('[onboard-tenant] invite failed', e);
    return errorResponse(500, 'admin_invite_failed', String(e));
  }

  if (!createdUserId) {
    return errorResponse(500, 'admin_user_not_created');
  }

  // 4) Insert public.users (il trigger sync_user_claims popolerà i claim JWT)
  const { error: uErr } = await admin.from('users').insert({
    id: createdUserId,
    tenant_id: tenant.id,
    role: 'owner',
    display_name: body.admin.displayName,
    attivo: true,
  });
  if (uErr) {
    console.error('[onboard-tenant] public.users insert failed', uErr);
    return errorResponse(500, 'user_insert_failed', uErr.message);
  }

  // 5) Audit
  await admin.from('audit_events').insert({
    tenant_id: tenant.id,
    actor_user_id: null,
    actor_role: null,
    entity_type: 'tenant',
    entity_id: tenant.id,
    action: 'onboard',
    after_data: {
      slug,
      storage_provider: body.storageProvider,
      admin_email: body.admin.email,
    },
  });

  return jsonResponse({
    ok: true,
    tenantId: tenant.id,
    slug,
    adminUserId: createdUserId,
    note: 'Email di invito inviata; l\'admin dovrà completare il sign-in via magic link.',
  });
});

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
async function ensureSupabaseBucket(admin: any, bucket: string) {
  // L'SDK getBucket/createBucket richiede service role (ce l'abbiamo).
  const { data: existing } = await admin.storage.getBucket(bucket);
  if (existing) return;
  const { error } = await admin.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024, // 50 MB per upload (le foto vengono compresse lato PWA)
  });
  if (error && !String(error.message).toLowerCase().includes('exists')) {
    throw error;
  }
}

async function ensureNextcloudRoot(cfg: Record<string, unknown>, slug: string) {
  const baseUrl = (cfg.base_url as string) ?? Deno.env.get('NEXTCLOUD_BASE_URL') ?? '';
  const user = (cfg.user as string) ?? Deno.env.get('NEXTCLOUD_USER') ?? '';
  const password = (cfg.app_password as string) ?? Deno.env.get('NEXTCLOUD_APP_PASSWORD') ?? '';
  if (!baseUrl || !user || !password) return;
  const url = `${baseUrl.replace(/\/+$/, '')}/remote.php/dav/files/${encodeURIComponent(user)}/${encodeURIComponent(slug)}`;
  const res = await fetch(url, {
    method: 'MKCOL',
    headers: { Authorization: `Basic ${btoa(`${user}:${password}`)}` },
  });
  if (![201, 405, 409].includes(res.status)) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Nextcloud MKCOL ${slug} → ${res.status} ${txt.slice(0, 200)}`);
  }
}
