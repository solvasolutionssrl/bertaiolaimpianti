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

/**
 * Risposta di `/api/upload/media/[id]/resume` — ripresa di un multipart
 * interrotto (app chiusa, rete caduta).
 *
 * `mode: 'multipart'` → il multipart su R2 è ancora aperto: `parts` contiene
 * SOLO le parti mancanti (già firmate) e `giaCaricate` quelle che R2 ha già,
 * con il loro ETag, da riusare al momento del complete.
 * `mode: 'scaduto'` → non c'è più niente da riprendere, si riparte da /init.
 */
export interface ResumeResponseMultipart {
  mode: 'multipart';
  fileRefId: string;
  uploadId: string;
  partSize: number;
  /** Solo le parti ANCORA da caricare. */
  parts: { partNumber: number; url: string }[];
  giaCaricate: CompletePartInfo[];
  /** Byte già presenti su R2 (per far ripartire la barra dal punto giusto). */
  bytesGiaCaricati: number;
  expiresAt: string;
}

export interface ResumeResponseScaduto {
  mode: 'scaduto';
}

export type ResumeResponse = ResumeResponseMultipart | ResumeResponseScaduto;

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
