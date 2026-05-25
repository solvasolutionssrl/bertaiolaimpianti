import { type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
} from '@kommessa/integrations/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/upload/media/[id]/flatten
 *
 * Quando l'utente salva un'annotazione foto, il client invia qui il render
 * "flattenato" (immagine + disegno sopra). Il server:
 *  1. Verifica auth + ownership del file_ref
 *  2. Copia l'originale corrente di r2_key → backup path (timestamp suffix)
 *  3. Sovrascrive r2_key con il nuovo blob
 *  4. Aggiorna file_refs: status='uploaded' (re-syncable), sha256, size_bytes
 *  5. Audit event
 *
 * Cap dimensione: 50 MB (le foto annotate raramente superano i 20 MB).
 */
const MAX_FLATTEN_BYTES = 50 * 1024 * 1024;

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

  // 2. Body multipart
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'Body non valido' }, { status: 400 });
  }
  const file = form.get('image');
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: 'image mancante' }, { status: 400 });
  }
  if (file.size > MAX_FLATTEN_BYTES) {
    return Response.json(
      { error: `File troppo grande (max ${MAX_FLATTEN_BYTES} byte)` },
      { status: 413 },
    );
  }

  // 3. file_ref via RLS (verifica accesso) + service per update
  const supabase = createServerSupabase();
  const { data: ref, error: rErr } = await supabase
    .from('file_refs')
    .select('id, tenant_id, commessa_id, r2_key, status, mime, filename, path')
    .eq('id', fileRefId)
    .single();

  if (rErr || !ref) {
    return Response.json({ error: 'Media non trovato' }, { status: 404 });
  }
  if (ref.tenant_id !== ctx.tenantId) {
    return Response.json({ error: 'Non autorizzato' }, { status: 403 });
  }
  if (!ref.r2_key) {
    return Response.json(
      { error: 'File senza r2_key (legacy): flatten non supportato' },
      { status: 409 },
    );
  }
  if (!ref.mime?.startsWith('image/')) {
    return Response.json(
      { error: 'Flatten supportato solo per immagini' },
      { status: 409 },
    );
  }

  // 4. R2 provider
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
    return Response.json({ error: 'R2 non configurato' }, { status: 503 });
  }

  // 5. Backup dell'originale corrente
  const ts = Date.now();
  const backupKey = ref.r2_key.replace(
    '/original/',
    `/backups/${ts}_`,
  );
  // Se r2_key non ha "/original/" nel path (variazione), fallback append.
  const safeBackupKey =
    backupKey === ref.r2_key
      ? `${ref.r2_key}.backup.${ts}`
      : backupKey;

  try {
    await r2.copyObject(ref.r2_key, safeBackupKey);
  } catch (e) {
    return Response.json(
      {
        error: `Backup originale fallito: ${e instanceof Error ? e.message : 'unknown'}`,
      },
      { status: 502 },
    );
  }

  // 6. Calcola sha256 + sovrascrivi r2_key col nuovo blob
  const buffer = new Uint8Array(await file.arrayBuffer());
  const sha256 = createHash('sha256').update(buffer).digest('hex');

  try {
    await r2.putObject(ref.r2_key, buffer, file.type || ref.mime);
  } catch (e) {
    return Response.json(
      {
        error: `Sovrascrittura R2 fallita: ${e instanceof Error ? e.message : 'unknown'}`,
      },
      { status: 502 },
    );
  }

  // 7. Aggiorna file_refs: status='uploaded' per re-syncare su Nextcloud,
  //    nuovi size/sha256. sync_attempts azzerato per pulizia log.
  const { error: updErr } = await supabase
    .from('file_refs')
    .update({
      status: 'uploaded',
      size_bytes: buffer.byteLength,
      sha256,
      sync_attempts: 0,
      last_sync_error: null,
    })
    .eq('id', fileRefId);

  if (updErr) {
    return Response.json(
      { error: `Update metadata fallito: ${updErr.message}` },
      { status: 500 },
    );
  }

  // 8. Audit
  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'file_ref',
    entity_id: fileRefId,
    action: 'media.annotate.flatten',
    metadata: {
      commessa_id: ref.commessa_id,
      r2_key: ref.r2_key,
      backup_key: safeBackupKey,
      size_bytes: buffer.byteLength,
      sha256,
    },
  });

  revalidatePath(`/office/commesse/${ref.commessa_id}`);
  revalidatePath(`/mobile/commessa/${ref.commessa_id}`);

  return Response.json({
    ok: true,
    fileRefId,
    sizeBytes: buffer.byteLength,
    backupKey: safeBackupKey,
  });
}
