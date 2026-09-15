import 'server-only';
import { cache } from 'react';

import { createServerSupabase } from '@kommessa/api/server';
import type { AppMode } from '@kommessa/api/types';

import { requireTenantContextCached } from '@/app/_lib/tenant-cache';
import { tenantHasModule } from '@/app/_lib/modules';

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
  if (raw !== 'kantiere' && raw !== 'full') return 'kommessa';
  // Senza il modulo Kantiere le sue aree sono chiuse: restare su 'kantiere' o
  // 'full' rimbalzerebbe all'infinito fra /office e /office/kantiere (e fra
  // /mobile e /mobile/kantiere). Si torna all'esperienza commesse.
  return (await tenantHasModule('kantiere')) ? raw : 'kommessa';
});

/**
 * True se il tenant è puro-Kantiere (`app_mode = 'kantiere'`), cioè senza il
 * mondo commesse. Da usare nelle server action commesse per bloccare
 * l'invocazione diretta da un tenant Kantiere: il gate delle PAGINE non
 * protegge la chiamata diretta all'azione. I tenant `kommessa`/`full` → false.
 */
export async function isKantiereOnly(): Promise<boolean> {
  return (await getAppModeCached()) === 'kantiere';
}
