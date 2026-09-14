/**
 * Il percorso di una giornata dichiarata a mano («Registra giornata»).
 *
 * Chi scrive la giornata la sera dice da dove è partito la mattina, su quali
 * cantieri ha lavorato e in che ordine, e dove è rientrato. Il resto si ricava:
 * fra un cantiere e il successivo c'è una tratta, di norma diretta, che si
 * corregge solo quando non lo è (passando dalla sede, o da casa).
 *
 * Regole decise con il cliente (14/09/2026):
 * - **partenza e rientro** sono gli estremi della giornata e si dicono una volta;
 * - **guida e mezzo** si dicono una volta e valgono per tutte le tratte;
 * - le **tratte fra cantieri** le costruisce il sistema, l'utente le corregge;
 * - andata e ritorno sono **tempo di viaggio** (fuori dall'orario di lavoro
 *   dichiarato); le tratte in mezzo stanno **dentro** quell'orario, quindi se ne
 *   registra la stima ma non si pagano una seconda volta.
 *
 * Pura e deterministica: la usano la pagina (cosa manca, la barra dei tempi) e
 * l'azione sul server (quali righe scrivere e a quali timbrature legarle).
 */

/** Da dove si parte la mattina / dove si rientra la sera. */
export type Estremo = { tipo: 'casa' } | { tipo: 'sede'; sedeId: string };

/** Come si va da un cantiere al successivo. */
export type Passaggio = 'diretto' | 'casa' | { sedeId: string };

export interface CoppiaCantieri {
  da: string;
  a: string;
}

/** Una tratta fra due cantieri consecutivi, come verrà registrata. */
export type TrattaIntermedia =
  | { tipo: 'diretta'; da: string; a: string }
  | { tipo: 'via_sede'; da: string; a: string; sedeId: string }
  /** Passato da casa (es. pranzo): nessun viaggio di lavoro da registrare. */
  | { tipo: 'via_casa'; da: string; a: string };

export function chiaveCoppia(c: CoppiaCantieri): string {
  return `${c.da}>${c.a}`;
}

/** Valore `via` del payload (`'diretto'`, `'casa'` o l'id di una sede). */
export function passaggioDaVia(via: string): Passaggio {
  if (via === 'diretto' || via === 'casa') return via;
  return { sedeId: via };
}

export function viaDaPassaggio(p: Passaggio): string {
  return typeof p === 'string' ? p : p.sedeId;
}

/**
 * Le tratte fra cantieri della giornata. `coppie` arriva dall'ordine dei
 * cantieri (vedi `trasferimentiDaSegmenti`); una coppia senza passaggio indicato
 * è diretta. Un passaggio che non corrisponde a nessuna coppia si ignora: i
 * cantieri sono cambiati dopo che l'utente l'aveva scelto.
 */
export function tratteIntermedie(
  coppie: readonly CoppiaCantieri[],
  passaggi: Readonly<Record<string, Passaggio | undefined>>,
): TrattaIntermedia[] {
  return coppie.map((c) => {
    const p = passaggi[chiaveCoppia(c)] ?? 'diretto';
    if (p === 'diretto') return { tipo: 'diretta', da: c.da, a: c.a };
    if (p === 'casa') return { tipo: 'via_casa', da: c.da, a: c.a };
    return { tipo: 'via_sede', da: c.da, a: c.a, sedeId: p.sedeId };
  });
}

/**
 * I punti della giornata in cui si passa da un cantiere all'altro: l'uscita dal
 * primo e l'ingresso nel secondo. Servono a legare le tratte «passando dalla
 * sede» alle timbrature giuste (ritorno sull'uscita, andata sull'ingresso).
 *
 * Un'uscita seguita da un ingresso sullo STESSO cantiere è la pausa di un
 * cantiere solo, non un cambio: si salta. Stesso ordine delle coppie di
 * `trasferimentiDaSegmenti`.
 */
