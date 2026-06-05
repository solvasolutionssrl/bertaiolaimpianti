import 'server-only';

import { createServiceSupabase } from '@kommessa/api/service';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
  getStorageProvider,
  type R2StorageProvider,
  type StorageProvider,
  type StorageProviderName,
} from '@kommessa/integrations/storage';

import { syncOneFile } from './sync-r2-to-nextcloud';

/**
 * Cestino media con retention 30 giorni — "cassaforte R2".
 *
 * Quando un file (foto/video/pdf) viene eliminato dall'app (office o
 * super admin), NON lo distruggiamo subito:
 *
 *  - Se ha `r2_key` (flusso nuovo): cancelliamo SOLO la copia visibile su
 *    Nextcloud (così sparisce per il cliente che naviga la sua cartella),
 *    ma teniamo l'oggetto R2 come backup. R2 è staging interno: il cliente
 *    non lo vede. Il backup è quindi invisibile per costruzione e lo
 *    gestisce solo SOLVA da /admin/media.
 *  - Se è legacy (nessun `r2_key`, solo su Nextcloud): non c'è cassaforte
 *    R2, quindi SPOSTIAMO il file in una dotfolder nascosta `.cestino_solva/`
 *    dentro la cartella commessa (i dotfolder sono nascosti nella UI
 *    Nextcloud). Memorizziamo il path in `trash_nc_path` per poterlo
 *    rimettere a posto al ripristino.
 *
 * In entrambi i casi il record `file_refs` passa a `status='deleted'` con
 * `deleted_at` + `purge_after = deleted_at + 30gg`: sparisce subito da
 * tutte le gallerie (office, PWA, allegati riunione) che filtrano
 * `deleted_at IS NULL`.
 *
 * Ripristino (solo super admin): se c'è `r2_key` ri-triggeriamo il sync
 * R2→Nextcloud esistente; se legacy, rimettiamo il file dalla dotfolder.
 *
 * Purge definitivo (cron giornaliero, oltre `purge_after`): cancella
 * l'oggetto R2 (+ thumb) o il file nella dotfolder. Da lì irrecuperabile.
 */

const RETENTION_DAYS = 30;

export interface CestinoResult {
  ok: boolean;
  message: string;
}

export interface ActorInfo {
  /** UUID utente, oppure null per cron/sistema. */
  userId: string | null;
  /** Ruolo applicativo o 'platform_admin'. */
  role: string | null;
}

type ServiceClient = ReturnType<typeof createServiceSupabase>;

interface TenantProviders {
  nc: StorageProvider | null;
  r2: R2StorageProvider | null;
}

/**
 * Costruisce i provider storage (Nextcloud + R2) di un tenant leggendo la
 * sua config. Ritorna null per il provider non configurabile (non blocca
 * l'altro). Mirror della logica in sync-r2-to-nextcloud.
 */
async function buildTenantProviders(
  service: ServiceClient,
  tenantId: string,
): Promise<TenantProviders> {
  const { data: tenant } = await service
    .from('tenants')
    .select('storage_provider, storage_config, r2_config')
    .eq('id', tenantId)
    .maybeSingle();

  let nc: StorageProvider | null = null;
  try {
    const providerName =
      (tenant?.storage_provider as StorageProviderName | null) ?? 'nextcloud';
    const cfg =
      (tenant?.storage_config as Record<string, string> | null) ?? {};
    if (
      providerName === 'nextcloud' &&
      cfg.baseUrl &&
      cfg.user &&
      cfg.appPassword
    ) {
      nc = getStorageProvider({
        provider: 'nextcloud',
        baseUrl: cfg.baseUrl,
        user: cfg.user,
        appPassword: cfg.appPassword,
        basePath: typeof cfg.basePath === 'string' ? cfg.basePath : undefined,
      });
    } else if (providerName === 'supabase') {
      nc = getStorageProvider({
        provider: 'supabase',
        bucket: (cfg.bucket as string | undefined) ?? 'commesse',
      });
    }
  } catch {
    nc = null;
  }

  const r2 =
    getR2ProviderFromTenantConfig(
      (tenant?.r2_config as Record<string, unknown> | null) ?? null,
    ) ?? getR2ProviderFromEnv();

  return { nc, r2 };
}

