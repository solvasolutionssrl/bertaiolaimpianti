import 'server-only';
import { createHash } from 'node:crypto';

import { createServiceSupabase } from '@kommessa/api/service';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
  getStorageProvider,
  type R2StorageProvider,
  type StorageProvider,
  type StorageProviderName,
} from '@kommessa/integrations/storage';

/**
 * Worker di sync R2 → Nextcloud (Fase 2).
 *
 * Per ogni file:
 *   1. Atomic claim: status='syncing' (compare-and-set)
 *   2. HEAD R2 → size + etag
 *   3. Download buffered da R2 (cap 500MB)
 *   4. Verifica size + SHA-256 (se dichiarato)
 *   5. Crea cartella parent su Nextcloud (idempotente)
 *   6. PUT buffer su Nextcloud al path pre-calcolato
 *   7. Verifica esistenza file su Nextcloud (storage.exists)
 *   8. status='synced', clear last_sync_error
 *
 * Su qualunque errore: status='sync_failed', last_sync_error=msg,
 * sync_attempts++. Idempotente: ri-eseguibile (l'UPSERT su Nextcloud
 * sovrascrive, e la verifica size garantisce coerenza).
 */

/** File più grandi di così vengono saltati dal worker (per ora). */
export const SYNC_MAX_BUFFER_BYTES = 500 * 1024 * 1024;

/**
 * Soglia "stale" per i file in stato 'syncing': se un file è in syncing
 * da più di questo intervallo, lo consideriamo orfano (function crash/
 * timeout/OOM tra il claim e il commit). Il batch lo recupererà.
 *
 * 10 minuti > maxDuration function (300s = 5 min) → garantito che nessuna
 * function attiva stia ancora lavorando su quel file.
 */
const STALE_SYNCING_MINUTES = 10;

export interface SyncResult {
  fileRefId: string;
  ok: boolean;
  reason: 'synced' | 'skipped' | 'failed' | 'not_claimed';
  detail?: string;
  bytesSynced?: number;
  durationMs?: number;
}

