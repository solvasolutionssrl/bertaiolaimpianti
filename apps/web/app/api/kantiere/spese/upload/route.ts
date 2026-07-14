import { type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { waitUntil } from '@vercel/functions';

import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
} from '@kommessa/integrations/storage';

import { tenantHasModule } from '@/app/_lib/modules';
import { kontabilitaAttiva } from '@/app/_lib/kontabilita-config';
import { processSpesaAI } from '@/app/api/kantiere/spese/_lib/analisi-spesa';

export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB: scontrini, non video
const THUMB_SIZE = 400;

/**
 * Upload IMMEDIATO della ricevuta (nuovo flusso mobile async).
 *
 * L'utente ha già scelto il cantiere e scattato la foto. Qui:
 *   1) si carica la foto (+thumb) su R2 — l'utente aspetta SOLO questo;
 *   2) si crea SUBITO la riga `spese` in stato 'in_elaborazione' col cantiere
 *      scelto (foto al sicuro anche se chiude il telefono);
 *   3) si lancia l'analisi AI IN BACKGROUND con waitUntil → i campi vengono
 *      compilati dopo, lato server, e la riga passa a 'confermata'/'bozza'.
 *
 * Risponde appena R2 conferma → niente attesa dei ~10s dell'AI in cantiere.
 */
