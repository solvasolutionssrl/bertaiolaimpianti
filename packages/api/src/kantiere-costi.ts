// =====================================================================
// kantiere-costi.ts — logica PURA (no I/O, no Supabase) per le regole di
// maggiorazione ore e il calcolo dei costi del modulo Kantiere (Fase I/A).
//
// Specchio stilistico di kantiere-ore.ts / kantiere-report.ts: funzioni
// pure, Map per gli aggregati, arrotondamento a 2 decimali.
// =====================================================================

/** Le 7 classi di regola supportate (allineate al CHECK SQL). */
export type TipoRegola =
  | 'soglia_giornaliera'
  | 'maggiorazione_straordinario'
  | 'maggiorazione_viaggio'
  | 'notturno'
  | 'festivo'
  | 'weekend'
  | 'personalizzata';

/** Dimensione di applicazione di una regola (scope). */
export type TipoTarget = 'tenant' | 'dipendente' | 'cantiere';

export type RegolaOre = {
  id: string;
  nome: string;
  tipo: TipoRegola;
  attiva: boolean;
  /** parametri liberi (es. soglia ore, fascia notturna inizio/fine). */
  params: Record<string, unknown>;
  /** percentuale di maggiorazione applicata (es. 25 = +25%). */
  maggiorazione_pct: number;
  /** priorità: più alto vince a parità di dimensione (default 100). */
  priorita: number;
};

export type RegolaAmbito = {
  regola_id: string;
  tipo_target: TipoTarget;
  /** null quando tipo_target='tenant' (vale per tutti). */
  target_id: string | null;
};

