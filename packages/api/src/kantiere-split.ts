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

export interface CalcolaSplitInput {
  /** Inizio turno (ms epoch) = ingresso reale. */
  ingressoMs: number;
  /** Fine turno (ms epoch). */
  uscitaMs: number;
  /** Pausa da sottrarre in minuti (0 se nessuna). */
  pausaMin: number;
  /** Segmenti dichiarati; il primo è il cantiere del turno. Somma ≈ netto. */
  segmenti: SegmentoSplit[];
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

  // Interi ≥ 0, ordine preservato.
  let segs = input.segmenti.map((s) => ({
    cantiereId: s.cantiereId,
    minuti: Math.max(0, Math.round(s.minuti)),
  }));

  // L'ULTIMA riga assorbe il resto → somma esatta = netMin.
  const sommaRest = segs.slice(0, -1).reduce((a, s) => a + s.minuti, 0);
  if (sommaRest > netMin) return { ok: false, error: 'SOMMA_NON_TORNA' };
  segs[segs.length - 1] = { ...segs[segs.length - 1]!, minuti: netMin - sommaRest };

  // Via i segmenti a 0 minuti (nessun lavoro).
  segs = segs.filter((s) => s.minuti > 0);
  if (segs.length === 0) return { ok: false, error: 'NETTO_NON_VALIDO' };

  // Cumulate net-time dei confini (cum[N] === netMin).
  const cum: number[] = [0];
  for (const s of segs) cum.push(cum[cum.length - 1]! + s.minuti);

  type Cut = { netTime: number; nextCantiere: string; pausa: boolean };
  const cuts: Cut[] = [];
  for (let i = 1; i < segs.length; i++) {
    cuts.push({ netTime: cum[i]!, nextCantiere: segs[i]!.cantiereId, pausa: false });
  }

  // Pausa = gap. Con ≥2 segmenti → confine più vicino al centro; con 1 solo
  // cantiere → spezza il segmento al centro (straddle).
  if (P > 0) {
    const center = netMin / 2;
    if (cuts.length >= 1) {
      let best = 0;
      for (let i = 1; i < cuts.length; i++) {
        if (Math.abs(cuts[i]!.netTime - center) < Math.abs(cuts[best]!.netTime - center)) best = i;
      }
      cuts[best]!.pausa = true;
    } else {
      const mid = Math.min(netMin - 1, Math.max(1, Math.round(center)));
      cuts.push({ netTime: mid, nextCantiere: segs[0]!.cantiereId, pausa: true });
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
    eventi.push({ cantiereId: cut.nextCantiere, tipo: 'ingresso', pausa: cut.pausa, ms: realMs });
    cur = cut.nextCantiere;
    prevNet = cut.netTime;
  }
  realMs += (netMin - prevNet) * MIN_MS;
  eventi.push({ cantiereId: cur, tipo: 'uscita', pausa: false, ms: realMs });

  return { ok: true, eventi, nettoMin: netMin };
}
