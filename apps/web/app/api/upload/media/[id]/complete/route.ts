import { type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerSupabase } from '@impiantixplus/api/server';
import { createServiceSupabase } from '@impiantixplus/api/service';
import { requireTenantContext } from '@impiantixplus/api/tenant';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
} from '@impiantixplus/integrations/storage';

import type { CompleteResponse } from '../../../../../_lib/media-upload-types';

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
  const { data: ref, error: rErr } = await supabase
    .from('file_refs')
    .select('id, tenant_id, commessa_id, r2_key, r2_upload_id, status, mime, size_bytes')
    .eq('id', fileRefId)
    .single();

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

  // 5. R2 provider
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

  revalidatePath(`/office/commesse/${ref.commessa_id}`);
  revalidatePath(`/mobile/commessa/${ref.commessa_id}`);

  // 10. Fire-and-forget: avvia sync R2 → Nextcloud per questo file.
  // Il cron */10min cattura comunque ciò che fallisce qui.
  triggerSyncForFile(request, ref.id).catch(() => {});

  return Response.json({
    ok: true,
    fileRefId: ref.id,
    sizeBytes: head.size,
    status: 'uploaded',
  } satisfies CompleteResponse);
}

/**
 * Avvia il sync di un singolo file in background (fire-and-forget).
 * Usa CRON_SECRET come bearer interno: in produzione Vercel risolve l'URL
 * via origine della request; in dev locale punta a localhost.
 */
async function triggerSyncForFile(request: NextRequest, fileRefId: string): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return; // in dev senza CRON_SECRET, cron periodico catturerà comunque

  const origin = new URL(request.url).origin;
  await fetch(`${origin}/api/sync/r2-to-nextcloud`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Sync-Secret': secret,
    },
    body: JSON.stringify({ fileRefId }),
    // Non aspettiamo la risposta: lasciamo che giri in background
    keepalive: true,
  });
}
