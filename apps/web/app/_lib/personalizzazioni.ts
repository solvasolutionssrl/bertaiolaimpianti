import 'server-only';

import { createServerSupabase } from '@kommessa/api/server';

import {
  chiaviValide,
  type PersonalizzazioneKey,
} from './personalizzazioni-registry';

/**
 * Quali funzioni su misura sono accese per un cliente.
 *
 * Il modulo `personalizzazioni` apre l'area; questa lettura dice cosa c'e'
 * dentro. Difensiva come le altre: se la riga o la chiave non ci sono, non e'
 * acceso niente. Il silenzio vale come "no", non come "tutto".
 */

type Supa = ReturnType<typeof createServerSupabase>;

export async function leggiFunzioniPersonalizzate(
  supabase: Supa,
  tenantId: string,
): Promise<PersonalizzazioneKey[]> {
  const { data } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('module_code', 'personalizzazioni')
    .maybeSingle();
  const config = (data as { config: Record<string, unknown> | null } | null)?.config ?? {};
  return chiaviValide(config['funzioni']);
}

/** Impostazioni di una singola funzione, sotto la sua chiave nella config. */
export async function leggiConfigFunzione(
  supabase: Supa,
  tenantId: string,
  key: PersonalizzazioneKey,
): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('module_code', 'personalizzazioni')
    .maybeSingle();
  const config = (data as { config: Record<string, unknown> | null } | null)?.config ?? {};
  const sua = config[key];
  return sua && typeof sua === 'object' && !Array.isArray(sua)
    ? (sua as Record<string, unknown>)
    : {};
}
