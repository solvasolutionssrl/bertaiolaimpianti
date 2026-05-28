'use server';

import { revalidatePath } from 'next/cache';

import { createServiceSupabase } from '@kommessa/api/service';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
} from '@kommessa/integrations/storage';

import { requirePlatformAdmin } from '../../_lib/guard';
import { syncOneFile, syncBatch } from '../../../_lib/sync-r2-to-nextcloud';

export interface RetrySyncResult {
  ok: boolean;
  message: string;
}

/** Server Action: forza il sync di un singolo file_ref (richiesto da admin). */
export async function retrySyncFile(fileRefId: string): Promise<RetrySyncResult> {
  await requirePlatformAdmin();

  const r = await syncOneFile(fileRefId);
  revalidatePath('/admin/media');

  if (r.ok) {
    return {
      ok: true,
      message: `Sincronizzato ${(r.bytesSynced ?? 0).toLocaleString('it-IT')} byte in ${r.durationMs ?? '?'} ms`,
    };
  }
  return {
    ok: false,
    message: `Sync fallito (${r.reason}): ${r.detail ?? 'errore sconosciuto'}`,
  };
}

/** Server Action: processa un batch di N file in attesa. */
export async function runSyncBatch(maxFiles = 10): Promise<{
  processed: number;
  synced: number;
  failed: number;
  skipped: number;
}> {
  await requirePlatformAdmin();

  const r = await syncBatch(Math.min(Math.max(1, maxFiles), 50));
  revalidatePath('/admin/media');

  return {
    processed: r.processed,
    synced: r.synced,
    failed: r.failed,
    skipped: r.skipped,
  };
}

/**
 * Server Action: forza il reset di un file stuck (syncing/sync_failed/
 * failed) riportandolo a 'uploaded' così il prossimo batch lo riproverà
 * da capo.
 *
 * Da usare SOLO quando l'auto-recovery (10 min stale) non basta — es.
 * dopo un fix del codice di sync, per accelerare il retry senza aspettare
 * il cron.
 */
export async function forceResetFile(
  fileRefId: string,
): Promise<RetrySyncResult> {
  await requirePlatformAdmin();
  const service = createServiceSupabase();

  // Solo per file con r2_key e in stato non-terminal-success.
  const { data: row, error: rErr } = await service
    .from('file_refs')
    .select('id, status, r2_key, sync_attempts')
    .eq('id', fileRefId)
    .maybeSingle();
  if (rErr || !row) {
    return { ok: false, message: 'File non trovato' };
  }
  if (!row.r2_key) {
    return { ok: false, message: 'File legacy senza r2_key, niente da resettare' };
  }
  if (row.status === 'synced') {
    return { ok: false, message: 'File già synced, nessun reset necessario' };
  }
  if (row.status === 'failed') {
    // failed = upload R2 mai concluso → non riavviabile dal server.
    return {
      ok: false,
      message: 'File in stato terminale "failed": l\'upload R2 non si è concluso, non si può riprendere lato server.',
    };
  }

  const { error: updErr } = await service
    .from('file_refs')
    .update({
      status: 'uploaded',
      last_sync_error: null,
    })
    .eq('id', fileRefId);
  if (updErr) {
    return { ok: false, message: `Reset fallito: ${updErr.message}` };
  }
  revalidatePath('/admin/media');
  return {
    ok: true,
    message: 'Stato resettato a "uploaded". Sarà ripreso dal prossimo batch.',
  };
}

/**
 * Server Action: elimina hard un file media.
 *  1) DELETE oggetto R2 (se r2_key presente).
 *  2) DELETE link commessa_riunione_allegato + simili (cascade FK).
 *  3) Soft delete su file_refs (status='deleted', deleted_at=now()) per
 *     mantenere l'audit trail.
 *
 * NOTA: la copia su Nextcloud NON viene toccata (l'utente la rimuove a
 * mano dal client Nextcloud se serve).
 */
export async function hardDeleteFile(
  fileRefId: string,
): Promise<RetrySyncResult> {
  await requirePlatformAdmin();
  const service = createServiceSupabase();

  // 1) Carica file_ref + tenant
  const { data: row, error: rErr } = await service
    .from('file_refs')
    .select('id, tenant_id, filename, r2_key, status')
    .eq('id', fileRefId)
    .maybeSingle();
  if (rErr || !row) {
    return { ok: false, message: 'File non trovato' };
  }
  if (row.status === 'deleted') {
    return { ok: false, message: 'File già marcato come eliminato' };
  }

  // 2) Provider R2 del tenant
  if (row.r2_key) {
    const { data: tenantRow } = await service
      .from('tenants')
      .select('r2_config')
      .eq('id', row.tenant_id)
      .maybeSingle();
    const r2 =
      getR2ProviderFromTenantConfig(
        (tenantRow?.r2_config as Record<string, unknown> | null) ?? null,
      ) ?? getR2ProviderFromEnv();
    if (r2) {
      try {
        await r2.delete(row.r2_key);
      } catch (e) {
        // Logghiamo ma proseguiamo: se l'oggetto R2 era già stato pulito
        // a monte (Lifecycle), non è bloccante.
        // eslint-disable-next-line no-console
        console.warn(
          '[admin] delete R2 fallito (non-bloccante):',
          e instanceof Error ? e.message : e,
        );
      }
    }
  }

  // 3) Soft delete su file_refs. La FK ON DELETE CASCADE su
  //    commessa_riunione_allegato/altri non scatta col soft delete: la
  //    rimozione esplicita del link è gestita più sotto.
  const nowIso = new Date().toISOString();
  const { error: updErr } = await service
    .from('file_refs')
    .update({
      status: 'deleted',
      deleted_at: nowIso,
      last_sync_error: null,
    })
    .eq('id', fileRefId);
  if (updErr) {
    return { ok: false, message: `Soft delete fallito: ${updErr.message}` };
  }

  // 4) Pulisci i link che renderebbero il file ancora visibile in UI:
  //    - commessa_riunione_allegato (allegati riunioni)
  //    - eventuali altre tabelle che linkano file_refs si possono
  //      aggiungere qui senza toccare il file_ref stesso.
  const { error: linkErr } = await service
    .from('commessa_riunione_allegato' as never)
    .delete()
    .eq('file_ref_id', fileRefId);
  if (linkErr) {
    // eslint-disable-next-line no-console
    console.warn(
      '[admin] delete link riunione fallito (non-bloccante):',
      linkErr.message,
    );
  }

  // 5) Audit
  await service.from('audit_events').insert({
    tenant_id: row.tenant_id,
    actor_user_id: null,
    actor_role: null,
    entity_type: 'file_ref',
    entity_id: fileRefId,
    action: 'media.hard_delete',
    metadata: {
      filename: row.filename,
      r2_key: row.r2_key,
      previous_status: row.status,
    },
  });

  revalidatePath('/admin/media');
  return {
    ok: true,
    message: 'File eliminato. La copia su Nextcloud va rimossa a mano se serve.',
  };
}
