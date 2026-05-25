'use server';

import { z } from 'zod';

import { createServiceSupabase } from '@kommessa/api/service';
import {
  NextcloudStorageProvider,
  type StorageObject,
} from '@kommessa/integrations/storage';

import { requirePlatformAdmin } from '../_lib/guard';

/**
 * Tool di diagnostica storage per platform admin.
 *
 * Le tre azioni servono a:
 *  1. testare credenziali + raggiungibilità basePath del tenant,
 *  2. listare cartelle nella home WebDAV dell'utente app (senza basePath),
 *     in modo che l'admin possa scegliere quale linkare,
 *  3. listare cartelle dentro basePath, per vedere lo stato dello scaffold
 *     (01_Richieste, 02_In_Lavorazione, ecc.) e capire se l'app sta
 *     scrivendo nel posto giusto.
 *
 * Tutte richiedono platform_admin. Nessuna scrive — sono read-only.
 */

const TenantIdInput = z.object({ tenantId: z.string().uuid() });

type NextcloudCfg = {
  baseUrl: string;
  user: string;
  appPassword: string;
  basePath?: string;
};

async function loadNextcloudConfig(tenantId: string): Promise<
  | { ok: true; cfg: NextcloudCfg }
  | { ok: false; error: string }
> {
  const service = createServiceSupabase();
  const { data, error } = await service
    .from('tenants')
    .select('storage_provider, storage_config')
    .eq('id', tenantId)
    .maybeSingle();
  if (error || !data) {
    return { ok: false, error: 'Tenant non trovato' };
  }
  if (data.storage_provider !== 'nextcloud') {
    return {
      ok: false,
      error: `Provider attivo: ${data.storage_provider ?? 'nessuno'} (non Nextcloud)`,
    };
  }
  const cfg = (data.storage_config ?? {}) as Record<string, unknown>;
  const baseUrl = String(cfg.baseUrl ?? cfg.base_url ?? '');
  const user = String(cfg.user ?? '');
  const appPassword = String(cfg.appPassword ?? cfg.app_password ?? '');
  if (!baseUrl || !user || !appPassword) {
    return { ok: false, error: 'Configurazione incompleta (baseUrl/user/appPassword)' };
  }
  const basePath =
    typeof cfg.basePath === 'string' && cfg.basePath.length > 0
      ? cfg.basePath
      : undefined;
  return { ok: true, cfg: { baseUrl, user, appPassword, basePath } };
}

export interface StorageFolderEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
}

function toEntry(o: StorageObject): StorageFolderEntry {
  return {
    name: o.name,
    path: o.path,
    isDirectory: o.isDirectory,
    size: o.size,
    modifiedAt: o.modifiedAt,
  };
}

export interface StorageTestResult {
  ok: boolean;
  /** Provider effettivo configurato sul tenant. */
  provider: string;
  /** Host estratto dal baseUrl (per visualizzazione). */
  host: string;
  /** User app configurato. */
  user: string;
  /** basePath configurato (o null se nessuno). */
  basePath: string | null;
  /** True se la connessione + auth funzionano (PROPFIND root utente). */
  rootReachable: boolean;
  /** True se la cartella basePath esiste lato Nextcloud. */
  basePathExists: boolean;
  /** Numero di entry dentro basePath (se raggiungibile). */
  basePathEntries: number | null;
  /** True se dentro basePath ci sono le 4 cartelle di stato. */
  scaffoldComplete: boolean;
  /** Lista delle 4 cartelle di stato attese e se ciascuna esiste. */
  scaffoldFolders: Array<{ name: string; exists: boolean }>;
  /** Eventuale dettaglio errore. */
  error?: string;
}

const STATUS_FOLDERS = [
  '01_Richieste',
  '02_In_Lavorazione',
  '03_Completate',
  '04_Archivio',
] as const;

/**
 * Sonda la configurazione storage del tenant. Restituisce un riassunto
 * dello "stato di salute" pronto da renderizzare.
 */
