import { NextResponse } from 'next/server';

import { createServiceSupabase } from '@impiantixplus/api/service';
import { requireTenantContext } from '@impiantixplus/api/tenant';
import {
  getStorageProvider,
  type StorageProviderName,
} from '@impiantixplus/integrations/storage';

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
      const res = await fetch(ncUrl, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!res.ok || !res.body) {
        return NextResponse.json(
          { error: 'cloud_fetch_failed', status: res.status },
          { status: 502 },
        );
      }
      const headers = new Headers();
      const ct = res.headers.get('content-type');
      const cl = res.headers.get('content-length');
      if (ct) headers.set('Content-Type', ct);
      if (cl) headers.set('Content-Length', cl);
      // Disposition inline → apre nel browser dove possibile
      headers.set('Content-Disposition', `inline; filename="${safePath.split('/').pop() ?? 'file'}"`);
      headers.set('Cache-Control', 'private, max-age=300');
      return new NextResponse(res.body, { status: 200, headers });
    }

    return NextResponse.json({ error: 'unsupported_provider' }, { status: 503 });
  } catch (e) {
    return NextResponse.json(
      { error: 'proxy_error', detail: e instanceof Error ? e.message.slice(0, 200) : 'unknown' },
      { status: 502 },
    );
  }
}
