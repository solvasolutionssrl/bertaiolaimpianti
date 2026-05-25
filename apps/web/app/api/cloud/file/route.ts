import { NextResponse } from 'next/server';

import { createServerSupabase } from '@impiantixplus/api/server';
import { createServiceSupabase } from '@impiantixplus/api/service';
import { requireTenantContext } from '@impiantixplus/api/tenant';
import {
  getStorageProvider,
  type StorageProviderName,
} from '@impiantixplus/integrations/storage';

import {
  canView,
  loadFolderAclMap,
  stripCommessaRoot,
} from '../../../_lib/folder-acl';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/cloud/file?path=<percorso>
 *
 * Proxy server-side per il download di un file dal cloud storage del
 * tenant corrente. Necessario perché Nextcloud richiede Basic Auth — il
 * browser non può richiamare direttamente WebDAV con credenziali.
 *
 * Per Supabase Storage: ritorna un redirect 302 al signed URL pubblico.
 * Per Nextcloud: fa fetch lato server e streama la risposta al client.
 *
 * Sicurezza:
 *  - Richiede tenant context (sessione valida)
 *  - Sanitizza il path (no `..`)
 *  - Path è relativo alla root del bucket / share del tenant
 */
export async function GET(req: Request) {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const rawPath = url.searchParams.get('path') ?? '';
  // Sanitizza il path: rimuovi traversal, normalizza slash
  const safePath = rawPath
    .replace(/\.\./g, '')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '');
  if (!safePath) {
    return NextResponse.json({ error: 'path required' }, { status: 400 });
  }

  // ─── ACL CHECK ─────────────────────────────────────────────────────
  // Schema path atteso: <01_X>/<nome_cartella>/<rest...>
  // Trova la commessa via nome_cartella, poi verifica il ruolo sul path relativo.
  const pathSegments = safePath.split('/');
  if (pathSegments.length >= 2 && /^[0-9]{2}_/.test(pathSegments[0]!)) {
    const nomeCartella = pathSegments[1]!;
    const sb = createServerSupabase();
    const { data: commessa } = await sb
      .from('commesse')
      .select('id, tenant_id')
      .eq('nome_cartella', nomeCartella)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (commessa?.id) {
      // Tecnico: deve essere assegnato alla commessa
      if (ctx.role === 'tecnico') {
        const { data: assign } = await sb
          .from('commessa_tecnici')
          .select('commessa_id')
          .eq('commessa_id', commessa.id)
          .eq('user_id', ctx.userId)
          .maybeSingle();
        if (!assign) {
          return NextResponse.json({ error: 'forbidden' }, { status: 403 });
        }
      }

      // Folder ACL
      const aclMap = await loadFolderAclMap(ctx.tenantId, commessa.id);
      const relPath = stripCommessaRoot(safePath);
      // Estrai SOLO la cartella, non il filename, per il check
      const folderPath = relPath.includes('/')
        ? relPath.split('/').slice(0, -1).join('/')
        : '';
      if (folderPath && !canView(ctx.role, folderPath, aclMap)) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      }
    }
  }

  // Risolvi config storage del tenant via service role
  const service = createServiceSupabase();
  const { data: tenant, error } = await service
    .from('tenants')
    .select('storage_provider, storage_config')
    .eq('id', ctx.tenantId)
    .maybeSingle();
  if (error || !tenant) {
    return NextResponse.json({ error: 'tenant config unavailable' }, { status: 500 });
  }

  const providerName = (tenant.storage_provider as StorageProviderName) ?? 'supabase';
  const cfg = (tenant.storage_config as Record<string, string> | null) ?? {};

  try {
    if (providerName === 'supabase') {
      const provider = getStorageProvider({
        provider: 'supabase',
        bucket: (cfg.bucket as string | undefined) ?? 'commesse',
      });
      const signed = await provider.getDownloadUrl(safePath, 300);
      return NextResponse.redirect(signed.url);
    }

    if (providerName === 'nextcloud') {
      if (!cfg.baseUrl || !cfg.user || !cfg.appPassword) {
        return NextResponse.json({ error: 'nextcloud_not_configured' }, { status: 503 });
      }
      const ncUrl = `${cfg.baseUrl.replace(/\/+$/, '')}/remote.php/dav/files/${cfg.user}/${encodeURI(safePath)}`;
      const auth = Buffer.from(`${cfg.user}:${cfg.appPassword}`).toString('base64');

      // Forward del Range del client → Nextcloud. Indispensabile per il
      // tag <video>: senza partial content il browser non può fare seek
      // né iniziare la riproduzione prima del download completo.
      const range = req.headers.get('range');
      const upstreamHeaders: Record<string, string> = { Authorization: `Basic ${auth}` };
      if (range) upstreamHeaders['Range'] = range;

      const res = await fetch(ncUrl, { headers: upstreamHeaders });
      if (!res.ok || !res.body) {
        return NextResponse.json(
          { error: 'cloud_fetch_failed', status: res.status },
          { status: 502 },
        );
      }

      const headers = new Headers();
      const ct = res.headers.get('content-type');
      const cl = res.headers.get('content-length');
      const cr = res.headers.get('content-range');
      const ar = res.headers.get('accept-ranges');
      if (ct) headers.set('Content-Type', ct);
      if (cl) headers.set('Content-Length', cl);
      if (cr) headers.set('Content-Range', cr);
      // Annuncia che accettiamo Range anche quando rispondiamo 200:
      // così i video player capiscono che possono fare seek.
      headers.set('Accept-Ranges', ar ?? 'bytes');
      headers.set('Content-Disposition', `inline; filename="${safePath.split('/').pop() ?? 'file'}"`);
      headers.set('Cache-Control', 'private, max-age=300');

      // Mantieni 206 Partial Content se l'upstream l'ha emesso, altrimenti 200.
      const status = res.status === 206 ? 206 : 200;
      return new NextResponse(res.body, { status, headers });
    }

    return NextResponse.json({ error: 'unsupported_provider' }, { status: 503 });
  } catch (e) {
    return NextResponse.json(
      { error: 'proxy_error', detail: e instanceof Error ? e.message.slice(0, 200) : 'unknown' },
      { status: 502 },
    );
  }
}
