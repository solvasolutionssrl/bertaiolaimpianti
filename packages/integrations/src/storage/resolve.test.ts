import { describe, it, expect } from 'vitest';
import { resolveStorageConfig, shouldProvisionFolders } from './resolve';

describe('resolveStorageConfig', () => {
  it('nextcloud: legge da storage_config', () => {
    expect(
      resolveStorageConfig({
        slug: 'BER',
        storage_provider: 'nextcloud',
        storage_config: { baseUrl: 'https://nc', user: 'u', appPassword: 'p', basePath: '/BER' },
        r2_config: {},
      }),
    ).toEqual({ provider: 'nextcloud', baseUrl: 'https://nc', user: 'u', appPassword: 'p', basePath: '/BER' });
  });

  it('r2: legge da r2_config e deriva basePath dallo slug', () => {
    expect(
      resolveStorageConfig({
        slug: 'FPM',
        storage_provider: 'r2',
        storage_config: {},
        r2_config: { account_id: 'acc', bucket: 'b', access_key_id: 'ak', secret_access_key: 'sk', endpoint: 'https://e' },
      }),
    ).toEqual({ provider: 'r2', accountId: 'acc', bucket: 'b', accessKeyId: 'ak', secretAccessKey: 'sk', endpoint: 'https://e', basePath: 'tenants/FPM' });
  });

  it('supabase: default bucket commesse', () => {
    expect(
      resolveStorageConfig({ slug: 'X', storage_provider: 'supabase', storage_config: {}, r2_config: {} }),
    ).toEqual({ provider: 'supabase', bucket: 'commesse' });
  });
});

describe('shouldProvisionFolders', () => {
  it('true di default', () => {
    expect(shouldProvisionFolders({ crea_cartelle: true })).toBe(true);
    expect(shouldProvisionFolders({ crea_cartelle: null })).toBe(true);
    expect(shouldProvisionFolders({})).toBe(true);
  });
  it('false se crea_cartelle=false', () => {
    expect(shouldProvisionFolders({ crea_cartelle: false })).toBe(false);
  });
});
