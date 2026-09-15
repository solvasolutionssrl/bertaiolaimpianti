import 'server-only';
import { formattaOreTotale } from '@kommessa/api/kantiere-ore';
import { orarioOrdinarioValido } from '@kommessa/api/kantiere-quote';

import { createServerSupabase } from '@kommessa/api/server';

type Supa = ReturnType<typeof createServerSupabase>;

// ── Impostazioni del modulo Kantiere ────────────────────────────────────────

/** I controlli della pagina Anomalie (config `anomalie`), tutti attivi se assenti. */
export interface AnomalieKantiere {
  incomplete: boolean;
  straordinari: boolean;
  senza_rapportino: boolean;
  modificato: boolean;
  festivo: boolean;
  weekend: boolean;
  ore_eccessive: boolean;
}

/**
 * Le impostazioni Kantiere di un tenant (`tenant_modules.config`), normalizzate.
 * Chiave assente o non valida = valore predefinito. Pagina Impostazioni, azioni
 * e calcoli leggono tutti da `impostazioniDaConfig`, quindi i predefiniti sono
 * gli stessi ovunque.
 */
export interface ImpostazioniKantiere {
  /** `soglia_ore_ordinarie` (ore): orario ordinario giornaliero, in minuti. Predefinito 480. */
  orarioOrdinarioMin: number;
  /** `quote_ore_dal`: giorno da cui il viaggio entra nell'orario ordinario; null = da sempre. */
  quoteOreDal: string | null;
  /** `arrotondamento_viaggio_min`: passo del tempo di viaggio. Predefinito 5. */
  arrotondamentoViaggioMin: number;
  /** `arrotondamento_ore_min`: passo delle ore di lavoro, 0 = al minuto. Predefinito 0. */
  arrotondamentoOreMin: number;
  /** `avvio_turno_libero`: turno avviabile su ogni cantiere. Predefinito sì. */
  avvioTurnoLibero: boolean;
  /** `split_fine_turno_attivo`: ripartizione delle ore alla chiusura. Predefinito sì. */
  splitFineTurnoAttivo: boolean;
  /** `registra_giornata_attivo`: giornata senza timbrature. Predefinito sì. */
  registraGiornataAttivo: boolean;
  /** `tolleranza_chiusura_min`: scarto ammesso nella ripartizione (0-30). Predefinito 5. */
  tolleranzaChiusuraMin: number;
  /** `passo_minuti_stepper`: passo dei tasti + e − (5/10/15/30). Predefinito 15. */
  passoMinutiStepper: number;
  /** `soglia_pausa_pranzo_ore`: durata del turno oltre cui si chiede la pausa. Predefinito 5. */
  sogliaPausaPranzoOre: number;
  /** `soglia_auto_spegnimento_pausa_ore`: chiusura automatica della pausa (≥ 0,5). Predefinito 1,5. */
  sogliaAutoSpegnimentoPausaOre: number;
  /** `km_solo_autista`: i km di una tratta condivisa vanno a chi guida. Predefinito sì. */
  kmSoloAutista: boolean;
  /** `sede_partenza_default`: indirizzo proposto ai cantieri nuovi. Predefinito vuoto. */
  sedePartenzaDefault: string;
  /** `routing_provider`: stime di viaggio, scelto dal super admin. Predefinito 'free'. */
  routingProvider: 'free' | 'google';
  /** `auto_approva_rapportini`: approvazione automatica delle giornate. Predefinito sì. */
  autoApprovaRapportini: boolean;
  /** `anomalia_turno_ore_max` (ore): soglia di verifica della giornata. Predefinito 10. */
  anomaliaTurnoOreMax: number;
  anomalie: AnomalieKantiere;
  /** `kontabilita_attiva`: spese di cantiere. Predefinito sì. */
  kontabilitaAttiva: boolean;
}

export const PASSI_MINUTI_STEPPER = [5, 10, 15, 30] as const;

function intero(v: unknown, def: number): number {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.round(v);
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    if (!isNaN(n) && n >= 0) return n;
  }
  return def;
}

