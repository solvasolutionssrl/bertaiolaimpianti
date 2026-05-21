/**
 * Tipi condivisi fra le route di upload media e l'hook client.
 *
 * Flusso Fase 1:
 *   1. POST /api/upload/media/init    → presigned URL(s) per R2
 *   2. client PUT/UPLOAD_PART su R2   → upload diretto, niente Vercel
 *   3. POST /api/upload/media/[id]/complete → server marca uploaded, HEAD R2
 *      (opzionale POST /api/upload/media/[id]/abort)
 *   4. GET  /api/media/[id]           → resolver, 302 verso signed GET R2
 */

export type Momento = 'sopralluogo' | 'in_corso' | 'finale';

export interface InitRequestBody {
  commessaId: string;
  momento?: Momento;
  voceId?: number | null;
  filename: string;
  mime: string;
  sizeBytes: number;
  geoLat?: number | null;
  geoLng?: number | null;
}

export interface InitResponseSingle {
  mode: 'single';
  fileRefId: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface InitResponseMultipart {
  mode: 'multipart';
  fileRefId: string;
  uploadId: string;
  partSize: number;
  parts: { partNumber: number; url: string }[];
  expiresAt: string;
}

export type InitResponse = InitResponseSingle | InitResponseMultipart;

export interface CompletePartInfo {
  partNumber: number;
  etag: string;
}

export interface CompleteRequestBody {
  /** Per single PUT: ETag opzionale ritornato da R2 (debug/log). */
  etag?: string;
  /** Per multipart: parti completate con ETag. */
  parts?: CompletePartInfo[];
  /** SHA-256 esadecimale calcolato dal client durante l'upload. */
  sha256Hex?: string;
}

export interface CompleteResponse {
  ok: true;
  fileRefId: string;
  sizeBytes: number;
  status: 'uploaded';
}