export function confiniFraCantieri<T extends { tipo: 'ingresso' | 'uscita'; cantiereId: string }>(
  eventi: readonly T[],
): { uscita: T; ingresso: T }[] {
  const out: { uscita: T; ingresso: T }[] = [];
  for (let i = 0; i < eventi.length - 1; i++) {
    const u = eventi[i]!;
    const n = eventi[i + 1]!;
    if (u.tipo === 'uscita' && n.tipo === 'ingresso' && u.cantiereId !== n.cantiereId) {
      out.push({ uscita: u, ingresso: n });
    }
  }
  return out;
}

// ── Cosa manca per registrare ───────────────────────────────────────────────

/** Una delle due tratte agli estremi (andata o ritorno), com'è sulla pagina. */
export interface TrattaEstrema {
  /** null = l'utente non l'ha ancora indicato. */
  luogo: Estremo | null;
  /** Minuti stimati (già arrotondati), null se la stima non c'è. */
  stimaMin: number | null;
  /** La stima è ancora in arrivo: non si chiede niente finché non risponde. */
  inArrivo: boolean;
  /** Minuti corretti a mano, null se si tiene la stima. */
  minutiCorretti: number | null;
  motivo: string;
}

/** Il mezzo è stato scelto ma non è nel parco mezzi (auto propria, noleggio). */
export const MEZZO_NON_IN_ELENCO = 'non_in_elenco';

export type DatoMancante =
  | 'partenza'
  | 'tempo_andata'
  | 'motivo_andata'
  | 'mezzo'
  | 'rientro'
  | 'tempo_ritorno'
  | 'motivo_ritorno';

/** Minuti di viaggio della tratta: la correzione vince sulla stima. Casa = 0. */
export function minutiTratta(t: TrattaEstrema): number {
  if (t.luogo?.tipo !== 'sede') return 0;
  return Math.max(0, t.minutiCorretti ?? t.stimaMin ?? 0);
}

/** Tempo diverso dalla stima: serve un motivo (stessa regola di `validaViaggio`). */
export function trattaModificata(t: TrattaEstrema): boolean {
  return (
    t.luogo?.tipo === 'sede' &&
    t.stimaMin != null &&
    t.minutiCorretti != null &&
    t.minutiCorretti !== t.stimaMin
  );
}

/** C'è almeno un tragitto di lavoro, quindi ha senso chiedere chi guidava. */
export function ciSonoViaggi(p: {
  andata: TrattaEstrema;
  ritorno: TrattaEstrema;
  intermedie: readonly TrattaIntermedia[];
}): boolean {
  return (
    p.andata.luogo?.tipo === 'sede' ||
    p.ritorno.luogo?.tipo === 'sede' ||
    p.intermedie.some((t) => t.tipo !== 'via_casa')
  );
}

/**
 * I dati obbligatori che mancano, nell'ordine in cui compaiono sulla pagina
 * (partenza e mezzo in alto, rientro in fondo). Vuoto = si può registrare.
 */
export function datiMancanti(p: {
  andata: TrattaEstrema;
  ritorno: TrattaEstrema;
  intermedie: readonly TrattaIntermedia[];
  autista: boolean;
  /** id del mezzo, `MEZZO_NON_IN_ELENCO`, oppure null = non ancora scelto. */
  mezzo: string | null;
  mezziDisponibili: number;
}): DatoMancante[] {
  const out: DatoMancante[] = [];
  const estremo = (t: TrattaEstrema, luogo: DatoMancante, tempo: DatoMancante, motivo: DatoMancante) => {
    if (!t.luogo) {
      out.push(luogo);
      return;
    }
    if (t.luogo.tipo !== 'sede' || t.inArrivo) return;
    if (minutiTratta(t) <= 0) out.push(tempo);
    else if (trattaModificata(t) && t.motivo.trim().length < 3) out.push(motivo);
  };
  estremo(p.andata, 'partenza', 'tempo_andata', 'motivo_andata');
  if (p.autista && p.mezziDisponibili > 0 && p.mezzo == null && ciSonoViaggi(p)) out.push('mezzo');
  estremo(p.ritorno, 'rientro', 'tempo_ritorno', 'motivo_ritorno');
  return out;
}