/** `dir/file.jpg` → `dir/.cestino_solva/file.jpg` (path dotfolder nascosto). */
function deriveTrashNcPath(path: string): string {
  const parts = path.split('/');
  const filename = parts.pop() ?? 'file';
  const dir = parts.join('/');
  return `${dir ? `${dir}/` : ''}.cestino_solva/${filename}`;
}

/**
 * Soft-delete di un media nel cestino (retention 30gg).
 *
 * @param expectTenantId se valorizzato, il file DEVE appartenere a questo
 *   tenant (guardrail per le azioni office che girano con service role).
 *   Passare null per il super admin (cross-tenant).
 */
export async function softDeleteMediaFile(opts: {
  fileRefId: string;
  expectTenantId: string | null;
  actor: ActorInfo;
}): Promise<CestinoResult> {
  const { fileRefId, expectTenantId, actor } = opts;
  const service = createServiceSupabase();

  const { data: row, error: rErr } = await service
    .from('file_refs')
    .select('id, tenant_id, commessa_id, filename, path, r2_key, status')
    .eq('id', fileRefId)
    .maybeSingle();
  if (rErr || !row) {
    return { ok: false, message: 'File non trovato' };
  }
  if (expectTenantId && row.tenant_id !== expectTenantId) {
    return { ok: false, message: 'File non appartiene al tuo spazio' };
  }
  if (row.status === 'deleted') {
    return { ok: false, message: 'File già nel cestino' };
  }

  const { nc, r2 } = await buildTenantProviders(service, row.tenant_id as string);

  // La cassaforte è R2 SOLO se l'oggetto esiste DAVVERO. In futuro la copia
  // R2 verrà eliminata dopo 90gg (R2 è cache; la source of truth è
  // Nextcloud): allora un file sincronizzato diventa "solo su Nextcloud"
  // anche se ha ancora `r2_key` in DB. Quindi NON ci fidiamo di r2_key: un
  // HEAD conferma l'esistenza. Se R2 non c'è (purgato) o l'esito è incerto
  // (errore di rete), trattiamo come "nessun backup R2" e NON cancelliamo
  // mai l'unica copia: la spostiamo nel cestino.
  let r2Exists = false;
  if (row.r2_key && r2) {
    try {
      r2Exists = (await r2.head(row.r2_key as string)) !== null;
    } catch {
      r2Exists = false;
    }
  }

  let trashNcPath: string | null = null;

  if (r2Exists) {
    // Backup = oggetto R2 (invisibile al cliente). Togliamo la copia NC.
    if (nc && row.path) {
      try {
        await nc.delete(row.path as string);
      } catch (e) {
        // Non bloccante: se il file su NC non c'era (mai sincronizzato) va
        // bene comunque. Il backup R2 resta intatto.
        // eslint-disable-next-line no-console
        console.warn(
          '[cestino] delete NC fallito (non-bloccante):',
          e instanceof Error ? e.message : e,
        );
      }
    }
  } else if (nc && row.path) {
    // Nessun backup R2 (file solo-Nextcloud: legacy oppure R2 già purgato a
    // 90gg). NON cancelliamo: spostiamo in dotfolder nascosta, recuperabile.
    trashNcPath = deriveTrashNcPath(row.path as string);
    const trashDir = trashNcPath.slice(0, trashNcPath.lastIndexOf('/'));
    try {
      // WebDAV MOVE richiede che il parent di destinazione esista (MKCOL non
      // è ricorsivo). createFolder è idempotente: crea la dotfolder se manca.
      await nc.createFolder(trashDir);
      await nc.move(row.path as string, trashNcPath);
    } catch (e) {
      // Se il move fallisce non lasciamo il record incoerente: abortiamo.
      // eslint-disable-next-line no-console
      console.warn(
        '[cestino] move NC verso cestino fallito:',
        e instanceof Error ? e.message : e,
      );
      return {
        ok: false,
        message:
          'Impossibile spostare il file nel cestino su Nextcloud. Riprova.',
      };
    }
  }

  const now = new Date();
  const purgeAfter = new Date(now.getTime() + RETENTION_DAYS * 86_400_000);

  // Cast `as never`: deleted_by/purge_after/trash_nc_path sono introdotte
  // dalla migration 20260604000000 e non sono ancora nei types generati.
  const { error: updErr } = await service
    .from('file_refs')
    .update({
      status: 'deleted',
      deleted_at: now.toISOString(),
      purge_after: purgeAfter.toISOString(),
      deleted_by: actor.userId,
      trash_nc_path: trashNcPath,
      last_sync_error: null,
    } as never)
    .eq('id', fileRefId);
  if (updErr) {
    return { ok: false, message: `Eliminazione fallita: ${updErr.message}` };
  }

  // NB: il link commessa_riunione_allegato NON viene cancellato — così il
  // ripristino è completo. Le query lato pagina filtrano per deleted_at.

  await service.from('audit_events').insert({
    tenant_id: row.tenant_id,
    actor_user_id: actor.userId,
    actor_role: actor.role,
    entity_type: 'file_ref',
    entity_id: fileRefId,
    action: 'media.soft_delete',
    metadata: {
      filename: row.filename,
      r2_key: row.r2_key,
      vault: trashNcPath ? 'nextcloud_dotfolder' : 'r2',
      purge_after: purgeAfter.toISOString(),
    },
  } as never);

  return {
    ok: true,
    message: `Spostato nel cestino. Recuperabile ${RETENTION_DAYS} giorni dal pannello SOLVA.`,
  };
}

