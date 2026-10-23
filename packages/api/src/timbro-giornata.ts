/**
 * La giornata vista dai timbri del terminale: **il contenitore**, e come lo
 * si riempie.
 *
 * Due domande, due funzioni pure:
 *
 *  1. `statoGiornataTimbro` — dati i timbri grezzi del giorno (il terminale)
 *     e le timbrature gia' attribuite (app, QR, ufficio, o una ripartizione
 *     precedente), **in che stato e' la giornata**: niente da fare, presenza
 *     ancora aperta, scatola da riempire, turno dell'app da chiudere con il
 *     timbro, giornata coperta, o qualcosa che non torna e va all'ufficio.
 *
 *  2. `riempiScatola` — dati gli intervalli di presenza (dai timbri) e la
 *     ripartizione dichiarata (cantiere, minuti, viaggi), **gli eventi da
 *     scrivere in `timbrature`**: ingressi e uscite con l'orologio vero dei
 *     timbri, pause dove sono state timbrate, strada come buco fra i cantieri.
 *
 * ⭐ Perche' non si riusa `calcolaSegmentiSplit` cosi' com'e': quella prende
 * UN intervallo [ingresso, uscita] e mette la pausa dove le pare (al cambio
 * di cantiere piu' vicino al centro). Qui la pausa **e' stata timbrata**: la
 * persona e' uscita alle 12:31 e rientrata alle 13:28, e la giornata scritta
 * deve dirlo cosi', non «pausa alle 12:45 per comodita' di calcolo». Quindi
 * il contenitore e' una lista di intervalli, e il lavoro si versa dentro in
 * ordine, scavalcando i buchi.
 *
 * ⭐ Il contenitore e' VIRTUALE finche' non si riempie: `timbrature` nasce
 * solo qui, gia' attribuita. Il perche' e' nel manuale
 * (`Logiche_Integrazione_Timbro.md` §4): nessuno stato nostro puo' fermare
 * un export verso il gestionale, l'unico presidio e' che le ore non esistano.
 */

import { risolviSequenza, type EventoTimbro, type TimbroRisolto } from './timbri-sequenza';

// ── Il contenitore ──────────────────────────────────────────────────────────

export interface Intervallo {
  inizioMs: number;
  fineMs: number;
}

export interface Presenza {
  timbri: TimbroRisolto[];
  /** Gli intervalli chiusi ingresso → uscita, in ordine. */
  intervalli: Intervallo[];
  /** L'ultimo ingresso non ha un'uscita: qualcuno e' ancora dentro. */
  aperta: boolean;
  incoerente: boolean;
  /** Minuti dentro gli intervalli chiusi (le pause timbrate sono fuori). */
  minutiNetti: number;
  /** Minuti dei buchi fra un intervallo e il successivo: le pause timbrate. */
  minutiPausa: number;
  /** Quanti eventi non sono entrati nel conto (doppioni, senza ora). */
  scartati: number;
}

const MIN_MS = 60_000;
const minuti = (ms: number) => Math.round(ms / MIN_MS);

/** Dai timbri risolti (gia' con la direzione) agli intervalli di presenza. */
export function presenzaDaEventi(eventi: readonly EventoTimbro[]): Presenza {
  const seq = risolviSequenza(eventi);
  const intervalli: Intervallo[] = [];
  let apertoMs: number | null = null;
  for (const t of seq.timbri) {
    if (t.tipo === 'ingresso') {
      // Un ingresso dichiarato mentre si e' gia' dentro: la sequenza l'ha gia'
      // segnalato come incoerente; qui si tiene il primo, che e' il fatto.
      if (apertoMs === null) apertoMs = t.ms;
    } else if (apertoMs !== null) {
      if (t.ms > apertoMs) intervalli.push({ inizioMs: apertoMs, fineMs: t.ms });
      apertoMs = null;
    }
  }
  const minutiNetti = intervalli.reduce((a, i) => a + minuti(i.fineMs - i.inizioMs), 0);
  let minutiPausa = 0;
  for (let i = 1; i < intervalli.length; i++) {
    minutiPausa += minuti(intervalli[i]!.inizioMs - intervalli[i - 1]!.fineMs);
  }
  return {
    timbri: seq.timbri,
    intervalli,
    aperta: seq.aperta,
    incoerente: seq.incoerente,
    minutiNetti,
    minutiPausa,
    scartati: seq.scartati.length,
  };
}