export async function POST(request: NextRequest) {
  // 1. Auth + gate modulo/kontabilità (tecnici ammessi: registrano le PROPRIE).
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return Response.json({ ok: false, code: 'NON_AUTENTICATO' }, { status: 401 });
  }
  if (!(await tenantHasModule('kantiere'))) {
    return Response.json({ ok: false, code: 'MODULO_ASSENTE' }, { status: 404 });
  }
  const service = createServiceSupabase();
  if (!(await kontabilitaAttiva(service, ctx.tenantId))) {
    return Response.json({ ok: false, code: 'KONTABILITA_ASSENTE' }, { status: 404 });
  }

  // 2. Form: foto + cantiereId (opzionale).
  const form = await request.formData().catch(() => null);
  const file = form?.get('foto');
  const cantiereIdRaw = form?.get('cantiereId');
  const cantiereIdInput =
    typeof cantiereIdRaw === 'string' && cantiereIdRaw.trim() ? cantiereIdRaw.trim() : null;

  if (!(file instanceof Blob) || file.size === 0) {
    return Response.json({ ok: false, code: 'FILE_MANCANTE' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ ok: false, code: 'FILE_TROPPO_GRANDE' }, { status: 413 });
  }
  const mime = file.type || 'image/jpeg';
  const isPdf = mime === 'application/pdf';
  if (!mime.startsWith('image/') && !isPdf) {
    return Response.json({ ok: false, code: 'FORMATO_NON_SUPPORTATO' }, { status: 415 });
  }
  const originalBuf = Buffer.from(await file.arrayBuffer());

  // 3. Dipendente collegato (registra le proprie spese).
  const { data: dipRow } = await service
    .from('dipendenti' as never)
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('user_id', ctx.userId)
    .maybeSingle();
  const dipId = (dipRow as { id: string } | null)?.id;
  if (!dipId) {
    return Response.json({ ok: false, code: 'DIPENDENTE_ASSENTE' }, { status: 400 });
  }

  // 4. Cantiere scelto: validalo nel tenant e ricava la commessa collegata.
  let cantiereId: string | null = null;
  let commessaId: string | null = null;
  if (cantiereIdInput) {
    const { data: cant } = await service
      .from('cantieri' as never)
      .select('id, tenant_id, commessa_id')
      .eq('id', cantiereIdInput)
      .maybeSingle();
    const cantRow = cant as { id: string; tenant_id: string; commessa_id: string | null } | null;
    if (!cantRow || cantRow.tenant_id !== ctx.tenantId) {
      return Response.json({ ok: false, code: 'CANTIERE_NON_VALIDO' }, { status: 400 });
    }
    cantiereId = cantRow.id;
    commessaId = cantRow.commessa_id ?? null;
  }

  // 5. Downscale di sicurezza lato server (max 2048px, JPEG q88). I PDF intatti.
  let uploadBuf: Buffer = originalBuf;
  let uploadMime = mime;
  if (!isPdf) {
    try {
      uploadBuf = await sharp(originalBuf, { failOn: 'none' })
        .rotate()
        .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer();
      uploadMime = 'image/jpeg';
    } catch {
      uploadBuf = originalBuf;
      uploadMime = mime;
    }
  }

  // 6. R2 provider (config tenant con fallback env).
  const { data: tenantRow } = await service
    .from('tenants')
    .select('r2_config, slug')
    .eq('id', ctx.tenantId)
    .maybeSingle();
  const r2 =
    getR2ProviderFromTenantConfig(
      (tenantRow?.r2_config as Record<string, unknown> | null) ?? null,
    ) ?? getR2ProviderFromEnv();
  if (!r2) {
    return Response.json({ ok: false, code: 'R2_ASSENTE' }, { status: 503 });
  }

  // 7. Chiavi R2 ordinate per tenant/anno/mese.
  const slug = (tenantRow?.slug as string | undefined) ?? ctx.tenantId;
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const id = randomUUID();
  const ext = isPdf
    ? '.pdf'
    : uploadMime === 'image/png'
      ? '.png'
      : uploadMime === 'image/webp'
        ? '.webp'
        : '.jpg';
  const r2Key = `tenants/${slug}/kantiere/spese/${yyyy}/${mm}/${id}/scontrino${ext}`;
  const thumbKey = `tenants/${slug}/kantiere/spese/${yyyy}/${mm}/${id}/thumb.webp`;

  // 8. Upload originale (l'utente aspetta questo) + thumb (best-effort).
  try {
    await r2.putObject(r2Key, uploadBuf, uploadMime);
  } catch (e) {
    return Response.json(
      { ok: false, code: 'UPLOAD_FALLITO', detail: e instanceof Error ? e.message : 'unknown' },
      { status: 502 },
    );
  }
  let r2ThumbKey: string | null = null;
  if (!isPdf) {
    try {
      const thumbBuf = await sharp(originalBuf, { failOn: 'none' })
        .rotate()
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'centre' })
        .webp({ quality: 75 })
        .toBuffer();
      await r2.putObject(thumbKey, thumbBuf, 'image/webp');
      r2ThumbKey = thumbKey;
    } catch {
      // thumb non critica: si ricade sul full-size
    }
  }

  // 9. Crea SUBITO la riga in 'in_elaborazione' (foto al sicuro, importo dopo).
  const { data: inserted, error } = await service
    .from('spese' as never)
    .insert({
      tenant_id: ctx.tenantId,
      dipendente_id: dipId,
      cantiere_id: cantiereId,
      commessa_id: commessaId,
      categoria: 'varie',
      importo_totale: null,
      valuta: 'EUR',
      metodo_pagamento: 'carta',
      numero_persone: 1,
      r2_key: r2Key,
      r2_thumb_key: r2ThumbKey,
      foto_mime: uploadMime,
      foto_size_bytes: uploadBuf.length,
      stato: 'in_elaborazione',
    } as never)
    .select('id')
    .single();

  if (error || !inserted) {
    // DB fallito dopo l'upload: rimuovi la foto orfana da R2 (best-effort).
    try {
      await r2.delete(r2Key);
      if (r2ThumbKey) await r2.delete(r2ThumbKey);
    } catch {
      /* orfano benigno */
    }
    return Response.json({ ok: false, code: 'DB_FALLITO' }, { status: 500 });
  }

  const spesaId = (inserted as { id: string }).id;

  // 10. Analisi AI IN BACKGROUND (garantita su Vercel con waitUntil): non blocca
  //     la risposta. Passa il buffer già in memoria → niente re-download da R2.
  //     Se il PDF/immagine non è analizzabile, la riga diventa 'bozza'.
  waitUntil(
    processSpesaAI({ tenantId: ctx.tenantId, spesaId, buf: uploadBuf, mime: uploadMime }).catch(
      () => {
        /* la riga resta in elaborazione → recuperabile con "Rianalizza" */
      },
    ),
  );

  return Response.json({ ok: true, spesaId });
}