/** Una riga di costo (output del calcolo per una giornata/target). */
export type RigaCosto = {
  chiaveDipendente: string;
  chiaveCommessa: string;
  ore_ordinarie: number;
  ore_straordinarie: number;
  ore_viaggio: number;
  ore_weekend: number;
  ore_festivo: number;
  /** ore pesate (× moltiplicatore di maggiorazione) — comparabili a parità di €. */
  ore_pesate: number;
  /** costo in € della giornata; null se costo orario non noto. */
  costo_totale: number | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------
// risolviRegoleEffettive
// ---------------------------------------------------------------------

/**
 * Dato l'insieme delle regole + i loro ambiti e il contesto (dipendente,
 * cantiere), restituisce la regola EFFETTIVA per ciascun `tipo`.
 *
 * Dedup per dimensione con priorità di scope: dipendente > cantiere > tenant.
 * A parità di scope vince la `priorita` più alta; ulteriore tie-break sul
 * `maggiorazione_pct` più alto, poi sull'id (stabile).
 *
 * Le regole non attive sono ignorate. Gli ambiti non pertinenti al contesto
 * (es. regola riservata a un altro dipendente) vengono scartati.
 */
export function risolviRegoleEffettive(
  regole: RegolaOre[],
  ambiti: RegolaAmbito[],
  ctx: { dipendenteId?: string | null; cantiereId?: string | null },
): Map<TipoRegola, RegolaOre> {
  const ambitiPerRegola = new Map<string, RegolaAmbito[]>();
  for (const a of ambiti) {
    const arr = ambitiPerRegola.get(a.regola_id) ?? [];
    arr.push(a);
    ambitiPerRegola.set(a.regola_id, arr);
  }

  // Rank dello scope: più alto = più specifico (vince).
  const scopeRank = (s: TipoTarget): number =>
    s === 'dipendente' ? 3 : s === 'cantiere' ? 2 : 1;

  // Per ciascuna regola, lo scope più specifico che combacia col contesto.
  type Candidato = { regola: RegolaOre; rank: number };
  const candidatiPerTipo = new Map<TipoRegola, Candidato>();

  for (const regola of regole) {
    if (!regola.attiva) continue;

    const ambitiRegola = ambitiPerRegola.get(regola.id) ?? [];
    // Regola senza ambiti espliciti = tenant-wide (vale per tutti).
    const effettivi: RegolaAmbito[] =
      ambitiRegola.length > 0
        ? ambitiRegola
        : [{ regola_id: regola.id, tipo_target: 'tenant', target_id: null }];

    let migliorRank = 0;
    for (const a of effettivi) {
      let combacia = false;
      if (a.tipo_target === 'tenant') {
        combacia = true;
      } else if (a.tipo_target === 'dipendente') {
        combacia = !!ctx.dipendenteId && a.target_id === ctx.dipendenteId;
      } else if (a.tipo_target === 'cantiere') {
        combacia = !!ctx.cantiereId && a.target_id === ctx.cantiereId;
      }
      if (combacia) {
        const r = scopeRank(a.tipo_target);
        if (r > migliorRank) migliorRank = r;
      }
    }
    if (migliorRank === 0) continue; // nessun ambito pertinente

    const corrente = candidatiPerTipo.get(regola.tipo);
    if (!corrente || vince({ regola, rank: migliorRank }, corrente)) {
      candidatiPerTipo.set(regola.tipo, { regola, rank: migliorRank });
    }
  }

  const out = new Map<TipoRegola, RegolaOre>();
  for (const [tipo, c] of candidatiPerTipo) out.set(tipo, c.regola);
  return out;

  function vince(a: { regola: RegolaOre; rank: number }, b: { regola: RegolaOre; rank: number }): boolean {
    if (a.rank !== b.rank) return a.rank > b.rank;
    if (a.regola.priorita !== b.regola.priorita) return a.regola.priorita > b.regola.priorita;
    if (a.regola.maggiorazione_pct !== b.regola.maggiorazione_pct)
      return a.regola.maggiorazione_pct > b.regola.maggiorazione_pct;
    return a.regola.id > b.regola.id;
  }
}

// ---------------------------------------------------------------------
// calcolaCostoGiornata
// ---------------------------------------------------------------------

/** Percentuale di maggiorazione effettiva per una classe di ore. */
function pctPerTipo(regole: Map<TipoRegola, RegolaOre>, tipo: TipoRegola): number {
  const r = regole.get(tipo);
  return r ? r.maggiorazione_pct : 0;
}

export type InputCostoGiornata = {
  chiaveDipendente: string;
  chiaveCommessa: string;
  ore_ordinarie: number;
  ore_straordinarie: number;
  ore_viaggio: number;
  /** ore in giorno di weekend (sabato/domenica). */
  ore_weekend?: number;
  /** ore in giorno festivo. */
  ore_festivo?: number;
  /** costo orario base del dipendente; null/undefined → costo_totale null. */
  costoOrario: number | null;
  /** regole effettive risolte per questo contesto. */
  regole: Map<TipoRegola, RegolaOre>;
};

/**
 * Calcola le ore pesate e il costo € di una giornata.
 *
 * Le ore ordinarie sono al moltiplicatore 1. Le altre classi applicano la
 * maggiorazione della regola corrispondente:
 *   straordinarie → maggiorazione_straordinario
 *   viaggio       → maggiorazione_viaggio
 *   weekend       → weekend
 *   festivo       → festivo
 *
 * costo_totale = Σ ore × costoOrario × (1 + pct/100).
 * Se `costoOrario` è null, `costo_totale` è null (le ore pesate restano).
 *
 * NB: il tipo regola `notturno` è PREDISPOSTO ma la classificazione
 * automatica delle ore notturne (split per fascia 22:00–06:00) è FUORI
 * SCOPO in questa fase: questo calcolo NON deriva ore notturne dalle
 * timbrature. Se a monte vengono passate ore già classificate come
 * notturne, andranno aggiunte qui esplicitamente in un'evoluzione futura.
 */
export function calcolaCostoGiornata(input: InputCostoGiornata): RigaCosto {
  const ore_ordinarie = input.ore_ordinarie ?? 0;
  const ore_straordinarie = input.ore_straordinarie ?? 0;
  const ore_viaggio = input.ore_viaggio ?? 0;
  const ore_weekend = input.ore_weekend ?? 0;
  const ore_festivo = input.ore_festivo ?? 0;

  const pctStraord = pctPerTipo(input.regole, 'maggiorazione_straordinario');
  const pctViaggio = pctPerTipo(input.regole, 'maggiorazione_viaggio');
  const pctWeekend = pctPerTipo(input.regole, 'weekend');
  const pctFestivo = pctPerTipo(input.regole, 'festivo');

  const multStraord = 1 + pctStraord / 100;
  const multViaggio = 1 + pctViaggio / 100;
  const multWeekend = 1 + pctWeekend / 100;
  const multFestivo = 1 + pctFestivo / 100;

  const ore_pesate = round2(
    ore_ordinarie +
      ore_straordinarie * multStraord +
      ore_viaggio * multViaggio +
      ore_weekend * multWeekend +
      ore_festivo * multFestivo,
  );

  let costo_totale: number | null = null;
  if (input.costoOrario != null) {
    costo_totale = round2(ore_pesate * input.costoOrario);
  }

  return {
    chiaveDipendente: input.chiaveDipendente,
    chiaveCommessa: input.chiaveCommessa,
    ore_ordinarie: round2(ore_ordinarie),
    ore_straordinarie: round2(ore_straordinarie),
    ore_viaggio: round2(ore_viaggio),
    ore_weekend: round2(ore_weekend),
    ore_festivo: round2(ore_festivo),
    ore_pesate,
    costo_totale,
  };
}

// ---------------------------------------------------------------------
// aggregaCosti
// ---------------------------------------------------------------------

export type AggregatoCosto = {
  ore_ordinarie: number;
  ore_straordinarie: number;
  ore_viaggio: number;
  ore_weekend: number;
  ore_festivo: number;
  ore_pesate: number;
  /** somma dei costi; null se NESSUNA riga aveva un costo (tutte null). */
  costo_totale: number | null;
};

/**
 * Aggrega le righe di costo per dipendente o per commessa/cantiere.
 *
 * Il costo è sommato solo quando presente: se almeno una riga ha un costo,
 * l'aggregato lo riporta; se nessuna riga del gruppo ha costo, resta null.
 */
export function aggregaCosti(
  righe: RigaCosto[],
  per: 'dipendente' | 'commessa',
): Map<string, AggregatoCosto> {
  const out = new Map<string, AggregatoCosto>();
  for (const r of righe) {
    const chiave = per === 'dipendente' ? r.chiaveDipendente : r.chiaveCommessa;
    const cur =
      out.get(chiave) ??
      ({
        ore_ordinarie: 0,
        ore_straordinarie: 0,
        ore_viaggio: 0,
        ore_weekend: 0,
        ore_festivo: 0,
        ore_pesate: 0,
        costo_totale: null,
      } as AggregatoCosto);
    cur.ore_ordinarie = round2(cur.ore_ordinarie + r.ore_ordinarie);
    cur.ore_straordinarie = round2(cur.ore_straordinarie + r.ore_straordinarie);
    cur.ore_viaggio = round2(cur.ore_viaggio + r.ore_viaggio);
    cur.ore_weekend = round2(cur.ore_weekend + r.ore_weekend);
    cur.ore_festivo = round2(cur.ore_festivo + r.ore_festivo);
    cur.ore_pesate = round2(cur.ore_pesate + r.ore_pesate);
    if (r.costo_totale != null) {
      cur.costo_totale = round2((cur.costo_totale ?? 0) + r.costo_totale);
    }
    out.set(chiave, cur);
  }
  return out;
}

// ---------------------------------------------------------------------
// festivitaItaliane
// ---------------------------------------------------------------------

/** Pasqua (domenica) per l'anno dato — algoritmo di Gauss/Meeus (calendario gregoriano). */
export function calcolaPasqua(anno: number): { mese: number; giorno: number } {
  const a = anno % 19;
  const b = Math.floor(anno / 100);
  const c = anno % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31); // 3=marzo, 4=aprile
  const giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return { mese, giorno };
}

