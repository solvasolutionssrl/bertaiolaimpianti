import { type NextRequest } from 'next/server';
import { z } from 'zod';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
} from '@kommessa/integrations/storage';

/**
 * PUT /api/bozze/[id] — upsert (autosave) della bozza dell'utente.
 * DELETE /api/bozze/[id] — scarta la bozza + pulisce gli oggetti R2 staging.
 *
 * Il client è la verità locale (IndexedDB): qui facciamo last-write-wins
 * lato server (single-author), col client che vince sempre. L'id della bozza
 * è generato dal client (uuid v4) così esiste anche offline.
 */

const PutBody = z.object({
  payload: z.record(z.string(), z.unknown()),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: 'id bozza non valido' }, { status: 400 });
  }

  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return Response.json({ error: 'Non autenticato' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = PutBody.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: 'Body non valido', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = createServerSupabase();

  // Esiste già? (RLS: solo se è dell'utente)
  const { data: existingRaw } = await supabase
    .from('commessa_bozze' as never)
    .select('id, numero_bozza, stato')
    .eq('id', id)
    .maybeSingle();
  const existing = existingRaw as unknown as {
    id: string;
    numero_bozza: number | null;
    stato: string;
  } | null;

  if (existing) {
    if (existing.stato !== 'attiva') {
      return Response.json(
        { error: 'Bozza già finalizzata' },
        { status: 409 },
      );
    }
    const { error: uErr } = await supabase
      .from('commessa_bozze' as never)
      .update({
        payload: parsed.data.payload,
        last_synced_at: new Date().toISOString(),
      } as never)
      .eq('id', id);
    if (uErr) {
      return Response.json({ error: uErr.message }, { status: 500 });
    }
    return Response.json({ id, numeroBozza: existing.numero_bozza });
  }

  // Prima sincronizzazione: assegna il numero bozza (per-tenant, atomico).
  const { data: numRaw, error: numErr } = await supabase.rpc(
    'genera_numero_bozza' as never,
    { p_tenant_id: ctx.tenantId } as never,
  );
  if (numErr) {
    return Response.json(
      { error: `Generazione numero bozza fallita: ${numErr.message}` },
      { status: 500 },
    );
  }
  const numeroBozza = numRaw as unknown as number;

  const { error: insErr } = await supabase
    .from('commessa_bozze' as never)
    .insert({
      id,
      tenant_id: ctx.tenantId,
      created_by: ctx.userId,
      numero_bozza: numeroBozza,
      payload: parsed.data.payload,
      stato: 'attiva',
      last_synced_at: new Date().toISOString(),
    } as never);
  if (insErr) {
    return Response.json({ error: insErr.message }, { status: 500 });
  }

  return Response.json({ id, numeroBozza });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return Response.json({ error: 'Non autenticato' }, { status: 401 });
  }

  const supabase = createServerSupabase();

  // Verifica che la bozza sia dell'utente (RLS).
  const { data: bozzaRaw } = await supabase
    .from('commessa_bozze' as never)
    .select('id, stato')
    .eq('id', id)
    .maybeSingle();
  const bozza = bozzaRaw as unknown as { id: string; stato: string } | null;
  if (!bozza) {
    return Response.json({ error: 'Bozza non trovata' }, { status: 404 });
  }

  // Pulizia oggetti R2 di staging (service: bypassa RLS per leggere i file).
  const service = createServiceSupabase();
  const { data: filesRaw } = await service
    .from('file_refs')
    .select('id, r2_key, r2_thumb_key')
    .eq('bozza_id', id as never);
  const files = (filesRaw as unknown as Array<{
    id: string;
    r2_key: string | null;
    r2_thumb_key: string | null;
  }>) ?? [];

  if (files.length > 0) {
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
      for (const f of files) {
        if (f.r2_key) await r2.delete(f.r2_key).catch(() => {});
        if (f.r2_thumb_key) await r2.delete(f.r2_thumb_key).catch(() => {});
      }
    }
  }

  // Elimina la bozza: il CASCADE su file_refs.bozza_id rimuove le righe.
  const { error: dErr } = await supabase
    .from('commessa_bozze' as never)
    .delete()
    .eq('id', id);
  if (dErr) {
    return Response.json({ error: dErr.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
