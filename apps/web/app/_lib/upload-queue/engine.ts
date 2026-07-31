/**
 * Engine di upload R2: init → PUT/multipart → complete.
 *
 * Invocato dal worker della UploadQueue (background, non legato a un
 * componente React). Mantiene le stesse API contrattuali verso il server
 * (init, complete, abort).
 *
 * L'orchestrazione del multipart vive in `@kommessa/api/upload-multipart`
 * (pura e unit-testata): qui restiamo con la sola colla DOM (XHR).
 *
 * ─── Correzioni 30/07/2026 ────────────────────────────────────────────────
 *  - i worker fratelli vengono fermati al primo errore e `caricaParti` non
 *    ritorna finché non sono tutti usciti → niente più due tentativi vivi sullo
 *    stesso file che si scrivono addosso il progresso;
 *  - ogni XHR ha una **sentinella di stallo**: se non arrivano byte per
 *    `STALLO_MS` la richiesta viene abortita (prima un upload congelato teneva
 *    lo slot occupato per sempre);
 *  - il progresso è monotono per tentativo.
 *
 * Vedi `documentazione_generale/08_LOGICHE/Logiche_Upload_Media.md`.
 */

import {
  caricaParti,
  erroreAnnullato,
  type CaricaParte,
} from '@kommessa/api/upload-multipart';

import type {
  CompletePartInfo,
  CompleteRequestBody,
  CompleteResponse,
  InitRequestBody,
  InitResponse,
  ResumeResponse,
  ResumeResponseMultipart,
} from '../media-upload-types';

/**
 * Sopra questa dimensione NON si calcola l'impronta SHA-256 lato client.
 *
 * `crypto.subtle.digest` non ha una forma a flusso: per calcolarla bisogna
 * caricare **tutto** il file in memoria (`blob.arrayBuffer()`) e macinarlo sul
 * main thread. Con la soglia precedente (100 MB) un video da 90 MB si portava
 * dietro un'allocazione da 90 MB e qualche secondo di blocco **subito dopo
 * l'ultima parte** — cioè al 100%, quando l'utente si aspetta "fatto" e invece
 * il telefono resta fermo. Su iOS, con la memoria già occupata dai buffer
 * dell'upload, è anche un ottimo modo per farsi terminare la scheda.
 *
 * L'impronta serve solo a essere archiviata (`file_refs.sha256`, per una
 * eventuale deduplica futura): non viene verificata dal server, che si fida
 * dell'HEAD su R2. Rinunciarvi sui file grandi non toglie nessuna garanzia.
 * Sotto la soglia (foto e PDF) resta, e costa qualche decina di millisecondi.
 */
const DEFAULT_SHA256_MAX = 16 * 1024 * 1024; // 16 MB
const DEFAULT_CONCURRENCY = 3;
/** Nessun byte trasferito per questo tempo ⇒ la richiesta è considerata morta. */
const STALLO_MS = 45_000;

export interface RunUploadOptions {
  /** Concorrenza per i part upload multipart. */
  multipartConcurrency?: number;
  /** Calcola SHA-256 client se size ≤ questa soglia. */
  sha256MaxBytes?: number;
  /** AbortController esterno: il chiamante può cancellare il job. */
  abort: AbortController;
  /** Callback bytes caricati totali (per il progress). */
  onProgress: (bytesUploaded: number) => void;
  /** Callback quando il server emette il fileRefId (init OK). */
  onFileRefId: (fileRefId: string) => void;
  /** Callback transizione di fase (per UI). */
  onPhase: (phase: 'init' | 'uploading' | 'finalizing') => void;
}

export interface RunUploadResult {
  fileRefId: string;
  sizeBytes: number;
}

export interface UploadInputForEngine {
  file: Blob;
  fileName: string;
  fileMime: string;
  fileSize: number;
  /** Esattamente uno fra `commessaId` e `bozzaId` (lo impone anche /init). */
  commessaId?: string | null;
  momento?: 'sopralluogo' | 'in_corso' | 'finale' | null;
  voceId?: number | null;
  riunioneId?: string | null;
  bozzaId?: string | null;
  kind?: 'foto' | 'video' | 'pdf_acquisito' | null;
  geoLat?: number | null;
  geoLng?: number | null;
  takenAtIso?: string | null;
  /**
   * fileRefId di un upload interrotto da riprendere (app chiusa a metà).
   * Si tenta `/resume`: se il multipart su R2 è ancora aperto si ricaricano
   * solo le parti mancanti, altrimenti si riparte con un /init pulito.
   */
  ripresaFileRefId?: string | null;
}

