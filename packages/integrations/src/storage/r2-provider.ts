import type {
  StorageProvider,
  StorageObject,
  UploadResult,
  SignedUrl,
  UploadOptions,
} from './types';
import { R2StorageProvider, type R2Config } from './r2';
import { normalizeBasePath, joinKey, mapListToStorageObjects } from './r2-paths';

async function toUint8Array(
  body: Blob | ArrayBuffer | Uint8Array,
): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(await body.arrayBuffer());
}

/**
 * Adapter che espone R2 come `StorageProvider` completo (semantica a prefisso).
 * Compone `R2StorageProvider` (chiavi grezze, INTATTO) e antepone un basePath
 * per-tenant. R2 non ha directory reali: i prefissi nascono col primo upload.
 */
export class R2FileStorageProvider implements StorageProvider {
  readonly name = 'r2' as const;
  private readonly r2: R2StorageProvider;
  private readonly basePath: string;

  constructor(config: R2Config & { basePath?: string }) {
    this.r2 = new R2StorageProvider(config);
    this.basePath = normalizeBasePath(config.basePath);
  }

  private key(path: string): string {
    return joinKey(this.basePath, path);
  }

  async createFolder(): Promise<void> {}
  async createFolderTree(): Promise<void> {}

  async uploadFile(
    path: string,
    body: Blob | ArrayBuffer | Uint8Array,
    opts?: UploadOptions,
  ): Promise<UploadResult> {
    const bytes = await toUint8Array(body);
    await this.r2.putObject(
      this.key(path),
      bytes,
      opts?.contentType ?? 'application/octet-stream',
    );
    return { path, size: bytes.byteLength };
  }

  async listFolder(path: string): Promise<StorageObject[]> {
    const prefix = this.key(path).replace(/\/?$/, '/');
    const res = await this.r2.listObjects(prefix, { delimiter: '/' });
    return mapListToStorageObjects(this.basePath, prefix, res);
  }

  async getDownloadUrl(path: string, expiresInSec?: number): Promise<SignedUrl> {
    // Default 1h per il contratto StorageProvider (R2 di suo userebbe 5min).
    const signed = await this.r2.createPresignedGetUrl(this.key(path), {
      ttlSec: expiresInSec ?? 3600,
    });
    return { url: signed.url, expiresAt: signed.expiresAt };
  }

  async delete(path: string): Promise<void> {
    await this.r2.delete(this.key(path));
  }

  async move(from: string, to: string): Promise<void> {
    await this.r2.copyObject(this.key(from), this.key(to));
    await this.r2.delete(this.key(from));
  }

  async exists(path: string): Promise<boolean> {
    return (await this.r2.head(this.key(path))) !== null;
  }
}
