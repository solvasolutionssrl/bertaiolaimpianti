'use server';

import { revalidatePath } from 'next/cache';

import { createServiceSupabase } from '@kommessa/api/service';

import { requirePlatformAdmin } from '../../_lib/guard';
import { syncOneFile, syncBatch } from '../../../_lib/sync-r2-to-nextcloud';
import {
  softDeleteMediaFile,
  restoreMediaFile,
} from '../../../_lib/media-cestino';

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
 * Server Action: sposta un media nel cestino (retention 30gg).
 *
 * Delega al modulo condiviso `media-cestino`: rimuove la copia visibile da
 * Nextcloud ma tiene il backup su R2 (invisibile al cliente) finché non
 * scade. Il link riunione NON viene cancellato (così il ripristino è
 * completo); le gallerie filtrano per deleted_at. Cross-tenant (super admin).
 */
export async function hardDeleteFile(
  fileRefId: string,
): Promise<RetrySyncResult> {
  const admin = await requirePlatformAdmin();

  const res = await softDeleteMediaFile({
    fileRefId,
    expectTenantId: null,
    actor: { userId: admin.userId, role: 'platform_admin' },
  });
  revalidatePath('/admin/media');
  return res;
}

/**
 * Server Action: ripristina un file dal cestino. Solo super admin.
 * Se ha r2_key ri-pusha su Nextcloud con la pipeline di sync; se legacy lo
 * rimette dalla dotfolder nascosta.
 */
export async function restoreMedia(
  fileRefId: string,
): Promise<RetrySyncResult> {
  const admin = await requirePlatformAdmin();

  const res = await restoreMediaFile({
    fileRefId,
    actor: { userId: admin.userId, role: 'platform_admin' },
  });
  revalidatePath('/admin/media');
  return res;
}