/**
 * Ripristino di un file dal cestino. Solo super admin.
 */
export async function restoreMediaFile(opts: {
  fileRefId: string;
  actor: ActorInfo;
}): Promise<CestinoResult> {
  const { fileRefId, actor } = opts;
  const service = createServiceSupabase();

  const { data: rowRaw, error: rErr } = await service
    .from('file_refs')
    .select('id, tenant_id, filename, path, r2_key, status, trash_nc_path')
    .eq('id', fileRefId)
    .maybeSingle();
  if (rErr || !rowRaw) {
    return { ok: false, message: 'File non trovato' };
  }
  // Cast: trash_nc_path non è nei types generati (migration 20260604000000).
  const row = rowRaw as unknown as {
    id: string;
    tenant_id: string;
    filename: string | null;
    path: string | null;
    r2_key: string | null;
    status: string;
    trash_nc_path: string | null;
  };
  if (row.status !== 'deleted') {
    return { ok: false, message: 'Il file non è nel cestino' };
  }

  // Il segnale definitivo di DOVE sta il backup è `trash_nc_path`: se è
  // valorizzato il file è stato SPOSTATO nella dotfolder (caso solo-NC,
  // legacy o R2 già purgato a 90gg) e si ripristina rimettendolo a posto.
  // Altrimenti il backup è l'oggetto R2 e si ripristina ri-sincronizzando.
  if (!row.trash_nc_path && row.r2_key) {
    // Cassaforte R2: riportiamo lo stato a 'uploaded' e ri-pushiamo su
    // Nextcloud con la pipeline di sync esistente.
    const { error: updErr } = await service
      .from('file_refs')
      .update({
        status: 'uploaded',
        deleted_at: null,
        purge_after: null,
        deleted_by: null,
        trash_nc_path: null,
        last_sync_error: null,
      } as never)
      .eq('id', fileRefId);
    if (updErr) {
      return { ok: false, message: `Ripristino fallito: ${updErr.message}` };
    }
    // Ri-sync immediato (best-effort: se fallisce, il cron lo riprende).
    try {
      await syncOneFile(fileRefId);
    } catch {
      /* il batch cron lo riprenderà */
    }
  } else if (row.trash_nc_path) {
    // Backup nella dotfolder: rimettiamo il file dal cestino al path originale.
    const { nc } = await buildTenantProviders(service, row.tenant_id as string);
    if (nc && row.path) {
      try {
        await nc.move(row.trash_nc_path as string, row.path as string);
      } catch (e) {
        return {
          ok: false,
          message: `Impossibile rimettere il file su Nextcloud: ${
            e instanceof Error ? e.message : 'errore'
          }`,
        };
      }
    }
    const { error: updErr } = await service
      .from('file_refs')
      .update({
        status: 'synced',
        deleted_at: null,
        purge_after: null,
        deleted_by: null,
        trash_nc_path: null,
        last_sync_error: null,
      } as never)
      .eq('id', fileRefId);
    if (updErr) {
      return { ok: false, message: `Ripristino fallito: ${updErr.message}` };
    }
  } else {
    // Né dotfolder né R2: il backup è già stato purgato, non c'è nulla da
    // rimettere. (Non raggiungibile da UI: il tasto Ripristina sparisce
    // quando purge_after è null.)
    return {
      ok: false,
      message: 'Backup non più disponibile: il file è stato purgato.',
    };
  }

  await service.from('audit_events').insert({
    tenant_id: row.tenant_id,
    actor_user_id: actor.userId,
    actor_role: actor.role,
    entity_type: 'file_ref',
    entity_id: fileRefId,
    action: 'media.restore',
    metadata: { filename: row.filename },
  } as never);

  return { ok: true, message: 'File ripristinato.' };
}

