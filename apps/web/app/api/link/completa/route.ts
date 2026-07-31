import { type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { waitUntil } from '@vercel/functions';

import { createServiceSupabase } from '@kommessa/api/service';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
} from '@kommessa/integrations/storage';

import { autenticaToken } from '../../../_lib/api-token';
import { generateAndUploadThumb } from '../../../_lib/thumbnails';
import { syncOneFile } from '../../../_lib/sync-r2-to-nextcloud';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/link/completa — terzo passo del caricamento diretto su R2.
 *
 * Il telefono ha appena spedito i byte direttamente a Cloudflare. Qui si
 * verifica che l'oggetto ci sia davvero (HEAD su R2: unica fonte attendibile
 * per la dimensione reale), si porta la riga a 'uploaded' e si avvia la solita
 * coda — miniatura e copia su Nextcloud. Da questo punto in poi il file è
 * indistinguibile da uno caricato dall'app.
 *
 * Campo del form: `fileRefId`.
 */
export async function POST(request: NextRequest) {
  const ctx = await autenticaToken(request, 'upload');
  if (!ctx) {
    return Response.json(
      {
        error: 'Token non valido',
        messaggio: 'Token non valido: controlla la prima azione del comando.',
      },
      { status: 401 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: 'form non valido', messaggio: 'Richiesta non leggibile.' },
      { status: 400 },
    );
  }

  const fileRefId = String(form.get('fileRefId') ?? '').trim();
  if (!fileRefId) {
    return Response.json(
      { error: 'fileRefId mancante', messaggio: 'Manca il riferimento al file.' },
      { status: 400 },
    );
  }

  const service = createServiceSupabase();
  const { data: refRaw } = await service
    .from('file_refs')
    .select('id, tenant_id, commessa_id, r2_key, mime, status')
    .eq('id', fileRefId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  const ref = refRaw as unknown as {
    id: string;
    tenant_id: string;
    commessa_id: string | null;
    r2_key: string | null;
    mime: string;
    status: string;
  } | null;

  if (!ref || !ref.r2_key) {
    return Response.json(
      { error: 'file non trovato', messaggio: 'Riferimento al file non valido.' },
      { status: 404 },
    );
  }
  // Idempotente: un rilancio del comando non deve ri-fare il lavoro.
  if (ref.status !== 'uploading') {
    return Response.json({ ok: true, messaggio: 'Già caricato.' });
  }

  const { data: tenantRow } = await service
    .from('tenants')
    .select('r2_config, storage_provider')
    .eq('id', ctx.tenantId)
    .maybeSingle();

  const r2 =
    getR2ProviderFromTenantConfig(
      (tenantRow?.r2_config as Record<string, unknown> | null) ?? null,
    ) ?? getR2ProviderFromEnv();
  if (!r2) {
    return Response.json(
      { error: 'R2 non configurato', messaggio: 'Archivio non configurato.' },
      { status: 503 },
    );
  }

  // HEAD: la dimensione dichiarata dal telefono non conta, conta cosa c'è.
  const head = await r2.head(ref.r2_key);
  if (!head) {
    return Response.json(
      {
        error: 'oggetto assente',
        messaggio: 'Il file non è arrivato: riprova.',
      },
      { status: 502 },
    );
  }

  await service
    .from('file_refs')
    .update({
      status: 'uploaded',
      size_bytes: head.size,
      last_sync_error: null,
    } as never)
    .eq('id', fileRefId);

  const { error: auditErr } = await service.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'file_ref',
    entity_id: fileRefId,
    action: 'media.upload.link',
    metadata: {
      commessa_id: ref.commessa_id,
      token_id: ctx.tokenId,
      r2_key: ref.r2_key,
      size_bytes: head.size,
      mime: ref.mime,
      via: 'shortcut_ios_diretto',
    },
  } as never);
  if (auditErr) {
    // eslint-disable-next-line no-console
    console.error('[link/completa] audit fallito:', auditErr.message);
  }

  if (ref.commessa_id) {
    revalidatePath(`/office/commesse/${ref.commessa_id}`);
    revalidatePath(`/mobile/commessa/${ref.commessa_id}`);
  }

  if (ref.mime?.startsWith('image/')) {
    waitUntil(generateAndUploadThumb(ctx.tenantId, fileRefId).catch(() => {}));
  }
  if ((tenantRow?.storage_provider as string | undefined) !== 'r2') {
    waitUntil(syncOneFile(fileRefId).catch(() => {}));
  }

  const mb = Math.max(1, Math.round(head.size / 1024 / 1024));
  return Response.json({
    ok: true,
    sizeBytes: head.size,
    messaggio: `Caricato (${mb} MB).`,
  });
}
