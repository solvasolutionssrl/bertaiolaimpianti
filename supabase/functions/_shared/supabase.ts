// =====================================================================
// _shared/supabase.ts — factory client Supabase per Edge Functions.
// Due varianti:
//   - serviceClient(): bypassa RLS (per webhook + funzioni admin)
//   - userClient(authHeader): rispetta RLS, propaga il JWT dell'utente
//
// Edge Functions girano su Deno. Usiamo l'SDK via esm.sh.
// =====================================================================

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export type { SupabaseClient };

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/**
 * Client con service role: bypassa RLS.
 * Usare SOLO da Edge (mai esposto al client browser).
 */
export function serviceClient(): SupabaseClient {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-impiantixplus-source': 'edge-service' } },
  });
}

/**
 * Client che propaga il Bearer dell'utente chiamante (rispetta RLS).
 * Usare quando la function deve agire "come utente".
 */
export function userClient(authHeader: string | null | undefined): SupabaseClient {
  const url = env('SUPABASE_URL');
  const anonKey = env('SUPABASE_ANON_KEY');
  if (!authHeader) throw new Error('Missing Authorization header');
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
}

/**
 * Estrae user_id + tenant_id + role dal JWT corrente (via getUser+claims).
 * Restituisce null se non autenticato o claim mancanti.
 */
export interface JwtContext {
  userId: string;
  tenantId: string;
  tenantSlug: string;
  role: string;
  email: string | null;
}

export async function resolveJwtContext(
  client: SupabaseClient,
): Promise<JwtContext | null> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const u = data.user;
  const meta = (u.app_metadata ?? {}) as Record<string, unknown>;
  const tenantId =
    (meta.tenant_id as string | undefined) ??
    ((u as unknown as { tenant_id?: string }).tenant_id ?? '');
  const tenantSlug = (meta.tenant_slug as string | undefined) ?? '';
  const role = (meta.role as string | undefined) ?? 'tecnico';
  if (!tenantId) return null;
  return {
    userId: u.id,
    tenantId,
    tenantSlug,
    role,
    email: u.email ?? null,
  };
}
