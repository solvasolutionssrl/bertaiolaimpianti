import 'server-only';

import { createServerSupabase } from '@kommessa/api/server';
import type { AppRole } from '@kommessa/api';

import { canView, loadFolderAclMap, stripCommessaRoot } from './folder-acl';

/**
 * Autorizzazione UNIFICATA per gli endpoint che servono file/media
 * (`/api/photo/[id]`, `/api/media/[id]`, `/api/cloud/file`).
 *
 * Presupposto: il file (`file_refs`) o la commessa sono GIÀ stati verificati
 * appartenere al tenant del chiamante (via RLS del client autenticato oppure
 * filtro esplicito `tenant_id = ctx.tenantId`). Questo helper aggiunge il
 * livello di autorizzazione PER-RUOLO/PER-CARTELLA che la RLS di `file_refs`
 * (tenant-wide) non copre:
 *
 *  - **cliente** (portale): NON accede agli endpoint staff — ha il proprio
 *    flusso (`portal_files_view` + signed URL). SEMPRE negato. (Chiude il
 *    caso: un cliente autenticato che enumera i `file_refs` del tenant e
 *    scarica le foto di altri clienti/commesse.)
 *  - **admin**: accesso pieno nel proprio tenant.
 *  - **office**: soggetto alla folder-ACL (una cartella può essere nascosta
 *    anche all'office via preset/override).
 *  - **tecnico**: deve essere assegnato alla commessa (`commessa_tecnici`) e
 *    rispettare la folder-ACL.
 *
 * `commessaId === null` = file non legato a una commessa (es. allegato
 * riunione/todo a livello tenant). Per gli endpoint basati su `file_refs`
 * (row già tenant-scoped) è consentito allo staff interno. Per gli endpoint
 * basati su un PATH fornito dal client (`cloud/file`) passare
 * `strictNoCommessa: true`: un path che non risolve a una commessa è servibile
 * solo ad admin/office (evita che un tecnico legga path arbitrari del share).
 */
export async function canAccessFile(
  ctx: { tenantId: string; userId: string; role: AppRole },
  opts: { commessaId: string | null; path: string | null; strictNoCommessa?: boolean },
): Promise<boolean> {
  if (ctx.role === 'cliente') return false;
  if (ctx.role === 'admin') return true;

  if (!opts.commessaId) {
    if (opts.strictNoCommessa) return ctx.role === 'office';
    // Riga file_ref tenant-scoped senza commessa: staff interni ok.
    return ctx.role === 'office' || ctx.role === 'tecnico';
  }

  const sb = createServerSupabase();
  if (ctx.role === 'tecnico') {
    const { data: assign } = await sb
      .from('commessa_tecnici')
      .select('commessa_id')
      .eq('commessa_id', opts.commessaId)
      .eq('user_id', ctx.userId)
      .maybeSingle();
    if (!assign) return false;
  }

  if (opts.path) {
    const aclMap = await loadFolderAclMap(ctx.tenantId, opts.commessaId);
    const relPath = stripCommessaRoot(opts.path);
    const folderPath = relPath.includes('/')
      ? relPath.split('/').slice(0, -1).join('/')
      : '';
    if (folderPath && !canView(ctx.role, folderPath, aclMap)) return false;
  }

  return true;
}