/** Sincronizza un singolo file. Atomicamente claim → sync → mark. */
export async function syncOneFile(fileRefId: string): Promise<SyncResult> {
  const t0 = Date.now();
  const service = createServiceSupabase();

  // 1. Carica il file_ref (service bypass RLS)
  const { data: ref, error: refErr } = await service
    .from('file_refs')
    .select(
      'id, tenant_id, commessa_id, path, filename, mime, size_bytes, sha256, status, r2_key, sync_attempts',
    )
    .eq('id', fileRefId)
    .maybeSingle();

  if (refErr || !ref) {
    return {
      fileRefId,
      ok: false,
      reason: 'failed',
      detail: refErr?.message ?? 'file_ref non trovato',
    };
  }

  if (!ref.r2_key) {
    return { fileRefId, ok: false, reason: 'failed', detail: 'r2_key mancante' };
  }
  if (ref.size_bytes > SYNC_MAX_BUFFER_BYTES) {
    await markFailed(
      service,
      fileRefId,
      ref.sync_attempts,
      `file > ${SYNC_MAX_BUFFER_BYTES} byte, streaming sync non ancora implementato`,
    );
    return { fileRefId, ok: false, reason: 'skipped', detail: 'file troppo grande' };
  }

  // 2. Claim atomico: status='syncing' se era uploaded/sync_failed.
  // Permettiamo anche il re-claim di un 'syncing' stale (orfano da function
  // crashata/timeout/OOM): la guard updated_at < now-STALE_SYNCING_MINUTES
  // è applicata server-side da una sub-query OR.
  const staleThreshold = new Date(
    Date.now() - STALE_SYNCING_MINUTES * 60 * 1000,
  ).toISOString();
  const { data: claimed, error: claimErr } = await service
    .from('file_refs')
    .update({
      status: 'syncing',
      sync_attempts: ref.sync_attempts + 1,
      last_sync_error: null,
    })
    .eq('id', fileRefId)
    .or(
      `status.in.(uploaded,sync_failed),and(status.eq.syncing,updated_at.lt.${staleThreshold})`,
    )
    .select('id')
    .maybeSingle();

  if (claimErr || !claimed) {
    // qualcun altro ha già il claim, o lo stato è cambiato (synced/failed/deleted)
    return {
      fileRefId,
      ok: false,
      reason: 'not_claimed',
      detail: claimErr?.message ?? `stato corrente: ${ref.status}`,
    };
  }

  // 3. R2 + Nextcloud providers per il tenant
  const { data: tenantRow, error: tenantErr } = await service
    .from('tenants')
    .select('storage_provider, storage_config, r2_config')
    .eq('id', ref.tenant_id)
    .maybeSingle();

  if (tenantErr || !tenantRow) {
    return finalizeFailed(
      service,
      fileRefId,
      ref.sync_attempts + 1,
      `tenant ${ref.tenant_id} non trovato`,
      t0,
    );
  }

  const r2 =
    getR2ProviderFromTenantConfig(
      (tenantRow.r2_config as Record<string, unknown> | null) ?? null,
    ) ?? getR2ProviderFromEnv();
  if (!r2) {
    return finalizeFailed(
      service,
      fileRefId,
      ref.sync_attempts + 1,
      'R2 non configurato',
      t0,
    );
  }

  let nextcloud: StorageProvider;
  try {
    nextcloud = buildNextcloudProvider(tenantRow.storage_provider, tenantRow.storage_config);
  } catch (e) {
    return finalizeFailed(
      service,
      fileRefId,
      ref.sync_attempts + 1,
      `Nextcloud config: ${e instanceof Error ? e.message : 'unknown'}`,
      t0,
    );
  }

  // 4. HEAD su R2 (size reale)
  let r2Size: number;
  try {
    const head = await r2.head(ref.r2_key);
    if (!head) {
      return finalizeFailed(
        service,
        fileRefId,
        ref.sync_attempts + 1,
        'oggetto assente su R2',
        t0,
      );
    }
    r2Size = head.size;
  } catch (e) {
    return finalizeFailed(
      service,
      fileRefId,
      ref.sync_attempts + 1,
      `HEAD R2: ${e instanceof Error ? e.message : 'unknown'}`,
      t0,
    );
  }

  // 5. Download buffered
  let buffer: Uint8Array;
  try {
    buffer = await downloadFromR2(r2, ref.r2_key);
  } catch (e) {
    return finalizeFailed(
      service,
      fileRefId,
      ref.sync_attempts + 1,
      `download R2: ${e instanceof Error ? e.message : 'unknown'}`,
      t0,
    );
  }

  if (buffer.byteLength !== r2Size) {
    return finalizeFailed(
      service,
      fileRefId,
      ref.sync_attempts + 1,
      `size mismatch download vs HEAD R2: ${buffer.byteLength} vs ${r2Size}`,
      t0,
    );
  }

  // 6. Verifica SHA-256 se dichiarato dal client
  if (ref.sha256) {
    const actual = createHash('sha256').update(buffer).digest('hex');
    if (actual !== ref.sha256.toLowerCase()) {
      return finalizeFailed(
        service,
        fileRefId,
        ref.sync_attempts + 1,
        `sha256 mismatch: atteso ${ref.sha256}, ricevuto ${actual}`,
        t0,
      );
    }
  }

  // 7. Crea cartella parent + PUT su Nextcloud
  try {
    const parentPath = ref.path.split('/').slice(0, -1).join('/');
    if (parentPath) await nextcloud.createFolder(parentPath);

    await nextcloud.uploadFile(ref.path, buffer, {
      contentType: ref.mime,
      upsert: true,
    });
  } catch (e) {
    return finalizeFailed(
      service,
      fileRefId,
      ref.sync_attempts + 1,
      `PUT Nextcloud: ${e instanceof Error ? e.message : 'unknown'}`,
      t0,
    );
  }

  // 8. Verifica esistenza su Nextcloud
  try {
    const exists = await nextcloud.exists(ref.path);
    if (!exists) {
      return finalizeFailed(
        service,
        fileRefId,
        ref.sync_attempts + 1,
        'file assente su Nextcloud dopo PUT',
        t0,
      );
    }
  } catch (e) {
    // exists() può fallire per motivi di rete; non blocchiamo il sync
    console.warn(`[sync] exists() ha fallito ma il PUT è andato: ${e instanceof Error ? e.message : ''}`);
  }

  // 9. Marca synced
  const { error: updErr } = await service
    .from('file_refs')
    .update({
      status: 'synced',
      last_sync_error: null,
    })
    .eq('id', fileRefId);

  if (updErr) {
    return finalizeFailed(
      service,
      fileRefId,
      ref.sync_attempts + 1,
      `update synced fallito: ${updErr.message}`,
      t0,
    );
  }

  // Audit
  await service.from('audit_events').insert({
    tenant_id: ref.tenant_id,
    actor_user_id: null,
    actor_role: null, // 'system' non è un app_role valido; sync è cron/system
    entity_type: 'file_ref',
    entity_id: fileRefId,
    action: 'media.sync.synced',
    metadata: {
      commessa_id: ref.commessa_id,
      r2_key: ref.r2_key,
      nextcloud_path: ref.path,
      size_bytes: r2Size,
      sync_attempts: ref.sync_attempts + 1,
      sha256_verified: Boolean(ref.sha256),
      duration_ms: Date.now() - t0,
    },
  });

  return {
    fileRefId,
    ok: true,
    reason: 'synced',
    bytesSynced: r2Size,
    durationMs: Date.now() - t0,
  };
}