function decimale(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function impostazioniDaConfig(config: Record<string, unknown>): ImpostazioniKantiere {
  const soglia = decimale(config['soglia_ore_ordinarie']);
  const dal = config['quote_ore_dal'];
  const passo = intero(config['passo_minuti_stepper'], 15);
  const pausa = intero(config['soglia_pausa_pranzo_ore'], 5);
  const autoPausa = decimale(config['soglia_auto_spegnimento_pausa_ore']);
  const verifica = decimale(config['anomalia_turno_ore_max']);
  const an =
    config['anomalie'] && typeof config['anomalie'] === 'object'
      ? (config['anomalie'] as Record<string, unknown>)
      : {};
  return {
    orarioOrdinarioMin: orarioOrdinarioValido(soglia != null ? Math.round(soglia * 60) : null),
    quoteOreDal: typeof dal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dal) ? dal : null,
    arrotondamentoViaggioMin: intero(config['arrotondamento_viaggio_min'], 5),
    arrotondamentoOreMin: intero(config['arrotondamento_ore_min'], 0),
    avvioTurnoLibero: config['avvio_turno_libero'] !== false,
    splitFineTurnoAttivo: config['split_fine_turno_attivo'] !== false,
    registraGiornataAttivo: config['registra_giornata_attivo'] !== false,
    tolleranzaChiusuraMin: Math.min(30, intero(config['tolleranza_chiusura_min'], 5)),
    passoMinutiStepper: (PASSI_MINUTI_STEPPER as readonly number[]).includes(passo) ? passo : 15,
    sogliaPausaPranzoOre: pausa >= 1 ? pausa : 5,
    sogliaAutoSpegnimentoPausaOre: autoPausa != null && autoPausa > 0 ? Math.max(0.5, autoPausa) : 1.5,
    kmSoloAutista: config['km_solo_autista'] !== false,
    sedePartenzaDefault: typeof config['sede_partenza_default'] === 'string' ? config['sede_partenza_default'] : '',
    routingProvider: config['routing_provider'] === 'google' ? 'google' : 'free',
    autoApprovaRapportini: config['auto_approva_rapportini'] !== false,
    // Con i decimali: 10,5 ore restano 10,5 (prima si arrotondava a 11).
    anomaliaTurnoOreMax: verifica != null && verifica > 0 ? verifica : 10,
    anomalie: {
      incomplete: an['incomplete'] !== false,
      straordinari: an['straordinari'] !== false,
      senza_rapportino: an['senza_rapportino'] !== false,
      modificato: an['modificato'] !== false,
      festivo: an['festivo'] !== false,
      weekend: an['weekend'] !== false,
      ore_eccessive: an['ore_eccessive'] !== false,
    },
    kontabilitaAttiva: config['kontabilita_attiva'] !== false,
  };
}

async function leggiConfig(supabase: Supa, tenantId: string): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('module_code', 'kantiere')
    .maybeSingle();
  return (data as { config: Record<string, unknown> | null } | null)?.config ?? {};
}

/** Tutte le impostazioni Kantiere del tenant, con i predefiniti. */
export async function leggiImpostazioniKantiere(supabase: Supa, tenantId: string): Promise<ImpostazioniKantiere> {
  return impostazioniDaConfig(await leggiConfig(supabase, tenantId));
}

// ── Letture parziali (stessi valori, per chi ne usa solo una parte) ─────────

export type ArrotondamentiKantiere = {
  /** Passo (min) del tempo di viaggio. */
  viaggioMin: number;
  /** Passo (min) delle ore di lavoro, 0 = al minuto. */
  oreMin: number;
};

export async function leggiArrotondamenti(supabase: Supa, tenantId: string): Promise<ArrotondamentiKantiere> {
  const imp = await leggiImpostazioniKantiere(supabase, tenantId);
  return { viaggioMin: imp.arrotondamentoViaggioMin, oreMin: imp.arrotondamentoOreMin };
}

export type RegolaQuote = {
  /** Orario ordinario giornaliero in minuti. */
  orarioOrdinarioMin: number;
  /**
   * Giorno (AAAA-MM-GG) da cui le quote si derivano con la regola del viaggio.
   * Le giornate precedenti restano come registrate anche se ricalcolate.
   * null = la regola vale da sempre (tenant nuovi).
   */
  quoteDal: string | null;
};

