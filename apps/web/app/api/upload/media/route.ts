import { type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';

import { createServerSupabase } from '@impiantixplus/api/server';
import { createServiceSupabase } from '@impiantixplus/api/service';
import { requireTenantContext } from '@impiantixplus/api/tenant';
import {
  getStorageProvider,
  type StorageProviderName,
} from '@impiantixplus/integrations/storage';

export const maxDuration = 300;

type MomentoFoto = 'sopralluogo' | 'in_corso' | 'finale';
const MOMENTO_FOLDER: Record<MomentoFoto, string> = {
  sopralluogo: 'Sopralluogo',
  in_corso: 'In corso',
  finale: 'Finali',
};

export async function POST(request: NextRequest) {
  // Probe: verifica che la funzione venga chiamata (console.warn sopravvive a removeConsole)
  const clHeader = request.headers.get('content-length');
  const xfsHeader = request.headers.get('x-file-size');
  const ctHeader = request.headers.get('content-type') ?? '?';
  console.warn(`[upload/media] ENTRY content-length=${clHeader} x-file-size=${xfsHeader} content-type=${ctHeader}`);

  // 1. Auth — reads session from cookies, does NOT consume request body
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return Response.json({ error: 'Non autenticato' }, { status: 401 });
  }

  // 2. Params from query string and headers
  const { searchParams } = new URL(request.url);
  const commessaId = searchParams.get('commessaId');
  const momento = (searchParams.get('momento') ?? 'sopralluogo') as MomentoFoto;
  const faseVoceIdRaw = searchParams.get('faseVoceId');
  const faseVoceId = faseVoceIdRaw ? Number(faseVoceIdRaw) : null;

  if (!commessaId) {
    return Response.json({ error: 'commessaId obbligatorio' }, { status: 400 });
  }

  const contentType = request.headers.get('content-type') ?? 'application/octet-stream';
  const filename = decodeURIComponent(request.headers.get('x-filename') ?? 'file');

  if (!request.body) {
    return Response.json({ error: 'Body mancante' }, { status: 400 });
  }

  // 3. Verify commessa access via RLS (JWT scoped to tenant)
  const supabase = createServerSupabase();
  const { data: commessa, error: cErr } = await supabase
    .from('commesse')
    .select('id, cloud_folder_path')
    .eq('id', commessaId)
    .single();

  if (cErr || !commessa?.cloud_folder_path) {
    return Response.json({ error: 'Commessa non trovata o senza cartella cloud' }, { status: 404 });
  }

  // 4. Build storage path
  const ts = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const timestamp =
    `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}` +
    `_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 8);
  const extFromName = filename.match(/\.[a-zA-Z0-9]+$/)?.[0];
  const ext =
    extFromName?.toLowerCase() ??
    (contentType === 'image/png' ? '.png' : contentType.startsWith('video/') ? '.mov' : '.jpg');
  const baseFilename = `${timestamp}_${rand}${ext}`;
  const root = commessa.cloud_folder_path.replace(/^\/+|\/+$/g, '');
  const storagePath = `${root}/Foto/${MOMENTO_FOLDER[momento]}/${baseFilename}`;

  // 5. Resolve storage provider (service-role bypasses RLS for tenant config)
  const service = createServiceSupabase();
  const { data: tenantRow } = await service
    .from('tenants')
    .select('storage_provider, storage_config')
    .eq('id', ctx.tenantId)
    .maybeSingle();

  if (!tenantRow) {
    return Response.json({ error: 'Configurazione storage non disponibile' }, { status: 500 });
  }

  const providerName = (tenantRow.storage_provider as StorageProviderName) ?? 'supabase';
  const cfg = (tenantRow.storage_config as Record<string, string> | null) ?? {};

  let storage;
  try {
    if (providerName === 'nextcloud') {
      if (!cfg.baseUrl || !cfg.user || !cfg.appPassword)
        throw new Error('Nextcloud config incompleta');
      storage = getStorageProvider({
        provider: 'nextcloud',
        baseUrl: cfg.baseUrl,
        user: cfg.user,
        appPassword: cfg.appPassword,
      });
    } else {
      storage = getStorageProvider({
        provider: 'supabase',
        bucket: (cfg.bucket as string | undefined) ?? 'commesse',
      });
    }
  } catch (e) {
    return Response.json(
      { error: `Storage init fallito: ${e instanceof Error ? e.message : 'unknown'}` },
      { status: 500 },
    );
  }

  // 6. Buffer body + upload
  // Usiamo uploadFile (body bufferizzato) invece dello streaming duplex:'half'
  // che su Node.js 24 / Vercel Fluid Compute causava Content-Length:0 verso
  // Nextcloud e fallimento immediato del PUT.
  // Per file fino a 500 MB siamo ampiamente sotto il limite memoria Vercel (1 GB).
  let uploadedPath: string;
  let actualSize: number;
  try {
    const buffer = new Uint8Array(await request.arrayBuffer());
    actualSize = buffer.byteLength;
    console.warn(`[upload/media] buffered ${actualSize}B → ${storagePath}`);
    const result = await storage.uploadFile(storagePath, buffer, { contentType });
    uploadedPath = result.path;
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'unknown';
    console.error(`[upload/media] storage upload failed (${providerName}, ${contentType}):`, detail);
    return Response.json(
      { error: `Upload su ${providerName} fallito: ${detail}` },
      { status: 502 },
    );
  }

  // 7. Insert file_refs (metadata in Supabase)
  const { data: ref, error: rErr } = await supabase
    .from('file_refs')
    .insert({
      tenant_id: ctx.tenantId,
      commessa_id: commessaId,
      voce_id: faseVoceId,
      momento,
      path: uploadedPath,
      filename: baseFilename,
      mime: contentType,
      size_bytes: actualSize,
      uploaded_by: ctx.userId,
      taken_at: ts.toISOString(),
      geo_lat: null,
      geo_lng: null,
    })
    .select('id')
    .single();

  if (rErr || !ref) {
    storage.delete(uploadedPath).catch(() => {});
    return Response.json(
      { error: `Salvataggio metadata fallito: ${rErr?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  // 8. Audit log
  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'file_ref',
    entity_id: ref.id,
    action: 'file.upload',
    metadata: {
      commessa_id: commessaId,
      momento,
      voce_id: faseVoceId,
      path: uploadedPath,
      size_bytes: actualSize,
      mime: contentType,
      storage: { provider: providerName, via: 'api_buffered' },
    },
  });

  revalidatePath(`/office/commesse/${commessaId}`);
  revalidatePath(`/mobile/commessa/${commessaId}`);

  return Response.json({ ok: true, fileRefId: ref.id, path: uploadedPath });
}
