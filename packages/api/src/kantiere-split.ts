/**
 * Split "cosa hai fatto oggi" a fine turno — sintesi dei SEGMENTI timbrati.
 *
 * Quando un tecnico NON ha cambiato cantiere live ma dichiara alla chiusura di
 * aver lavorato su più cantieri, si "sintetizzano" le timbrature che il
 * ricalcolo (`ricomputaRapportinoAuto`) trasformerà nelle righe giuste. NON si
 * scrivono `rapportino_righe` (verrebbero sovrascritte): il conteggio ore deriva
 * SEMPRE dalle timbrature (`minutiPerCommessa` appaia ingresso→uscita per
 * cantiere e ignora il flag pausa: la pausa è un GAP fra un'uscita e l'ingresso
 * successivo).
 *
 * Modello: la giornata è [ingresso@T0 … uscita@T1]. Netto lavorato =
 * (T1-T0) - pausa. I `segmenti` dichiarano i minuti per cantiere (somma = netto;
 * l'ultima riga assorbe il resto). Si generano segmenti back-to-back; la pausa è
 * un gap (al confine più vicino al centro con ≥2 cantieri, oppure spezzando il
 * singolo segmento). Il primo ingresso è quello REALE già esistente (sul
 * cantiere del turno) → gli eventi restituiti lo ESCLUDONO.
 *
 * Pura e deterministica (nessun Date.now): unit-testata.
 */

export interface SegmentoSplit {
  cantiereId: string;
  minuti: number;
}

/**
 * Minuti di lavoro fra l'arrivo su un cantiere e la pausa, quando la pausa
 * cadrebbe sullo stesso cambio di una tratta (vedi `calcolaSegmentiSplit`).
 */
export const SCARTO_PAUSA_MIN = 30;

export interface CalcolaSplitInput {
  /** Inizio turno (ms epoch) = ingresso reale. */
  ingressoMs: number;
  /** Fine turno (ms epoch). */
  uscitaMs: number;
  /** Pausa da sottrarre in minuti (0 se nessuna). */
  pausaMin: number;
  /** Segmenti dichiarati; il primo è il cantiere del turno. Somma ≈ netto. */
  segmenti: SegmentoSplit[];
  /**
   * Minuti di viaggio PRIMA di ogni segmento (stesso indice di `segmenti`; il
   * primo si ignora): i trasferimenti fra cantieri. Diventano un buco fra
   * l'uscita dal cantiere precedente e l'ingresso nel successivo, così le ore
   * dichiarate restano lavoro puro e il viaggio non si conta due volte.
   * Assente = segmenti attaccati (split di fine turno, come prima).
   */
  viaggioPrima?: number[];
}

export interface EventoSplit {
  cantiereId: string;
  tipo: 'ingresso' | 'uscita';
  pausa: boolean;
  ms: number;
}

export type SplitError = 'NESSUN_SEGMENTO' | 'NETTO_NON_VALIDO' | 'SOMMA_NON_TORNA';

export type CalcolaSplitResult =
  | { ok: true; eventi: EventoSplit[]; nettoMin: number }
  | { ok: false; error: SplitError };

const MIN_MS = 60000;

/** Netto (minuti lavorati) di una giornata: (uscita - ingresso) - pausa. */
export function nettoMinuti(ingressoMs: number, uscitaMs: number, pausaMin: number): number {
  return Math.round((uscitaMs - ingressoMs) / MIN_MS) - Math.max(0, Math.round(pausaMin));
}

