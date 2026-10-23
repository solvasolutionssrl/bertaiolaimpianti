/**
 * Arrotondamento delle timbrature nei CALCOLI delle ore (23/10/2026).
 *
 * Decisione di Luca con FPM e il consulente del lavoro (nessun vincolo
 * normativo sui 5 minuti): chi timbra scrive l'orario ESATTO nel database;
 * a video si legge arrotondato ai 5 minuti (`ora-mostrata`); e le ORE si
 * calcolano sugli orari arrotondati, cosi' la scatola della giornata, il
 * tetto del «+», le righe per cantiere e cio' che esce verso il gestionale
 * sono multipli del passo. Vale per tutte le bocche: badge, QR, app, PC.
 *
 * Due regole ferree:
 *  - **Al piu' vicino.** 08:02 → 08:00, 08:03 → 08:05. Neutro nel lungo
 *    periodo; e' lo stesso verso di `oraMostrata`, cosi' cio' che si legge
 *    e cio' che si conta coincidono.
 *  - **Il passato non si tocca.** La regola ha una data di partenza
 *    (`dal`, giorno italiano): le giornate precedenti si calcolano al
 *    minuto come prima, anche se qualcuno preme «Ricalcola». Senza data la
 *    regola vale da sempre; con passo 0 non vale mai.
 *
 * Il dato nel database NON cambia: queste funzioni restituiscono copie.
 * Un intervallo che dopo l'arrotondamento finisce sullo stesso minuto
 * (ingresso 12:32:31 → 12:35, uscita 12:33:29 → 12:35) vale zero minuti,
 * mai negativo: chi somma lo fa gia' con `Math.max(0, …)`.
 */

import { romeDay } from './rome-time';

export interface RegolaArrotondamentoTimbri {
  /** Passo in minuti; 0 = nessun arrotondamento. */
  passoMin: number;
  /** Primo giorno (AAAA-MM-GG, Europe/Rome) a cui la regola si applica; null = da sempre. */
  dal: string | null;
}

export const NESSUN_ARROTONDAMENTO: RegolaArrotondamentoTimbri = { passoMin: 0, dal: null };

/** L'istante (ms) arrotondato al passo piu' vicino. Passo ≤ 0 = invariato. */
export function arrotondaMsAlPasso(ms: number, passoMin: number): number {
  if (!Number.isFinite(ms) || !(passoMin > 0)) return ms;
  const passo = Math.round(passoMin) * 60_000;
  return Math.round(ms / passo) * passo;
}

/** La regola vale per questo istante? (passo > 0 e giorno italiano ≥ `dal`). */
export function regolaVale(ms: number, regola: RegolaArrotondamentoTimbri): boolean {
  if (!(regola.passoMin > 0) || !Number.isFinite(ms)) return false;
  if (!regola.dal) return true;
  return romeDay(new Date(ms)) >= regola.dal;
}

/** L'istante arrotondato secondo la regola (ms). */
export function arrotondaMs(ms: number, regola: RegolaArrotondamentoTimbri): number {
  return regolaVale(ms, regola) ? arrotondaMsAlPasso(ms, regola.passoMin) : ms;
}

/** L'ISO arrotondato secondo la regola; una stringa non leggibile torna com'e'. */
export function arrotondaTs(iso: string, regola: RegolaArrotondamentoTimbri): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const r = arrotondaMs(ms, regola);
  return r === ms ? iso : new Date(r).toISOString();
}

/** Copia delle righe con `ts` arrotondato. L'ordine resta quello d'ingresso. */
export function arrotondaTimbrature<T extends { ts: string }>(righe: readonly T[], regola: RegolaArrotondamentoTimbri): T[] {
  if (!(regola.passoMin > 0)) return [...righe];
  return righe.map((r) => ({ ...r, ts: arrotondaTs(r.ts, regola) }));
}

/** Copia degli eventi con `ms` arrotondato (il registro del terminale lavora in ms). */
export function arrotondaEventi<T extends { ms: number }>(eventi: readonly T[], regola: RegolaArrotondamentoTimbri): T[] {
  if (!(regola.passoMin > 0)) return [...eventi];
  return eventi.map((e) => ({ ...e, ms: arrotondaMs(e.ms, regola) }));
}
