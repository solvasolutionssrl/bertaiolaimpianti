import 'server-only';

import { createServerSupabase } from '@kommessa/api/server';
import { PERMESSO_TIPI_DEFAULT_ATTIVI, CODICI_PERMESSO } from '@kommessa/api/permessi-tipi';

type Supa = ReturnType<typeof createServerSupabase>;

export type ConfigDipendenti = {
  /** Pianificazione settimanale attiva. Default true (chiave assente = attiva). */
  pianificazioneAttiva: boolean;
  /** Ferie e permessi attivi. Default true (chiave assente = attiva). */
  ferieAttiva: boolean;
};

/**
 * Sotto-flag del modulo `dipendenti` (config in `tenant_modules`). Difensivo:
 * finché la riga/chiave non c'è, i sotto-flag valgono `true` (il modulo, se
 * attivo, porta di default entrambe le funzioni). Il gate del modulo stesso
 * resta `tenantHasModule('dipendenti')`.
 */
export async function leggiConfigDipendenti(
  supabase: Supa,
  tenantId: string,
): Promise<ConfigDipendenti> {
  const { data } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('module_code', 'dipendenti')
    .maybeSingle();
  const config =
    (data as { config: Record<string, unknown> | null } | null)?.config ?? {};
  return {
    pianificazioneAttiva: config['pianificazione_attiva'] === false ? false : true,
    ferieAttiva: config['ferie_attiva'] === false ? false : true,
  };
}

/**
 * Codici dei tipi di permesso ATTIVI (mostrati ai dipendenti nel form richiesta).
 * Config `permesso_tipi_attivi` (array di codici); se assente → set di default.
 * Filtra sui codici validi del catalogo (difensivo).
 */
export async function leggiTipiPermessoAttivi(
  supabase: Supa,
  tenantId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('module_code', 'dipendenti')
    .maybeSingle();
  const config =
    (data as { config: Record<string, unknown> | null } | null)?.config ?? {};
  const raw = config['permesso_tipi_attivi'];
  const valid = new Set(CODICI_PERMESSO);
  if (Array.isArray(raw)) {
    const filtered = raw.filter((c): c is string => typeof c === 'string' && valid.has(c));
    // Se la config esiste ma è vuota, rispettala (nessun tipo attivo).
    return filtered;
  }
  return PERMESSO_TIPI_DEFAULT_ATTIVI.filter((c) => valid.has(c));
}