export function calcolaSegmentiSplit(input: CalcolaSplitInput): CalcolaSplitResult {
  const P = Math.max(0, Math.round(input.pausaMin));
  const netMin = nettoMinuti(input.ingressoMs, input.uscitaMs, P);
  if (netMin <= 0) return { ok: false, error: 'NETTO_NON_VALIDO' };
  if (input.segmenti.length === 0) return { ok: false, error: 'NESSUN_SEGMENTO' };

  // Interi ≥ 0, ordine preservato. Il viaggio prima di un segmento vale solo se
  // il segmento resta (a zero minuti non c'è un cantiere da raggiungere).
  const ultimo = input.segmenti.length - 1;
  let segs = input.segmenti.map((s, i) => ({
    cantiereId: s.cantiereId,
    minuti: Math.max(0, Math.round(s.minuti)),
    viaggioPrima: i === 0 ? 0 : Math.max(0, Math.round(input.viaggioPrima?.[i] ?? 0)),
  }));
  const viaggioTot = segs.reduce((a, s, i) => a + (s.minuti > 0 || i === ultimo ? s.viaggioPrima : 0), 0);
  const lavoroMin = netMin - viaggioTot;
  if (lavoroMin <= 0) return { ok: false, error: 'NETTO_NON_VALIDO' };

  // L'ULTIMA riga assorbe il resto → somma esatta = lavoro netto.
  const sommaRest = segs.slice(0, -1).reduce((a, s) => a + s.minuti, 0);
  if (sommaRest > lavoroMin) return { ok: false, error: 'SOMMA_NON_TORNA' };
  segs[ultimo] = { ...segs[ultimo]!, minuti: lavoroMin - sommaRest };
  // L'ultimo cantiere senza lavoro ma con un viaggio per raggiungerlo: i conti
  // non tornano, meglio dirlo che scrivere un viaggio verso il niente.
  if (segs[ultimo]!.minuti === 0 && segs[ultimo]!.viaggioPrima > 0) {
    return { ok: false, error: 'SOMMA_NON_TORNA' };
  }

  // Via i segmenti a 0 minuti (nessun lavoro).
  segs = segs.filter((s) => s.minuti > 0);
  if (segs.length === 0) return { ok: false, error: 'NETTO_NON_VALIDO' };
  const netLavoro = lavoroMin;

  // Cumulate net-time dei confini (cum[N] === lavoro netto).
  const cum: number[] = [0];
  for (const s of segs) cum.push(cum[cum.length - 1]! + s.minuti);

  type Cut = { netTime: number; nextCantiere: string; pausa: boolean; viaggio: number };
  const cuts: Cut[] = [];
  for (let i = 1; i < segs.length; i++) {
    cuts.push({ netTime: cum[i]!, nextCantiere: segs[i]!.cantiereId, pausa: false, viaggio: segs[i]!.viaggioPrima });
  }

  // Pausa = gap. Con ≥2 segmenti → confine più vicino al centro; con 1 solo
  // cantiere → spezza il segmento al centro (straddle). Se a quel confine c'è
  // anche una tratta, pausa e strada farebbero un buco solo e la pausa
  // risulterebbe più lunga di quella dichiarata: la pausa va dentro il cantiere
  // di arrivo dopo SCARTO_PAUSA_MIN di lavoro (o prima della partenza, se
  // l'arrivo è troppo corto). Pausa e viaggio restano due buchi distinti.
  if (P > 0) {
    const center = netLavoro / 2;
    if (cuts.length >= 1) {
      let best = 0;
      for (let i = 1; i < cuts.length; i++) {
        if (Math.abs(cuts[i]!.netTime - center) < Math.abs(cuts[best]!.netTime - center)) best = i;
      }
      const scelto = cuts[best]!;
      const scarto = (m: number) => Math.min(SCARTO_PAUSA_MIN, Math.floor(m / 2));
      const partenza = segs[best]!;
      const arrivo = segs[best + 1]!;
      if (scelto.viaggio === 0) {
        scelto.pausa = true;
      } else if (scarto(arrivo.minuti) >= 1) {
        cuts.push({ netTime: scelto.netTime + scarto(arrivo.minuti), nextCantiere: arrivo.cantiereId, pausa: true, viaggio: 0 });
      } else if (scarto(partenza.minuti) >= 1) {
        cuts.push({ netTime: scelto.netTime - scarto(partenza.minuti), nextCantiere: partenza.cantiereId, pausa: true, viaggio: 0 });
      } else {
        scelto.pausa = true;
      }
    } else {
      const mid = Math.min(netLavoro - 1, Math.max(1, Math.round(center)));
      cuts.push({ netTime: mid, nextCantiere: segs[0]!.cantiereId, pausa: true, viaggio: 0 });
    }
  }
  cuts.sort((a, b) => a.netTime - b.netTime);

  // Eventi con orologio reale — ESCLUSO l'ingresso iniziale (già reale su segs[0]).
  const eventi: EventoSplit[] = [];
  let realMs = input.ingressoMs;
  let cur = segs[0]!.cantiereId;
  let prevNet = 0;
  for (const cut of cuts) {
    realMs += (cut.netTime - prevNet) * MIN_MS;
    eventi.push({ cantiereId: cur, tipo: 'uscita', pausa: cut.pausa, ms: realMs });
    if (cut.pausa) realMs += P * MIN_MS;
    realMs += cut.viaggio * MIN_MS;
    eventi.push({ cantiereId: cut.nextCantiere, tipo: 'ingresso', pausa: cut.pausa, ms: realMs });
    cur = cut.nextCantiere;
    prevNet = cut.netTime;
  }
  realMs += (netLavoro - prevNet) * MIN_MS;
  eventi.push({ cantiereId: cur, tipo: 'uscita', pausa: false, ms: realMs });

  return { ok: true, eventi, nettoMin: netLavoro };
}

/** Tratta di trasferimento cantiere→cantiere (partenza `da`, arrivo `a`). */
export interface TrasferimentoPair {
  da: string;
  a: string;
}

/**
 * Ricava le tratte di TRASFERIMENTO cantiere→cantiere dall'ordine dei segmenti
 * dichiarati (stesso input di `calcolaSegmentiSplit`). Ogni cambio di cantiere
 * nella sequenza reale è un tragitto da percorrere → una coppia {da, a}.
 *
 * Rispecchia il filtro dei segmenti a 0 minuti di `calcolaSegmentiSplit`
 * (l'ultimo assorbe sempre il resto → è sempre "visitato"; gli altri a 0 minuti
 * si saltano perché nessuna timbratura li tocca) e collassa i cantieri
 * consecutivi identici (nessun tragitto verso sé stessi). Pura e deterministica:
 * unit-testata. Serve a REGISTRARE i km+tempo dei trasferimenti; NON incide sul
 * conteggio ore (che deriva sempre dalle timbrature).
 */
export function trasferimentiDaSegmenti(segmenti: SegmentoSplit[]): TrasferimentoPair[] {
  if (segmenti.length === 0) return [];
  const lastIdx = segmenti.length - 1;
  // Un segmento è "visitato" se ha minuti > 0, oppure è l'ultimo (assorbe il resto).
  const visitati = segmenti.filter((s, i) => Math.round(s.minuti) > 0 || i === lastIdx);
  // Collassa i cantieri consecutivi identici.
  const ordine: string[] = [];
  for (const s of visitati) {
    if (ordine[ordine.length - 1] !== s.cantiereId) ordine.push(s.cantiereId);
  }
  const pairs: TrasferimentoPair[] = [];
  for (let i = 1; i < ordine.length; i++) {
    pairs.push({ da: ordine[i - 1]!, a: ordine[i]! });
  }
  return pairs;
}