export async function testStorageConnection(
  input: unknown,
): Promise<StorageTestResult> {
  await requirePlatformAdmin();
  const parsed = TenantIdInput.safeParse(input);
  if (!parsed.success) {
    return emptyResult({ error: 'Input non valido' });
  }
  const loaded = await loadNextcloudConfig(parsed.data.tenantId);
  if (!loaded.ok) {
    return emptyResult({ error: loaded.error });
  }
  const { cfg } = loaded;
  const host = safeHost(cfg.baseUrl);

  const base: StorageTestResult = {
    ok: false,
    provider: 'nextcloud',
    host,
    user: cfg.user,
    basePath: cfg.basePath ?? null,
    rootReachable: false,
    basePathExists: false,
    basePathEntries: null,
    scaffoldComplete: false,
    scaffoldFolders: STATUS_FOLDERS.map((name) => ({ name, exists: false })),
  };

  // 1. Test root (senza basePath) — verifica credenziali.
  try {
    const rootProvider = new NextcloudStorageProvider({
      baseUrl: cfg.baseUrl,
      user: cfg.user,
      appPassword: cfg.appPassword,
      // niente basePath: lista la home dell'utente app
    });
    await rootProvider.listFolder('/');
    base.rootReachable = true;
  } catch (e) {
    base.error = `Auth/host fallito: ${e instanceof Error ? e.message : 'unknown'}`;
    return base;
  }

  // 2. Test basePath (se configurato) + scaffold.
  if (cfg.basePath) {
    try {
      const provider = new NextcloudStorageProvider(cfg);
      const entries = await provider.listFolder('/');
      base.basePathExists = true;
      base.basePathEntries = entries.length;
      const presentNames = new Set(
        entries.filter((e) => e.isDirectory).map((e) => e.name),
      );
      base.scaffoldFolders = STATUS_FOLDERS.map((name) => ({
        name,
        exists: presentNames.has(name),
      }));
      base.scaffoldComplete = base.scaffoldFolders.every((f) => f.exists);
    } catch (e) {
      base.error = `basePath non raggiungibile: ${e instanceof Error ? e.message : 'unknown'}`;
      return base;
    }
  } else {
    // Senza basePath: lo scaffold è considerato "non applicabile",
    // ma la connessione è comunque OK.
  }

  base.ok = base.rootReachable && (cfg.basePath ? base.basePathExists : true);
  return base;
}

/**
 * Lista le cartelle alla root della home WebDAV dell'utente app
 * (ignorando basePath). Serve all'admin per scegliere quale cartella
 * condivisa linkare come basePath.
 */
export async function listRemoteRoot(input: unknown): Promise<
  | { ok: true; entries: StorageFolderEntry[] }
  | { ok: false; error: string }
> {
  await requirePlatformAdmin();
  const parsed = TenantIdInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const loaded = await loadNextcloudConfig(parsed.data.tenantId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const provider = new NextcloudStorageProvider({
    baseUrl: loaded.cfg.baseUrl,
    user: loaded.cfg.user,
    appPassword: loaded.cfg.appPassword,
    // niente basePath
  });
  try {
    const entries = await provider.listFolder('/');
    return {
      ok: true,
      entries: entries
        .filter((e) => e.isDirectory)
        .map(toEntry)
        .sort((a, b) => a.name.localeCompare(b.name, 'it')),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Errore listing root',
    };
  }
}

/**
 * Lista contenuto della cartella basePath corrente.
 */
export async function listRemoteBasePath(input: unknown): Promise<
  | { ok: true; entries: StorageFolderEntry[]; basePath: string }
  | { ok: false; error: string }
> {
  await requirePlatformAdmin();
  const parsed = TenantIdInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const loaded = await loadNextcloudConfig(parsed.data.tenantId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  if (!loaded.cfg.basePath) {
    return { ok: false, error: 'Nessun basePath configurato sul tenant' };
  }

  const provider = new NextcloudStorageProvider(loaded.cfg);
  try {
    const entries = await provider.listFolder('/');
    return {
      ok: true,
      basePath: loaded.cfg.basePath,
      entries: entries
        .map(toEntry)
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name, 'it');
        }),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Errore listing basePath',
    };
  }
}

// ─── helpers ────────────────────────────────────────────────────────────

function emptyResult(opts: { error?: string }): StorageTestResult {
  return {
    ok: false,
    provider: 'nextcloud',
    host: '',
    user: '',
    basePath: null,
    rootReachable: false,
    basePathExists: false,
    basePathEntries: null,
    scaffoldComplete: false,
    scaffoldFolders: STATUS_FOLDERS.map((name) => ({ name, exists: false })),
    error: opts.error,
  };
}

function safeHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}