// ── Lo stato della giornata ─────────────────────────────────────────────────

export interface TimbraturaAttribuita {
  id: string;
  tipo: 'ingresso' | 'uscita';
  ms: number;
  pausa: boolean;
  cantiereId: string | null;
  /** La fase del cantiere, se le ore sono attribuite a una fase. */
  sottocantiereId?: string | null;
  /**
   * Istante ESATTO (o un indice crescente), per l'ordine a parita' di `ms`:
   * con le timbrature arrotondate al passo (23/10/2026) una ripresa e una fine
   * nello stesso slot cadono sullo stesso `ms`, e l'ordine in cui sono
   * avvenute non deve andare perso.
   */
  ordine?: number;
}

export type StatoGiornataTimbro =
  /** Nessun timbro del terminale: la giornata e' quella di sempre. */
  | 'nessun_timbro'
  /** C'e' un ingresso senza uscita: si aspetta. */
  | 'presenza_aperta'
  /** Timbri chiusi e niente di attribuito: la scatola e' da riempire. */
  | 'da_ripartire'
  /** Un turno aperto dall'app, e un timbro dopo: il timbro lo chiude, e il resto si ripartisce. */
  | 'da_chiudere'
  /** Le ore attribuite coprono la presenza: niente da fare. */
  | 'coperta'
  /** Qualcosa non torna. Lo guarda una persona. */
  | 'da_verificare';

/** Cio' che serve a chi riempie: gli intervalli e i due fatti sugli estremi. */
export interface Scatola {
  intervalli: Intervallo[];
  inizioMs: number;
  fineMs: number;
  /** Minuti da ripartire prima di pause dichiarate e strada. */
  nettoMin: number;
  /** Pause gia' timbrate (i buchi fra gli intervalli). */
  pausaTimbrataMin: number;
  /**
   * Il turno aperto dall'app che il timbro chiude: il primo cantiere della
   * ripartizione e' questo, e il suo ingresso esiste gia'.
   */
  ingressoEsistente: { id: string; cantiereId: string; sottocantiereId?: string | null; ms: number } | null;
  /**
   * L'inizio e' un passaggio al terminale: la persona era in sede. Da qui la
   * proposta «lavoro in sede» e, se e' uscita, la strada dalla sede sta DENTRO
   * il contenitore.
   */
  inizioFisico: boolean;
  /** La fine e' un passaggio al terminale: idem per il rientro. */
  fineFisica: boolean;
}

export interface GiornataTimbro {
  stato: StatoGiornataTimbro;
  presenza: Presenza | null;
  scatola: Scatola | null;
  /** Per lo stato `da_verificare`: cosa non torna, a parole. */
  motivo: string | null;
  /** Minuti attribuiti (lavoro timbrato in `timbrature`) e di viaggio registrati. */
  attribuitoMin: number;
}

export const TOLLERANZA_COPERTURA_MIN = 15;

/**
 * Minuti fra ogni ingresso e l'uscita successiva, cantiere per cantiere non
 * serve: qui si misura quanto della giornata e' gia' stato detto.
 */
function minutiAttribuiti(timbrature: readonly TimbraturaAttribuita[]): number {
  const ord = [...timbrature].sort(
    (a, b) => a.ms - b.ms || (a.ordine ?? a.ms) - (b.ordine ?? b.ms) || (a.tipo === b.tipo ? 0 : a.tipo === 'uscita' ? -1 : 1),
  );
  let tot = 0;
  let aperto: number | null = null;
  for (const t of ord) {
    if (t.tipo === 'ingresso') {
      if (aperto === null) aperto = t.ms;
    } else if (aperto !== null) {
      tot += Math.max(0, minuti(t.ms - aperto));
      aperto = null;
    }
  }
  return tot;
}

