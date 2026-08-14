import { type NextRequest } from 'next/server';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
  MULTIPART_PART_SIZE_BYTES,
} from '@kommessa/integrations/storage';

import type { ResumeResponse } from '../../../../../_lib/media-upload-types';

export const maxDuration = 30;

/**
 * POST /api/upload/media/[id]/resume — riprende un multipart interrotto.
 *
 * Scenario: il tecnico è in cantiere, sta caricando un video da 300 MB, blocca
 * il telefono ed esce. Alla riapertura dell'app la coda ritrova il job su
 * IndexedDB. Senza questo endpoint ripartirebbe da zero byte; con questo,
 * chiediamo a **R2** quali parti sono già arrivate (`ListParts`, fonte di
 * verità: il client non deve ricordare nulla) e rifirmiamo solo le mancanti.
 *
 * Il multipart resta aperto su R2 fino al cleanup delle 24h, quindi la finestra
 * di ripresa è ampia. Se non c'è più, si risponde `scaduto` e il client rifà
 * un /init pulito.
 *
 * Vedi `documentazione_generale/08_LOGICHE/Logiche_Upload_Media.md`.
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

  // RLS: verifica implicita dell'accesso alla commessa/bozza.
  const supabase = createServerSupabase();
  const { data: refRaw, error: rErr } = await supabase
    .from('file_refs')
    .select('id, tenant_id, r2_key, r2_upload_id, status, size_bytes')
    .eq('id', fileRefId)
    .single();

  const ref = refRaw as unknown as {
    id: string;
    tenant_id: string;
    r2_key: string | null;
    r2_upload_id: string | null;
    status: string;
    size_bytes: number;
  } | null;

  if (rErr || !ref) {
    return Response.json({ error: 'Media non trovato' }, { status: 404 });
  }
  if (ref.tenant_id !== ctx.tenantId) {
    return Response.json({ error: 'Non autorizzato' }, { status: 403 });
  }

  // Riprendibile solo un multipart ancora in corso.
  if (ref.status !== 'uploading' || !ref.r2_key || !ref.r2_upload_id) {
    return Response.json({ mode: 'scaduto' } satisfies ResumeResponse);
  }

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

  const presenti = await r2.listParts(ref.r2_key, ref.r2_upload_id).catch(() => null);
  if (presenti === null) {
    // Multipart sparito: niente da riprendere.
    return Response.json({ mode: 'scaduto' } satisfies ResumeResponse);
  }

  const partSize = MULTIPART_PART_SIZE_BYTES;
  const totale = Math.max(1, Math.ceil(ref.size_bytes / partSize));
  const giaFatte = new Set(presenti.map((p) => p.partNumber));
  const mancanti: number[] = [];
  for (let n = 1; n <= totale; n += 1) {
    if (!giaFatte.has(n)) mancanti.push(n);
  }

  const parts = mancanti.length > 0
    ? await r2.signMultipartParts(ref.r2_key, ref.r2_upload_id, mancanti)
    : [];

  const bytesGiaCaricati = presenti.reduce((acc, p) => acc + (p.size ?? 0), 0);

  return Response.json({
    mode: 'multipart',
    fileRefId: ref.id,
    uploadId: ref.r2_upload_id,
    partSize,
    parts,
    giaCaricate: presenti.map((p) => ({
      partNumber: p.partNumber,
      etag: p.etag,
    })),
    bytesGiaCaricati,
    expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
  } satisfies ResumeResponse);
}
