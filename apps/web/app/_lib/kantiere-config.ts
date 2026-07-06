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

/**
 * Soglia (ore) oltre cui una pausa pranzo avviata e DIMENTICATA si auto-spegne:
 * il turno riprende in automatico (l'orologio riparte) e vengono scalati
 * esattamente `soglia` minuti. Distinta da `soglia_pausa_pranzo_ore` (5h, che
 * governa il PROMEMORIA a dichiarare la pausa in chiusura turno). Default 1.5h,
 * forzata >= 0.5h. Configurabile dalle Impostazioni Kantiere.
 */
export async function leggiSogliaAutoSpegnimentoPausa(
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
  const raw = config['soglia_auto_spegnimento_pausa_ore'];
  let n = 1.5;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) n = raw;
  else if (typeof raw === 'string') {
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed > 0) n = parsed;
  }
  return n >= 0.5 ? n : 0.5;
}

/**
 * Provider di routing scelto dal super admin per il tenant ('free' | 'google').
 * Default 'free'. La CHIAVE Google è unica di piattaforma (env), qui c'è solo la
 * scelta abilitato/no — non è un segreto, quindi sta in `tenant_modules.config`.
 */
export async function leggiRoutingProvider(
  supabase: Supa,
  tenantId: string,
): Promise<'free' | 'google'> {
  const { data } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('module_code', 'kantiere')
    .maybeSingle();
  const config = (data as { config: Record<string, unknown> | null } | null)?.config ?? {};
  return config['routing_provider'] === 'google' ? 'google' : 'free';
}

export type ImpostazioniTurno = {
  /** Tolleranza (min) sulla somma dello split di fine turno. Default 5. */
  tolleranzaChiusuraMin: number;
  /** Split "cosa hai fatto oggi" attivo. Default true. */
  splitAttivo: boolean;
  /** Km del tragitto sul cambio cantiere (switch). Default false (opt-in). */
  kmSwitchAttivo: boolean;
  /** Passo (min) dei +/- degli stepper ore (5/10/15/30). Default 15. */
  passoMinuti: number;
  /** I tecnici possono avviare un turno su QUALSIASI cantiere. Default true. */
  avvioLibero: boolean;
  /** Registrazione di una giornata senza timbrature (caso 4). Default true. */
  registraGiornataAttivo: boolean;
};

const PASSI_MINUTI = [5, 10, 15, 30];

/**
 * Impostazioni per il flusso turni (chiusura, split, km, stepper, avvio libero).
 * Gestite dall'ufficio (Impostazioni Kantiere). Una sola lettura del config.
 */
export async function leggiImpostazioniTurno(
  supabase: Supa,
  tenantId: string,
): Promise<ImpostazioniTurno> {
  const { data } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('module_code', 'kantiere')
    .maybeSingle();
  const config = (data as { config: Record<string, unknown> | null } | null)?.config ?? {};
  const passo = toInt(config['passo_minuti_stepper'], 15);
  return {
    tolleranzaChiusuraMin: Math.min(30, toInt(config['tolleranza_chiusura_min'], 5)),
    splitAttivo: config['split_fine_turno_attivo'] === false ? false : true,
    kmSwitchAttivo: config['km_switch_attivo'] === true,
    passoMinuti: PASSI_MINUTI.includes(passo) ? passo : 15,
    avvioLibero: config['avvio_turno_libero'] === false ? false : true,
    registraGiornataAttivo: config['registra_giornata_attivo'] === false ? false : true,
  };
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
