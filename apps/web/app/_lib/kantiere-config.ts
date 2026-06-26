import 'server-only';

import { createServerSupabase } from '@kommessa/api/server';

type Supa = ReturnType<typeof createServerSupabase>;

export type ArrotondamentiKantiere = {
  /** Step (min) per l'arrotondamento del TEMPO DI VIAGGIO. Default 5. */
  viaggioMin: number;
  /** Step (min) per l'arrotondamento delle ORE LAVORO. Default 0 = nessuno
   *  (si raccoglie tutto a dettaglio massimo, si arrotonda nel report). */
  oreMin: number;
};

function toInt(v: unknown, def: number): number {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.round(v);
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    if (!isNaN(n) && n >= 0) return n;
  }
  return def;
}

/** Legge gli step di arrotondamento dal config del modulo kantiere del tenant. */
export async function leggiArrotondamenti(
  supabase: Supa,
  tenantId: string,
): Promise<ArrotondamentiKantiere> {
  const { data } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('module_code', 'kantiere')
    .maybeSingle();
  const config = (data as { config: Record<string, unknown> | null } | null)?.config ?? {};
  return {
    viaggioMin: toInt(config['arrotondamento_viaggio_min'], 5),
    oreMin: toInt(config['arrotondamento_ore_min'], 0),
  };
}

/**
 * Soglia (ore) oltre cui, in chiusura turno SENZA pausa timbrata, l'app propone
 * di dichiarare la pausa pranzo. Identica per QR e tasto in-app. Default 5h
 * (`SOGLIA_PAUSA_PRANZO_ORE`), configurabile dalle Impostazioni Kantiere.
 */
export async function leggiSogliaPausaPranzoOre(
  supabase: Supa,
  tenantId: string,
): Promise<number> {
  const { data } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('module_code', 'kantiere')
    .maybeSingle();
  const config = (data as { config: Record<string, unknown> | null } | null)?.config ?? {};
  const n = toInt(config['soglia_pausa_pranzo_ore'], 5);
  return n >= 1 ? n : 5;
}

export type PolicyRapportini = {
  /** Auto-approvazione delle giornate "pulite" (turno chiuso, entro soglia). Default true. */
  autoApprova: boolean;
  /** Soglia ore lavorate (pause escluse) oltre cui la giornata è anomalia "da verificare". Default 10. */
  sogliaAnomaliaTurnoOre: number;
};

/**
 * Policy di approvazione rapportini del tenant. Le timbrature sono le ore
 * effettive: le giornate complete entro soglia si auto-approvano; quelle oltre
 * soglia (o aperte) restano "da verificare" per l'ufficio.
 */
export async function leggiPolicyRapportini(
  supabase: Supa,
  tenantId: string,
): Promise<PolicyRapportini> {
  const { data } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('module_code', 'kantiere')
    .maybeSingle();
  const config = (data as { config: Record<string, unknown> | null } | null)?.config ?? {};
  const auto = config['auto_approva_rapportini'];
  return {
    autoApprova: auto === false ? false : true, // default true
    sogliaAnomaliaTurnoOre: toInt(config['anomalia_turno_ore_max'], 10) || 10,
  };
}