/** La regola con cui si derivano le quote dai minuti puri. Vedi `@kommessa/api/kantiere-quote`. */
export async function leggiRegolaQuote(supabase: Supa, tenantId: string): Promise<RegolaQuote> {
  const imp = await leggiImpostazioniKantiere(supabase, tenantId);
  return { orarioOrdinarioMin: imp.orarioOrdinarioMin, quoteDal: imp.quoteOreDal };
}

/** Durata del turno (ore) oltre cui, chiudendo senza pausa timbrata, si chiede la pausa. */
export async function leggiSogliaPausaPranzoOre(supabase: Supa, tenantId: string): Promise<number> {
  return (await leggiImpostazioniKantiere(supabase, tenantId)).sogliaPausaPranzoOre;
}

/** Durata (ore) oltre cui una pausa rimasta aperta si chiude e il turno riprende. */
export async function leggiSogliaAutoSpegnimentoPausa(supabase: Supa, tenantId: string): Promise<number> {
  return (await leggiImpostazioniKantiere(supabase, tenantId)).sogliaAutoSpegnimentoPausaOre;
}

/**
 * Provider delle stime di viaggio scelto dal super admin ('free' | 'google').
 * La chiave Google è di piattaforma (env): qui c'è solo la scelta.
 */
export async function leggiRoutingProvider(supabase: Supa, tenantId: string): Promise<'free' | 'google'> {
  return (await leggiImpostazioniKantiere(supabase, tenantId)).routingProvider;
}

/**
 * «I chilometri li accumula chi guida.» Su una tratta condivisa il tempo vale
 * per ciascuno, i chilometri sono quelli del mezzo: attribuirli anche ai
 * passeggeri li conterebbe più volte. La tratta resta registrata per intero;
 * l'impostazione decide solo a chi contano.
 */
export async function leggiKmSoloAutista(supabase: Supa, tenantId: string): Promise<boolean> {
  return (await leggiImpostazioniKantiere(supabase, tenantId)).kmSoloAutista;
}

export type ImpostazioniTurno = {
  tolleranzaChiusuraMin: number;
  splitAttivo: boolean;
  passoMinuti: number;
  avvioLibero: boolean;
  registraGiornataAttivo: boolean;
};

/** Impostazioni del flusso turni (avvio, chiusura, ripartizione, stepper). */
export async function leggiImpostazioniTurno(supabase: Supa, tenantId: string): Promise<ImpostazioniTurno> {
  const imp = await leggiImpostazioniKantiere(supabase, tenantId);
  return {
    tolleranzaChiusuraMin: imp.tolleranzaChiusuraMin,
    splitAttivo: imp.splitFineTurnoAttivo,
    passoMinuti: imp.passoMinutiStepper,
    avvioLibero: imp.avvioTurnoLibero,
    registraGiornataAttivo: imp.registraGiornataAttivo,
  };
}

export type PolicyRapportini = {
  /** Approvazione automatica delle giornate chiuse entro soglia. */
  autoApprova: boolean;
  /** Ore di lavoro (pause escluse) oltre cui la giornata resta da verificare. */
  sogliaAnomaliaTurnoOre: number;
};

/**
 * Le timbrature sono le ore effettive: le giornate chiuse entro soglia si
 * approvano da sole, quelle oltre soglia (o aperte) restano da verificare.
 */
export async function leggiPolicyRapportini(supabase: Supa, tenantId: string): Promise<PolicyRapportini> {
  const imp = await leggiImpostazioniKantiere(supabase, tenantId);
  return { autoApprova: imp.autoApprovaRapportini, sogliaAnomaliaTurnoOre: imp.anomaliaTurnoOreMax };
}

/** Solo la soglia oltre la quale una giornata non si approva da sola. */
export async function sogliaAnomaliaTurnoOre(supabase: Supa, tenantId: string): Promise<number> {
  return (await leggiPolicyRapportini(supabase, tenantId)).sogliaAnomaliaTurnoOre;
}

export interface GiornateOltreSoglia {
  giornate: number;
  /** Ore in attesa, già scritte come si legge un totale: "705 ore". */
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
      oreTotali: formattaOreTotale(minuti),
      chi,
    };
  } catch {
    return vuoto;
  }
}
