import { redirect } from 'next/navigation';

import type { TenantContext } from '@impiantixplus/api/tenant';
import { getTenantContextCached as getTenantContext } from '../../_lib/tenant-cache';

/**
 * Auth guard per le pagine in viewport mobile.
 *
 * Chiamala in cima a ogni server component sotto `mobile/`: se l'utente
 * non e' autenticato fa redirect a `/login?next=/mobile`, altrimenti
 * restituisce il `TenantContext` (tenantId, userId, role, ...).
 */
export async function guardMobile(): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) {
    redirect('/login?next=/mobile');
  }
  return ctx;
}
