import 'server-only';
import { cache } from 'react';

import { createServerSupabase } from '@kommessa/api/server';
import type { AppMode } from '@kommessa/api/types';

import { requireTenantContextCached } from '@/app/_lib/tenant-cache';

/**
 * `tenants.app_mode` del tenant corrente, deduplicato per request.
 *
 * Default 'kommessa' se la colonna è null/assente → Bertaiola e ogni tenant
 * esistente restano identici. Sorgente unica di verità per l'esperienza app
 * (mobile shell, office nav, deattivazione aree commessa).
 *
 *   kommessa = app completa attuale (commessa + eventuale kantiere)
 *   kantiere = solo Kantiere (niente area commessa) — desktop e mobile
 *   full     = combinata
 */
export const getAppModeCached = cache(async (): Promise<AppMode> => {
  const ctx = await requireTenantContextCached();
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from('tenants')
    .select('app_mode')
    .eq('id', ctx.tenantId)
    .maybeSingle();
  const raw = (data as { app_mode?: string | null } | null)?.app_mode ?? null;
  return raw === 'kantiere' || raw === 'full' ? raw : 'kommessa';
});