/**
 * Esegue un singolo upload end-to-end. Idempotente lato server:
 * un retry chiama di nuovo /init (nuovo fileRefId) — il server tollera.
 */
export async function runUpload(
  input: UploadInputForEngine,
  options: RunUploadOptions,
): Promise<RunUploadResult> {
  const concurrency = Math.max(1, options.multipartConcurrency ?? DEFAULT_CONCURRENCY);
  const sha256MaxBytes = options.sha256MaxBytes ?? DEFAULT_SHA256_MAX;
  const { abort, onProgress, onFileRefId, onPhase } = options;

  onPhase('init');

  // 0) RIPRESA — se questo job era già partito in una sessione precedente,
  // chiediamo a R2 (tramite il server) cosa è già arrivato e ricarichiamo solo
  // il resto. Fail-soft: qualunque intoppo e si riparte da un /init pulito.
  let ripresa: ResumeResponseMultipart | null = null;
  if (input.ripresaFileRefId) {
    try {
      const res = await fetch(
        `/api/upload/media/${input.ripresaFileRefId}/resume`,
        { method: 'POST', signal: abort.signal },
      );
      if (res.ok) {
        const dati = (await res.json()) as ResumeResponse;
        if (dati.mode === 'multipart') ripresa = dati;
      }
    } catch (e) {
      if (abort.signal.aborted) throw e;
      // resume non disponibile → si ricomincia da capo
    }
  }

  if (ripresa) {
    onFileRefId(ripresa.fileRefId);
    onPhase('uploading');
    const nuove =
      ripresa.parts.length > 0
        ? await caricaParti({
            parts: ripresa.parts,
            partSize: ripresa.partSize,
            fileSize: input.fileSize,
            concorrenza: concurrency,
            caricaParte: (fetta, signal, onBytes) =>
              inviaBlob({
                url: fetta.url,
                blob: input.file.slice(fetta.inizio, fetta.fine),
                signal,
                onBytes,
                richiediEtag: true,
              }),
            onProgress,
            signalEsterno: abort.signal,
            bytesIniziali: ripresa.bytesGiaCaricati,
          })
        : [];
    return finalizza({
      fileRefId: ripresa.fileRefId,
      parts: [...ripresa.giaCaricate, ...nuove],
      input,
      sha256MaxBytes,
      abort,
      onPhase,
      onProgress,
    });
  }

  // 1) INIT
  // NB: /api/upload/media/init impone `commessaId` XOR `bozzaId` — mandarne
  // due o zero è un 400. Quindi si valorizza solo quello presente.
  if (!input.commessaId === !input.bozzaId) {
    throw new Error('Upload: serve esattamente uno fra commessaId e bozzaId');
  }
  const initBody: Omit<InitRequestBody, 'commessaId'> & {
    commessaId?: string;
    bozzaId?: string;
    riunioneId?: string | null;
    kind?: 'foto' | 'video' | 'pdf_acquisito' | null;
    takenAtIso?: string | null;
  } = {
    ...(input.commessaId
      ? { commessaId: input.commessaId }
      : { bozzaId: input.bozzaId as string }),
    momento: input.momento ?? undefined,
    voceId: input.voceId ?? null,
    filename: input.fileName,
    mime: input.fileMime || 'application/octet-stream',
    sizeBytes: input.fileSize,
    geoLat: input.geoLat ?? null,
    geoLng: input.geoLng ?? null,
    riunioneId: input.riunioneId ?? null,
    kind: input.kind ?? null,
    takenAtIso: input.takenAtIso ?? null,
  };
  const initRes = await fetch('/api/upload/media/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(initBody),
    signal: abort.signal,
  });
  if (!initRes.ok) {
    const t = await initRes.text();
    throw new Error(`init ${initRes.status}: ${t.slice(0, 200)}`);
  }
  const init = (await initRes.json()) as InitResponse;
  onFileRefId(init.fileRefId);

  // 2) UPLOAD
  onPhase('uploading');
  let completedParts: CompletePartInfo[] = [];

  if (init.mode === 'single') {
    await inviaBlob({
      url: init.uploadUrl,
      blob: input.file,
      signal: abort.signal,
      onBytes: onProgress,
    });
  } else {
    const caricaParte: CaricaParte = (fetta, signal, onBytes) =>
      inviaBlob({
        url: fetta.url,
        blob: input.file.slice(fetta.inizio, fetta.fine),
        signal,
        onBytes,
        richiediEtag: true,
      });

    completedParts = await caricaParti({
      parts: init.parts,
      partSize: init.partSize,
      fileSize: input.fileSize,
      concorrenza: concurrency,
      caricaParte,
      onProgress,
      signalEsterno: abort.signal,
    });
  }

  // 3) FINALIZE
  return finalizza({
    fileRefId: init.fileRefId,
    parts: init.mode === 'multipart' ? completedParts : undefined,
    input,
    sha256MaxBytes,
    abort,
    onPhase,
    onProgress,
  });
}

