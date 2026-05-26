import { type NextRequest } from 'next/server';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/photo/[id]
 *
 * Proxy autenticato per immagini su Nextcloud.
 * Usato come src nelle thumbnail della commessa (thumbnail_url mai popolato
 * dal pipeline di upload → deriviamo l'URL dal fileRefId).
 * Non serve per video (troppo pesanti da proxare).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await requireTenantContext();
  } catch {
    return new Response('Non autenticato', { status: 401 });
  }

  const supabase = createServerSupabase();
  const service = createServiceSupabase();

  // RLS garantisce che l'utente possa leggere solo i file_refs del proprio tenant
  const { data: ref } = await supabase
    .from('file_refs')
    .select('path, mime, tenant_id')
    .eq('id', params.id)
    .single();

  if (!ref?.path) return new Response('Non trovato', { status: 404 });
  if (ref.mime?.startsWith('video/')) {
    return new Response('Video non supportato come proxy', { status: 400 });
  }

  // Config storage (service-role, bypassa RLS)
  const { data: tenant } = await service
    .from('tenants')
    .select('storage_provider, storage_config')
    .eq('id', ref.tenant_id)
    .single();

  if (!tenant) return new Response('Config non trovata', { status: 500 });

  const cfg = (tenant.storage_config as Record<string, string> | null) ?? {};

  if (tenant.storage_provider === 'nextcloud') {
    const baseUrl = (cfg.baseUrl ?? '').replace(/\/+$/, '');
    const user = cfg.user ?? '';
    const authHeader = `Basic ${Buffer.from(`${user}:${cfg.appPassword}`).toString('base64')}`;
    // basePath: cartella condivisa del tenant dentro la home dell'app
    // user Nextcloud (es. "/Bertaiola Impianti"). I path in file_refs sono
    // relativi a quella root, vanno prepended. Senza questo, PROPFIND/GET
    // ritorna 404 e le thumbnail appaiono come placeholder grigio.
    const basePathRaw = (cfg.basePath ?? '').replace(/^\/+|\/+$/g, '');
    const basePath = basePathRaw ? `/${basePathRaw}` : '';
    const path = ref.path.startsWith('/') ? ref.path : `/${ref.path}`;
    const url = `${baseUrl}/remote.php/dav/files/${user}${basePath}${path}`;

    const upstream = await fetch(url, { headers: { Authorization: authHeader } });
    if (!upstream.ok) return new Response('Errore storage', { status: 502 });

    return new Response(upstream.body, {
      headers: {
        'Content-Type': ref.mime || 'image/jpeg',
        'Cache-Control': 'private, max-age=3600, immutable',
      },
    });
  }

  if (tenant.storage_provider === 'supabase') {
    const bucket = cfg.bucket ?? 'commesse';
    const { data } = service.storage.from(bucket).getPublicUrl(ref.path);
    return Response.redirect(data.publicUrl, 302);
  }

  return new Response('Provider non supportato', { status: 501 });
}
