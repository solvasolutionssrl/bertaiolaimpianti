'use server';

import { revalidatePath } from 'next/cache';

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
