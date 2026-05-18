/**
 * Storage abstraction — il provider finale è TBD (vedi CLAUDE.md):
 * Hetzner Storage Share (Nextcloud) era la proposta v2 ma non è confermata.
 * Tutto il prodotto deve passare da queste interfacce.
 */

export type StorageProviderName = 'supabase' | 'nextcloud';

export interface StorageObject {
  path: string;
  name: string;
  size: number;
  mimeType: string;
  isDirectory: boolean;
  modifiedAt: string;
}

export interface UploadResult {
  path: string;
  size: number;
  sha256?: string;
  url?: string;
}

export interface SignedUrl {
  url: string;
  expiresAt: string;
}

export interface UploadOptions {
  contentType?: string;
  cacheControl?: string;
  upsert?: boolean;
  metadata?: Record<string, string>;
}

export interface StorageProvider {
  readonly name: StorageProviderName;

  /** Crea una cartella (idempotente). Crea anche tutti i parent mancanti. */
  createFolder(path: string): Promise<void>;

  /** Crea in batch tutto lo scaffold di una commessa. */
  createFolderTree(rootPath: string, tree: string[]): Promise<void>;

  /** Carica un file binario al `path` indicato. */
  uploadFile(path: string, body: Blob | ArrayBuffer | Uint8Array, opts?: UploadOptions): Promise<UploadResult>;

  /** Lista i contenuti di una directory (non ricorsivo). */
  listFolder(path: string): Promise<StorageObject[]>;

  /** URL firmato per il download — durata `expiresInSec` (default 1h). */
  getDownloadUrl(path: string, expiresInSec?: number): Promise<SignedUrl>;

  /** Cancella file o directory. */
  delete(path: string): Promise<void>;

  /** Sposta/rinomina (idempotente sulla destinazione). */
  move(from: string, to: string): Promise<void>;

  /** Esistenza di un percorso. */
  exists(path: string): Promise<boolean>;
}

/**
 * Albero standard di scaffold per ogni commessa
 * (vedi Tassonomia_Lavori.md §2.2 — Sottocartelle scaffold).
 * Le voci di Sezione B selezionate possono aggiungere ulteriori
 * sottocartelle via `extraFromVoci()` qui sotto.
 */
export const SCAFFOLD_TREE: readonly string[] = Object.freeze([
  'Preventivi',
  'Schemi',
  'Foto/Sopralluogo',
  'Foto/In corso',
  'Foto/Finali',
  'Documenti/POS',
  'Documenti/Cartellone',
  'Documenti/DICO',
  'Documenti/Cassette_DPI',
  'Documenti/Certificazioni',
  'Materiali',
  'Chiusura',
]);
