/**
 * L'ora che si mostra a video, arrotondata ai 5 minuti.
 *
 * Richiesta di Luca (22/10/2026): nel database l'istante resta quello vero
 * (secondi compresi), ma a schermo un orario di timbratura si legge ai 5
 * minuti: 12:32:29 → 12:30, 12:32:31 → 12:35. Al piu' vicino, con il confine
 * a 2 minuti e 30 secondi che sale.
 *
 * ⚠️ Solo per i testi che si LEGGONO: pillole, timeline, «dalle HH:MM». Le
 * somme (H:MM di lavoro) restano al minuto esatto, i campi in cui si scrive
 * un orario non si arrotondano, e nessun calcolo passa di qui.
 */
export const PASSO_ORA_MOSTRATA_MIN = 5;

/** L'istante arrotondato ai 5 minuti piu' vicini (millisecondi). */
export function arrotondaAi5Min(ms: number): number {
  const passo = PASSO_ORA_MOSTRATA_MIN * 60_000;
  return Math.round(ms / passo) * passo;
}

const fmt = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });

/** «HH:MM» in ora italiana, ai 5 minuti. Stringa vuota se l'istante non c'e'. */
export function oraMostrata(quando: string | number | Date | null | undefined): string {
  if (quando === null || quando === undefined || quando === '') return '';
  const ms = typeof quando === 'number' ? quando : new Date(quando).getTime();
  if (!Number.isFinite(ms)) return '';
  return fmt.format(new Date(arrotondaAi5Min(ms)));
}
