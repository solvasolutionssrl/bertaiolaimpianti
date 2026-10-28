/**
 * Riallocare una giornata gia' registrata (28/10/2026).
 *
 * Dal telefono il tecnico corregge **su quali commesse** e **quante ore per
 * ciascuna**, e la pausa se non l'ha timbrata. Inizio e fine NON si toccano:
 * quelli li corregge l'ufficio. Qui, dalle timbrature della giornata, si
 * ricavano gli estremi fissi, gli intervalli di lavoro (la presenza meno le
 * pause timbrate) e le due pause, cosi' la giornata si puo' riempire di nuovo
 * con `riempiScatola` come una giornata del terminale.
 *
 * Una pausa e' **dichiarata** se l'ha scritta una persona (pausa dichiarata,
 * «Registra giornata», l'ufficio): si puo' cambiare. Altrimenti e' timbrata
 * (QR, cronometro, capo squadra) e resta dov'e'.
 */

export interface TimbraturaGiornata {
  tipo: 'ingresso' | 'uscita';
  pausa: boolean;
  ts: string;
  modalita: string | null;
  origine?: string | null;
}

export const MODALITA_PAUSA_DICHIARATA: readonly string[] = ['pausa_dichiarata', 'giornata_dichiarata', 'ufficio'];

/**
 * ⚠️ Le righe scritte prima che esistesse `modalita` l'hanno vuota: fra quelle,
 * una pausa `manuale` l'ha scritta una persona (misurato il 28/10/2026: 46
 * pause cosi' in produzione). Una pausa da QR, cronometro o terminale e'
 * timbrata, qualunque sia la modalita'.
 */
export function pausaDichiarata(t: Pick<TimbraturaGiornata, 'modalita' | 'origine'>): boolean {
  if (t.modalita) return MODALITA_PAUSA_DICHIARATA.includes(t.modalita);
  return t.origine === 'manuale';
}

export type EstremiGiornata =
  | {
      ok: true;
      inizioMs: number;
      fineMs: number;
      /** La presenza meno le pause timbrate: il tempo da ripartire. */
      intervalli: { inizioMs: number; fineMs: number }[];
      pausaTimbrataMin: number;
      pausaDichiarataMin: number;
    }
  | { ok: false; error: 'GIORNATA_NON_CHIUSA' };

const MIN = 60_000;

export function estremiGiornata(timbrature: readonly TimbraturaGiornata[]): EstremiGiornata {
  const ordinate = [...timbrature].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const lavori = ordinate.filter((t) => !t.pausa);
  const primo = lavori.find((t) => t.tipo === 'ingresso');
  const ultima = [...lavori].reverse().find((t) => t.tipo === 'uscita');
  if (!primo || !ultima) return { ok: false, error: 'GIORNATA_NON_CHIUSA' };
  const inizioMs = Date.parse(primo.ts);
  const fineMs = Date.parse(ultima.ts);
  if (!(fineMs > inizioMs)) return { ok: false, error: 'GIORNATA_NON_CHIUSA' };

  // Le pause: un'uscita di pausa apre, il successivo ingresso di pausa chiude.
  const timbrate: { inizioMs: number; fineMs: number }[] = [];
  let pausaDichiarataMin = 0;
  let aperta: TimbraturaGiornata | null = null;
  for (const t of ordinate) {
    if (!t.pausa) continue;
    if (t.tipo === 'uscita') {
      aperta = t;
      continue;
    }
    if (!aperta) continue;
    const da = Math.max(inizioMs, Date.parse(aperta.ts));
    const a = Math.min(fineMs, Date.parse(t.ts));
    if (a > da) {
      const dichiarata = pausaDichiarata(aperta);
      if (dichiarata) pausaDichiarataMin += Math.round((a - da) / MIN);
      else timbrate.push({ inizioMs: da, fineMs: a });
    }
    aperta = null;
  }

  const intervalli: { inizioMs: number; fineMs: number }[] = [];
  let cursore = inizioMs;
  for (const p of timbrate.sort((x, y) => x.inizioMs - y.inizioMs)) {
    if (p.inizioMs > cursore) intervalli.push({ inizioMs: cursore, fineMs: p.inizioMs });
    cursore = Math.max(cursore, p.fineMs);
  }
  if (fineMs > cursore) intervalli.push({ inizioMs: cursore, fineMs });

  return {
    ok: true,
    inizioMs,
    fineMs,
    intervalli,
    pausaTimbrataMin: timbrate.reduce((s, p) => s + Math.round((p.fineMs - p.inizioMs) / MIN), 0),
    pausaDichiarataMin,
  };
}

/**
 * La pausa che c'e' ma non e' segnata come tale.
 *
 * Quando la pausa cade proprio su un cambio di cantiere, la giornata ripartita
 * (`riempiScatola`) la fonde con il buco della strada: restano un'uscita e un
 * ingresso di lavoro, nessuna timbratura di pausa. Le ore sono giuste, ma alla
 * correzione successiva quella mezz'ora sembrerebbe tempo da ripartire, e
 * aprire e salvare senza cambiare niente sposterebbe le ore. Qui la si ritrova:
 * i buchi fra un'uscita e l'ingresso successivo, meno la strada fra cantieri.
 */
export function pausaImplicita(timbrature: readonly TimbraturaGiornata[], stradaDentroMin: number): number {
  const lavori = [...timbrature]
    .filter((t) => !t.pausa)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  let buchi = 0;
  for (let i = 0; i < lavori.length - 1; i++) {
    const a = lavori[i]!;
    const b = lavori[i + 1]!;
    if (a.tipo === 'uscita' && b.tipo === 'ingresso') buchi += Math.round((Date.parse(b.ts) - Date.parse(a.ts)) / MIN);
  }
  return Math.max(0, buchi - Math.max(0, Math.round(stradaDentroMin)));
}