/**
 * Sincronizza un batch di file pending (status='uploaded' o 'sync_failed').
 * Processa sequenzialmente per limitare memoria/banda.
 */
export async function syncBatch(maxFiles = 10): Promise<{
  processed: number;
  synced: number;
  skipped: number;
  failed: number;
  results: SyncResult[];
}> {
  const service = createServiceSupabase();

  // Prendi i candidati (RLS bypass via service role).
  // Include: uploaded + sync_failed + syncing-stale (function crashata).
  const staleThreshold = new Date(
    Date.now() - STALE_SYNCING_MINUTES * 60 * 1000,
  ).toISOString();
  const { data: candidates } = await service
    .from('file_refs')
    .select('id')
    .is('deleted_at', null)
    .not('r2_key', 'is', null)
    .or(
      `status.in.(uploaded,sync_failed),and(status.eq.syncing,updated_at.lt.${staleThreshold})`,
    )
    .order('uploaded_at', { ascending: true })
    .limit(maxFiles);

  const results: SyncResult[] = [];
  for (const c of candidates ?? []) {
    const r = await syncOneFile(c.id);
    results.push(r);
  }

  return {
    processed: results.length,
    synced: results.filter((r) => r.reason === 'synced').length,
    skipped: results.filter((r) => r.reason === 'skipped').length,
    failed: results.filter((r) => r.reason === 'failed' || r.reason === 'not_claimed').length,
    results,
  };
}

// ---------------------------------------------------------------------------
// Helpers privati
// ---------------------------------------------------------------------------

async function downloadFromR2(
  r2: R2StorageProvider,
  key: string,
): Promise<Uint8Array> {
  // Usa direttamente il client S3 interno: serve l'accesso al body stream.
  // R2StorageProvider non espone GetObject; lo facciamo via signed GET +
  // fetch per restare disaccoppiati dal client interno.
  const { url } = await r2.createPresignedGetUrl(key, { ttlSec: 60 * 10 });
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`GET R2 ${res.status}`);
  }
  const arr = new Uint8Array(await res.arrayBuffer());
  return arr;
}

function buildNextcloudProvider(
  providerName: string | null,
  storageConfig: unknown,
): StorageProvider {
  const cfg = (storageConfig as Record<string, string> | null) ?? {};
  const name = (providerName as StorageProviderName) ?? 'nextcloud';

  if (name === 'nextcloud') {
    if (!cfg.baseUrl || !cfg.user || !cfg.appPassword) {
      throw new Error('Nextcloud config incompleta (baseUrl/user/appPassword)');
    }
    return getStorageProvider({
      provider: 'nextcloud',
      baseUrl: cfg.baseUrl,
      user: cfg.user,
      appPassword: cfg.appPassword,
      basePath: typeof cfg.basePath === 'string' ? cfg.basePath : undefined,
    });
  }
  if (name === 'supabase') {
    return getStorageProvider({
      provider: 'supabase',
      bucket: (cfg.bucket as string | undefined) ?? 'commesse',
    });
  }
  throw new Error(`Provider storage non supportato per sync: ${name}`);
}

async function markFailed(
  service: ReturnType<typeof createServiceSupabase>,
  fileRefId: string,
  newAttempts: number,
  errorMsg: string,
): Promise<void> {
  await service
    .from('file_refs')
    .update({
      status: 'sync_failed',
      sync_attempts: newAttempts,
      last_sync_error: errorMsg.slice(0, 500),
    })
    .eq('id', fileRefId);
}

async function finalizeFailed(
  service: ReturnType<typeof createServiceSupabase>,
  fileRefId: string,
  newAttempts: number,
  errorMsg: string,
  t0: number,
): Promise<SyncResult> {
  await markFailed(service, fileRefId, newAttempts, errorMsg);
  return {
    fileRefId,
    ok: false,
    reason: 'failed',
    detail: errorMsg,
    durationMs: Date.now() - t0,
  };
}