function iso(anno: number, mese1: number, giorno: number): string {
  const mm = String(mese1).padStart(2, '0');
  const dd = String(giorno).padStart(2, '0');
  return `${anno}-${mm}-${dd}`;
}

/**
 * Festività nazionali italiane per l'anno dato, come Set di stringhe
 * `YYYY-MM-DD`. Include le fisse nazionali + Pasqua e Lunedì dell'Angelo
 * (Pasquetta) calcolate via algoritmo di Gauss/Meeus.
 *
 * NON include i patroni locali (es. Sant'Ambrogio a Milano), che sono
 * specifici per comune e fuori scope.
 */
export function festivitaItaliane(anno: number): Set<string> {
  const out = new Set<string>();
  // Fisse nazionali
  out.add(iso(anno, 1, 1)); // Capodanno
  out.add(iso(anno, 1, 6)); // Epifania
  out.add(iso(anno, 4, 25)); // Liberazione
  out.add(iso(anno, 5, 1)); // Festa dei lavoratori
  out.add(iso(anno, 6, 2)); // Festa della Repubblica
  out.add(iso(anno, 8, 15)); // Ferragosto
  out.add(iso(anno, 11, 1)); // Tutti i Santi
  out.add(iso(anno, 12, 8)); // Immacolata
  out.add(iso(anno, 12, 25)); // Natale
  out.add(iso(anno, 12, 26)); // Santo Stefano

  // Mobili: Pasqua + Pasquetta (lunedì successivo)
  const pasqua = calcolaPasqua(anno);
  const pasquaDate = new Date(Date.UTC(anno, pasqua.mese - 1, pasqua.giorno));
  out.add(iso(anno, pasqua.mese, pasqua.giorno));
  const pasquetta = new Date(pasquaDate);
  pasquetta.setUTCDate(pasquetta.getUTCDate() + 1);
  out.add(
    iso(pasquetta.getUTCFullYear(), pasquetta.getUTCMonth() + 1, pasquetta.getUTCDate()),
  );

  return out;
}

/** True se la data `YYYY-MM-DD` è festività nazionale italiana. */
export function eFestivo(giornoISO: string): boolean {
  const anno = Number(giornoISO.slice(0, 4));
  if (!Number.isFinite(anno)) return false;
  return festivitaItaliane(anno).has(giornoISO);
}

/** True se la data `YYYY-MM-DD` cade di sabato o domenica. */
export function eWeekend(giornoISO: string): boolean {
  const d = new Date(`${giornoISO}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=domenica, 6=sabato
  return dow === 0 || dow === 6;
}
