/**
 * Le quote delle ore di una giornata: ordinarie, straordinarie, viaggio.
 *
 * **Si registrano i dati puri, le quote si derivano.** Di ogni giornata si
 * salvano i minuti di lavoro e i minuti di viaggio per cantiere, così come sono
 * stati timbrati o dichiarati: 10 ore di lavoro sono 10 ore, non 8 + 2. Le quote
 * si ricavano da questi numeri con la regola del tenant, qui, in un posto solo.
 *
 * Prima non era così e le modalità divergevano: le giornate timbrate si
 * salvavano già divise (8 ordinarie + 2 straordinarie), quelle scritte a mano
 * mettevano tutto nelle ordinarie anche oltre le 8 ore (29 giornate FPM su 66 al
 * 14/09/2026).
 *
 * Regola (decisa con il cliente il 14/09/2026), per giornata, con S = orario
 * ordinario giornaliero delle impostazioni (default 8 ore):
 *
 * | Quota | Valore |
 * |---|---|
 * | ordinarie di lavoro | lavoro fino a S |
 * | straordinarie | lavoro oltre S |
 * | viaggio ordinario | viaggio che entra nelle S ore rimaste dopo il lavoro |
 * | viaggio eccedente | il viaggio che non ci entra |
 *
 * Quindi le ore ordinarie della giornata sono `min(lavoro + viaggio, S)`.
 * Esempi: 7 + 2 di viaggio → 8 ordinarie (7 lavoro + 1 viaggio) e 1 di viaggio
 * eccedente; 10 + 2 → 8 ordinarie, 2 straordinarie, 2 di viaggio eccedente.
 *
 * Il viaggio comprende andata, ritorno e i trasferimenti fra cantieri. Sabato e
 * festivi si registrano allo stesso modo: le maggiorazioni le applicano le
 * regole dei costi. Pura e deterministica.
 */

export const ORARIO_ORDINARIO_DEFAULT_MIN = 8 * 60;

/** I minuti puri di una riga della giornata (un cantiere). */
export interface RigaMinuti {
  chiave: string;
  minutiLavoro: number;
  minutiViaggio: number;
}

export interface QuoteRiga extends RigaMinuti {
  /** Lavoro dentro l'orario ordinario. */
  minutiOrdinari: number;
  /** Lavoro oltre l'orario ordinario. */
  minutiStraordinari: number;
  /** Viaggio che entra nell'orario ordinario rimasto dopo il lavoro. */
  minutiViaggioOrdinari: number;
  /** Viaggio oltre l'orario ordinario. */
  minutiViaggioEccedenti: number;
}

export interface TotaliQuote {
  minutiLavoro: number;
  minutiViaggio: number;
  minutiOrdinari: number;
  minutiStraordinari: number;
  minutiViaggioOrdinari: number;
  minutiViaggioEccedenti: number;
}

/** Orario ordinario valido: un numero di minuti fra 1 e 24 ore, altrimenti il default. */
export function orarioOrdinarioValido(minuti: number | null | undefined): number {
  const m = Math.round(Number(minuti));
  return Number.isFinite(m) && m > 0 && m <= 24 * 60 ? m : ORARIO_ORDINARIO_DEFAULT_MIN;
}

const pulito = (n: number) => Math.max(0, Math.round(Number(n) || 0));

/**
 * Le quote di una giornata. Il lavoro consuma l'orario ordinario per primo, riga
 * per riga nell'ordine dato; il viaggio usa quello che resta, sempre riga per
 * riga. Così le quote di ogni cantiere sommano esattamente ai totali.
 */
