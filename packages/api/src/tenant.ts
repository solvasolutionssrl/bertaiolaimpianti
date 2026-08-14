import { createServerSupabase } from './server';

/**
 * Ruoli applicativi (v2 semplificata).
 *
 * Postgres enum app_role conserva ancora 'owner' e 'capo' come valori
 * deprecati (non rimuovibili senza riscrivere policies/funzioni). Lato
 * TypeScript ci limitiamo ai 4 ruoli attivi: chi legge un valore legacy
 * dal DB (caso teorico, già migrato a runtime) verrà gestito come
 * 'admin' o 'tecnico' lato applicazione.
 *
 * Super_admin SOLVA è ortogonale (users.is_platform_admin flag).
 */
export type AppRole = 'admin' | 'office' | 'tecnico' | 'cliente';

export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  userId: string;
  email: string;
  role: AppRole;
}

/**
 * Reads the current authenticated tenant + user from the JWT custom claims.
 * Throws if unauthenticated. Use in Server Components / Server Actions
 * where authentication is required.
 *
 * IMPERSONATION: il sistema di impersonation è in `apps/web/app/admin/
 * _actions/tenants.ts` (`impersonateUser`/`endImpersonation`). Funziona
 * via JWT swap (magic-link + verifyOtp) → riscrive i cookie sb-*-auth-token
 * con la sessione del target user. Risultato: `requireTenantContext` legge
 * naturalmente i claim del target dal nuovo JWT, senza override custom.
 * Per il banner UI vedi `apps/web/app/office/_components/impersonation-banner.tsx`.
 *
 * NOTA performance: chiamata ripetuta in layout + page nella stessa
 * request porta a multiple chiamate a `auth.getUser()`. Gli app consumer
 * dovrebbero wrappare in `React.cache` (es. `apps/web` lo fa via
 * `office/_lib/tenant-cache.ts`). Il package `api` non dipende da React
 * per restare framework-agnostic.
 */
export async function requireTenantContext(): Promise<TenantContext> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error('UNAUTHENTICATED');
  }
  const claims = (data.user.app_metadata ?? {}) as Record<string, unknown>;
  const tenantId = (claims.tenant_id as string) ?? null;
  const tenantSlug = (claims.tenant_slug as string) ?? null;
  const role = ((claims.role as AppRole) ?? 'tecnico') as AppRole;
  if (!tenantId || !tenantSlug) {
    throw new Error('NO_TENANT_CLAIM');
  }
  return {
    tenantId,
    tenantSlug,
    userId: data.user.id,
    email: data.user.email ?? '',
    role,
  };
}

/** Same as `requireTenantContext` but returns `null` instead of throwing. */
export async function getTenantContext(): Promise<TenantContext | null> {
  try {
    return await requireTenantContext();
  } catch {
    return null;
  }
}

/**
 * «Non sei collegato» e «non sono riuscito a verificarlo adesso» sono due cose
 * diverse, e trattarle allo stesso modo è quello che buttava fuori la gente.
 *
 * Sul telefono capita di continuo: l'app resta ferma in tasca, si riapre in un
 * capannone senza campo e la prima verifica della sessione non arriva a
 * destinazione. La sessione è viva — il biglietto per rinnovarla è lì nei
 * cookie — ma il controllo fallisce, e finora questo valeva quanto un logout:
 * ripartire dalla schermata di accesso, con la password da riscrivere e il
 * turno da riprendere.
 *
 * Qui si guarda **prima** se il biglietto c'è:
 * - non c'è          → `anonimo`, e allora sì, si va all'accesso;
 * - c'è ma non passa → `incerto`: si riprova, non si butta fuori nessuno.
 */
export type EsitoSessione =
  | { stato: 'ok'; ctx: TenantContext }
  | { stato: 'anonimo' }
  | { stato: 'incerto' };

/** Il cookie che Supabase usa per la sessione, anche spezzato in più pezzi. */
function haCookieDiSessione(cookies: { name: string }[]): boolean {
  return cookies.some((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name));
}

export async function leggiSessione(
  cookies: { name: string }[],
): Promise<EsitoSessione> {
  try {
    return { stato: 'ok', ctx: await requireTenantContext() };
  } catch (e) {
    const causa = e instanceof Error ? e.message : '';
    // Autenticato ma senza tenant nei claim: è un problema di configurazione
    // dell'utente, non un dubbio. Lo lasciamo esplodere come prima.
    if (causa === 'NO_TENANT_CLAIM') throw e;
    return haCookieDiSessione(cookies) ? { stato: 'incerto' } : { stato: 'anonimo' };
  }
}
