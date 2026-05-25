import { type NextRequest } from 'next/server';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
} from '@kommessa/integrations/storage';

import {
  canView,
  loadFolderAclMap,
  stripCommessaRoot,
} from '../../../_lib/folder-acl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/media/[id]
 *
 * Resolver canonico per media del nuovo flusso R2 (Fase 1).
 *
 * Comportamento:
 *  - Auth obbligatoria.
 *  - RLS garantisce accesso solo ai file_refs del tenant/commessa.
 *  - Se la riga ha `r2_key` e `status` in stato visibile, 302 verso signed
 *    URL R2 (TTL 5 min).
 *  - Se la riga è legacy (no r2_key) o soft-deleted, 404. I file legacy si
 *    continuano a servire via /api/photo/[id] finché non migrano al nuovo flusso.
 *
 * In Fase 2 il resolver imparerà a ricadere su Nextcloud quando R2 sarà
 * stato pulito post-sync.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: fileRefId } = await params;

  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return new Response('Non autenticato', { status: 401 });
  }

  const supabase = createServerSupabase();
  const { data: ref, error } = await supabase
    .from('file_refs')
    .select('id, tenant_id, commessa_id, path, r2_key, status, mime, filename, deleted_at')
    .eq('id', fileRefId)
    .single();

  if (error || !ref) {
    return new Response('Non trovato', { status: 404 });
  }
  if (ref.tenant_id !== ctx.tenantId) {
    return new Response('Non autorizzato', { status: 403 });
  }
  if (ref.deleted_at) {
    return new Response('Non trovato', { status: 404 });
  }
  if (!ref.r2_key) {
    // Riga legacy: continua a usare /api/photo/[id] (immagini)
    return new Response('Media legacy: usare /api/photo/[id]', { status: 410 });
  }
  if (!['uploaded', 'syncing', 'synced', 'sync_failed'].includes(ref.status)) {
    return new Response('Media non disponibile', { status: 409 });
  }

  // ─── ACL CHECK ───────────────────────────────────────────────────────
  if (ref.commessa_id) {
    if (ctx.role === 'tecnico') {
      // Tecnico vede solo media di commesse a cui è assegnato
      const { data: assign } = await supabase
        .from('commessa_tecnici')
        .select('commessa_id')
        .eq('commessa_id', ref.commessa_id)
        .eq('user_id', ctx.userId)
        .maybeSingle();
      if (!assign) {
        return new Response('Forbidden', { status: 403 });
      }
    }
    // Folder ACL: deriva folder dal path file_refs.path
    if (ref.path) {
      const aclMap = await loadFolderAclMap(ctx.tenantId, ref.commessa_id);
      const relPath = stripCommessaRoot(ref.path);
      const folderPath = relPath.includes('/')
        ? relPath.split('/').slice(0, -1).join('/')
        : '';
      if (folderPath && !canView(ctx.role, folderPath, aclMap)) {
        return new Response('Forbidden', { status: 403 });
      }
    }
  }

  // R2 provider (tenant config con fallback env)
  const service = createServiceSupabase();
  const { data: tenantRow } = await service
    .from('tenants')
    .select('r2_config')
    .eq('id', ctx.tenantId)
    .maybeSingle();

  const r2 =
    getR2ProviderFromTenantConfig(
      (tenantRow?.r2_config as Record<string, unknown> | null) ?? null,
    ) ?? getR2ProviderFromEnv();

  if (!r2) {
    return new Response('R2 non configurato', { status: 503 });
  }

  const presigned = await r2.createPresignedGetUrl(ref.r2_key, {
    ttlSec: 5 * 60,
  });

  return Response.redirect(presigned.url, 302);
}
