/**
 * Tipi della upload queue persistente (Ondata 2).
 *
 * I job vivono nel UploadQueueProvider + IndexedDB. Sopravvivono al cambio
 * pagina (Context) e — per i single-PUT < threshold — anche al refresh
 * (IDB). Per upload multipart la ripresa cross-session di parti già
 * caricate è fuori scope: riprendiamo il job ma riavviamo l'upload
 * (il server ha già il fileRefId in stato uploading, è idempotente).
 */

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
  commessaId: string;
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
}

export const MAX_ATTEMPTS = 5;
export const RETRY_DELAYS_MS = [
  2_000, // 2s
  8_000, // 8s
  30_000, // 30s
  120_000, // 2min
  600_000, // 10min
] as const;

/** Limite client-side per video (richiesto da Bertaiola: 500 MB). */
export const VIDEO_MAX_SIZE_BYTES = 500 * 1024 * 1024;