export function statoGiornataTimbro(input: {
  eventi: readonly EventoTimbro[];
  timbrature: readonly TimbraturaAttribuita[];
  /** Minuti di viaggio registrati nel giorno (`timbratura_viaggio`). */
  viaggioMin?: number;
  tolleranzaMin?: number;
}): GiornataTimbro {
  const toll = Math.max(0, input.tolleranzaMin ?? TOLLERANZA_COPERTURA_MIN);
  const attribuitoMin = minutiAttribuiti(input.timbrature);
  const vuoto = (stato: StatoGiornataTimbro, motivo: string | null = null): GiornataTimbro => ({
    stato,
    presenza: null,
    scatola: null,
    motivo,
    attribuitoMin,
  });

  if (input.eventi.length === 0) return vuoto('nessun_timbro');

  const ordinate = [...input.timbrature].sort(
    (a, b) => a.ms - b.ms || (a.ordine ?? a.ms) - (b.ordine ?? b.ms) || (a.tipo === b.tipo ? 0 : a.tipo === 'uscita' ? -1 : 1),
  );
  const ultima = ordinate[ordinate.length - 1];
  const turnoAperto = ultima && ultima.tipo === 'ingresso' ? ultima : null;

  // ⭐ «Si apre dall'app e si chiude al terminale.» Il terminale da solo
  // vedrebbe un tocco e lo leggerebbe come un ingresso. Chi tiene il registro
  // sa che un turno e' gia' aperto: se a quell'ora i timbri dicono «fuori»,
  // l'inizio del turno entra nella sequenza come una direzione dichiarata, e
  // il tocco dopo diventa l'uscita. Se invece un tocco aveva gia' aperto la
  // presenza (badge in sede, poi avvio turno in cantiere), non si aggiunge
  // niente: non e' una contraddizione, e' un'attribuzione.
  // ⭐ Vale per OGNI ingresso di turno (non di pausa), aperto o chiuso: una
  // giornata «app alle 9, badge alle 18» resta la stessa giornata anche dopo
  // che le ore sono state ripartite, e il badge delle 18 deve restare
  // un'uscita. Si procede in ordine, e ogni innesto conta per i successivi:
  // con un turno 8→12 e uno 13→aperto si innesta solo l'8 (alle 13 la
  // presenza e' gia' dentro), a meno che fra i due ci sia stato un badge di
  // uscita.
  // ⚠️ Un turno CHIUSO si innesta solo se dopo di lui c'e' un tocco SENZA
  // direzione da leggere (il badge): e' a quello che l'innesto serve. Un
  // turno chiuso dall'app e poi una presenza dichiarata dall'app non hanno
  // bisogno di niente, e innestarlo farebbe due ingressi dichiarati di fila.
  const eventiPresenza: EventoTimbro[] = [...input.eventi];
  for (const t of ordinate) {
    if (t.tipo !== 'ingresso' || t.pausa) continue;
    const aperto = turnoAperto !== null && t.id === turnoAperto.id;
    const toccoDopo = input.eventi.some((e) => e.tipo === null && e.ms > t.ms);
    if (!aperto && !toccoDopo) continue;
    const prima = presenzaDaEventi(eventiPresenza.filter((e) => e.ms < t.ms));
    if (!prima.aperta) {
      eventiPresenza.push({ id: `app:${t.id}`, ms: t.ms, tipo: 'ingresso', orologio: 'telefono' });
    }
  }
  const presenza = presenzaDaEventi(eventiPresenza);
  if (presenza.timbri.length === 0) return vuoto('nessun_timbro');
  const con = (stato: StatoGiornataTimbro, scatola: Scatola | null, motivo: string | null = null): GiornataTimbro => ({
    stato,
    presenza,
    scatola,
    motivo,
    attribuitoMin,
  });

  if (presenza.incoerente) {
    return con('da_verificare', null, 'Una direzione dichiarata contraddice la sequenza dei timbri.');
  }

  const fineMs = presenza.intervalli[presenza.intervalli.length - 1]?.fineMs ?? null;

  // Niente di attribuito: o si aspetta l'uscita, o la scatola e' pronta.
  if (ordinate.length === 0) {
    if (presenza.aperta || presenza.intervalli.length === 0) return con('presenza_aperta', null);
    const scatola: Scatola = {
      intervalli: presenza.intervalli,
      inizioMs: presenza.intervalli[0]!.inizioMs,
      fineMs: fineMs!,
      nettoMin: presenza.minutiNetti,
      pausaTimbrataMin: presenza.minutiPausa,
      ingressoEsistente: null,
      inizioFisico: true,
      fineFisica: true,
    };
    if (scatola.nettoMin <= 0) return con('da_verificare', null, 'La presenza timbrata dura zero minuti.');
    return con('da_ripartire', scatola);
  }

  // Un turno aperto dall'app: se c'e' un timbro di uscita dopo, e' lui che lo chiude.
  if (turnoAperto) {
    if (presenza.aperta || fineMs === null) return con('presenza_aperta', null);
    if (fineMs <= turnoAperto.ms) {
      return con(
        'da_verificare',
        null,
        'Il turno aperto dall’app e’ successivo all’ultimo timbro del terminale.',
      );
    }
    if (!turnoAperto.cantiereId) {
      return con('da_verificare', null, 'Il turno aperto non ha un cantiere.');
    }
    const intervalli = presenza.intervalli
      .filter((i) => i.fineMs > turnoAperto.ms)
      .map((i) => ({ inizioMs: Math.max(i.inizioMs, turnoAperto.ms), fineMs: i.fineMs }));
    const nettoMin = intervalli.reduce((a, i) => a + minuti(i.fineMs - i.inizioMs), 0);
    let pausa = 0;
    for (let i = 1; i < intervalli.length; i++) {
      pausa += minuti(intervalli[i]!.inizioMs - intervalli[i - 1]!.fineMs);
    }
    if (nettoMin <= 0) return con('da_verificare', null, 'Fra il turno aperto e il timbro di uscita non passa tempo.');
    return con('da_chiudere', {
      intervalli,
      inizioMs: turnoAperto.ms,
      fineMs,
      nettoMin,
      pausaTimbrataMin: pausa,
      ingressoEsistente: {
        id: turnoAperto.id,
        cantiereId: turnoAperto.cantiereId,
        ...conFase(turnoAperto.sottocantiereId),
        ms: turnoAperto.ms,
      },
      inizioFisico: false,
      fineFisica: true,
    });
  }

  // Tutto chiuso dall'app, e la presenza e' ancora aperta. Due casi: la
  // presenza che CONTENEVA il turno non si e' chiusa (manca il badge di
  // uscita: da verificare), oppure dopo il turno e' cominciata una presenza
  // NUOVA (in sede, senza cantiere): quella e' solo aperta, si aspetta.
  if (presenza.aperta) {
    const ultimaUscitaMs = [...ordinate].reverse().find((t) => t.tipo === 'uscita' && !t.pausa)?.ms ?? null;
    const apertaDaMs = [...presenza.timbri].reverse().find((t) => t.tipo === 'ingresso')?.ms ?? null;
    if (ultimaUscitaMs !== null && apertaDaMs !== null && apertaDaMs > ultimaUscitaMs) {
      return con('presenza_aperta', null);
    }
    return con('da_verificare', null, 'Le ore sono attribuite ma manca il timbro di uscita dal terminale.');
  }
  // ⭐ Si apre con una bocca e si chiude con un'altra: badge in sede la
  // mattina, QR in cantiere, chiusura dall'app. Il turno copre la presenza
  // dal suo primo ingresso alla sua ultima uscita vera, pause e strade fra i
  // cantieri comprese (stanno DENTRO la giornata di lavoro). Cio' che della
  // presenza resta FUORI da quell'arco — prima di partire, dopo essere
  // tornati — e' una scatola da riempire, non un'anomalia.
  // Ore attribuite OLTRE la presenza non sono una scatola mezza vuota: sono
  // una stima di strada piu' lunga del buco vero, o un turno dell'app partito
  // prima del badge. Le giudica la soglia di verifica delle giornate, non qui.
  const arcoInizio = ordinate.find((t) => t.tipo === 'ingresso')?.ms ?? null;
  const arcoFine = [...ordinate].reverse().find((t) => t.tipo === 'uscita' && !t.pausa)?.ms ?? null;
  const scoperti: Intervallo[] = [];
  for (const i of presenza.intervalli) {
    if (arcoInizio === null || arcoFine === null) {
      scoperti.push(i);
      continue;
    }
    if (i.inizioMs < arcoInizio) scoperti.push({ inizioMs: i.inizioMs, fineMs: Math.min(i.fineMs, arcoInizio) });
    if (i.fineMs > arcoFine) scoperti.push({ inizioMs: Math.max(i.inizioMs, arcoFine), fineMs: i.fineMs });
  }
  const scopertoMin = scoperti.reduce((a, i) => a + minuti(i.fineMs - i.inizioMs), 0);
  // La strada agli estremi (andata dalla sede, ritorno) sta in quel buco: e'
  // gia' registrata come viaggio, non va chiesta di nuovo.
  const scarto = scopertoMin - Math.max(0, Math.round(input.viaggioMin ?? 0));
  if (scarto <= toll) return con('coperta', null);
  return con('da_ripartire', {
    intervalli: scoperti,
    inizioMs: scoperti[0]!.inizioMs,
    fineMs: scoperti[scoperti.length - 1]!.fineMs,
    nettoMin: scopertoMin,
    // I buchi fra i pezzi scoperti sono il turno, non una pausa.
    pausaTimbrataMin: 0,
    ingressoEsistente: null,
    inizioFisico: true,
    fineFisica: true,
  });
}