export function quoteGiornata(
  righe: readonly RigaMinuti[],
  orarioOrdinarioMin: number,
): { righe: QuoteRiga[]; totali: TotaliQuote } {
  let restante = orarioOrdinarioValido(orarioOrdinarioMin);

  const conLavoro = righe.map((r) => {
    const minutiLavoro = pulito(r.minutiLavoro);
    const minutiViaggio = pulito(r.minutiViaggio);
    const minutiOrdinari = Math.min(restante, minutiLavoro);
    restante -= minutiOrdinari;
    return {
      chiave: r.chiave,
      minutiLavoro,
      minutiViaggio,
      minutiOrdinari,
      minutiStraordinari: minutiLavoro - minutiOrdinari,
    };
  });

  const out: QuoteRiga[] = conLavoro.map((r) => {
    const minutiViaggioOrdinari = Math.min(restante, r.minutiViaggio);
    restante -= minutiViaggioOrdinari;
    return {
      ...r,
      minutiViaggioOrdinari,
      minutiViaggioEccedenti: r.minutiViaggio - minutiViaggioOrdinari,
    };
  });

  const totali = out.reduce<TotaliQuote>(
    (a, r) => ({
      minutiLavoro: a.minutiLavoro + r.minutiLavoro,
      minutiViaggio: a.minutiViaggio + r.minutiViaggio,
      minutiOrdinari: a.minutiOrdinari + r.minutiOrdinari,
      minutiStraordinari: a.minutiStraordinari + r.minutiStraordinari,
      minutiViaggioOrdinari: a.minutiViaggioOrdinari + r.minutiViaggioOrdinari,
      minutiViaggioEccedenti: a.minutiViaggioEccedenti + r.minutiViaggioEccedenti,
    }),
    {
      minutiLavoro: 0,
      minutiViaggio: 0,
      minutiOrdinari: 0,
      minutiStraordinari: 0,
      minutiViaggioOrdinari: 0,
      minutiViaggioEccedenti: 0,
    },
  );
  return { righe: out, totali };
}

/** Ore decimali a 2 cifre per le colonne `ore_*` (numeric 4,2). */
export function oreDaMinuti(minuti: number): number {
  return Math.round((pulito(minuti) / 60) * 100) / 100;
}

/**
 * Una riga del rapportino come si legge dal database, vecchia o nuova.
 * Le righe scritte prima del 14/09/2026 non hanno i minuti puri né le quote di
 * viaggio: il loro viaggio era tutto «a parte».
 */
export interface RigaRapportinoLetta {
  minuti_lavoro?: number | null;
  minuti_viaggio?: number | null;
  ore_ordinarie?: number | string | null;
  ore_straordinarie?: number | string | null;
  ore_viaggio?: number | string | null;
  ore_viaggio_ordinarie?: number | string | null;
  ore_viaggio_eccedenti?: number | string | null;
}

/**
 * Una riga ha le quote della regola nuova se ha le quote di viaggio: si scrivono
 * sempre insieme ai minuti puri. Le righe vecchie hanno i minuti puri riempiti
 * dalla migrazione, ma non le quote di viaggio.
 */
export function rigaConQuoteNuove(r: RigaRapportinoLetta): boolean {
  return r.ore_viaggio_ordinarie != null || r.ore_viaggio_eccedenti != null;
}

/**
 * Le quote di una riga letta dal database, in minuti, qualunque sia l'epoca.
 *
 * - Riga nuova: lavoro e viaggio sono i minuti puri, le quote quelle scritte al
 *   salvataggio con la regola del tenant.
 * - Riga vecchia: ordinarie e straordinarie come salvate, e tutto il viaggio
 *   resta eccedente (a parte), com'era. Le giornate vecchie non si ricalcolano:
 *   scelta del cliente.
 */
export function quoteDaRiga(r: RigaRapportinoLetta): TotaliQuote {
  const min = (h: number | string | null | undefined) => Math.round((Number(h) || 0) * 60);
  const ordinari = min(r.ore_ordinarie);
  const straordinari = min(r.ore_straordinarie);
  if (rigaConQuoteNuove(r)) {
    return {
      minutiLavoro: r.minuti_lavoro != null ? pulito(r.minuti_lavoro) : ordinari + straordinari,
      minutiViaggio: r.minuti_viaggio != null ? pulito(r.minuti_viaggio) : min(r.ore_viaggio),
      minutiOrdinari: ordinari,
      minutiStraordinari: straordinari,
      minutiViaggioOrdinari: min(r.ore_viaggio_ordinarie),
      minutiViaggioEccedenti: min(r.ore_viaggio_eccedenti),
    };
  }
  const viaggio = r.minuti_viaggio != null ? pulito(r.minuti_viaggio) : min(r.ore_viaggio);
  return {
    minutiLavoro: r.minuti_lavoro != null ? pulito(r.minuti_lavoro) : ordinari + straordinari,
    minutiViaggio: viaggio,
    minutiOrdinari: ordinari,
    minutiStraordinari: straordinari,
    minutiViaggioOrdinari: 0,
    minutiViaggioEccedenti: viaggio,
  };
}

