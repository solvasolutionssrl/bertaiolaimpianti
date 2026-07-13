import { type NextRequest } from 'next/server';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
} from '@kommessa/integrations/storage';

import { canAccessFile } from '../../../_lib/file-authz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/photo/[id]?size=thumb
 *
 * Proxy autenticato per immagini.
 *
 * Modalità:
 *  - Default (no `size` o `size=full`): proxy del full-size da Nextcloud.
 *  - `size=thumb`: redirect (302) a signed GET R2 del thumbnail 400x400 webp
 *    se `file_refs.r2_thumb_key` è valorizzato. Se assente o non risolvibile,
 *    fallback automatico al proxy full-size (così le foto vecchie senza
 *    thumb generato continuano a funzionare).
 *
 * Non serve per video.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return new Response('Non autenticato', { status: 401 });
  }

  const supabase = createServerSupabase();
  const service = createServiceSupabase();

  const url = new URL(req.url);
  const sizeParam = (url.searchParams.get('size') ?? '').toLowerCase();
  const wantThumb = sizeParam === 'thumb';

  // RLS garantisce che l'utente possa leggere solo i file_refs del proprio tenant
  const { data: refRaw } = await supabase
    .from('file_refs')
    .select('path, mime, tenant_id, r2_thumb_key, commessa_id')
    .eq('id', params.id)
    .single();
  // Cast: r2_thumb_key è introdotta dalla migration 20260528010000,
  // i types Supabase la rifletteranno al prossimo `supabase gen types`.
  const ref = refRaw as unknown as {
    path: string | null;
    mime: string | null;
    tenant_id: string;
    r2_thumb_key: string | null;
    commessa_id: string | null;
  } | null;

  if (!ref?.path) return new Response('Non trovato', { status: 404 });
  if (ref.mime?.startsWith('video/')) {
    return new Response('Video non supportato come proxy', { status: 400 });
  }

  // Autorizzazione per-ruolo/per-cartella: la RLS su file_refs è tenant-wide,
  // quindi qui blocchiamo i clienti del portale e i tecnici non assegnati/
  // fuori-ACL. Vale sia per il thumb sia per il full-size.
  if (!(await canAccessFile(ctx, { commessaId: ref.commessa_id, path: ref.path }))) {
    return new Response('Non autorizzato', { status: 403 });
  }

  // ----- Modalità thumb: redirect a signed GET R2 (se disponibile) ---------
  if (wantThumb && ref.r2_thumb_key) {
    const { data: tenantR2 } = await service
      .from('tenants')
      .select('r2_config')
      .eq('id', ref.tenant_id)
      .maybeSingle();
    const r2 =
      getR2ProviderFromTenantConfig(
        (tenantR2?.r2_config as Record<string, unknown> | null) ?? null,
      ) ?? getR2ProviderFromEnv();
    if (r2) {
      try {
        // TTL allineato al Cache-Control sotto (5 min) per evitare che il
        // browser tenga in cache un URL già scaduto.
        const signed = await r2.createPresignedGetUrl(ref.r2_thumb_key, {
          ttlSec: 5 * 60,
        });
        return Response.redirect(signed.url, 302);
      } catch {
        // Fallback al full-size sotto
      }
    }
    // Se R2 non risponde o thumb_key punta a oggetto inesistente: silently
    // cade al full-size (proxy Nextcloud) sotto. Niente errore UI.
  }

  // ----- Modalità default (full-size) o fallback thumb ---------------------
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
    const basePathSeg = basePathRaw ? `${encodeURI(basePathRaw)}/` : '';
    const rawPath = ref.path.replace(/^\/+/, '');
    const ncUrl = `${baseUrl}/remote.php/dav/files/${user}/${basePathSeg}${encodeURI(rawPath)}`;

    const upstream = await fetch(ncUrl, { headers: { Authorization: authHeader } });
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
