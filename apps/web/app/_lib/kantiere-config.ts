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

/**
 * Toggle per-tenant "conteggia i trasferimenti tra cantieri" (chiave storica
 * `km_switch_attivo`). I trasferimenti cantiere→cantiere (km + tempo stimato)
 * sono SEMPRE registrati e visibili al super admin; questo toggle governa solo
 * il CONTEGGIO lato tenant: se OFF, le aggregazioni km del tenant escludono le
 * tratte cantiere→cantiere (i numeri operativi del tenant non cambiano). Alla
 * futura attivazione entrerà anche il tempo di viaggio nel calcolo ore (logica
 * da definire col cliente). Default false (opt-in). FPM Impianti: OFF.
 */
export async function leggiTrasferimentiAttivi(supabase: Supa, tenantId: string): Promise<boolean> {
  const { data } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('module_code', 'kantiere')
    .maybeSingle();
  const config = (data as { config: Record<string, unknown> | null } | null)?.config ?? {};
  return config['km_switch_attivo'] === true;
}

/**
 * «I chilometri li accumula chi guida.»
 *
 * Su una tratta condivisa il **tempo** è di tutti — sono ore in cui nessuno dei
 * passeggeri poteva fare altro — ma i **chilometri** sono uno solo, quelli del
 * mezzo: attribuirli anche ai passeggeri li conterebbe tre volte per lo stesso
 * viaggio, e a fine mese il costo del cantiere risulterebbe il triplo del vero.
 *
 * La tratta resta comunque registrata per intero (distanza inclusa): questo
 * toggle decide solo **a chi contano**. Default `true`, che è la regola
 * normale; si spegne se un cliente rimborsa i km a testa.
 */
export async function leggiKmSoloAutista(supabase: Supa, tenantId: string): Promise<boolean> {
  const { data } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('module_code', 'kantiere')
    .maybeSingle();
  const config = (data as { config: Record<string, unknown> | null } | null)?.config ?? {};
  return config['km_solo_autista'] !== false;
}

export type ImpostazioniTurno = {
  /** Tolleranza (min) sulla somma dello split di fine turno. Default 5. */
  tolleranzaChiusuraMin: number;
  /** Split "cosa hai fatto oggi" attivo. Default true. */
  splitAttivo: boolean;
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

/** Solo la soglia oltre la quale una giornata non si approva da sola. */
export async function sogliaAnomaliaTurnoOre(
  supabase: Supa,
  tenantId: string,
): Promise<number> {
  return (await leggiPolicyRapportini(supabase, tenantId)).sogliaAnomaliaTurnoOre;
}

export interface GiornateOltreSoglia {
  giornate: number;
  /** Ore in attesa, già in formato leggibile: "134:06". */
  oreTotali: string;
  /** I nomi di chi le ha, per dare un appiglio: "Atanasoaie, Vanzo e altri 2". */
  chi: string;
}

/**
 * Le giornate rimaste «da verificare» perché superano la soglia.
 *
 * Sono lavoro vero, non dati sballati: giornate lunghe da trasferta che il
 * freno tiene ferme apposta. Il guaio è che se nessuno le guarda restano lì per
 * sempre, e quelle ore non arrivano da nessuna parte — per questo la dashboard
 * le mostra invece di lasciarle sedimentare in una pagina che nessuno apre.
 *
 * Fail-soft: se qualcosa non risponde, l'avviso semplicemente non compare.
 */
export async function giornateOltreSoglia(
  supabase: Supa,
  tenantId: string,
  sogliaOre: number,
  /** Oggi in formato AAAA-MM-GG (ora italiana). */
  oggiIso: string,
): Promise<GiornateOltreSoglia> {
  const vuoto: GiornateOltreSoglia = { giornate: 0, oreTotali: '0:00', chi: '' };
  try {
    const { data } = await supabase
      .from('rapportini' as never)
      .select(
        'id, data, dipendente_id, righe:rapportino_righe(ore_ordinarie, ore_straordinarie),' +
          ' dipendente:dipendenti(cognome)',
      )
      .eq('tenant_id', tenantId)
      .eq('stato', 'bozza')
      // Oggi no: un turno ancora in corso non "aspetta un controllo", aspetta
      // solo di finire. Segnalarlo sarebbe gridare al lupo.
      .lt('data', oggiIso);

    const righe = (data ?? []) as unknown as {
      id: string;
      data: string;
      dipendente_id: string;
      righe: { ore_ordinarie: number | null; ore_straordinarie: number | null }[] | null;
      dipendente: { cognome: string | null } | null;
    }[];

    const candidate = righe
      .map((r) => ({
        ...r,
        minuti: Math.round(
          (r.righe ?? []).reduce(
            (a, x) => a + Number(x.ore_ordinarie ?? 0) + Number(x.ore_straordinarie ?? 0),
            0,
          ) * 60,
        ),
      }))
      .filter((r) => r.minuti > sogliaOre * 60);

    if (candidate.length === 0) return vuoto;

    // Una giornata rimasta APERTA (qualcuno non ha timbrato l'uscita) è un
    // problema diverso, e ha la sua pagina: qui si contano solo quelle chiuse
    // che il freno delle ore tiene ferme.
    const date = [...new Set(candidate.map((r) => r.data))].sort();
    const { data: timbRaw } = await supabase
      .from('timbrature' as never)
      .select('dipendente_id, tipo, ts')
      .eq('tenant_id', tenantId)
      .gte('ts', `${date[0]}T00:00:00Z`);

    const bilancio = new Map<string, number>();
    for (const tb of (timbRaw ?? []) as unknown as {
      dipendente_id: string;
      tipo: string;
      ts: string;
    }[]) {
      const giorno = new Date(tb.ts).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
      const k = `${tb.dipendente_id}|${giorno}`;
      bilancio.set(k, (bilancio.get(k) ?? 0) + (tb.tipo === 'ingresso' ? 1 : -1));
    }

    const ferme = candidate.filter(
      (r) => (bilancio.get(`${r.dipendente_id}|${r.data}`) ?? 0) === 0,
    );
    if (ferme.length === 0) return vuoto;

    const minuti = ferme.reduce((a, r) => a + r.minuti, 0);
    const nomi = [...new Set(ferme.map((r) => r.dipendente?.cognome).filter(Boolean))] as string[];
    const chi =
      nomi.length <= 2
        ? nomi.join(' e ')
        : `${nomi.slice(0, 2).join(', ')} e altri ${nomi.length - 2}`;

    return {
      giornate: ferme.length,
      oreTotali: `${Math.floor(minuti / 60)}:${String(minuti % 60).padStart(2, '0')}`,
      chi,
    };
  } catch {
    return vuoto;
  }
}
