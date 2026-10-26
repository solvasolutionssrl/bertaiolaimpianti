/**
 * Le **fasi del turno** di Timbro (dal 26/10/2026): come si legge un passaggio
 * del terminale che dichiara in che punto della giornata si trova la persona.
 *
 * Timbro manda tre cose nuove su ogni passaggio: `step` (la fase), `step_source`
 * (chi l'ha stabilita) e `shift_was_open` (se Timbro sapeva di un turno aperto).
 * Il contratto e' **additivo**: finche' FPM resta in «Solo evento» arriva tutto
 * `null` e qui non cambia niente.
 *
 * ⚠️⚠️ **`direction` non si guarda mai.** Con una fase presente la direzione e'
 * determinata dalla fase; senza, e' una deduzione del terminale. Lo dice Timbro
 * stesso: «non fidarti di `direction`». La direzione, da noi, la decide la
 * sequenza (`timbri-sequenza`), che conosce anche le timbrature della nostra app
 * e quindi ne sa di piu'.
 *
 * ⚠️ **`inferred` e' un'ipotesi, non un fatto.** Il terminale la ricava
 * dall'ultimo stato che *lui* conosce: se la persona ha aperto il turno dalla
 * nostra app e noi non l'abbiamo ancora scritto su Timbro, l'ipotesi e'
 * sbagliata. Per questo `leggiPasso` vuole sapere cosa dice la NOSTRA sequenza
 * e, quando le due si contraddicono, lo dichiara invece di scegliere.
 */

export type PassoTimbro = 'start' | 'pause_start' | 'pause_end' | 'end';
export type OriginePasso = 'person' | 'inferred' | 'api' | 'office';
/** Lo stato che conosciamo NOI, dalla nostra sequenza. */
export type StatoNostro = 'aperto' | 'in_pausa' | 'chiuso' | 'ignoto';

export interface CampiPasso {
  step?: string | null;
  step_source?: string | null;
  shift_was_open?: boolean | null;
}

export type Fiducia =
  /** La persona ha toccato il tasto, o l'ha scritta l'ufficio di Timbro. */
  | 'dichiarata'
  /** L'ha dedotta il terminale: va confrontata con la nostra sequenza. */
  | 'ipotesi'
  /** L'abbiamo scritta noi: non dovrebbe nemmeno rientrare. */
  | 'nostra'
  /** Nessuno l'ha indicata. */
  | 'nessuna';

export interface LetturaPasso {
  passo: PassoTimbro | null;
  fiducia: Fiducia;
  /** Il verso che la FASE impone. `null` = la fase non c'e', decide la sequenza. */
  verso: 'ingresso' | 'uscita' | null;
  /** La fase dichiara una pausa pranzo (inizio o rientro). */
  pausa: boolean;
  /**
   * L'ipotesi del terminale contraddice quello che sappiamo noi. Non si
   * sceglie qui: si dichiara, e chi legge preferisce la propria sequenza.
   */
  contraddice: boolean;
}

const PASSI: Record<PassoTimbro, { verso: 'ingresso' | 'uscita'; pausa: boolean }> = {
  start: { verso: 'ingresso', pausa: false },
  pause_start: { verso: 'uscita', pausa: true },
  pause_end: { verso: 'ingresso', pausa: true },
  end: { verso: 'uscita', pausa: false },
};

function passoValido(v: unknown): v is PassoTimbro {
  return typeof v === 'string' && v in PASSI;
}

function fiduciaDa(origine: unknown, passo: PassoTimbro | null): Fiducia {
  if (!passo) return 'nessuna';
  if (origine === 'person' || origine === 'office') return 'dichiarata';
  if (origine === 'api') return 'nostra';
  if (origine === 'inferred') return 'ipotesi';
  // ⚠️ Un'origine che non conosciamo non si promuove a «dichiarata»: un valore
  // nuovo nel contratto di Timbro non deve diventare una verita' da noi.
  return 'ipotesi';
}

/**
 * Una fase dedotta dal terminale contraddice il nostro stato quando il
 * terminale crede che il turno sia chiuso (e propone un inizio) mentre per noi
 * e' aperto, o viceversa.
 */
function contraddiceIlNostro(passo: PassoTimbro, nostro: StatoNostro): boolean {
  if (nostro === 'ignoto') return false;
  if (passo === 'start') return nostro === 'aperto' || nostro === 'in_pausa';
  if (passo === 'pause_end') return nostro !== 'in_pausa';
  if (passo === 'pause_start' || passo === 'end') return nostro === 'chiuso';
  return false;
}

export function leggiPasso(p: CampiPasso, nostro: StatoNostro = 'ignoto'): LetturaPasso {
  const passo = passoValido(p.step) ? p.step : null;
  const fiducia = fiduciaDa(p.step_source, passo);
  if (!passo) {
    return { passo: null, fiducia: 'nessuna', verso: null, pausa: false, contraddice: false };
  }
  const { verso, pausa } = PASSI[passo];
  return {
    passo,
    fiducia,
    verso,
    pausa,
    contraddice: fiducia === 'ipotesi' && contraddiceIlNostro(passo, nostro),
  };
}

