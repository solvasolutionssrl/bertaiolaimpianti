/**
 * Cloudflare R2 staging provider — S3-compatible.
 *
 * NON è un `StorageProvider` completo: serve solo come buffer di upload
 * (presigned PUT/multipart + signed GET). La source of truth aziendale
 * resta Nextcloud; il worker di sync (Fase 2) trasferirà i file da R2 a
 * Nextcloud calcolando lo SHA-256 per verifica integrità.
 *
 * Bucket condiviso fra tenant, prefisso:
 *   tenants/{tenantId}/commesse/{commessaId}/media/{fileRefId}/original/{filename}
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  type CompletedPart,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface R2Config {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Override dell'endpoint S3; di default è https://{accountId}.r2.cloudflarestorage.com */
  endpoint?: string;
}

export interface PresignedUploadUrl {
  url: string;
  expiresAt: string;
}

export interface PresignedPart {
  partNumber: number;
  url: string;
}

export interface MultipartSession {
  uploadId: string;
  key: string;
}

export interface CompletedPartInput {
  partNumber: number;
  etag: string;
}

export interface ObjectHead {
  size: number;
  etag: string;
  contentType: string | null;
  lastModified: string | null;
}

const DEFAULT_PUT_TTL_SEC = 60 * 60; // 1h — sufficiente per upload mobile
const DEFAULT_GET_TTL_SEC = 5 * 60;  // 5 min — TTL del resolver

export class R2StorageProvider {
  readonly bucket: string;
  private readonly client: S3Client;

  constructor(config: R2Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint ?? `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // Cloudflare R2: signed URLs richiedono path-style addressing
      forcePathStyle: false,
    });
  }

  // ----- Single PUT (file ≤ 100MB) ---------------------------------------

  async createPresignedPutUrl(
    key: string,
    contentType: string,
    opts?: { ttlSec?: number },
  ): Promise<PresignedUploadUrl> {
    const ttl = opts?.ttlSec ?? DEFAULT_PUT_TTL_SEC;
    // ContentLength NON firmato di proposito: alcuni browser mobile
    // (notabilmente iOS Safari) possono divergere di pochi byte fra dichiarato
    // e payload reale, causando SignatureDoesNotMatch. La size vera viene
    // verificata server-side via HEAD R2 in /complete.
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: ttl });
    return {
      url,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  // ----- Multipart (file > 100MB) ----------------------------------------

  async createMultipartUpload(
    key: string,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<MultipartSession> {
    const cmd = new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      Metadata: metadata,
    });
    const res = await this.client.send(cmd);
    if (!res.UploadId) {
      throw new Error('R2: createMultipartUpload returned no UploadId');
    }
    return { uploadId: res.UploadId, key };
  }

  async signMultipartParts(
    key: string,
    uploadId: string,
    partNumbers: number[],
    opts?: { ttlSec?: number },
  ): Promise<PresignedPart[]> {
    const ttl = opts?.ttlSec ?? DEFAULT_PUT_TTL_SEC;
    return Promise.all(
      partNumbers.map(async (partNumber) => {
        const cmd = new UploadPartCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
        });
        const url = await getSignedUrl(this.client, cmd, { expiresIn: ttl });
        return { partNumber, url };
      }),
    );
  }

  async completeMultipart(
    key: string,
    uploadId: string,
    parts: CompletedPartInput[],
  ): Promise<{ etag: string | null; location: string | null }> {
    const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    const completed: CompletedPart[] = sorted.map((p) => ({
      PartNumber: p.partNumber,
      ETag: p.etag,
    }));
    const cmd = new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: completed },
    });
    const res = await this.client.send(cmd);
    return { etag: res.ETag ?? null, location: res.Location ?? null };
  }

  async abortMultipart(key: string, uploadId: string): Promise<void> {
    const cmd = new AbortMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
    });
    await this.client.send(cmd);
  }

  // ----- Lettura: signed GET + head -------------------------------------

  async createPresignedGetUrl(
    key: string,
    opts?: { ttlSec?: number; downloadAs?: string },
  ): Promise<PresignedUploadUrl> {
    const ttl = opts?.ttlSec ?? DEFAULT_GET_TTL_SEC;
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: opts?.downloadAs
        ? `attachment; filename="${opts.downloadAs.replace(/"/g, '')}"`
        : undefined,
    });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: ttl });
    return {
      url,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  async head(key: string): Promise<ObjectHead | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        size: res.ContentLength ?? 0,
        etag: (res.ETag ?? '').replace(/^"|"$/g, ''),
        contentType: res.ContentType ?? null,
        lastModified: res.LastModified?.toISOString() ?? null,
      };
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name;
      if (name === 'NotFound' || name === 'NoSuchKey') return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Costruisce un R2 provider dalla `r2_config` (jsonb) del tenant.
 * Ritorna null se il tenant non ha configurato R2 (campo vuoto): chi chiama
 * deve gestire il fallback al vecchio flusso buffered.
 */
export function getR2ProviderFromTenantConfig(
  cfg: Record<string, unknown> | null | undefined,
): R2StorageProvider | null {
  if (!cfg || typeof cfg !== 'object') return null;
  const accountId = cfg.account_id as string | undefined;
  const bucket = cfg.bucket as string | undefined;
  const accessKeyId = cfg.access_key_id as string | undefined;
  const secretAccessKey = cfg.secret_access_key as string | undefined;
  const endpoint = cfg.endpoint as string | undefined;

  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) return null;

  return new R2StorageProvider({
    accountId,
    bucket,
    accessKeyId,
    secretAccessKey,
    endpoint,
  });
}

/**
 * Override globale via env (dev/staging). Usato quando il tenant non ha
 * la propria config R2 ma l'ambiente di runtime la fornisce.
 */
export function getR2ProviderFromEnv(): R2StorageProvider | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT;

  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) return null;

  return new R2StorageProvider({
    accountId,
    bucket,
    accessKeyId,
    secretAccessKey,
    endpoint,
  });
}

// ---------------------------------------------------------------------------
// Costanti del pipeline
// ---------------------------------------------------------------------------

/** Soglia oltre la quale usare multipart anziché single PUT. */
export const MULTIPART_THRESHOLD_BYTES = 100 * 1024 * 1024; // 100 MB

/** Dimensione delle parti multipart (R2 minimo: 5 MB per le parti non finali). */
export const MULTIPART_PART_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Costruisce la chiave R2 secondo lo schema convenzionale. */
export function buildR2Key(input: {
  tenantId: string;
  commessaId: string;
  fileRefId: string;
  filename: string;
}): string {
  const safeName = input.filename.replace(/[/\\]+/g, '_');
  return `tenants/${input.tenantId}/commesse/${input.commessaId}/media/${input.fileRefId}/original/${safeName}`;
}
