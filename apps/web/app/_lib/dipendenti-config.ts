import 'server-only';

import { createServerSupabase } from '@kommessa/api/server';
import {
  PERMESSO_TIPI,
  PERMESSO_TIPI_DEFAULT_ATTIVI,
  CODICI_PERMESSO,
  labelTipoPermesso,
} from '@kommessa/api/permessi-tipi';

type Supa = ReturnType<typeof createServerSupabase>;

/** Opzione tipo permesso per i form di richiesta (built-in attivo o custom). */
export interface TipoOpt {
  codice: string;
  label: string;
  unita: 'giorni' | 'ore' | 'entrambi';
  /** Ore predefinite (per i tipi custom a ore fisse). */
  oreDefault?: number | null;
  custom?: boolean;
}

/** Tipi permesso personalizzati del tenant (config `permesso_tipi_custom`). */
export async function leggiTipiPermessoCustom(
  supabase: Supa,
  tenantId: string,
): Promise<TipoOpt[]> {
  const { data } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('module_code', 'dipendenti')
    .maybeSingle();
  const config =
    (data as { config: Record<string, unknown> | null } | null)?.config ?? {};
  const raw = config['permesso_tipi_custom'];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map((t) => ({
      codice: String(t.codice ?? ''),
      label: String(t.label ?? ''),
      unita: (t.unita === 'ore' || t.unita === 'entrambi' ? t.unita : 'giorni') as
        | 'giorni'
        | 'ore'
        | 'entrambi',
      oreDefault: typeof t.oreDefault === 'number' ? t.oreDefault : null,
      custom: true,
    }))
    .filter((t) => t.codice && t.label);
}

/** Tipi richiedibili dai dipendenti = built-in attivi + custom. */
export async function leggiTipiRichiedibili(
  supabase: Supa,
  tenantId: string,
): Promise<TipoOpt[]> {
  const [attivi, custom] = await Promise.all([
    leggiTipiPermessoAttivi(supabase, tenantId),
    leggiTipiPermessoCustom(supabase, tenantId),
  ]);
  const builtin: TipoOpt[] = PERMESSO_TIPI.filter((t) => attivi.includes(t.codice)).map((t) => ({
    codice: t.codice,
    label: t.label,
    unita: t.unita,
  }));
  return [...builtin, ...custom];
}

/** Mappa codice → label (built-in + custom) per risolvere le richieste in lista. */
export async function leggiLabelTipi(
  supabase: Supa,
  tenantId: string,
): Promise<Record<string, string>> {
  const custom = await leggiTipiPermessoCustom(supabase, tenantId);
  const map: Record<string, string> = {};
  for (const t of PERMESSO_TIPI) map[t.codice] = t.label;
  for (const c of custom) map[c.codice] = c.label;
  return map;
}

/** Risolve la label di un tipo con fallback al catalogo built-in. */
export function labelTipoConMappa(codice: string, mappa: Record<string, string>): string {
  return mappa[codice] ?? labelTipoPermesso(codice);
}

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
