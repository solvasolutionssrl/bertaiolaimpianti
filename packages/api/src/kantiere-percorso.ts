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
 * - andata e ritorno sono **tempo di viaggio** fuori dall'orario di lavoro
 *   dichiarato; le tratte in mezzo stanno **dentro** quell'orario ma sono
 *   anch'esse viaggio: si tolgono dalle ore da assegnare ai cantieri (15/09/2026);
 * - «lavoro dalla sede sul progetto»: le ore restano del cantiere, ma le tratte
 *   partono e arrivano alla sede predefinita; nella stessa sede non c'è strada.
 *
 * Pura e deterministica: la usano la pagina (cosa manca, la barra dei tempi) e
 * l'azione sul server (quali righe scrivere e a quali timbrature legarle).
 */

import { SCARTO_PAUSA_MIN } from './kantiere-split';

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
  /**
   * Il luogo è la sede in cui si lavora sul cantiere vicino («lavoro dalla sede
   * sul progetto»): non c'è strada, quindi nessuna tratta e niente da chiedere.
   */
  senzaViaggio?: boolean;
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
  if (t.luogo?.tipo !== 'sede' || t.senzaViaggio) return 0;
  return Math.max(0, t.minutiCorretti ?? t.stimaMin ?? 0);
}

/** Tempo diverso dalla stima: serve un motivo (stessa regola di `validaViaggio`). */
export function trattaModificata(t: TrattaEstrema): boolean {
  return (
    t.luogo?.tipo === 'sede' &&
    !t.senzaViaggio &&
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
    (p.andata.luogo?.tipo === 'sede' && !p.andata.senzaViaggio) ||
    (p.ritorno.luogo?.tipo === 'sede' && !p.ritorno.senzaViaggio) ||
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
    if (t.luogo.tipo !== 'sede' || t.inArrivo || t.senzaViaggio) return;
    if (minutiTratta(t) <= 0) out.push(tempo);
    else if (trattaModificata(t) && t.motivo.trim().length < 3) out.push(motivo);
  };
  estremo(p.andata, 'partenza', 'tempo_andata', 'motivo_andata');
  if (p.autista && p.mezziDisponibili > 0 && p.mezzo == null && ciSonoViaggi(p)) out.push('mezzo');
  estremo(p.ritorno, 'rientro', 'tempo_ritorno', 'motivo_ritorno');
  return out;
}

// ── Il viaggio fra un cantiere e l'altro ────────────────────────────────────

/** Un pezzo di strada di una tratta fra cantieri, di cui serve la stima. */
export type PezzoTratta =
  | { tipo: 'fra_cantieri'; da: string; a: string }
  | { tipo: 'verso_sede'; cantiereId: string; sedeId: string }
  | { tipo: 'da_sede'; sedeId: string; cantiereId: string };

/**
 * I minuti di viaggio prima di ogni cantiere (stesso indice di `cantieri`, il
 * primo è 0): le tratte fra un cantiere e il successivo. Sono viaggio e non
 * lavoro, quindi si tolgono dalle ore da assegnare ai cantieri.
 *
 * - tratta diretta: la stima della tratta;
 * - passando da una sede: la somma delle due tratte, verso la sede e dalla sede;
 * - passando da casa: 0, non è un viaggio di lavoro.
 *
 * `minuti` restituisce la stima già arrotondata, 0 se la stima non c'è, null se
 * è ancora in arrivo (`inArrivo`: la pagina non deve ancora registrare). La
 * usano sia la pagina sia il server, così le ore da assegnare coincidono.
 */
export function viaggioFraCantieri(
  cantieri: readonly string[],
  intermedie: readonly TrattaIntermedia[],
  minuti: (pezzo: PezzoTratta) => number | null,
): { prima: number[]; totale: number; inArrivo: boolean } {
  let inArrivo = false;
  const leggi = (pezzo: PezzoTratta) => {
    const m = minuti(pezzo);
    if (m == null) {
      inArrivo = true;
      return 0;
    }
    return Number.isFinite(m) ? Math.max(0, Math.round(m)) : 0;
  };
  const prima = cantieri.map((a, j) => {
    if (j === 0) return 0;
    const da = cantieri[j - 1]!;
    const t = intermedie.find((x) => x.da === da && x.a === a);
    if (!t || t.tipo === 'via_casa') return 0;
    if (t.tipo === 'diretta') return leggi({ tipo: 'fra_cantieri', da, a });
    return (
      leggi({ tipo: 'verso_sede', cantiereId: da, sedeId: t.sedeId }) +
      leggi({ tipo: 'da_sede', sedeId: t.sedeId, cantiereId: a })
    );
  });
  return { prima, totale: prima.reduce((s, m) => s + m, 0), inArrivo };
}

