import 'server-only';

import { createServiceSupabase } from '@kommessa/api/service';
import {
  getStorageProvider,
  type StorageProvider,
  type StorageProviderName,
} from '@kommessa/integrations/storage';

/**
 * Helper per eliminare file allegati (TODO / Riunione) anche dallo
 * storage cloud (Nextcloud / R2 / Supabase storage), non solo dal DB.
 *
 * Strategia "best-effort":
 *   1. Carica i file_refs (path + commessa per ricavare il tenant)
 *   2. Costruisce il provider del tenant
 *   3. Tenta DELETE su ogni path — errori vengono loggati ma non
 *      bloccano (lo storage può aver già perso il file, può essere
 *      offline, ecc.). Il DB è la fonte di verità: una riga DB senza
 *      file su disco è meglio di una riga DB con file orfano che
 *      blocca la cancellazione.
 *   4. Cancella le righe file_refs (cascade rimuove gli allegati
 *      junction). Se il chiamante ha già fatto la delete cascade del
 *      parent, queste file_refs sono orfane: vanno rimosse esplicitamente.
 *
 * Service role usato perché il chiamante può essere un tecnico che non
 * ha permesso DELETE diretto su file_refs.
 */
export async function cleanupAllegatoFiles(opts: {
  tenantId: string;
  fileRefIds: string[];
}): Promise<{ deletedDb: number; deletedCloud: number; errors: string[] }> {
  const out = { deletedDb: 0, deletedCloud: 0, errors: [] as string[] };
  if (opts.fileRefIds.length === 0) return out;

  const service = createServiceSupabase();

  const { data: refs } = await service
    .from('file_refs')
    .select('id, path, r2_key, tenant_id')
    .in('id', opts.fileRefIds)
    .eq('tenant_id', opts.tenantId);

  const safeRefs = (refs ?? []) as Array<{
    id: string;
    path: string | null;
    r2_key: string | null;
    tenant_id: string;
  }>;

  if (safeRefs.length === 0) return out;

  // Carica config storage del tenant
  let provider: StorageProvider | null = null;
  try {
    const { data: t } = await service
      .from('tenants')
      .select('storage_provider, storage_config')
      .eq('id', opts.tenantId)
      .maybeSingle();
    const name = (t?.storage_provider as StorageProviderName) ?? 'supabase';
    const cfg = (t?.storage_config as Record<string, string> | null) ?? {};
    if (name === 'nextcloud' && cfg.baseUrl && cfg.user && cfg.appPassword) {
      provider = getStorageProvider({
        provider: 'nextcloud',
        baseUrl: cfg.baseUrl,
        user: cfg.user,
        appPassword: cfg.appPassword,
        basePath: typeof cfg.basePath === 'string' ? cfg.basePath : undefined,
      });
    } else if (name === 'supabase') {
      provider = getStorageProvider({
        provider: 'supabase',
        bucket: cfg.bucket ?? 'commesse',
      });
    }
  } catch (e) {
    out.errors.push(
      `Storage config non disponibile: ${e instanceof Error ? e.message : 'unknown'}`,
    );
  }

  // Delete cloud — best effort
  if (provider) {
    for (const ref of safeRefs) {
      if (!ref.path) continue;
      try {
        // Path canonico: rimuovi leading slash (provider lo richiede senza)
        const p = ref.path.replace(/^\/+/, '');
        await provider.delete(p);
        out.deletedCloud += 1;
      } catch (e) {
        out.errors.push(
          `Delete cloud ${ref.path}: ${e instanceof Error ? e.message.slice(0, 120) : 'unknown'}`,
        );
      }
    }
  }

  // Delete DB rows (cascade rimuove i junction allegati)
  const { error: delErr, count } = await service
    .from('file_refs')
    .delete({ count: 'exact' })
    .eq('tenant_id', opts.tenantId)
    .in(
      'id',
      safeRefs.map((r) => r.id),
    );
  if (delErr) out.errors.push(`Delete DB: ${delErr.message}`);
  else out.deletedDb = count ?? safeRefs.length;

  return out;
}

/**
 * Carica gli id file_ref linkati a un TODO via commessa_todo_allegato.
 */
export async function getTodoFileRefIds(todoId: string): Promise<string[]> {
  const service = createServiceSupabase();
  const { data } = await service
    .from('commessa_todo_allegato' as never)
    .select('file_ref_id')
    .eq('todo_id', todoId);
  return ((data ?? []) as Array<{ file_ref_id: string }>).map((r) => r.file_ref_id);
}

/**
 * Carica gli id file_ref linkati a una riunione via commessa_riunione_allegato.
 */
export async function getRiunioneFileRefIds(riunioneId: string): Promise<string[]> {
  const service = createServiceSupabase();
  const { data } = await service
    .from('commessa_riunione_allegato' as never)
    .select('file_ref_id')
    .eq('riunione_id', riunioneId);
  return ((data ?? []) as Array<{ file_ref_id: string }>).map((r) => r.file_ref_id);
}
