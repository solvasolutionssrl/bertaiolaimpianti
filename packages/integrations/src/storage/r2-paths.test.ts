import { describe, it, expect } from 'vitest';
import { normalizeBasePath, joinKey, mapListToStorageObjects } from './r2-paths';

describe('normalizeBasePath', () => {
  it('vuoto resta vuoto', () => {
    expect(normalizeBasePath()).toBe('');
    expect(normalizeBasePath('')).toBe('');
  });
  it('toglie slash iniziali e finali', () => {
    expect(normalizeBasePath('/tenants/FPM/')).toBe('tenants/FPM');
  });
});

describe('joinKey', () => {
  it('unisce base + path', () => {
    expect(joinKey('tenants/FPM', 'commesse/x/foto.jpg')).toBe('tenants/FPM/commesse/x/foto.jpg');
  });
  it('toglie slash iniziale del path', () => {
    expect(joinKey('tenants/FPM', '/a/b')).toBe('tenants/FPM/a/b');
  });
  it('senza base ritorna il path relativo', () => {
    expect(joinKey('', 'a/b')).toBe('a/b');
  });
});

describe('mapListToStorageObjects', () => {
  it('mappa prefissi (cartelle) e chiavi (file) relativi al basePath', () => {
    const out = mapListToStorageObjects('tenants/FPM', 'tenants/FPM/c/', {
      keys: [
        { key: 'tenants/FPM/c/', size: 0, lastModified: null },
        { key: 'tenants/FPM/c/foto.jpg', size: 123, lastModified: '2026-06-18T00:00:00.000Z' },
      ],
      prefixes: ['tenants/FPM/c/sub/'],
    });
    expect(out).toEqual([
      { path: 'c/sub', name: 'sub', size: 0, mimeType: '', isDirectory: true, modifiedAt: '' },
      { path: 'c/foto.jpg', name: 'foto.jpg', size: 123, mimeType: '', isDirectory: false, modifiedAt: '2026-06-18T00:00:00.000Z' },
    ]);
  });
});
