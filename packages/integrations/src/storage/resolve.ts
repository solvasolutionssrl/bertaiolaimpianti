import type { StorageProviderName } from './types';
import type { StorageProviderConfig } from './index';

/** Sottoinsieme della riga `tenants` necessario a derivare lo storage. */
export interface TenantStorageRow {
  slug?: string | null;
  storage_provider: StorageProviderName;
  storage_config?: Record<string, unknown> | null;
  r2_config?: Record<string, unknown> | null;
  crea_cartelle?: boolean | null;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** Deriva la config del provider storage dalla riga tenant. */
export function resolveStorageConfig(t: TenantStorageRow): StorageProviderConfig {
  const sc = (t.storage_config ?? {}) as Record<string, unknown>;
  const rc = (t.r2_config ?? {}) as Record<string, unknown>;
  switch (t.storage_provider) {
    case 'nextcloud':
      return {
        provider: 'nextcloud',
        baseUrl: str(sc.baseUrl),
        user: str(sc.user),
        appPassword: str(sc.appPassword),
        basePath: str(sc.basePath),
      };
    case 'r2':
      return {
        provider: 'r2',
        accountId: str(rc.account_id),
        bucket: str(rc.bucket),
        accessKeyId: str(rc.access_key_id),
        secretAccessKey: str(rc.secret_access_key),
        endpoint: str(rc.endpoint),
        basePath: `tenants/${str(t.slug) ?? 'unknown'}`,
      };
    case 'supabase':
    default:
      return { provider: 'supabase', bucket: str(sc.bucket) ?? 'commesse' };
  }
}

/** True se per questo tenant va creato lo scaffold cartelle commessa. */
export function shouldProvisionFolders(t: Pick<TenantStorageRow, 'crea_cartelle'>): boolean {
  return t.crea_cartelle !== false;
}
