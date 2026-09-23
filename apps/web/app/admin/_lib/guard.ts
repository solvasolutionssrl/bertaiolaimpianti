import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';

import { leggiShadow, SHADOW_COOKIE } from './shadow';

/**
 * Contesto autenticato di un platform admin SOLVA.
 *
 * Nota: a differenza di `TenantContext` qui `tenant_id` è SEMPRE null
 * (i platform admin sono cross-tenant). Conserviamo invece l'identità
 * SOLVA (userId + email) per audit + UI.
 */
export interface PlatformAdminContext {
  userId: string;
  email: string;
}

/**
 * Esito del check platform admin senza throw. Distingue:
 *  - `anonymous`: utente non loggato → /login
 *  - `tenant_user`: loggato come utente di un tenant ma SENZA flag platform
 *                   → da rimandare a /office (NON kickare al login)
 *  - `admin`: ok, lascia passare
 */
export type PlatformAdminCheck =
  | { kind: 'anonymous' }
  | { kind: 'tenant_user'; email: string }
  | { kind: 'admin'; ctx: PlatformAdminContext };

/**
 * Verifica se l'utente loggato è un platform admin SOLVA.
 * Legge il JWT custom claim `app_metadata.platform_admin` (popolato da
 * `sync_user_claims` quando `users.is_platform_admin = true`). Nessuna
 * eccezione per indirizzo email: un'email non e' un permesso.
 */
export async function checkPlatformAdmin(): Promise<PlatformAdminCheck> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { kind: 'anonymous' };
  }
  const email = data.user.email ?? '';
  const meta = (data.user.app_metadata ?? {}) as Record<string, unknown>;
  const flag = meta.platform_admin === true || meta.platform_admin === 'true';
  if (flag) {
    return { kind: 'admin', ctx: { userId: data.user.id, email } };
  }
  return { kind: 'tenant_user', email };
}

/**
 * Guard per layout/page Server Component sotto `/admin/*`.
 *
 * Comportamento:
 *  - anonimo → redirect `/login?next=/admin`
 *  - tenant user (loggato ma non admin) → redirect `/office` (NON kick
 *    al login: l'utente ha già una sessione valida, semplicemente non
 *    può entrare nell'area platform)
 *  - platform admin → ritorna il contesto
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const check = await checkPlatformAdmin();
  if (check.kind === 'admin') return check.ctx;
  if (check.kind === 'tenant_user') {
    // Chi sta impersonando ha il JWT del tenant, quindi finirebbe rimbalzato
    // dentro al tenant proprio mentre cerca di tornare alla console: era l'unico
    // modo di uscirne fare logout. Con un cookie di impersonation ancora valido,
    // `/admin` diventa la via di ritorno. Il ripristino della sessione scrive
    // cookie, che un Server Component non puo' fare: passa da una route.
    if (leggiShadow(cookies().get(SHADOW_COOKIE)?.value)) redirect('/api/admin/rientro');
    redirect('/office');
  }
  redirect('/login?next=/admin');
}

/**
 * Verifica se l'attore corrente è un superadmin SOLVA, sia in modalità
 * nativa (JWT platform_admin) sia mentre IMPERSONA un tenant.
 *
 * Durante l'impersonation il JWT è quello dell'utente tenant (platform_admin
 * = false), ma il cookie httpOnly `shadow_admin` — settato solo dal flusso di
 * impersonation, che a sua volta richiede platform admin — conserva l'identità
 * reale SOLVA. La sua presenza è quindi un segnale affidabile.
 *
 * Usato per gating di azioni riservate al superadmin visibili nell'area office
 * (es. ripristino versione commessa).
 */
export async function isSuperadminActor(): Promise<{
  ok: boolean;
  email: string | null;
}> {
  // 1) Impersonation attiva: vale solo un cookie firmato dal server, non
  //    scaduto, di un utente che nel database è ancora super admin. Un cookie
  //    con quel nome impostato a mano non basta più.
  const shadow = leggiShadow(cookies().get(SHADOW_COOKIE)?.value);
  if (shadow) {
    const { data } = await createServiceSupabase()
      .from('users')
      .select('is_platform_admin')
      .eq('id', shadow.admin_user_id)
      .maybeSingle();
    if ((data as { is_platform_admin?: boolean } | null)?.is_platform_admin === true) {
      return { ok: true, email: shadow.admin_email };
    }
    return { ok: false, email: null };
  }
  // 2) Superadmin nativo (non in impersonation)
  const check = await checkPlatformAdmin();
  if (check.kind === 'admin') return { ok: true, email: check.ctx.email };
  return { ok: false, email: null };
}