/**
 * ⭐ Si segue la fase del terminale solo quando e' **dichiarata** o nostra.
 * Un'ipotesi non batte la nostra sequenza: noi conosciamo anche i timbri
 * dell'app, il terminale no.
 */
export function faseDaSeguire(l: LetturaPasso): boolean {
  return l.fiducia === 'dichiarata' || l.fiducia === 'nostra';
}

/** Come si chiama una fase a schermo. */
export function etichettaPasso(passo: PassoTimbro | null): string | null {
  if (passo === 'start') return 'Inizio giornata';
  if (passo === 'pause_start') return 'Inizio pausa';
  if (passo === 'pause_end') return 'Rientro dalla pausa';
  if (passo === 'end') return 'Fine giornata';
  return null;
}

/** Il nostro gesto → la fase di Timbro. Le quattro combaciano una a una. */
export function passoDaAzione(azione: string): PassoTimbro | null {
  if (azione === 'inizio') return 'start';
  if (azione === 'pausa') return 'pause_start';
  if (azione === 'ripresa') return 'pause_end';
  if (azione === 'fine') return 'end';
  return null;
}

/** La fase che una NOSTRA timbratura dichiara, dal verso e dal flag pausa. */
export function passoDaTimbratura(tipo: 'ingresso' | 'uscita', pausa: boolean): PassoTimbro {
  if (tipo === 'ingresso') return pausa ? 'pause_end' : 'start';
  return pausa ? 'pause_start' : 'end';
}

/**
 * Quali righe di un lotto si specchiano su Timbro.
 *
 * ⚠️⚠️ **Non tutte.** Il nostro scrittore unico produce anche righe
 * *derivate*: la divisione di fine turno, «Registra giornata», la scatola
 * timbrata e il cambio cantiere scrivono piu' righe in un colpo, che non sono
 * gesti ma una ricostruzione. Mandarle tutte direbbe al terminale che la
 * persona ha aperto e chiuso il turno cinque volte, e il suo `inferred`
 * diventerebbe sbagliato proprio per colpa nostra.
 *
 * Si manda quindi: **il lotto da una riga sola** (un gesto vero: badge QR,
 * tasto nell'app, capo squadra) e **la fine turno** di un lotto qualsiasi, che
 * e' l'unico fatto che il terminale deve conoscere di una giornata ricostruita.
 *
 * ⚠️⚠️ **Un'uscita seguita da un ingresso della stessa persona non e' una fine
 * turno**: e' un cambio cantiere, e la persona sta ancora lavorando. Mandarla
 * sarebbe **peggio di non mandare niente**: per Timbro il turno risulterebbe
 * chiuso, e il badge di fine giornata verrebbe registrato come `start`
 * dedotto — un'informazione sbagliata con una fiducia apparente, invece di un
 * onesto «non lo so». Concordato con Timbro il 26/10/2026.
 *
 * ⭐ Il riconoscimento guarda **la sequenza, non gli orari**: «c'e' un ingresso
 * dopo?» regge anche se i due istanti non coincidono, mentre «stesso istante»
 * dipende da come il chiamante arrotonda.
 *
 * ⚠️ Mai le righe che vengono DA Timbro (`origine: 'timbro'`): si rimanderebbe
 * indietro cio' che si e' appena letto.
 */
export function daSpecchiare<T extends { tipo: 'ingresso' | 'uscita'; pausa: boolean; origine: string; ts: string; dipendenteId: string }>(
  righe: readonly T[],
): T[] {
  const vive = righe.filter((r) => r.origine === 'qr' || r.origine === 'cronometro' || r.origine === 'capo');
  if (vive.length === 0) return [];
  if (righe.length === 1) return vive;
  // Un lotto composto: solo la fine turno vera, l'ultima per persona.
  // L'ultimo ingresso di ciascuno dice fin dove il turno e' ancora aperto.
  const ultimoIngresso = new Map<string, number>();
  for (const r of righe) {
    if (r.tipo !== 'ingresso') continue;
    const t = Date.parse(r.ts);
    const p = ultimoIngresso.get(r.dipendenteId);
    if (p === undefined || t > p) ultimoIngresso.set(r.dipendenteId, t);
  }
  const fini = new Map<string, T>();
  for (const r of vive) {
    if (r.tipo !== 'uscita' || r.pausa) continue;
    const dopo = ultimoIngresso.get(r.dipendenteId);
    if (dopo !== undefined && dopo >= Date.parse(r.ts)) continue; // riapre: non e' una fine
    const p = fini.get(r.dipendenteId);
    if (!p || Date.parse(r.ts) > Date.parse(p.ts)) fini.set(r.dipendenteId, r);
  }
  return [...fini.values()];
}

/**
 * Il nostro stato di giornata, dalla nostra ultima timbratura: serve a
 * `leggiPasso` per riconoscere un'ipotesi sbagliata del terminale.
 */
export function statoNostroDa(
  ultima: { tipo: 'ingresso' | 'uscita'; pausa?: boolean | null } | null | undefined,
): StatoNostro {
  if (!ultima) return 'ignoto';
  if (ultima.tipo === 'ingresso') return 'aperto';
  return ultima.pausa ? 'in_pausa' : 'chiuso';
}
