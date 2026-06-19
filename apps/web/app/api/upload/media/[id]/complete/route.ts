import { type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { waitUntil } from '@vercel/functions';
import { z } from 'zod';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
} from '@kommessa/integrations/storage';

import type { CompleteResponse } from '../../../../../_lib/media-upload-types';
import { generateAndUploadThumb } from '../../../../../_lib/thumbnails';
import { syncOneFile } from '../../../../../_lib/sync-r2-to-nextcloud';

export const maxDuration = 60;

const CompleteBody = z.object({
  etag: z.string().optional(),
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().positive(),
        etag: z.string().min(1),
      }),
    )
    .optional(),
  sha256Hex: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: fileRefId } = await params;

  // 1. Auth
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return Response.json({ error: 'Non autenticato' }, { status: 401 });
  }

  // 2. Body
  const json = await request.json().catch(() => null);
  const parsed = CompleteBody.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: 'Body non valido', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // 3. Carica file_ref via RLS (verifica accesso commessa)
  const supabase = createServerSupabase();
  const { data: refRaw, error: rErr } = await supabase
    .from('file_refs')
    .select(
      'id, tenant_id, commessa_id, bozza_id, r2_key, r2_upload_id, status, mime, size_bytes, filename, path, riunione_id',
    )
    .eq('id', fileRefId)
    .single();
  // Cast: riunione_id è introdotta dalla migration 28/05/2026 (Ondata 2),
  // bozza_id dalla 08/06/2026 (bozze autosave); i types Supabase le
  // rifletteranno al prossimo `supabase gen types`.
  const ref = refRaw as unknown as {
    id: string;
    tenant_id: string;
    commessa_id: string | null;
    bozza_id: string | null;
    r2_key: string | null;
    r2_upload_id: string | null;
    status: 'uploading' | 'uploaded' | 'syncing' | 'synced' | 'sync_failed' | 'failed' | 'deleted';
    mime: string;
    size_bytes: number;
    filename: string;
    path: string;
    riunione_id: string | null;
  } | null;

  if (rErr || !ref) {
    return Response.json({ error: 'Media non trovato' }, { status: 404 });
  }
  if (ref.tenant_id !== ctx.tenantId) {
    return Response.json({ error: 'Non autorizzato' }, { status: 403 });
  }

  // 4. Idempotenza: se già completato, ritorna stato corrente
  if (ref.status === 'uploaded' || ref.status === 'syncing' || ref.status === 'synced') {
    return Response.json({
      ok: true,
      fileRefId: ref.id,
      sizeBytes: ref.size_bytes,
      status: 'uploaded',
    } satisfies CompleteResponse);
  }
  if (ref.status !== 'uploading') {
    return Response.json(
      { error: `Stato non valido per complete: ${ref.status}` },
      { status: 409 },
    );
  }
  if (!ref.r2_key) {
    return Response.json({ error: 'r2_key mancante (riga legacy?)' }, { status: 409 });
  }

  // 5. R2 provider + storage_provider per guard sync
  const service = createServiceSupabase();
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
    return Response.json({ error: 'R2 non configurato' }, { status: 503 });
  }

  // 6. Finalizza multipart se serve
  if (ref.r2_upload_id) {
    if (!body.parts || body.parts.length === 0) {
      return Response.json(
        { error: 'parts obbligatorio per upload multipart' },
        { status: 400 },
      );
    }
    try {
      await r2.completeMultipart(ref.r2_key, ref.r2_upload_id, body.parts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      // Marca failed: il client può ritentare init+upload da capo
      await supabase
        .from('file_refs')
        .update({ status: 'failed', last_sync_error: msg })
        .eq('id', fileRefId);
      return Response.json(
        { error: `Completamento multipart fallito: ${msg}` },
        { status: 502 },
      );
    }
  }

  // 7. HEAD su R2 per size reale (single source of truth)
  const head = await r2.head(ref.r2_key);
  if (!head) {
    await supabase
      .from('file_refs')
      .update({ status: 'failed', last_sync_error: 'oggetto assente su R2 dopo complete' })
      .eq('id', fileRefId);
    return Response.json({ error: 'File non presente su R2' }, { status: 502 });
  }

  // 8. Aggiorna file_refs → uploaded
  const { error: uErr } = await supabase
    .from('file_refs')
    .update({
      status: 'uploaded',
      size_bytes: head.size,
      sha256: body.sha256Hex ?? null,
      r2_upload_id: null,
      last_sync_error: null,
    })
    .eq('id', fileRefId);

  if (uErr) {
    return Response.json(
      { error: `Update metadata fallito: ${uErr.message}` },
      { status: 500 },
    );
  }

  // 8.b — Se è un allegato di riunione: linka in commessa_riunione_allegato.
  // INSERT idempotente: ON CONFLICT non possibile (no unique), ma il complete
  // è già protetto da idempotency a monte (status===uploaded skip), quindi
  // questo INSERT viene eseguito esattamente 1 volta per file_ref.
  const refRiunioneId = ref.riunione_id;
  if (refRiunioneId) {
    const kind = deriveAllegatoKind(ref.mime);
    const { error: linkErr } = await supabase
      .from('commessa_riunione_allegato' as never)
      .insert({
        tenant_id: ctx.tenantId,
        riunione_id: refRiunioneId,
        file_ref_id: fileRefId,
        kind,
      } as never);
    if (linkErr) {
      // Non blocchiamo l'upload: il file è già su R2. Loggiamo come audit
      // ma restituiamo comunque ok — la UI potrà trovare il file via /api/photo.
      await supabase.from('audit_events').insert({
        tenant_id: ctx.tenantId,
        actor_user_id: ctx.userId,
        actor_role: ctx.role,
        entity_type: 'commessa_riunione_allegato',
        entity_id: fileRefId,
        action: 'media.upload.link_riunione_failed',
        metadata: {
          riunione_id: refRiunioneId,
          error: linkErr.message,
        },
      });
    }
  }

  // 9. Audit
  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'file_ref',
    entity_id: fileRefId,
    action: 'media.upload.complete',
    metadata: {
      commessa_id: ref.commessa_id,
      r2_key: ref.r2_key,
      size_bytes: head.size,
      sha256_declared: body.sha256Hex ?? null,
      etag: head.etag,
      mode: ref.r2_upload_id ? 'multipart' : 'single',
    },
  });

  if (ref.commessa_id) {
    revalidatePath(`/office/commesse/${ref.commessa_id}`);
    revalidatePath(`/mobile/commessa/${ref.commessa_id}`);
  }

  // 10. Lavoro in background GARANTITO con waitUntil.
  // Senza waitUntil, su Vercel la function viene congelata appena ritorna la
  // Response: i task non-awaited che non hanno fatto in tempo a girare vengono
  // persi. In un burst da N foto (a volte 20) se ne perdeva una parte → file
  // su R2 ma senza thumb / non sincronizzati. waitUntil tiene viva la function
  // finché i task finiscono (entro maxDuration), senza ritardare la Response.

  // 10.a — Thumbnail 400x400 webp su R2 (solo immagini). È parte del "file
  // corretto su R2": la UI serve il thumb da R2 via /api/photo?size=thumb,
  // indipendentemente dalla sync su Nextcloud.
  if (ref.mime && ref.mime.startsWith('image/')) {
    waitUntil(
      generateAndUploadThumb(ctx.tenantId, ref.id).catch(() => {}),
    );
  }

  // 10.b — Clone secondario R2 → Nextcloud. Chiamata diretta a syncOneFile
  // (niente più self-fetch a /api/sync, che spawnava un'altra function
  // ugualmente uccidibile). syncOneFile fa claim atomico, quindi è safe anche
  // se il cron-backstop gira in parallelo. R2 NON viene mai toccato qui: resta
  // il source of truth.
  //
  // ECCEZIONE bozze: i file in staging di una bozza (bozza_id valorizzato,
  // commessa_id NULL) NON vanno su Nextcloud finché la commessa non è
  // ufficializzata. La cartella vera non esiste ancora; il sync avverrà
  // alla finalizzazione (finalizzaBozza ri-aggancia il file e lo rimette in
  // stato 'uploaded' con il path Nextcloud reale).
  //
  // ECCEZIONE tenant r2-only: nessun Nextcloud configurato, il file resta su R2.
  // Cast a string: il DB enum non include ancora 'r2' nei generated types.
  if (!ref.bozza_id && (tenantRow?.storage_provider as string | undefined) !== 'r2') {
    waitUntil(syncOneFile(ref.id).catch(() => {}));
  }

  return Response.json({
    ok: true,
    fileRefId: ref.id,
    sizeBytes: head.size,
    status: 'uploaded',
  } satisfies CompleteResponse);
}

/**
 * Deriva il `kind` dell'allegato riunione dal MIME del file.
 * - image/* → 'foto'
 * - video/* → 'video'
 * - application/pdf → 'pdf_acquisito'
 * - fallback → 'foto' (il vincolo CHECK accetta solo i 3 valori)
 */
function deriveAllegatoKind(mime: string): 'foto' | 'video' | 'pdf_acquisito' {
  const m = mime.toLowerCase();
  if (m.startsWith('video/')) return 'video';
  if (m === 'application/pdf' || m.startsWith('application/pdf')) {
    return 'pdf_acquisito';
  }
  return 'foto';
}
