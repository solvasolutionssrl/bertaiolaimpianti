import { type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

import { createServiceSupabase } from '@kommessa/api/service';
import {
  buildR2Key,
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
} from '@kommessa/integrations/storage';

import { autenticaToken } from '../../../_lib/api-token';
import { risolviCommessa, type RigaCommessa } from '../_lib/risolvi-commessa';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/link/prepara — primo passo del caricamento diretto su R2.
 *
 * ─── Perché esiste ────────────────────────────────────────────────────────
 * `/api/link/upload` fa passare i byte DENTRO la richiesta al nostro server, e
 * lì la piattaforma taglia a 100 MB: un video da 200 MB viene respinto prima
 * ancora di raggiungere il codice, con una risposta che non è nemmeno JSON.
 *
 * Qui invece il server tratta solo i metadati e restituisce un **indirizzo di
 * caricamento firmato**: il telefono manda i byte direttamente a Cloudflare, e
 * il limite diventa quello di R2 (5 GB). È lo stesso schema dell'app.
 *
 * Campi del form: `etichetta` (o `commessaId`), `nome`, `mime`.
 * Risposta: `{ fileRefId, url, messaggio }` — poi PUT su `url`, infine
 * `/api/link/completa` con `fileRefId`.
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

  const etichetta = String(form.get('etichetta') ?? '').trim();
  const commessaId = String(form.get('commessaId') ?? '').trim();
  const nome = String(form.get('nome') ?? '').trim() || 'video.mov';
  const mime = String(form.get('mime') ?? '').trim() || 'video/quicktime';

  if (!etichetta && !commessaId) {
    return Response.json(
      {
        error: 'commessa mancante',
        messaggio: 'Non ho ricevuto la commessa.',
      },
      { status: 400 },
    );
  }

  const service = createServiceSupabase();
  const commessa = await risolviCommessa(service, ctx.tenantId, {
    commessaId,
    etichetta,
  });
  if (!commessa) {
    return Response.json(
      { error: 'commessa non trovata', messaggio: 'Commessa non trovata.' },
      { status: 404 },
    );
  }
  if (!commessa.cloud_folder_path) {
    return Response.json(
      {
        error: 'cartella mancante',
        messaggio: 'Questa commessa non ha ancora una cartella cloud.',
      },
      { status: 409 },
    );
  }

  const { data: tenantRow } = await service
    .from('tenants')
    .select('slug, r2_config')
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

  // Stessa convenzione di nomi dell'app: ordinabili e mai in collisione.
  const ts = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}` +
    `_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
  const estensione =
    /\.[a-zA-Z0-9]+$/.exec(nome)?.[0]?.toLowerCase() ??
    (mime.startsWith('video/') ? '.mov' : '.jpg');
  const filename = `${stamp}_${randomUUID().slice(0, 6)}${estensione}`;

  const radice = commessa.cloud_folder_path.replace(/^\/+|\/+$/g, '');
  const fileRefId = randomUUID();
  const r2Key = buildR2Key({
    tenantId: ctx.tenantId,
    commessaId: commessa.id,
    fileRefId,
    filename,
    tenantSlug: (tenantRow?.slug as string | undefined) ?? null,
    codiceInterno: commessa.codice_interno,
    nomeCartella: commessa.nome_cartella,
    sectionLabel: 'media',
  });

  // Riga in stato 'uploading': se il caricamento non arriva mai resta lì e
  // viene ripulita dal cleanup, esattamente come per l'app.
  const { error: insErr } = await service.from('file_refs').insert({
    id: fileRefId,
    tenant_id: ctx.tenantId,
    commessa_id: commessa.id,
    voce_id: null,
    momento: 'sopralluogo',
    path: `${radice}/Foto/Sopralluogo/${filename}`,
    filename,
    mime,
    size_bytes: 0,
    uploaded_by: ctx.userId,
    taken_at: ts.toISOString(),
    status: 'uploading',
    r2_key: r2Key,
  } as never);
  if (insErr) {
    return Response.json(
      { error: insErr.message, messaggio: 'Non riesco a preparare il caricamento.' },
      { status: 500 },
    );
  }

  // TTL generoso: un video da 200 MB su rete di cantiere ci mette minuti.
  const firmato = await r2.createPresignedPutUrl(r2Key, mime, {
    ttlSec: 3600,
    firmaContentType: false,
  });

  return Response.json({
    fileRefId,
    url: firmato.url,
    messaggio: 'Pronto, invio il file…',
  });
}