/** Somma di più righe lette (una giornata, un periodo). */
export function sommaQuote(righe: readonly RigaRapportinoLetta[]): TotaliQuote {
  return righe.map(quoteDaRiga).reduce<TotaliQuote>(
    (a, q) => ({
      minutiLavoro: a.minutiLavoro + q.minutiLavoro,
      minutiViaggio: a.minutiViaggio + q.minutiViaggio,
      minutiOrdinari: a.minutiOrdinari + q.minutiOrdinari,
      minutiStraordinari: a.minutiStraordinari + q.minutiStraordinari,
      minutiViaggioOrdinari: a.minutiViaggioOrdinari + q.minutiViaggioOrdinari,
      minutiViaggioEccedenti: a.minutiViaggioEccedenti + q.minutiViaggioEccedenti,
    }),
    {
      minutiLavoro: 0,
      minutiViaggio: 0,
      minutiOrdinari: 0,
      minutiStraordinari: 0,
      minutiViaggioOrdinari: 0,
      minutiViaggioEccedenti: 0,
    },
  );
}

// ── Dai timbri ai minuti puri ────────────────────────────────────────────────

export interface TimbraturaMinuti {
  id: string;
  tipo: 'ingresso' | 'uscita';
  ms: number;
  /** Chiave del target (`cantiere:<id>` / `commessa:<id>`); null = senza target. */
  chiave: string | null;
}

export interface TrattaMinuti {
  minuti: number;
  /** Timbratura a cui è legata (andata → ingresso, ritorno → uscita). */
  timbraturaId: string | null;
  /** Target a cui si attribuisce il viaggio (per le tratte non legate). */
  chiave: string | null;
  /** Trasferimento: target di partenza. */
  daChiave: string | null;
}

/**
 * Minuti puri di lavoro e di viaggio per target, da timbrature e tratte.
 *
 * Il lavoro è il tempo fra un ingresso e la sua uscita. Il viaggio è la somma
 * delle tratte, attribuita al target della timbratura a cui la tratta è legata
 * o, se non è legata, al cantiere di destinazione.
 *
 * **Un viaggio fatto dentro l'orario non è lavoro.** Fra un cantiere e l'altro
 * la strada occupa prima il buco fra uscita e ingresso (pausa compresa); quello
 * che il buco non copre si toglie dal lavoro accanto: dal cantiere di arrivo per
 * un trasferimento o un'andata, da quello di partenza per un ritorno. Così con
 * il cambio cantiere dal vivo (uscita e ingresso nello stesso istante) la strada
 * non si conta due volte, e con i buchi lasciati da «Registra giornata» non si
 * toglie niente. L'andata prima del primo ingresso e il ritorno dopo l'ultima
 * uscita stanno fuori dall'orario e non toccano il lavoro.
 */