// ── La barra dei tempi ──────────────────────────────────────────────────────

export type SegmentoBarra =
  | { tipo: 'andata'; minuti: number }
  | { tipo: 'cantiere'; indice: number; minuti: number }
  | { tipo: 'pausa'; minuti: number }
  | { tipo: 'trasferimento'; minuti: number }
  | { tipo: 'da_assegnare'; minuti: number }
  | { tipo: 'ritorno'; minuti: number };

/**
 * La giornata da un capo all'altro, in ordine: andata, lavoro sui cantieri con
 * la pausa e le tratte in mezzo, il lavoro ancora da assegnare, ritorno.
 *
 * La pausa si mette dove la mette `calcolaSegmentiSplit` quando registra: al
 * cambio di cantiere più vicino a metà giornata, oppure a metà dell'unico
 * cantiere; se a quel cambio c'è una tratta, dopo SCARTO_PAUSA_MIN sul cantiere
 * di arrivo (o prima della partenza). La tratta sta subito prima del cantiere
 * che raggiunge. Così la barra mostra la giornata come verrà scritta.
 */
export function segmentiBarraGiornata(p: {
  andataMin: number;
  ritornoMin: number;
  /** Minuti dichiarati per cantiere, nell'ordine della pagina. */
  minutiCantieri: readonly number[];
  /** Viaggio prima di ogni cantiere (vedi `viaggioFraCantieri`); il primo si ignora. */
  trasferimentiMin?: readonly number[];
  pausaMin: number;
  /** Lavoro da assegnare: (fine − inizio) − pausa − tratte fra cantieri. */
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

  // Minuti di strada prima di ogni cantiere (il primo non ne ha).
  const tratte = p.minutiCantieri.map((_, i) =>
    i === 0 ? 0 : Math.max(0, Math.round(p.trasferimentiMin?.[i] ?? 0)),
  );
  const tratteFra = (da: number, a: number) => {
    let minuti = 0;
    for (let k = da + 1; k <= a && k < tratte.length; k++) minuti += tratte[k]!;
    return minuti;
  };

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
      const precedente = lavoro[migliore - 1]!;
      const arrivo = lavoro[migliore]!;
      const scarto = (m: number) => Math.min(SCARTO_PAUSA_MIN, Math.floor(m / 2));
      const conStrada =
        precedente.tipo === 'cantiere' && arrivo.tipo === 'cantiere' && tratteFra(precedente.indice, arrivo.indice) > 0;
      if (conStrada && scarto(arrivo.minuti) >= 1) {
        const s = scarto(arrivo.minuti);
        lavoro.splice(migliore, 1, { ...arrivo, minuti: s }, { tipo: 'pausa', minuti: pausa }, { ...arrivo, minuti: arrivo.minuti - s });
      } else if (conStrada && scarto(precedente.minuti) >= 1) {
        const s = scarto(precedente.minuti);
        lavoro.splice(
          migliore - 1,
          1,
          { ...precedente, minuti: precedente.minuti - s },
          { tipo: 'pausa', minuti: pausa },
          { ...precedente, minuti: s },
        );
      } else {
        lavoro.splice(migliore, 0, { tipo: 'pausa', minuti: pausa });
      }
    }
  }

  const out: SegmentoBarra[] = [];
  if (p.andataMin > 0) out.push({ tipo: 'andata', minuti: Math.round(p.andataMin) });
  // Le tratte non ancora messe in barra si mettono davanti al cantiere che
  // raggiungono; quelle verso cantieri ancora a zero, davanti al da assegnare.
  let tratteMesse = 0;
  const metteTratteFino = (indice: number) => {
    let minuti = 0;
    for (let k = tratteMesse + 1; k <= indice && k < tratte.length; k++) minuti += tratte[k]!;
    tratteMesse = Math.max(tratteMesse, indice);
    if (minuti > 0) out.push({ tipo: 'trasferimento', minuti });
  };
  for (const s of lavoro) {
    if (s.tipo === 'cantiere') metteTratteFino(s.indice);
    else if (s.tipo === 'da_assegnare') metteTratteFino(tratte.length - 1);
    out.push(s);
  }
  metteTratteFino(tratte.length - 1);
  if (p.ritornoMin > 0) out.push({ tipo: 'ritorno', minuti: Math.round(p.ritornoMin) });
  return out;
}

/** "08:00" spostato di `deltaMin` minuti, sull'orologio di 24 ore. */
export function spostaOrario(hhmm: string, deltaMin: number): string {
  const [hh, mm] = hhmm.split(':').map((x) => parseInt(x, 10));
  const tot = ((((hh ?? 0) * 60 + (mm ?? 0) + Math.round(deltaMin)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
}
