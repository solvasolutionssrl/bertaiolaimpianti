import 'server-only';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@impiantixplus/api/server';

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
 * `sync_user_claims` quando `users.is_platform_admin = true`).
 *
 * Per robustezza in fase di sviluppo (claim non ancora propagato per il
 * primo utente seed) accettiamo ANCHE l'email `dev@solva.it` come admin —
 * questo evita lock-out se la migration platform è appena stata applicata
 * e il JWT in cookie è "vecchio".
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
  // Fallback dev: email hard-coded del seed SOLVA owner
  const isDevSolva = email.toLowerCase() === 'dev@solva.it';
  if (flag || isDevSolva) {
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
  if (check.kind === 'tenant_user') redirect('/office');
  redirect('/login?next=/admin');
}
