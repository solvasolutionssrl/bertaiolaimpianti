/**
 * **Da quanto è al lavoro, adesso.**
 *
 * Un posto solo per una domanda che tre superfici fanno: la colonna ORE di
 * «Presenze e ore», la card «Chi c'è adesso» del cruscotto e, un domani,
 * chiunque mostri una presenza in corso.
 *
 * ⚠️⚠️ **Il conto scorre solo mentre la presenza è aperta.** Appena si chiude
 * un intervallo — la persona ha timbrato l'inizio della pausa, o ha finito —
 * il numero che conta è il **netto già calcolato**, non «adesso meno
 * l'inizio»: continuare a far correre l'orologio durante la pausa pranzo
 * regalerebbe un'ora a tutti. È il difetto trovato su «Presenze e ore» il
 * 26/10/2026, quando il conteggio continuava a salire per chi era a mangiare.
 *
 * ⚠️ E non torna **zero**: una giornata ferma in pausa ha già delle ore dentro,
 * e scrivere `0:00` su una persona presente dalle 7:40 è peggio che non
 * scrivere niente.
 */

export interface IngressoPresenza {
  /** La presenza è aperta: l'ultimo intervallo non ha ancora una fine. */
  aperta: boolean;
  /** Quando è cominciata (ms). `null` = non lo sappiamo, e allora non si conta. */
  inizioMs: number | null;
  /** Pause già timbrate (minuti): sono buchi dentro la presenza, si scalano. */
  pausaTimbrataMin: number;
  /** Il netto già calcolato per gli intervalli chiusi. */
  nettoMin: number;
  /** Adesso (ms). Lo passa il chiamante: il server e il browser hanno orologi diversi. */
  oraMs: number;
}

/** Minuti di presenza da mostrare, o `null` se non c'è niente da dire. */
export function minutiPresenza(i: IngressoPresenza): number | null {
  if (i.aperta) {
    if (i.inizioMs == null || !Number.isFinite(i.inizioMs)) return null;
    const min = Math.round((i.oraMs - i.inizioMs) / 60_000) - Math.max(0, i.pausaTimbrataMin);
    // ⚠️ Mai negativo: un orologio del terminale avanti di qualche minuto
    // rispetto al nostro darebbe un conto all'indietro.
    return Math.max(0, min);
  }
  return i.nettoMin > 0 ? i.nettoMin : null;
}

/** `6h 20m` · `45m` · `—` quando non c'è niente da dire. */
export function scriviDurata(minuti: number | null): string {
  if (minuti == null) return '—';
  const h = Math.floor(minuti / 60);
  const m = minuti % 60;
  return h === 0 ? `${m}m` : `${h}h ${m.toString().padStart(2, '0')}m`;
}