// ── Riempire la scatola ─────────────────────────────────────────────────────

export interface SegmentoScatola {
  cantiereId: string;
  /** La fase del cantiere, se scelta. Due fasi dello stesso cantiere sono due segmenti. */
  sottocantiereId?: string | null;
  minuti: number;
}

export interface EventoScatola {
  cantiereId: string;
  sottocantiereId?: string | null;
  tipo: 'ingresso' | 'uscita';
  pausa: boolean;
  ms: number;
}

export type ErroreScatola =
  | 'NESSUN_SEGMENTO'
  | 'NESSUN_INTERVALLO'
  | 'NETTO_NON_VALIDO'
  | 'SOMMA_NON_TORNA';

export interface RiempiScatolaInput {
  intervalli: readonly Intervallo[];
  /** In ordine; l'ultimo assorbe il resto, come nello split di fine turno. */
  segmenti: readonly SegmentoScatola[];
  /** Strada PRIMA di ogni segmento (stesso indice); il primo si ignora. */
  viaggioPrima?: readonly number[];
  /** Strada dalla sede al primo cantiere, dentro il contenitore (inizio fisico). */
  andataMin?: number;
  /** Strada dall'ultimo cantiere alla sede, dentro il contenitore (fine fisica). */
  ritornoMin?: number;
  /** Una pausa non timbrata, dichiarata: si scava al centro dell'intervallo piu' lungo. */
  pausaDichiarataMin?: number;
}

