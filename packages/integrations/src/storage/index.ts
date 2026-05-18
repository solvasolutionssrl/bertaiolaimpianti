import type { StorageProvider, StorageProviderName } from './types';
import { SupabaseStorageProvider } from './supabase';
import { NextcloudStorageProvider } from './nextcloud';

export * from './types';
export { SupabaseStorageProvider, NextcloudStorageProvider };

export interface StorageProviderConfig {
  provider: StorageProviderName;
  bucket?: string; // supabase
  baseUrl?: string; // nextcloud
  user?: string; // nextcloud
  appPassword?: string; // nextcloud
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
      });
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
