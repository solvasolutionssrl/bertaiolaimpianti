import { createServerSupabase } from './server';

export type AppRole = 'owner' | 'admin' | 'office' | 'capo' | 'tecnico' | 'cliente';

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
