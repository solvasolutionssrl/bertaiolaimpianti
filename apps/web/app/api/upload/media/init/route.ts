import { type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import {
  buildR2Key,
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
  MULTIPART_PART_SIZE_BYTES,
  MULTIPART_THRESHOLD_BYTES,
} from '@kommessa/integrations/storage';

import type {
  InitResponse,
  InitResponseMultipart,
  InitResponseSingle,
} from '../../../../_lib/media-upload-types';

export const maxDuration = 30;

// 2GB hard cap per upload, ben oltre i ~500MB attesi per i video di cantiere.
const MAX_SIZE_BYTES = 2 * 1024 * 1024 * 1024;

const MOMENTO_FOLDER = {
  sopralluogo: 'Sopralluogo',
  in_corso: 'In corso',
  finale: 'Finali',
} as const;

const InitBody = z.object({
  commessaId: z.string().uuid(),
  momento: z.enum(['sopralluogo', 'in_corso', 'finale']).optional(),
  voceId: z.number().int().nullable().optional(),
  filename: z.string().min(1).max(255),
  mime: z.string().min(1).max(127),
  sizeBytes: z.number().int().positive().max(MAX_SIZE_BYTES),
  geoLat: z.number().finite().nullable().optional(),
  geoLng: z.number().finite().nullable().optional(),
  // Allegato di una riunione (variant). Se valorizzato, il path Nextcloud
  // sarà Riunioni/<YYYY-MM-DD>[_titolo]/<filename> e il complete linkerà
  // anche commessa_riunione_allegato.
  riunioneId: z.string().uuid().nullable().optional(),
  kind: z.enum(['foto', 'video', 'pdf_acquisito']).nullable().optional(),
});

export async function POST(request: NextRequest) {
  // 1. Auth
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return Response.json({ error: 'Non autenticato' }, { status: 401 });
  }

  // 2. Body
  const json = await request.json().catch(() => null);
  const parsed = InitBody.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: 'Body non valido', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const momento = body.momento ?? 'sopralluogo';

  // 3. Commessa accessibile via RLS + ha cartella cloud
  const supabase = createServerSupabase();
  const { data: commessa, error: cErr } = await supabase
    .from('commesse')
    .select('id, cloud_folder_path, codice_interno, nome_cartella')
    .eq('id', body.commessaId)
    .single();

  if (cErr || !commessa?.cloud_folder_path) {
    return Response.json(
      { error: 'Commessa non trovata o senza cartella cloud' },
      { status: 404 },
    );
  }

  // 4. Risolvi R2 provider (tenant config con fallback env) + slug tenant
  // (per usare path R2 leggibili invece di UUID).
  const service = createServiceSupabase();
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
    return Response.json(
      { error: 'R2 non configurato per il tenant' },
      { status: 503 },
    );
  }

  // 5. Genera fileRefId server-side e calcola path/r2_key
  const fileRefId = randomUUID();
  const ts = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const timestamp =
    `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}` +
    `_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;

  const extFromName = body.filename.match(/\.[a-zA-Z0-9]+$/)?.[0];
  const ext =
    extFromName?.toLowerCase() ??
    (body.mime === 'image/png'
      ? '.png'
      : body.mime.startsWith('video/')
        ? '.mov'
        : '.jpg');
  const rand = randomUUID().slice(0, 6);
  const generatedFilename = `${timestamp}_${rand}${ext}`;

  const root = commessa.cloud_folder_path.replace(/^\/+|\/+$/g, '');

  // Path branch: allegato riunione vs foto/video standard
  let pathSegments: string[];
  if (body.riunioneId) {
    // Verifica che la riunione esista e appartenga alla stessa commessa.
    // (RLS scopata su tenant: se è di un'altra commessa o tenant, query vuota.)
    const { data: riunioneRaw } = await supabase
      .from('commessa_riunione' as never)
      .select('id, data_riunione, titolo, commessa_id')
      .eq('id', body.riunioneId)
      .eq('commessa_id' as never, body.commessaId)
      .maybeSingle();
    const riunione = riunioneRaw as unknown as {
      id: string;
      data_riunione: string;
      titolo: string | null;
      commessa_id: string;
    } | null;
    if (!riunione) {
      return Response.json(
        { error: 'Riunione non trovata o non collegata a questa commessa' },
        { status: 404 },
      );
    }
    const dataRiunione = String(riunione.data_riunione).slice(0, 10); // YYYY-MM-DD
    const titoloSlug = riunione.titolo
      ? sanitizeFolderSegment(String(riunione.titolo))
      : '';
    const subFolder = titoloSlug ? `${dataRiunione}_${titoloSlug}` : dataRiunione;
    pathSegments = [root, 'Riunioni', subFolder, generatedFilename];
  } else {
    // Sotto-cartella per voce (parità con il vecchio Server Action uploadFoto)
    let voceFolder = '';
    if (body.voceId != null) {
      const { data: voce } = await supabase
        .from('voci_catalogo')
        .select('nome')
        .eq('id', body.voceId)
        .maybeSingle();
      if (voce?.nome) {
        voceFolder = sanitizeFolderSegment(voce.nome);
      }
    }
    pathSegments = [
      root,
      'Foto',
      MOMENTO_FOLDER[momento],
      voceFolder || null,
      generatedFilename,
    ].filter(Boolean) as string[];
  }
  // Path Nextcloud (destinazione finale, usato dal worker di Fase 2)
  const nextcloudPath = pathSegments.join('/');
  // Chiave R2 (staging buffer) — usa slug + codice + nome cartella per
  // path leggibile. Section "riunioni" se è un allegato di riunione.
  const r2Key = buildR2Key({
    tenantId: ctx.tenantId,
    commessaId: body.commessaId,
    fileRefId,
    filename: generatedFilename,
    tenantSlug: (tenantRow?.slug as string | undefined) ?? null,
    codiceInterno: (commessa.codice_interno as string | undefined) ?? null,
    nomeCartella: (commessa.nome_cartella as string | undefined) ?? null,
    sectionLabel: body.riunioneId ? 'riunioni' : 'media',
  });

  // 6. Decidi mode (single vs multipart) e prepara presigned URL
  const isMultipart = body.sizeBytes > MULTIPART_THRESHOLD_BYTES;
  let r2UploadId: string | null = null;
  let response: InitResponse;

  try {
    if (isMultipart) {
      const session = await r2.createMultipartUpload(r2Key, body.mime, {
        tenant_id: ctx.tenantId,
        commessa_id: body.commessaId,
        file_ref_id: fileRefId,
      });
      r2UploadId = session.uploadId;

      const numParts = Math.ceil(body.sizeBytes / MULTIPART_PART_SIZE_BYTES);
      const partNumbers = Array.from({ length: numParts }, (_, i) => i + 1);
      const parts = await r2.signMultipartParts(r2Key, r2UploadId, partNumbers);

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      response = {
        mode: 'multipart',
        fileRefId,
        uploadId: r2UploadId,
        partSize: MULTIPART_PART_SIZE_BYTES,
        parts,
        expiresAt,
      } satisfies InitResponseMultipart;
    } else {
      const presigned = await r2.createPresignedPutUrl(r2Key, body.mime);
      response = {
        mode: 'single',
        fileRefId,
        uploadUrl: presigned.url,
        expiresAt: presigned.expiresAt,
      } satisfies InitResponseSingle;
    }
  } catch (e) {
    // Pulizia: se siamo riusciti a creare la sessione multipart ma
    // signMultipartParts ha fallito, aborta lato R2 per non lasciare orfani.
    if (isMultipart && r2UploadId) {
      r2.abortMultipart(r2Key, r2UploadId).catch(() => {});
    }
    return Response.json(
      {
        error: `R2 init fallito: ${e instanceof Error ? e.message : 'unknown'}`,
      },
      { status: 502 },
    );
  }

  // 7. Insert file_refs (status='uploading'). Se fallisce: abort multipart su R2.
  // Per le righe allegato-riunione: voce_id null, momento qualsiasi (verrà
  // ignorato dalle query foto-tab perché filtrate da riunione_id IS NULL),
  // riunione_id valorizzato.
  const { error: rErr } = await supabase.from('file_refs').insert({
    id: fileRefId,
    tenant_id: ctx.tenantId,
    commessa_id: body.commessaId,
    voce_id: body.riunioneId ? null : body.voceId ?? null,
    momento: body.riunioneId ? 'sopralluogo' : momento,
    path: nextcloudPath,
    filename: generatedFilename,
    mime: body.mime,
    size_bytes: body.sizeBytes,
    uploaded_by: ctx.userId,
    taken_at: ts.toISOString(),
    geo_lat: body.geoLat ?? null,
    geo_lng: body.geoLng ?? null,
    status: 'uploading',
    r2_key: r2Key,
    r2_upload_id: r2UploadId,
    riunione_id: body.riunioneId ?? null,
  } as never);

  if (rErr) {
    if (isMultipart && r2UploadId) {
      r2.abortMultipart(r2Key, r2UploadId).catch(() => {});
    }
    return Response.json(
      { error: `Salvataggio metadata fallito: ${rErr.message}` },
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
    action: 'media.upload.init',
    metadata: {
      commessa_id: body.commessaId,
      momento,
      voce_id: body.voceId ?? null,
      mode: isMultipart ? 'multipart' : 'single',
      r2_key: r2Key,
      size_bytes: body.sizeBytes,
      mime: body.mime,
    },
  });

  return Response.json(response);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeFolderSegment(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);
}
