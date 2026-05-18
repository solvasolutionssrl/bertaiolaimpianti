import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  StorageObject,
  StorageProvider,
  StorageProviderName,
  UploadOptions,
  UploadResult,
  SignedUrl,
} from './types';

interface Config {
  bucket: string;
  url?: string;
  serviceKey?: string;
}

/**
 * Supabase Storage adapter. Usato per:
 *  - thumbnail e cache-asset (vedi Stack_Tecnico.md §"Storage cache/thumbnail")
 *  - **fallback default** quando il provider definitivo non è ancora deciso.
 *
 * Lavora come un POSIX-like filesystem dentro un singolo bucket; le
 * "directory" sono prefissi convenzionali (`/`-delimited).
 */
export class SupabaseStorageProvider implements StorageProvider {
  readonly name: StorageProviderName = 'supabase';
  private readonly bucket: string;
  private readonly client: SupabaseClient;

  constructor(config: Config) {
    this.bucket = config.bucket;
    const url = config.url ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const key = config.serviceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase storage: missing url/serviceKey');
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private placeholderPath(folder: string): string {
    const norm = folder.replace(/\/+$/, '');
    return `${norm}/.keep`;
  }

  async createFolder(path: string): Promise<void> {
    // Supabase Storage ha un modello "S3-like": le folder sono prefissi.
    // Per renderle visibili creiamo un placeholder `.keep` (idempotente).
    const placeholder = this.placeholderPath(path);
    const { error } = await this.client.storage.from(this.bucket).upload(
      placeholder,
      new Blob(['placeholder'], { type: 'text/plain' }),
      { upsert: true, contentType: 'text/plain' },
    );
    if (error && !error.message.toLowerCase().includes('exists')) {
      throw error;
    }
  }

  async createFolderTree(rootPath: string, tree: string[]): Promise<void> {
    await this.createFolder(rootPath);
    await Promise.all(tree.map((sub) => this.createFolder(`${rootPath}/${sub}`)));
  }

  async uploadFile(
    path: string,
    body: Blob | ArrayBuffer | Uint8Array,
    opts: UploadOptions = {},
  ): Promise<UploadResult> {
    const blob =
      body instanceof Blob
        ? body
        : new Blob([body as BlobPart], { type: opts.contentType ?? 'application/octet-stream' });

    const { error, data } = await this.client.storage
      .from(this.bucket)
      .upload(path, blob, {
        upsert: opts.upsert ?? true,
        contentType: opts.contentType,
        cacheControl: opts.cacheControl ?? '3600',
      });
    if (error) throw error;

    return { path: data.path, size: blob.size };
  }

  async listFolder(path: string): Promise<StorageObject[]> {
    const { data, error } = await this.client.storage.from(this.bucket).list(path, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    return (data ?? [])
      .filter((entry) => entry.name !== '.keep')
      .map((entry) => ({
        path: `${path}/${entry.name}`.replace(/\/+/g, '/'),
        name: entry.name,
        size: entry.metadata?.size ?? 0,
        mimeType: entry.metadata?.mimetype ?? 'application/octet-stream',
        isDirectory: entry.id === null,
        modifiedAt: entry.updated_at ?? entry.created_at ?? new Date().toISOString(),
      }));
  }

  async getDownloadUrl(path: string, expiresInSec = 3600): Promise<SignedUrl> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(path, expiresInSec);
    if (error) throw error;
    const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();
    return { url: data.signedUrl, expiresAt };
  }

  async delete(path: string): Promise<void> {
    // Cancella file singolo o intero prefisso (best-effort).
    const list = await this.listFolder(path).catch(() => null);
    const targets = list && list.length > 0 ? list.map((o) => o.path) : [path];
    const { error } = await this.client.storage.from(this.bucket).remove(targets);
    if (error) throw error;
  }

  async move(from: string, to: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).move(from, to);
    if (error) throw error;
  }

  async exists(path: string): Promise<boolean> {
    const segments = path.split('/');
    const name = segments.pop()!;
    const parent = segments.join('/');
    const list = await this.listFolder(parent).catch(() => []);
    return list.some((e) => e.name === name);
  }
}
