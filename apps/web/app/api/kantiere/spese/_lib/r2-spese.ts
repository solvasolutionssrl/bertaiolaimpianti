import 'server-only';

import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
  type R2StorageProvider,
} from '@kommessa/integrations/storage';

import { tenantHasModule } from '@/app/_lib/modules';

export type R2SpeseCtx = {
  tenantId: string;
  slug: string;
  r2: R2StorageProvider;
  /** Prefisso radice del namespace spese del tenant. Tutto deve stare qui sotto. */
  base: string;
};

export type R2SpeseErr = { error: string; status: number };

export function isErr(x: R2SpeseCtx | R2SpeseErr): x is R2SpeseErr {
  return 'error' in x;
}

/**
 * Contesto per gli endpoint R2 delle spese: solo office/admin/owner, modulo
 * kantiere attivo, provider R2 risolto, prefisso radice del tenant. La
 * validazione del namespace (vedi `dentroBase`) impedisce di leggere chiavi di
 * altri tenant o percorsi arbitrari.
 */
export async function r2SpeseContext(): Promise<R2SpeseCtx | R2SpeseErr> {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { error: 'NON_AUTENTICATO', status: 401 };
  }
  if (!['owner', 'admin', 'office'].includes(ctx.role)) {
    return { error: 'NON_AUTORIZZATO', status: 403 };
  }
  if (!(await tenantHasModule('kantiere'))) {
    return { error: 'MODULO_ASSENTE', status: 404 };
  }
  const service = createServiceSupabase();
  const { data: t } = await service
    .from('tenants')
    .select('r2_config, slug')
    .eq('id', ctx.tenantId)
    .maybeSingle();
  const r2 =
    getR2ProviderFromTenantConfig((t?.r2_config as Record<string, unknown> | null) ?? null) ??
    getR2ProviderFromEnv();
  if (!r2) return { error: 'R2_ASSENTE', status: 503 };
  const slug = (t?.slug as string | undefined) ?? ctx.tenantId;
  return { tenantId: ctx.tenantId, slug, r2, base: `tenants/${slug}/kantiere/spese/` };
}

/** True se la chiave/prefisso è dentro il namespace spese del tenant (no traversal). */
export function dentroBase(keyOrPrefix: string, base: string): boolean {
  if (keyOrPrefix.includes('..')) return false;
  return keyOrPrefix.startsWith(base);
}
