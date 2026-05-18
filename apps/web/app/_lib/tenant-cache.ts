import 'server-only';
import { cache } from 'react';
import {
  getTenantContext as getTenantContextRaw,
  type TenantContext,
} from '@impiantixplus/api/tenant';

/**
 * Wrapper request-scoped di `requireTenantContext` / `getTenantContext`.
 *
 * Il package `api` non dipende da React per restare framework-agnostic,
 * quindi facciamo qui la deduplicazione tra layout + page nella stessa
 * request (`React.cache`). Risultato: una sola chiamata a
 * `supabase.auth.getUser()` per render, anche se sia il layout che la
 * pagina richiamano `requireTenantContext`.
 *
 * Usalo nelle route ad alto traffico (es. `/office/*`, `/mobile/*`) al
 * posto degli helper raw del package api.
 */
export const getTenantContextCached = cache(
  async (): Promise<TenantContext | null> => getTenantContextRaw(),
);

export async function requireTenantContextCached(): Promise<TenantContext> {
  const ctx = await getTenantContextCached();
  if (!ctx) {
    // Stesso contratto del raw `requireTenantContext`, senza un secondo
    // round-trip a `supabase.auth.getUser()`: l'errore è già stato osservato.
    throw new Error('UNAUTHENTICATED');
  }
  return ctx;
}
