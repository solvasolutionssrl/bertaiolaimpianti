/**
 * Il margine ore di una persona: quanto e' sopra o sotto l'orario teorico,
 * giornata per giornata e nel mese (28/10/2026).
 *
 * Serve a non trasformare in permessi e straordinari le oscillazioni normali:
 * nove ore oggi e sette domani fanno zero, e non c'e' bisogno di segnare un'ora
 * di permesso da una parte e una di straordinario dall'altra. Questo modulo
 * **misura e basta**: come il consulente del lavoro trattera' il saldo e'
 * una decisione ancora da prendere, e non sta qui.
 *
 * Le regole:
 * - **Giorno feriale con ore registrate**: margine = lavoro + viaggio dentro
 *   l'orario + ore di permesso approvate − orario ordinario. Il viaggio oltre
 *   l'orario resta fuori: si paga a parte (causale di viaggio), contarlo qui lo
 *   pagherebbe due volte.
 * - **Sabato, domenica e festivi**: l'orario teorico non c'e', quindi tutto
 *   cio' che si e' fatto e' margine in piu'.
 * - **Assenza di giornata intera** (ferie, malattia...): la giornata non conta,
 *   ne' in piu' ne' in meno.
 * - **Feriale senza niente** (ne' ore ne' assenze): non si conta come «meno
 *   otto», perche' quasi sempre e' un dato che manca e non un'assenza vera. Si
 *   dichiara a parte, perche' chi legge sappia che il saldo non lo comprende.
 */

import { tipoGiorno } from './paghe-mappatura';

export interface GiornoMargine {
  /** `AAAA-MM-GG`. */
  data: string;
  /** Ore registrate quel giorno, se la giornata esiste. */
  minutiLavoro: number;
  /** Viaggio che entra nell'orario ordinario (le quote della giornata). */
  minutiViaggioOrdinari: number;
  /** Viaggio oltre l'orario: si mostra, non entra nel margine. */
  minutiViaggioEccedenti: number;
  /** Orario ordinario di quella giornata, in minuti. */
  orarioMin: number;
  /** Minuti di permesso approvato a ore, quel giorno. */
  minutiPermesso: number;
  /** C'e' un'assenza approvata di giornata intera. */
  assenzaIntera: boolean;
  /** Esiste una giornata registrata (anche a zero ore). */
  registrata: boolean;
}

export type EsitoGiorno = 'lavorato' | 'extra' | 'assente' | 'vuoto' | 'riposo';

export interface MargineGiorno {
  data: string;
  esito: EsitoGiorno;
  /** Minuti che contano per l'orario: lavoro + viaggio dentro l'orario + permesso. */
  minutiContati: number;
  /** Il teorico del giorno: l'orario ordinario se feriale, zero altrimenti. */
  minutiTeorici: number;
  /** Positivo = sopra l'orario, negativo = sotto. Zero se il giorno non conta. */
  margine: number;
}

export interface MargineMese {
  giorni: MargineGiorno[];
  /** Saldo del periodo, in minuti. */
  margine: number;
  minutiContati: number;
  minutiTeorici: number;
  minutiViaggioEccedenti: number;
  giorniLavorati: number;
  giorniAssenza: number;
  /** Feriali senza ore e senza assenze: il saldo non li comprende. */
  giorniVuoti: number;
}

export function margineGiorno(g: GiornoMargine): MargineGiorno {
  const feriale = tipoGiorno(g.data) === 'feriale';
  const contati = Math.max(0, g.minutiLavoro) + Math.max(0, g.minutiViaggioOrdinari) + Math.max(0, g.minutiPermesso);

  if (g.assenzaIntera) {
    return { data: g.data, esito: 'assente', minutiContati: 0, minutiTeorici: 0, margine: 0 };
  }
  if (!feriale) {
    if (contati > 0) return { data: g.data, esito: 'extra', minutiContati: contati, minutiTeorici: 0, margine: contati };
    return { data: g.data, esito: 'riposo', minutiContati: 0, minutiTeorici: 0, margine: 0 };
  }
  if (!g.registrata && g.minutiPermesso <= 0) {
    return { data: g.data, esito: 'vuoto', minutiContati: 0, minutiTeorici: 0, margine: 0 };
  }
  const teorici = Math.max(0, g.orarioMin);
  return { data: g.data, esito: 'lavorato', minutiContati: contati, minutiTeorici: teorici, margine: contati - teorici };
}

export function margineMese(giorni: readonly GiornoMargine[]): MargineMese {
  const out = [...giorni].sort((a, b) => a.data.localeCompare(b.data)).map(margineGiorno);
  return {
    giorni: out,
    margine: out.reduce((s, g) => s + g.margine, 0),
    minutiContati: out.reduce((s, g) => s + g.minutiContati, 0),
    minutiTeorici: out.reduce((s, g) => s + g.minutiTeorici, 0),
    minutiViaggioEccedenti: giorni.reduce((s, g) => s + Math.max(0, g.minutiViaggioEccedenti), 0),
    giorniLavorati: out.filter((g) => g.esito === 'lavorato' || g.esito === 'extra').length,
    giorniAssenza: out.filter((g) => g.esito === 'assente').length,
    giorniVuoti: out.filter((g) => g.esito === 'vuoto').length,
  };
}

/** `+1:30`, `−0:45`, `0:00`: il segno sempre, perche' e' la cosa che si legge. */
export function formattaMargine(minuti: number): string {
  const segno = minuti > 0 ? '+' : minuti < 0 ? '−' : '';
  const m = Math.abs(Math.round(minuti));
  return `${segno}${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