export function minutiDaTimbrature(
  timbrature: readonly TimbraturaMinuti[],
  tratte: readonly TrattaMinuti[],
): Map<string, { minutiLavoro: number; minutiViaggio: number }> {
  const ordinate = [...timbrature].sort(
    (a, b) => a.ms - b.ms || (a.tipo === b.tipo ? 0 : a.tipo === 'uscita' ? -1 : 1),
  );

  // Segmenti chiusi ingresso → uscita per target, in ordine di inizio.
  type Segmento = { chiave: string; inizio: number; fine: number; ingressoId: string; uscitaId: string; resto: number };
  const aperti = new Map<string, TimbraturaMinuti>();
  const segmenti: Segmento[] = [];
  for (const t of ordinate) {
    if (!t.chiave) continue;
    if (t.tipo === 'ingresso') {
      aperti.set(t.chiave, t);
    } else {
      const ing = aperti.get(t.chiave);
      if (!ing) continue; // uscita orfana
      aperti.delete(t.chiave);
      const minuti = Math.max(0, (t.ms - ing.ms) / 60000);
      segmenti.push({ chiave: t.chiave, inizio: ing.ms, fine: t.ms, ingressoId: ing.id, uscitaId: t.id, resto: minuti });
    }
  }
  segmenti.sort((a, b) => a.inizio - b.inizio);

  const out = new Map<string, { minutiLavoro: number; minutiViaggio: number }>();
  const voce = (k: string) => {
    let v = out.get(k);
    if (!v) out.set(k, (v = { minutiLavoro: 0, minutiViaggio: 0 }));
    return v;
  };
  const chiavePerId = new Map(ordinate.map((t) => [t.id, t.chiave]));

  // Ogni tratta: a chi va il viaggio, e a quale cambio fra segmenti appartiene.
  type Collocata = { minuti: number; confine: number; erodeArrivo: boolean };
  const perConfine = new Map<number, Collocata[]>();
  const confiniTrasferimento = new Set<number>();
  for (const tr of tratte) {
    const minuti = Math.max(0, Number(tr.minuti) || 0);
    const chiave = tr.timbraturaId ? (chiavePerId.get(tr.timbraturaId) ?? tr.chiave) : tr.chiave;
    if (chiave) voce(chiave).minutiViaggio += minuti;
    if (minuti <= 0) continue;

    let confine = -1;
    let erodeArrivo = true;
    if (tr.timbraturaId) {
      const iUscita = segmenti.findIndex((s) => s.uscitaId === tr.timbraturaId);
      const iIngresso = segmenti.findIndex((s) => s.ingressoId === tr.timbraturaId);
      if (iUscita >= 0 && iUscita < segmenti.length - 1) {
        confine = iUscita;
        erodeArrivo = false;
      } else if (iIngresso > 0) {
        confine = iIngresso - 1;
      }
    } else if (tr.daChiave && tr.chiave) {
      for (let b = 0; b < segmenti.length - 1; b++) {
        if (confiniTrasferimento.has(b)) continue;
        if (segmenti[b]!.chiave === tr.daChiave && segmenti[b + 1]!.chiave === tr.chiave) {
          confine = b;
          confiniTrasferimento.add(b);
          break;
        }
      }
    }
    if (confine < 0) continue;
    const lista = perConfine.get(confine) ?? [];
    lista.push({ minuti, confine, erodeArrivo });
    perConfine.set(confine, lista);
  }

  for (const [b, lista] of perConfine) {
    const prima = segmenti[b]!;
    const dopo = segmenti[b + 1]!;
    let buco = Math.max(0, (dopo.inizio - prima.fine) / 60000);
    for (const c of lista) {
      const coperto = Math.min(buco, c.minuti);
      buco -= coperto;
      let eccesso = c.minuti - coperto;
      const ordine = c.erodeArrivo ? [dopo, prima] : [prima, dopo];
      for (const s of ordine) {
        if (eccesso <= 0) break;
        const tolto = Math.min(s.resto, eccesso);
        s.resto -= tolto;
        eccesso -= tolto;
      }
    }
  }

  for (const s of segmenti) voce(s.chiave).minutiLavoro += s.resto;
  for (const v of out.values()) {
    v.minutiLavoro = Math.round(v.minutiLavoro);
    v.minutiViaggio = Math.round(v.minutiViaggio);
  }
  return out;
}

// ── In ore, per chi mostra ed esporta ────────────────────────────────────────

/** Le quote di una riga in ore decimali (2 cifre), con i nomi che si mostrano. */
export interface QuoteOre {
  /** Lavoro totale (puro). */
  lavoro: number;
  /** Viaggio totale (puro). */
  viaggio: number;
  /** Ore ordinarie della giornata: lavoro e viaggio entro l'orario ordinario. */
  ordinarie: number;
  /** Di cui lavoro. */
  lavoroOrdinario: number;
  /** Di cui viaggio. */
  viaggioOrdinario: number;
  /** Lavoro oltre l'orario ordinario. */
  straordinarie: number;
  /** Viaggio oltre l'orario ordinario. */
  viaggioEccedente: number;
}

export function quoteOre(q: TotaliQuote): QuoteOre {
  return {
    lavoro: oreDaMinuti(q.minutiLavoro),
    viaggio: oreDaMinuti(q.minutiViaggio),
    ordinarie: oreDaMinuti(q.minutiOrdinari + q.minutiViaggioOrdinari),
    lavoroOrdinario: oreDaMinuti(q.minutiOrdinari),
    viaggioOrdinario: oreDaMinuti(q.minutiViaggioOrdinari),
    straordinarie: oreDaMinuti(q.minutiStraordinari),
    viaggioEccedente: oreDaMinuti(q.minutiViaggioEccedenti),
  };
}

/** Le colonne da leggere su `rapportino_righe` per ricavare le quote. */
export const COLONNE_QUOTE =
  'minuti_lavoro, minuti_viaggio, ore_ordinarie, ore_straordinarie, ore_viaggio, ore_viaggio_ordinarie, ore_viaggio_eccedenti';
