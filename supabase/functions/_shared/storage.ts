// =====================================================================
// _shared/storage.ts — Storage dispatcher per Edge Functions (Deno).
//
// Re-implementa in Deno l'interfaccia di
// `packages/integrations/src/storage/` (provider in TBD per CLAUDE.md):
//   - Supabase Storage (bucket `commesse`)
//   - Nextcloud / Hetzner Storage Share (WebDAV)
//
// L'API esposta è limitata a ciò che serve nelle Edge:
//   createFolder, createFolderTree, uploadFile, getDownloadUrl, exists.
//
// `SCAFFOLD_TREE` è duplicato qui (12 voci) per evitare dipendenze dal
// monorepo TS — quando cambia in `storage/types.ts` aggiornare entrambi.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export type StorageProviderName = 'supabase' | 'nextcloud';

export interface UploadOptions {
  contentType?: string;
  cacheControl?: string;
  upsert?: boolean;
}

export interface UploadResult {
  path: string;
  size: number;
}

export interface SignedUrl {
  url: string;
  expiresAt: string;
}

export interface StorageProvider {
  readonly name: StorageProviderName;
  createFolder(path: string): Promise<void>;
  createFolderTree(rootPath: string, tree: readonly string[]): Promise<void>;
  uploadFile(
    path: string,
    body: Blob | ArrayBuffer | Uint8Array,
    opts?: UploadOptions,
  ): Promise<UploadResult>;
  getDownloadUrl(path: string, expiresInSec?: number): Promise<SignedUrl>;
  exists(path: string): Promise<boolean>;
}

