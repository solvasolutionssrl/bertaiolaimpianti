import { type NextRequest } from 'next/server';

import { createServerSupabase } from '@impiantixplus/api/server';
import { createServiceSupabase } from '@impiantixplus/api/service';
import { requireTenantContext } from '@impiantixplus/api/tenant';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
} from '@impiantixplus/integrations/storage';

export const maxDuration = 30;

/**
 * Annulla un upload in corso:
 * - aborta la sessione multipart su R2 (se aperta)
 * - soft-delete del file_refs (status='failed', deleted_at=now)
 *
 * Chiamabile in modo idempotente: se l'upload è già completato/abortito,
 * ritorna 200 senza side effect.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: fileRefId } = await params;

  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return Response.json({ error: 'Non autenticato' }, { status: 401 });
  }

  const supabase = createServerSupabase();
  const { data: ref, error: rErr } = await supabase
    .from('file_refs')
    .select('id, tenant_id, commessa_id, r2_key, r2_upload_id, status')
    .eq('id', fileRefId)
    .single();

  if (rErr || !ref) {
    return Response.json({ error: 'Media non trovato' }, { status: 404 });
  }
  if (ref.tenant_id !== ctx.tenantId) {
    return Response.json({ error: 'Non autorizzato' }, { status: 403 });
  }

  // Idempotenza
  if (ref.status === 'failed' || ref.status === 'deleted') {
    return Response.json({ ok: true, alreadyAborted: true });
  }

  // Abort multipart su R2 se applicabile
  if (ref.r2_upload_id && ref.r2_key) {
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

    if (r2) {
      await r2.abortMultipart(ref.r2_key, ref.r2_upload_id).catch(() => {
        // best-effort: lasciamo il job di cleanup periodico per orfani
      });
    }
  }

  const { error: uErr } = await supabase
    .from('file_refs')
    .update({
      status: 'failed',
      r2_upload_id: null,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', fileRefId);

  if (uErr) {
    return Response.json(
      { error: `Update metadata fallito: ${uErr.message}` },
      { status: 500 },
    );
  }

  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'file_ref',
    entity_id: fileRefId,
    action: 'media.upload.abort',
    metadata: {
      commessa_id: ref.commessa_id,
      r2_key: ref.r2_key,
      had_multipart: Boolean(ref.r2_upload_id),
    },
  });

  return Response.json({ ok: true });
}
