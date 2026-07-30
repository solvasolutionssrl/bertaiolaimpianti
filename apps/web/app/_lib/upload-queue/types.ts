/**
 * Tipi della upload queue persistente (Ondata 2).
 *
 * I job vivono nel UploadQueueProvider + IndexedDB. Sopravvivono al cambio
 * pagina (Context) e — per i single-PUT < threshold — anche al refresh
 * (IDB). Per upload multipart la ripresa cross-session di parti già
 * caricate è fuori scope: riprendiamo il job ma riavviamo l'upload
 * (il server ha già il fileRefId in stato uploading, è idempotente).
 */

import {
  MAX_TENTATIVI,
  RITARDI_RETRY_MS,
} from '@kommessa/api/upload-queue-policy';

import type { Momento } from '../media-upload-types';

export type JobStatus =
  /** In coda, in attesa di uno slot libero. */
  | 'queued'
  /** Chiamata POST /api/upload/media/init in corso. */
  | 'init'
  /** Upload R2 in corso (single PUT o multipart). */
  | 'uploading'
  /** SHA-256 + chiamata complete in corso. */
  | 'finalizing'
  /** Completato con successo (R2 ack ricevuto). */
  | 'done'
  /** Fallito (dopo i retry massimi). */
  | 'failed'
  /** Annullato dall'utente. */
  | 'canceled';

export interface UploadJobPayload {
  /** Blob/File: persistito così com'è in IDB. */
  fileBlob: Blob;
  fileName: string;
  fileMime: string;
  fileSize: number;
  /**
   * Destinazione: esattamente uno fra `commessaId` e `bozzaId` (lo impone
   * /api/upload/media/init). `bozzaId` è la creazione commessa in corso: il
   * file viene messo in staging e agganciato alla commessa alla finalizzazione.
   */
  commessaId?: string | null;
  bozzaId?: string | null;
  // Standard upload (foto/video commessa per voce/momento)
  momento?: Momento | null;
  voceId?: number | null;
  // Upload allegato riunione (alternativo: se valorizzato, il backend
  // routerà il path su Riunioni/<data>/ e creerà commessa_riunione_allegato)
  riunioneId?: string | null;
  /** Per gli allegati riunione: 'foto' | 'video' | 'pdf_acquisito'. */
  kind?: 'foto' | 'video' | 'pdf_acquisito' | null;
  geoLat?: number | null;
  geoLng?: number | null;
  /** Data scatto reale (EXIF DateTimeOriginal o lastModified) in ISO 8601. */
  takenAtIso?: string | null;
}

export interface UploadJob {
  /** UUID v4 generato client-side al momento dell'enqueue. */
  id: string;
  status: JobStatus;
  payload: UploadJobPayload;
  /** Restituito da /init, popolato anche dopo crash al replay. */
  fileRefId: string | null;
  bytesUploaded: number;
  bytesTotal: number;
  /** Numero di tentativi già consumati (parte da 0). */
  attempt: number;
  /** Quando può ritentare. NULL se non in pending-retry. */
  nextAttemptAt: number | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
  /**
   * true = job ripescato da IndexedDB dopo che l'app era stata chiusa.
   * Serve alla UI per distinguere "sto riprendendo roba di prima" (giallo) da
   * "file appena aggiunto" (blu). Non viene mai rimesso a false.
   */
  ripreso?: boolean;
}

// Fonte unica di verità: la policy pura in @kommessa/api (unit-testata).
// Qui restano solo gli alias storici usati dalla UI.
export const MAX_ATTEMPTS = MAX_TENTATIVI;
export const RETRY_DELAYS_MS = RITARDI_RETRY_MS;

/** Limite client-side per video (richiesto da Bertaiola: 500 MB). */
export const VIDEO_MAX_SIZE_BYTES = 500 * 1024 * 1024;
