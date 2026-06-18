import type { StorageProvider, StorageProviderName } from './types';
import { SupabaseStorageProvider } from './supabase';
import { NextcloudStorageProvider } from './nextcloud';
import { R2FileStorageProvider } from './r2-provider';

export * from './types';
export * from './r2';
export * from './r2-provider';
export * from './r2-paths';
export * from './resolve';
export { SupabaseStorageProvider, NextcloudStorageProvider };

export interface StorageProviderConfig {
  provider: StorageProviderName;
  bucket?: string; // supabase + r2
  baseUrl?: string; // nextcloud
  user?: string; // nextcloud
  appPassword?: string; // nextcloud
  /**
   * Nextcloud: sotto-cartella radice del tenant. R2: prefisso chiave di
   * isolamento per-tenant (es. "tenants/FPM"). Se omesso, root.
   */
  basePath?: string;
  // r2
  accountId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
}

/**
 * Factory tenant-scoped: legge la configurazione storage del tenant
 * dalla tabella `tenants` (campo `storage_provider` + colonne dedicate)
 * o ricade su variabili d'ambiente per il dev.
 */
export function getStorageProvider(config: StorageProviderConfig): StorageProvider {
  switch (config.provider) {
    case 'supabase':
      return new SupabaseStorageProvider({
        bucket: config.bucket ?? 'commesse',
      });
    case 'nextcloud':
      if (!config.baseUrl || !config.user || !config.appPassword) {
        throw new Error('Nextcloud config incomplete: need baseUrl/user/appPassword');
      }
      return new NextcloudStorageProvider({
        baseUrl: config.baseUrl,
        user: config.user,
        appPassword: config.appPassword,
        basePath: config.basePath,
      });
    case 'r2': {
      const accountId = config.accountId ?? process.env.R2_ACCOUNT_ID;
      const bucket = config.bucket ?? process.env.R2_BUCKET;
      const accessKeyId = config.accessKeyId ?? process.env.R2_ACCESS_KEY_ID;
      const secretAccessKey = config.secretAccessKey ?? process.env.R2_SECRET_ACCESS_KEY;
      const endpoint = config.endpoint ?? process.env.R2_ENDPOINT;
      if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
        throw new Error('R2 config incomplete: set R2_* env vars (managed) or per-tenant r2_config');
      }
      return new R2FileStorageProvider({
        accountId, bucket, accessKeyId, secretAccessKey, endpoint,
        basePath: config.basePath,
      });
    }
    default: {
      const exhaustiveCheck: never = config.provider;
      throw new Error(`Unknown storage provider: ${exhaustiveCheck}`);
    }
  }
}

/**
 * Default storage provider derivato da env, per Edge Functions
 * o codice non a conoscenza del tenant. **Non** preferire in prodotto:
 * usa `getStorageProvider` con la config del tenant.
 */
export function getDefaultStorageProvider(): StorageProvider {
  const provider = (process.env.STORAGE_PROVIDER as StorageProviderName) ?? 'supabase';
  if (provider === 'nextcloud') {
    return new NextcloudStorageProvider({
      baseUrl: process.env.NEXTCLOUD_BASE_URL!,
      user: process.env.NEXTCLOUD_USER!,
      appPassword: process.env.NEXTCLOUD_APP_PASSWORD!,
    });
  }
  return new SupabaseStorageProvider({ bucket: 'commesse' });
}