/** SHA-256 client (se il file è piccolo) + POST /complete. */
async function finalizza(opzioni: {
  fileRefId: string;
  parts?: CompletePartInfo[];
  input: UploadInputForEngine;
  sha256MaxBytes: number;
  abort: AbortController;
  onPhase: RunUploadOptions['onPhase'];
  onProgress: RunUploadOptions['onProgress'];
}): Promise<RunUploadResult> {
  const { fileRefId, parts, input, sha256MaxBytes, abort, onPhase, onProgress } =
    opzioni;

  onPhase('finalizing');
  onProgress(input.fileSize);

  let sha256Hex: string | undefined;
  if (input.fileSize <= sha256MaxBytes) {
    sha256Hex = await sha256OfBlob(input.file);
  }

  const body: CompleteRequestBody = { sha256Hex, parts };
  const res = await fetch(`/api/upload/media/${fileRefId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: abort.signal,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`complete ${res.status}: ${t.slice(0, 200)}`);
  }
  const completato = (await res.json()) as CompleteResponse;
  return { fileRefId: completato.fileRefId, sizeBytes: completato.sizeBytes };
}

/** Notifica al server che un job è fallito/cancellato — best-effort. */
export function notifyAbortToServer(fileRefId: string): void {
  fetch(`/api/upload/media/${fileRefId}/abort`, {
    method: 'POST',
    keepalive: true,
  }).catch(() => {});
}

// --------------------------------------------------------------------------
// XHR: un solo helper per il PUT singolo e per la parte multipart.
// --------------------------------------------------------------------------

function inviaBlob(opzioni: {
  url: string;
  blob: Blob;
  signal: AbortSignal;
  onBytes: (bytes: number) => void;
  /** Le parti multipart DEVONO restituire un ETag (serve al complete). */
  richiediEtag?: boolean;
}): Promise<string> {
  const { url, blob, signal, onBytes, richiediEtag } = opzioni;

  return new Promise<string>((resolve, reject) => {
    if (signal.aborted) {
      reject(erroreAnnullato());
      return;
    }

    const xhr = new XMLHttpRequest();
    let sentinella: ReturnType<typeof setTimeout> | null = null;
    let concluso = false;

    const chiudi = () => {
      if (sentinella) {
        clearTimeout(sentinella);
        sentinella = null;
      }
      signal.removeEventListener('abort', suAbort);
    };

    /** Riarma la sentinella a ogni segno di vita della connessione. */
    const riarma = () => {
      if (concluso) return;
      if (sentinella) clearTimeout(sentinella);
      sentinella = setTimeout(() => {
        if (concluso) return;
        concluso = true;
        chiudi();
        try {
          xhr.abort();
        } catch {
          /* noop */
        }
        reject(
          new Error(
            `Trasferimento fermo da ${Math.round(STALLO_MS / 1000)}s: connessione persa`,
          ),
        );
      }, STALLO_MS);
    };

    function suAbort() {
      if (concluso) return;
      concluso = true;
      chiudi();
      try {
        xhr.abort();
      } catch {
        /* noop */
      }
      reject(erroreAnnullato());
    }
    signal.addEventListener('abort', suAbort);

    xhr.upload.onprogress = (ev) => {
      if (concluso) return;
      riarma();
      if (ev.lengthComputable) onBytes(ev.loaded);
    };
    xhr.onload = () => {
      if (concluso) return;
      concluso = true;
      chiudi();
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = (xhr.getResponseHeader('etag') ?? '').replace(/^"|"$/g, '');
        if (richiediEtag && !etag) {
          reject(new Error('R2 part: ETag mancante (verifica CORS ExposeHeaders)'));
          return;
        }
        resolve(etag);
      } else {
        reject(
          new Error(
            `R2 ${xhr.status}: ${(xhr.responseText ?? '').slice(0, 200)}`,
          ),
        );
      }
    };
    xhr.onerror = () => {
      if (concluso) return;
      concluso = true;
      chiudi();
      reject(new Error('R2 network error'));
    };
    xhr.onabort = () => {
      if (concluso) return;
      concluso = true;
      chiudi();
      reject(erroreAnnullato());
    };

    xhr.open('PUT', url, true);
    if (!richiediEtag && blob.type) xhr.setRequestHeader('Content-Type', blob.type);
    riarma();
    xhr.send(blob);
  });
}

async function sha256OfBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hashBuf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