// ── La barra dei tempi ──────────────────────────────────────────────────────

export type SegmentoBarra =
  | { tipo: 'andata'; minuti: number }
  | { tipo: 'cantiere'; indice: number; minuti: number }
  | { tipo: 'pausa'; minuti: number }
  | { tipo: 'da_assegnare'; minuti: number }
  | { tipo: 'ritorno'; minuti: number };

/**
 * La giornata da un capo all'altro, in ordine: andata, lavoro sui cantieri con
 * la pausa in mezzo, il lavoro ancora da assegnare, ritorno.
 *
 * La pausa si mette dove la mette `calcolaSegmentiSplit` quando registra: al
 * cambio di cantiere più vicino a metà giornata, oppure a metà dell'unico
 * cantiere. Così la barra mostra la giornata come verrà scritta.
 */
export function segmentiBarraGiornata(p: {
  andataMin: number;
  ritornoMin: number;
  /** Minuti dichiarati per cantiere, nell'ordine della pagina. */
  minutiCantieri: readonly number[];
  pausaMin: number;
  /** Lavoro netto dall'orario: (fine − inizio) − pausa. */
  nettoMin: number;
}): SegmentoBarra[] {
  type Lavoro = Extract<SegmentoBarra, { tipo: 'cantiere' | 'da_assegnare' | 'pausa' }>;
  const lavoro: Lavoro[] = [];
  p.minutiCantieri.forEach((m, indice) => {
    const minuti = Math.max(0, Math.round(m));
    if (minuti > 0) lavoro.push({ tipo: 'cantiere', indice, minuti });
  });
  const assegnati = lavoro.reduce((a, s) => a + s.minuti, 0);
  const resto = Math.round(p.nettoMin) - assegnati;
  if (resto > 0) lavoro.push({ tipo: 'da_assegnare', minuti: resto });

  const pausa = Math.max(0, Math.round(p.pausaMin));
  if (pausa > 0 && lavoro.length > 0) {
    const totale = lavoro.reduce((a, s) => a + s.minuti, 0);
    const centro = totale / 2;
    if (lavoro.length === 1) {
      const unico = lavoro[0]!;
      const meta = Math.min(unico.minuti - 1, Math.max(1, Math.round(centro)));
      if (unico.minuti >= 2) {
        lavoro.splice(0, 1, { ...unico, minuti: meta }, { tipo: 'pausa', minuti: pausa }, {
          ...unico,
          minuti: unico.minuti - meta,
        });
      } else {
        lavoro.push({ tipo: 'pausa', minuti: pausa });
      }
    } else {
      let cum = 0;
      let migliore = 1;
      let distanzaMigliore = Infinity;
      for (let i = 1; i < lavoro.length; i++) {
        cum += lavoro[i - 1]!.minuti;
        const d = Math.abs(cum - centro);
        if (d < distanzaMigliore) {
          distanzaMigliore = d;
          migliore = i;
        }
      }
      lavoro.splice(migliore, 0, { tipo: 'pausa', minuti: pausa });
    }
  }

  const out: SegmentoBarra[] = [];
  if (p.andataMin > 0) out.push({ tipo: 'andata', minuti: Math.round(p.andataMin) });
  out.push(...lavoro);
  if (p.ritornoMin > 0) out.push({ tipo: 'ritorno', minuti: Math.round(p.ritornoMin) });
  return out;
}

/** "08:00" spostato di `deltaMin` minuti, sull'orologio di 24 ore. */
export function spostaOrario(hhmm: string, deltaMin: number): string {
  const [hh, mm] = hhmm.split(':').map((x) => parseInt(x, 10));
  const tot = ((((hh ?? 0) * 60 + (mm ?? 0) + Math.round(deltaMin)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
}
