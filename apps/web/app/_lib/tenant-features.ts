import 'server-only';
import { cache } from 'react';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContextCached } from '@/app/_lib/tenant-cache';
import { FEATURE_REGISTRY, featureDefault, type FeatureKey } from './tenant-features-registry';

/**
 * Override per-tenant della visibilità funzioni (`tenants.features`), deduplicato
 * per request. **Tollerante** alla colonna ancora assente / non concessa (prima
 * dell'apply della migration `20260629120000`): in quel caso ritorna `{}` e si
 * usano i default → nessuna regressione.
 */
export const getTenantFeaturesCached = cache(async (): Promise<Record<string, boolean>> => {
  const ctx = await requireTenantContextCached();
  const supabase = createServerSupabase();
  try {
    const { data } = await supabase
      .from('tenants')
      .select('features')
      .eq('id', ctx.tenantId)
      .maybeSingle();
    const raw = (data as { features?: Record<string, unknown> | null } | null)?.features ?? {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'boolean') out[k] = v;
    return out;
  } catch {
    return {};
  }
});

/**
 * Una funzione è attiva per il tenant corrente? Override esplicito se presente,
 * altrimenti il default della funzione (che per le funzioni "mondo commesse"
 * segue `kommessaWorld` = app_mode ≠ kantiere).
 */
export async function tenantFeatureEnabled(key: FeatureKey, kommessaWorld: boolean): Promise<boolean> {
  const overrides = await getTenantFeaturesCached();
  if (key in overrides) return overrides[key]!;
  const def = FEATURE_REGISTRY.find((f) => f.key === key);
  return def ? featureDefault(def, kommessaWorld) : true;
}