export type RiempiScatolaResult =
  | { ok: true; eventi: EventoScatola[]; nettoMin: number }
  | { ok: false; error: ErroreScatola };

/** Il campo della fase compare solo se c'e': gli eventi senza fase restano com'erano. */
const conFase = (fase: string | null | undefined) => (fase ? { sottocantiereId: fase } : {});

function nonNeg(n: number | undefined): number {
  return Math.max(0, Math.round(n ?? 0));
}

export function riempiScatola(input: RiempiScatolaInput): RiempiScatolaResult {
  // 1. Gli intervalli, puliti e in ordine.
  let intervalli = input.intervalli
    .filter((i) => Number.isFinite(i.inizioMs) && Number.isFinite(i.fineMs) && i.fineMs > i.inizioMs)
    .map((i) => ({ inizioMs: i.inizioMs, fineMs: i.fineMs }))
    .sort((a, b) => a.inizioMs - b.inizioMs);
  if (intervalli.length === 0) return { ok: false, error: 'NESSUN_INTERVALLO' };
  if (input.segmenti.length === 0) return { ok: false, error: 'NESSUN_SEGMENTO' };

  // 2. Una pausa dichiarata si scava al centro dell'intervallo piu' lungo: e'
  //    la stessa scelta di `calcolaSegmentiSplit` per il cantiere unico, ma
  //    qui gli estremi sono fatti e non si spostano.
  const pausaDich = nonNeg(input.pausaDichiarataMin);
  if (pausaDich > 0) {
    let k = 0;
    for (let i = 1; i < intervalli.length; i++) {
      if (intervalli[i]!.fineMs - intervalli[i]!.inizioMs > intervalli[k]!.fineMs - intervalli[k]!.inizioMs) k = i;
    }
    const lungo = intervalli[k]!;
    const durata = minuti(lungo.fineMs - lungo.inizioMs);
    if (durata <= pausaDich + 1) return { ok: false, error: 'NETTO_NON_VALIDO' };
    const centro = lungo.inizioMs + Math.round((lungo.fineMs - lungo.inizioMs) / 2);
    const mezza = Math.round((pausaDich * MIN_MS) / 2);
    intervalli = [
      ...intervalli.slice(0, k),
      { inizioMs: lungo.inizioMs, fineMs: centro - mezza },
      { inizioMs: centro - mezza + pausaDich * MIN_MS, fineMs: lungo.fineMs },
      ...intervalli.slice(k + 1),
    ];
  }

  // 3. I conti: presenza − strada − pausa dichiarata = lavoro da versare.
  const presenzaMin = intervalli.reduce((a, i) => a + minuti(i.fineMs - i.inizioMs), 0);
  const andata = nonNeg(input.andataMin);
  const ritorno = nonNeg(input.ritornoMin);

  // Cantieri consecutivi uguali (stessa fase) sono uno: nessuna strada verso
  // se' stessi. Due fasi dello stesso cantiere restano due segmenti: cambiano
  // le righe, non la strada (che fra loro vale zero).
  type Seg = { cantiereId: string; sottocantiereId: string | null; minuti: number; viaggioPrima: number };
  const segs: Seg[] = [];
  input.segmenti.forEach((s, i) => {
    const m = nonNeg(s.minuti);
    const v = i === 0 ? 0 : nonNeg(input.viaggioPrima?.[i]);
    const fase = s.sottocantiereId ?? null;
    const prev = segs[segs.length - 1];
    if (prev && prev.cantiereId === s.cantiereId && prev.sottocantiereId === fase) {
      prev.minuti += m;
      return;
    }
    segs.push({ cantiereId: s.cantiereId, sottocantiereId: fase, minuti: m, viaggioPrima: v });
  });
  const ultimo = segs.length - 1;
  const stradaFra = segs.reduce((a, s, i) => a + (s.minuti > 0 || i === ultimo ? s.viaggioPrima : 0), 0);
  const lavoroMin = presenzaMin - andata - ritorno - stradaFra;
  if (lavoroMin <= 0) return { ok: false, error: 'NETTO_NON_VALIDO' };

  const sommaRest = segs.slice(0, -1).reduce((a, s) => a + s.minuti, 0);
  if (sommaRest > lavoroMin) return { ok: false, error: 'SOMMA_NON_TORNA' };
  segs[ultimo] = { ...segs[ultimo]!, minuti: lavoroMin - sommaRest };
  if (segs[ultimo]!.minuti === 0 && segs[ultimo]!.viaggioPrima > 0) {
    return { ok: false, error: 'SOMMA_NON_TORNA' };
  }
  const vivi = segs.filter((s) => s.minuti > 0);
  if (vivi.length === 0) return { ok: false, error: 'NETTO_NON_VALIDO' };

  // 4. Si versa: un cursore che scorre gli intervalli. Il lavoro emette le
  //    pause ai bordi; la strada li scavalca senza dire niente (si e' in
  //    viaggio, non in cantiere).
  const eventi: EventoScatola[] = [];
  let k = 0;
  let cursore = intervalli[0]!.inizioMs;
  let cantiereAperto: string | null = null;
  let faseAperta: string | null = null;

  const viaggia = (min: number) => {
    let resto = min * MIN_MS;
    while (resto > 0) {
      const fine = intervalli[k]!.fineMs;
      const posso = Math.max(0, fine - cursore);
      const prendo = Math.min(posso, resto);
      cursore += prendo;
      resto -= prendo;
      if (resto > 0) {
        if (k + 1 >= intervalli.length) return false;
        k += 1;
        cursore = intervalli[k]!.inizioMs;
      }
    }
    return true;
  };

  /** Prima di aprire un cantiere: se si e' sul bordo di un intervallo, si passa al successivo. */
  const allineaAllInizio = () => {
    while (cursore >= intervalli[k]!.fineMs && k + 1 < intervalli.length) {
      k += 1;
      cursore = intervalli[k]!.inizioMs;
    }
  };

  const lavora = (cantiereId: string, sottocantiereId: string | null, min: number): boolean => {
    let resto = min * MIN_MS;
    while (resto > 0) {
      const fine = intervalli[k]!.fineMs;
      const posso = Math.max(0, fine - cursore);
      const prendo = Math.min(posso, resto);
      cursore += prendo;
      resto -= prendo;
      if (resto > 0) {
        // L'intervallo e' finito: pausa timbrata. Si chiude e si riapre sullo
        // stesso cantiere, con il flag che lo dice.
        if (k + 1 >= intervalli.length) return false;
        eventi.push({ cantiereId, ...conFase(sottocantiereId), tipo: 'uscita', pausa: true, ms: cursore });
        k += 1;
        cursore = intervalli[k]!.inizioMs;
        eventi.push({ cantiereId, ...conFase(sottocantiereId), tipo: 'ingresso', pausa: true, ms: cursore });
      }
    }
    return true;
  };

  if (!viaggia(andata)) return { ok: false, error: 'NETTO_NON_VALIDO' };
  for (let i = 0; i < vivi.length; i++) {
    const s = vivi[i]!;
    if (cantiereAperto) {
      eventi.push({ cantiereId: cantiereAperto, ...conFase(faseAperta), tipo: 'uscita', pausa: false, ms: cursore });
      cantiereAperto = null;
      faseAperta = null;
      if (!viaggia(s.viaggioPrima)) return { ok: false, error: 'NETTO_NON_VALIDO' };
    }
    allineaAllInizio();
    // Un cambio di cantiere che cade esattamente su una pausa timbrata: la
    // pausa si legge sull'uscita precedente e su questo ingresso.
    const precedente = eventi[eventi.length - 1];
    const sulBordo = precedente && precedente.tipo === 'uscita' && cursore > precedente.ms && s.viaggioPrima === 0;
    if (sulBordo) precedente.pausa = true;
    eventi.push({ cantiereId: s.cantiereId, ...conFase(s.sottocantiereId), tipo: 'ingresso', pausa: !!sulBordo, ms: cursore });
    cantiereAperto = s.cantiereId;
    faseAperta = s.sottocantiereId;
    if (!lavora(s.cantiereId, s.sottocantiereId, s.minuti)) return { ok: false, error: 'NETTO_NON_VALIDO' };
  }
  if (cantiereAperto) {
    eventi.push({ cantiereId: cantiereAperto, ...conFase(faseAperta), tipo: 'uscita', pausa: false, ms: cursore });
  }
  if (!viaggia(ritorno)) return { ok: false, error: 'NETTO_NON_VALIDO' };

  return { ok: true, eventi, nettoMin: lavoroMin };
}
