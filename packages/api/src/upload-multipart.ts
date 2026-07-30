/**
 * Orchestrazione pura del multipart upload.
 *
 * Estratta da `apps/web/app/_lib/upload-queue/engine.ts` per essere
 * unit-testabile: il caricamento della singola parte è **iniettato**
 * (`caricaParte`), quindi nei test si simulano fallimenti deterministici senza
 * XHR, senza rete e senza R2.
 *
 * ─── Perché esiste (bug del 30/07/2026) ────────────────────────────────────
 * La versione precedente faceva `await Promise.all(workers)`: al primo errore
 * la promise rigettava ma **gli altri worker restavano vivi**, continuavano a
 * caricare parti e a chiamare `onProgress`. Intanto la coda faceva ripartire lo
 * stesso job → due tentativi vivi sullo stesso file che si scrivevano addosso il
 * progresso (80% → 20% → 60% → 10%), consumo di banda doppio e livelock.
 *
 * Qui invece, al primo errore:
 *   1. si abortisce il controller interno → tutte le parti in volo si fermano;
 *   2. si **attende che tutti i worker siano usciti** (`allSettled`) prima di
 *      propagare l'errore → quando `caricaParti` rigetta non c'è più nulla di
 *      vivo;
 *   3. il canale del progresso viene **chiuso**: nessun byte può più essere
 *      riportato, nemmeno da un caricatore che ignorasse il signal.
 *
 * Vedi `documentazione_generale/08_LOGICHE/Logiche_Upload_Media.md`.
 */

export interface ParteDaCaricare {
  /** 1-based, come richiede S3/R2. */
  partNumber: number;
  /** URL presigned per il PUT della parte. */
  url: string;
}

export interface ParteCompletata {
  partNumber: number;
  etag: string;
}

/** Descrizione della fetta di file da spedire, passata al caricatore. */
export interface FettaParte extends ParteDaCaricare {
  /** Indice 0-based nell'array `parts`. */
  indice: number;
  /** Offset iniziale nel file (incluso). */
  inizio: number;
  /** Offset finale nel file (escluso). */
  fine: number;
}

export type CaricaParte = (
  fetta: FettaParte,
  signal: AbortSignal,
  /** Bytes caricati FINORA per questa parte (non cumulativi sul file). */
  onBytes: (bytes: number) => void,
) => Promise<string>;

export interface OpzioniCaricaParti {
  /**
   * Parti da caricare. In caso di RIPRESA è un **sottoinsieme**: l'offset nel
   * file si ricava sempre da `partNumber`, mai dalla posizione nell'array.
   */
  parts: ParteDaCaricare[];
  partSize: number;
  fileSize: number;
  /** Quante parti in volo contemporaneamente. */
  concorrenza: number;
  caricaParte: CaricaParte;
  /** Bytes totali caricati sul file (somma di tutte le parti). */
  onProgress: (bytesTotali: number) => void;
  /** Abort esterno (annullamento utente / cancellazione job). */
  signalEsterno?: AbortSignal;
  /**
   * Bytes già presenti sul server da una sessione precedente: la barra riparte
   * da lì invece che da zero.
   */
  bytesIniziali?: number;
}

/** Errore di annullamento riconoscibile senza dipendere da DOMException. */
export function erroreAnnullato(messaggio = 'Upload annullato'): Error {
  const e = new Error(messaggio);
  e.name = 'AbortError';
  return e;
}

export function eAnnullamento(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError';
}

/**
 * Carica tutte le parti con un pool di worker.
 *
 * Garanzie:
 *  - quando la promise si risolve o rigetta, **nessun caricamento è più in
 *    volo** (tutti i worker sono usciti);
 *  - dopo il primo errore **nessun ulteriore `onProgress`** viene emesso;
 *  - `onProgress` è monotono crescente entro un singolo invocazione.
 */
export async function caricaParti(
  opzioni: OpzioniCaricaParti,
): Promise<ParteCompletata[]> {
  const {
    parts,
    partSize,
    fileSize,
    concorrenza,
    caricaParte,
    onProgress,
    signalEsterno,
  } = opzioni;
  const bytesIniziali = Math.max(0, opzioni.bytesIniziali ?? 0);

  if (parts.length === 0) return [];

  const controller = new AbortController();
  const suAbortEsterno = () => controller.abort();
  if (signalEsterno) {
    if (signalEsterno.aborted) controller.abort();
    else signalEsterno.addEventListener('abort', suAbortEsterno);
  }

  const bytesPerParte = new Array<number>(parts.length).fill(0);
  const completate: ParteCompletata[] = [];
  /** Chiuso il canale del progresso: nessun report dopo un errore/abort. */
  let chiuso = false;
  let ultimoRiportato = bytesIniziali;
  let primoErrore: unknown = null;

  const riportaProgresso = () => {
    if (chiuso) return;
    let somma = bytesIniziali;
    for (const b of bytesPerParte) somma += b;
    const valore = Math.min(somma, fileSize);
    // Monotonia difensiva: un caricatore che riparte da 0 su una singola parte
    // non deve far arretrare il totale mostrato all'utente.
    if (valore < ultimoRiportato) return;
    ultimoRiportato = valore;
    onProgress(valore);
  };

  const fallisci = (e: unknown) => {
    if (primoErrore === null) primoErrore = e;
    chiuso = true;
    controller.abort();
  };

  let prossimoIndice = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (controller.signal.aborted) return;
      const indice = prossimoIndice++;
      if (indice >= parts.length) return;
      const parte = parts[indice]!;
      // Offset dal NUMERO di parte, non dall'indice nell'array: in ripresa
      // `parts` contiene solo le mancanti e gli indici non corrispondono.
      const inizio = (parte.partNumber - 1) * partSize;
      const fine = Math.min(inizio + partSize, fileSize);
      const etag = await caricaParte(
        { ...parte, indice, inizio, fine },
        controller.signal,
        (bytes) => {
          bytesPerParte[indice] = bytes;
          riportaProgresso();
        },
      );
      if (controller.signal.aborted) return;
      completate.push({ partNumber: parte.partNumber, etag });
    }
  };

  const quanti = Math.min(Math.max(1, concorrenza), parts.length);
  // allSettled (non all): aspettiamo che TUTTI i worker escano prima di
  // propagare l'errore. È questo che impedisce i worker orfani.
  await Promise.allSettled(
    Array.from({ length: quanti }, () =>
      worker().catch((e) => {
        fallisci(e);
        throw e;
      }),
    ),
  );

  if (signalEsterno) signalEsterno.removeEventListener('abort', suAbortEsterno);

  if (primoErrore !== null) throw primoErrore;
  if (controller.signal.aborted) throw erroreAnnullato();
  if (completate.length !== parts.length) {
    throw new Error(
      `Multipart incompleto: ${completate.length}/${parts.length} parti`,
    );
  }

  return [...completate].sort((a, b) => a.partNumber - b.partNumber);
}