/**
 * Scaffold standard (12 voci) — mirror di SCAFFOLD_TREE in
 * `packages/integrations/src/storage/types.ts`.
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

// ----------------------------------------------------------------------
// Sottocartelle dinamiche derivate dalle voci di Sezione B selezionate.
// Il path canonico per ogni voce vive in `voci_catalogo.cartella_template`
// (vedi 20260101000600_voci_catalogo.sql + seed.sql). Qui ci limitiamo a
// normalizzare l'elenco (dedup + filtra vuoti + filtra path già nello
// scaffold A).
// ----------------------------------------------------------------------
export function extraFoldersFromTemplates(templates: (string | null | undefined)[]): string[] {
  const builtin = new Set(SCAFFOLD_TREE);
  const out = new Set<string>();
  for (const t of templates) {
    if (!t) continue;
    const clean = t.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!clean) continue;
    if (builtin.has(clean)) continue;
    out.add(clean);
  }
  return Array.from(out);
}

// ----------------------------------------------------------------------
// Provider: Supabase Storage
// ----------------------------------------------------------------------
class SupabaseStorageProvider implements StorageProvider {
  readonly name: StorageProviderName = 'supabase';
  private readonly bucket: string;
  // deno-lint-ignore no-explicit-any
  private readonly client: any;

  constructor(opts: { bucket: string; url: string; serviceKey: string }) {
    this.bucket = opts.bucket;
    this.client = createClient(opts.url, opts.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private placeholderPath(folder: string): string {
    return `${folder.replace(/\/+$/, '')}/.keep`;
  }

  async createFolder(path: string): Promise<void> {
    const placeholder = this.placeholderPath(path);
    const { error } = await this.client.storage.from(this.bucket).upload(
      placeholder,
      new Blob(['placeholder'], { type: 'text/plain' }),
      { upsert: true, contentType: 'text/plain' },
    );
    if (error && !String(error.message ?? '').toLowerCase().includes('exists')) {
      throw error;
    }
  }

  async createFolderTree(rootPath: string, tree: readonly string[]): Promise<void> {
    await this.createFolder(rootPath);
    await Promise.all(tree.map((sub) => this.createFolder(`${rootPath}/${sub}`)));
  }

  async uploadFile(
    path: string,
    body: Blob | ArrayBuffer | Uint8Array,
    opts: UploadOptions = {},
  ): Promise<UploadResult> {
    const blob = body instanceof Blob
      ? body
      : new Blob([body as BlobPart], {
          type: opts.contentType ?? 'application/octet-stream',
        });

    const { error, data } = await this.client.storage.from(this.bucket).upload(path, blob, {
      upsert: opts.upsert ?? true,
      contentType: opts.contentType,
      cacheControl: opts.cacheControl ?? '3600',
    });
    if (error) throw error;
    return { path: data.path, size: blob.size };
  }

  async getDownloadUrl(path: string, expiresInSec = 3600): Promise<SignedUrl> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(path, expiresInSec);
    if (error) throw error;
    return {
      url: data.signedUrl,
      expiresAt: new Date(Date.now() + expiresInSec * 1000).toISOString(),
    };
  }

  async exists(path: string): Promise<boolean> {
    const segs = path.split('/');
    const name = segs.pop()!;
    const parent = segs.join('/');
    const { data, error } = await this.client.storage.from(this.bucket).list(parent, {
      limit: 1000,
    });
    if (error) return false;
    return (data ?? []).some((e: { name: string }) => e.name === name);
  }
}

// ----------------------------------------------------------------------
// Provider: Nextcloud (WebDAV)
// ----------------------------------------------------------------------
class NextcloudStorageProvider implements StorageProvider {
  readonly name: StorageProviderName = 'nextcloud';
  private readonly baseUrl: string;
  private readonly user: string;
  private readonly authHeader: string;

  constructor(opts: { baseUrl: string; user: string; appPassword: string }) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.user = opts.user;
    const token = btoa(`${opts.user}:${opts.appPassword}`);
    this.authHeader = `Basic ${token}`;
  }

  private webdav(path: string): string {
    const norm = path.startsWith('/') ? path : `/${path}`;
    // WebDAV vuole URL-encoding sui segmenti
    const encoded = norm
      .split('/')
      .map((seg) => (seg ? encodeURIComponent(seg) : seg))
      .join('/');
    return `${this.baseUrl}/remote.php/dav/files/${encodeURIComponent(this.user)}${encoded}`;
  }

  async createFolder(path: string): Promise<void> {
    // MKCOL non è ricorsivo: creiamo segmento per segmento (idempotente).
    const segments = path.split('/').filter(Boolean);
    let current = '';
    for (const seg of segments) {
      current += `/${seg}`;
      const res = await fetch(this.webdav(current), {
        method: 'MKCOL',
        headers: { Authorization: this.authHeader },
      });
      // 201 Created · 405 già esistente · 409 conflict tollerabile
      if (![201, 405, 409].includes(res.status)) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Nextcloud MKCOL ${current} → ${res.status} ${txt.slice(0, 200)}`);
      }
    }
  }

  async createFolderTree(rootPath: string, tree: readonly string[]): Promise<void> {
    await this.createFolder(rootPath);
    for (const sub of tree) {
      await this.createFolder(`${rootPath}/${sub}`);
    }
  }

  async uploadFile(
    path: string,
    body: Blob | ArrayBuffer | Uint8Array,
    opts: UploadOptions = {},
  ): Promise<UploadResult> {
    const buffer = body instanceof Blob
      ? new Uint8Array(await body.arrayBuffer())
      : body instanceof ArrayBuffer
        ? new Uint8Array(body)
        : body;
    const res = await fetch(this.webdav(path), {
      method: 'PUT',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': opts.contentType ?? 'application/octet-stream',
      },
      body: buffer,
    });
    if (!res.ok && ![201, 204].includes(res.status)) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Nextcloud PUT ${path} → ${res.status} ${txt.slice(0, 200)}`);
    }
    return { path, size: buffer.byteLength };
  }

  async getDownloadUrl(path: string, expiresInSec = 3600): Promise<SignedUrl> {
    // Senza OCS share, restituiamo l'URL WebDAV diretto (richiede auth lato chiamante).
    // In produzione conviene generare un proxy URL firmato dal backend.
    return {
      url: this.webdav(path),
      expiresAt: new Date(Date.now() + expiresInSec * 1000).toISOString(),
    };
  }

  async exists(path: string): Promise<boolean> {
    const res = await fetch(this.webdav(path), {
      method: 'PROPFIND',
      headers: { Authorization: this.authHeader, Depth: '0' },
    });
    return res.status === 207;
  }
}

// ----------------------------------------------------------------------
// Factory: legge il tenant e ritorna il provider configurato
// ----------------------------------------------------------------------

export interface TenantStorageConfig {
  storage_provider: StorageProviderName;
  storage_config: Record<string, unknown>;
}

/**
 * Costruisce uno StorageProvider a partire dalla riga `tenants` (campi
 * `storage_provider` + `storage_config`). Per Nextcloud `storage_config`
 * deve contenere `{ base_url, user, app_password }` (o env var
 * NEXTCLOUD_* come fallback per il pilot Bertaiola).
 */
export function buildStorageProvider(cfg: TenantStorageConfig): StorageProvider {
  if (cfg.storage_provider === 'nextcloud') {
    const c = cfg.storage_config ?? {};
    const baseUrl = (c.base_url as string) ?? Deno.env.get('NEXTCLOUD_BASE_URL') ?? '';
    const user = (c.user as string) ?? Deno.env.get('NEXTCLOUD_USER') ?? '';
    const appPassword =
      (c.app_password as string) ?? Deno.env.get('NEXTCLOUD_APP_PASSWORD') ?? '';
    if (!baseUrl || !user || !appPassword) {
      throw new Error('Nextcloud config incomplete: need base_url/user/app_password');
    }
    return new NextcloudStorageProvider({ baseUrl, user, appPassword });
  }

  // default: supabase
  const c = cfg.storage_config ?? {};
  const bucket = (c.bucket as string) ?? 'commesse';
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase storage: missing SUPABASE_URL/SERVICE_ROLE_KEY');
  return new SupabaseStorageProvider({ bucket, url, serviceKey: key });
}