/**
 * Purge definitivo dei file nel cestino oltre la scadenza (`purge_after`).
 * Chiamato dal cron giornaliero. Cancella l'oggetto R2 (+ thumb) o il file
 * nella dotfolder, poi azzera le chiavi (tombstone audit).
 */
export async function purgeExpiredMedia(opts: {
  limit?: number;
}): Promise<{ scanned: number; purged: number; failed: number }> {
  const limit = Math.min(Math.max(1, opts.limit ?? 50), 200);
  const service = createServiceSupabase();

  const nowIso = new Date().toISOString();
  // Cast `as never` sui nomi colonna nuovi: r2_thumb_key/purge_after/
  // trash_nc_path non sono nei types generati.
  const { data: rows, error } = await service
    .from('file_refs')
    .select(
      'id, tenant_id, filename, r2_key, r2_thumb_key, trash_nc_path, path',
    )
    .eq('status', 'deleted')
    .not('purge_after' as never, 'is', null)
    .lt('purge_after' as never, nowIso)
    .limit(limit);
  if (error || !rows) {
    return { scanned: 0, purged: 0, failed: 0 };
  }

  let purged = 0;
  let failed = 0;

  // Cache provider per tenant (evita di ricostruirli per ogni file).
  const provCache = new Map<string, TenantProviders>();
  const getProv = async (tenantId: string): Promise<TenantProviders> => {
    const hit = provCache.get(tenantId);
    if (hit) return hit;
    const p = await buildTenantProviders(service, tenantId);
    provCache.set(tenantId, p);
    return p;
  };

  for (const row of rows as unknown as Array<Record<string, unknown>>) {
    try {
      const { nc, r2 } = await getProv(row.tenant_id as string);

      if (row.r2_key && r2) {
        await r2.delete(row.r2_key as string).catch(() => undefined);
      }
      if (row.r2_thumb_key && r2) {
        await r2.delete(row.r2_thumb_key as string).catch(() => undefined);
      }
      if (row.trash_nc_path && nc) {
        await nc.delete(row.trash_nc_path as string).catch(() => undefined);
      }

      await service
        .from('file_refs')
        .update({
          r2_key: null,
          r2_thumb_key: null,
          trash_nc_path: null,
          purge_after: null,
        } as never)
        .eq('id', row.id as string);

      await service.from('audit_events').insert({
        tenant_id: row.tenant_id,
        actor_user_id: null,
        // actor_role è l'enum app_role: nessun valore "system", quindi null
        // per gli eventi generati dal cron.
        actor_role: null,
        entity_type: 'file_ref',
        entity_id: row.id,
        action: 'media.purged',
        metadata: { filename: row.filename },
      } as never);

      purged += 1;
    } catch {
      failed += 1;
    }
  }

  return { scanned: rows.length, purged, failed };
}
