import type { StorageObject } from './types';

/** Normalizza un basePath in prefisso chiave senza slash iniziale/finale. */
export function normalizeBasePath(basePath?: string): string {
  if (!basePath) return '';
  return basePath.replace(/^\/+|\/+$/g, '');
}

/** Unisce basePath + path relativo in una chiave R2 (no slash iniziali doppi). */
export function joinKey(basePath: string, path: string): string {
  const rel = path.replace(/^\/+/, '');
  return basePath ? `${basePath}/${rel}` : rel;
}

/**
 * Mappa il risultato ListObjectsV2 (chiavi + common prefixes) in
 * `StorageObject[]` con path relativi al basePath. `requestPrefix` è la
 * chiave completa con slash finale (la "cartella" richiesta), esclusa dai file.
 */
export function mapListToStorageObjects(
  basePath: string,
  requestPrefix: string,
  res: {
    keys: { key: string; size: number; lastModified: string | null }[];
    prefixes: string[];
  },
): StorageObject[] {
  const strip = (full: string) =>
    basePath && full.startsWith(`${basePath}/`) ? full.slice(basePath.length + 1) : full;

  const dirs: StorageObject[] = res.prefixes.map((p) => {
    const rel = strip(p.replace(/\/$/, ''));
    const name = rel.split('/').filter(Boolean).pop() ?? rel;
    return { path: rel, name, size: 0, mimeType: '', isDirectory: true, modifiedAt: '' };
  });

  const files: StorageObject[] = res.keys
    .filter((k) => k.key !== requestPrefix)
    .map((k) => {
      const rel = strip(k.key);
      const name = rel.split('/').filter(Boolean).pop() ?? rel;
      return { path: rel, name, size: k.size, mimeType: '', isDirectory: false, modifiedAt: k.lastModified ?? '' };
    });

  return [...dirs, ...files];
}
