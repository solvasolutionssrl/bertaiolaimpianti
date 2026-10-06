import { type NextRequest } from 'next/server';

import { createServiceSupabase } from '@kommessa/api/service';
import { mediaVisibilePubblicamente } from '@kommessa/api/link-pubblico';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
} from '@kommessa/integrations/storage';

import { risolviToken } from '@/app/_lib/link-pubblico-server';

/**
 * `GET /api/pubblico/[token]/media/[fileId]` — una foto o un video di una
 * commessa condivisa, **senza sessione**.
 *
 * `/api/photo/[id]` non va bene qui: comincia con `requireTenantContext()` e
 * risponde 401 a chi non ha un account, che è esattamente il nostro pubblico.
 *
 * ## Le tre domande, in quest'ordine
 *
 * 1. **Il token apre ancora?** Scaduto o spento ⇒ 404. Non 403: a chi prova
 *    indirizzi a caso non si dice se quel token è mai esistito.
 * 2. **Il file è DI QUELLA commessa?** È il controllo che conta. Senza, chi ha
 *    un link valido potrebbe scaricare qualunque file del sistema cambiando
 *    l'id nell'indirizzo — un link a una commessa diventerebbe un passepartout.
 * 3. **È una foto o un video?** I documenti e i preventivi non escono di qui
 *    nemmeno se qualcuno li mettesse nella stessa commessa.
 *
 * Risposta: un reindirizzamento a un indirizzo R2 firmato con scadenza breve.
 * Il file non passa per la funzione: costerebbe tempo e memoria per niente.
 */

export const dynamic = 'force-dynamic';

/** Quanto vive l'indirizzo firmato. Breve: serve solo a caricare l'immagine. */
const TTL_SEC = 5 * 60;

function nonTrovato() {
  return new Response('Non trovato', {
    status: 404,
    headers: { 'X-Robots-Tag': 'noindex' },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; fileId: string }> },
) {
  const { token, fileId } = await params;

  const link = await risolviToken(token);
  if (!link) return nonTrovato();

  const service = createServiceSupabase();
  const { data: refRaw } = await service
    .from('file_refs')
    .select('id, tenant_id, commessa_id, mime, r2_key, r2_thumb_key, status')
    .eq('id', fileId)
    .maybeSingle();

  const ref = refRaw as unknown as {
    id: string;
    tenant_id: string;
    commessa_id: string | null;
    mime: string | null;
    r2_key: string | null;
    r2_thumb_key: string | null;
    status: string;
  } | null;

  if (!ref) return nonTrovato();

  // ⚠️ Il controllo che regge tutto: il file dev'essere di QUELLA commessa e di
  // QUEL cliente. Senza queste due righe, un solo link valido aprirebbe
  // l'intero archivio di ogni tenant.
  if (ref.commessa_id !== link.commessaId) return nonTrovato();
  if (ref.tenant_id !== link.tenantId) return nonTrovato();

  if (!mediaVisibilePubblicamente(ref.mime)) return nonTrovato();
  if (ref.status === 'deleted' || ref.status === 'failed') return nonTrovato();

  const vuoleThumb = new URL(request.url).searchParams.get('size') === 'thumb';
  const chiave = vuoleThumb ? (ref.r2_thumb_key ?? null) : (ref.r2_key ?? null);
  // Senza miniatura si risponde 404 e la galleria mostra il segnaposto: il file
  // pieno non si spaccia mai per un'anteprima, perche' per un video sarebbero
  // decine di MB al posto di 30 KB.
  if (!chiave) return nonTrovato();

  const { data: tenantRow } = await service
    .from('tenants')
    .select('r2_config')
    .eq('id', ref.tenant_id)
    .maybeSingle();
  const r2 =
    getR2ProviderFromTenantConfig(
      (tenantRow?.r2_config as Record<string, unknown> | null) ?? null,
    ) ?? getR2ProviderFromEnv();
  if (!r2) return nonTrovato();

  try {
    const firmato = await r2.createPresignedGetUrl(chiave, { ttlSec: TTL_SEC });
    return Response.redirect(firmato.url, 302);
  } catch {
    return nonTrovato();
  }
}
