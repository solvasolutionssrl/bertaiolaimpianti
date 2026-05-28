/**
 * Generazione thumbnail persistenti su R2.
 *
 * Strategia:
 *  - Al `complete` dell'upload, se il file è un'immagine, scarica l'originale
 *    da R2 (signed GET), lo riduce a 400x400 webp con sharp, e fa putObject
 *    della miniatura su R2 con chiave parallela in sottocartella `thumbs/`.
 *  - Aggiorna `file_refs.r2_thumb_key`.
 *  - Fire-and-forget dal complete endpoint: se fallisce, la UI ricade
 *    silenziosamente sul proxy del full-size.
 *
 * Nomenclatura R2:
 *  - Originale: ricavato da `buildR2Key()` (vedi packages/integrations).
 *  - Thumb:     stesso path dell'originale ma con sottocartella `thumbs/`
 *               e file `{shortId}.webp`. Es:
 *                 .../media/abc12345_foto.jpg
 *                 .../media/thumbs/abc12345.webp
 *  - L'algoritmo deriva il thumb path dal r2_key reale del file (split
 *    sull'ultimo "/"): rispetta automaticamente la naming convention
 *    attuale (tenants/{slug}/commesse/{codice_interno}_{nome_cartella}/...)
 *    e qualunque cambio futuro.
 */

import sharp from 'sharp';

import { createServiceSupabase } from '@kommessa/api/service';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
  type R2StorageProvider,
} from '@kommessa/integrations/storage';

const THUMB_SIZE = 400;
const THUMB_QUALITY = 75;
const THUMB_CONTENT_TYPE = 'image/webp';

/**
 * Deriva la chiave R2 del thumbnail dalla chiave dell'originale.
 * Funziona indipendentemente dal formato dei segmenti precedenti.
 *
 *   tenants/ber/commesse/ber-2605-007_AgriCampeggio/media/abc12345_foto.jpg
 *     →
 *   tenants/ber/commesse/ber-2605-007_AgriCampeggio/media/thumbs/abc12345.webp
 */
export function deriveThumbKey(r2Key: string, fileRefId: string): string {
  const shortId = fileRefId.replace(/-/g, '').slice(0, 8);
  const parts = r2Key.split('/');
  if (parts.length < 2) return `${r2Key}.thumb.webp`;
  const dir = parts.slice(0, -1).join('/');
  return `${dir}/thumbs/${shortId}.webp`;
}

/**
 * Genera la thumbnail per un singolo file_ref e la carica su R2.
 * Idempotente: skip se r2_thumb_key è già valorizzato.
 * Fire-and-forget safe: cattura errori internamente.
 */
export async function generateAndUploadThumb(
  tenantId: string,
  fileRefId: string,
): Promise<{ ok: true; key: string } | { ok: false; reason: string }> {
  const service = createServiceSupabase();

  // 1. Carica file_ref (service: bypassa RLS, siamo background job)
  const { data: refRaw, error: rErr } = await service
    .from('file_refs')
    .select('id, tenant_id, mime, r2_key, r2_thumb_key, status')
    .eq('id', fileRefId)
    .single();

  if (rErr || !refRaw) return { ok: false, reason: 'file_ref non trovato' };
  // Cast: r2_thumb_key è introdotta dalla migration 20260528010000,
  // i types Supabase la rifletteranno al prossimo `supabase gen types`.
  const ref = refRaw as unknown as {
    id: string;
    tenant_id: string;
    mime: string | null;
    r2_key: string | null;
    r2_thumb_key: string | null;
    status: string;
  };

  if (ref.tenant_id !== tenantId) return { ok: false, reason: 'tenant mismatch' };
  if (ref.r2_thumb_key) return { ok: true, key: ref.r2_thumb_key };
  if (!ref.r2_key) return { ok: false, reason: 'r2_key mancante' };
  if (!ref.mime || !ref.mime.startsWith('image/')) {
    return { ok: false, reason: 'mime non image/*' };
  }
  if (ref.status !== 'uploaded' && ref.status !== 'syncing' && ref.status !== 'synced') {
    return { ok: false, reason: `status non valido: ${ref.status}` };
  }

  // 2. Provider R2 (per-tenant config con fallback env)
  const { data: tenantRow } = await service
    .from('tenants')
    .select('r2_config')
    .eq('id', tenantId)
    .maybeSingle();

  const r2: R2StorageProvider | null =
    getR2ProviderFromTenantConfig(
      (tenantRow?.r2_config as Record<string, unknown> | null) ?? null,
    ) ?? getR2ProviderFromEnv();

  if (!r2) return { ok: false, reason: 'R2 non configurato' };

  // 3. Download originale via signed GET (più semplice di GetObject diretto)
  const originalUrl = await r2.createPresignedGetUrl(ref.r2_key, { ttlSec: 120 });
  const upstream = await fetch(originalUrl.url);
  if (!upstream.ok) {
    return { ok: false, reason: `download R2 fallito: ${upstream.status}` };
  }
  const arrayBuf = await upstream.arrayBuffer();
  const originalBuf = Buffer.from(arrayBuf);

  // 4. Resize 400x400 cover webp
  let thumbBuf: Buffer;
  try {
    thumbBuf = await sharp(originalBuf, { failOn: 'none' })
      .rotate() // applica EXIF orientation
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'centre' })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return { ok: false, reason: `sharp resize fallito: ${msg}` };
  }

  // 5. Upload thumb su R2
  const thumbKey = deriveThumbKey(ref.r2_key, fileRefId);
  try {
    await r2.putObject(thumbKey, thumbBuf, THUMB_CONTENT_TYPE);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return { ok: false, reason: `R2 putObject fallito: ${msg}` };
  }

  // 6. Update file_refs
  // Cast: r2_thumb_key è nuova colonna (migration 20260528010000), i
  // generated types Supabase non la conoscono ancora.
  const { error: uErr } = await service
    .from('file_refs')
    .update({ r2_thumb_key: thumbKey } as never)
    .eq('id', fileRefId);

  if (uErr) {
    return { ok: false, reason: `update file_refs fallito: ${uErr.message}` };
  }

  return { ok: true, key: thumbKey };
}
