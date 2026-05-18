'use server';

import { revalidatePath } from 'next/cache';

import { createServerSupabase } from '@impiantixplus/api/server';
import { createServiceSupabase } from '@impiantixplus/api/service';
import { requireTenantContext } from '@impiantixplus/api/tenant';
import {
  getStorageProvider,
  type StorageProvider,
  type StorageProviderName,
} from '@impiantixplus/integrations/storage';

/**
 * Server Action: upload di una foto cantiere.
 *
 * Path di destinazione (Architettura_Soluzione.md §5 + Flusso_Operativo.md §2):
 *   <cloud_folder_path>/Foto/<Sopralluogo|In corso|Finali>/<voce_nome>/<timestamp>.jpg
 *
 * Steps:
 *  1. auth + RLS (tenant_id letto dal JWT)
 *  2. risolve commessa.cloud_folder_path + voce_catalogo.nome
 *  3. upload via storage provider (TBD: per ora default da env)
 *  4. insert in `file_refs` con momento/geo/voce
 *  5. revalida la pagina dettaglio commessa
 *
 * Nota MVP: la generazione della thumbnail compressa è TODO; per ora il
 * file originale è anche quello mostrato nelle griglie.
 */

const MOMENTO_FOLDER: Record<MomentoFoto, string> = {
  sopralluogo: 'Sopralluogo',
  in_corso: 'In corso',
  finale: 'Finali',
};

type MomentoFoto = 'sopralluogo' | 'in_corso' | 'finale';

export interface UploadFotoInput {
  commessaId: string;
  faseVoceId: number | null; // voci_catalogo.id (smallint 1..38) o null per "generico"
  momento: MomentoFoto;
  file: File;
  geo?: { lat: number; lng: number; accuracy?: number } | null;
  nota?: string | null;
  /**
   * Annotazione opzionale creata dal tecnico PRIMA dell'upload (vedi
   * `apps/web/app/mobile/commessa/[id]/scatto/scatto-form.tsx`). Se
   * presente, dopo l'INSERT in `file_refs` viene anche creata la riga
   * `file_annotations` corrispondente con version=1.
   */
  annotation?: {
    layer: unknown[];
    width: number;
    height: number;
  } | null;
}

export interface UploadFotoResult {
  ok: true;
  fileRefId: string;
  path: string;
}

export async function uploadFoto(
  input: UploadFotoInput,
): Promise<UploadFotoResult> {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  // 1) Recupera commessa (RLS già scoperà al tenant_id corrente)
  const { data: commessa, error: cErr } = await supabase
    .from('commesse')
    .select('id, cloud_folder_path, nome_cartella')
    .eq('id', input.commessaId)
    .single();

  if (cErr || !commessa) {
    throw new Error('Commessa non trovata o non accessibile');
  }
  if (!commessa.cloud_folder_path) {
    throw new Error('La commessa non ha ancora una cartella cloud associata');
  }

  // 2) Recupera nome voce (se presente) per costruire il sub-path
  let voceFolder = '';
  if (input.faseVoceId != null) {
    const { data: voce } = await supabase
      .from('voci_catalogo')
      .select('id, nome, cartella_template')
      .eq('id', input.faseVoceId)
      .single();
    if (voce) {
      voceFolder = sanitizeFolderSegment(voce.nome);
    }
  }

  // 3) Costruisci path: <root>/Foto/<momento>/<voce?>/<timestamp>_<rand>.jpg
  const ts = new Date();
  const timestamp = formatTimestampForFile(ts);
  const ext = guessExtension(input.file.type, input.file.name);
  const randSuffix = Math.random().toString(36).slice(2, 8);
  const baseFilename = `${timestamp}_${randSuffix}${ext}`;

  const pathParts = [
    stripLeading(commessa.cloud_folder_path),
    'Foto',
    MOMENTO_FOLDER[input.momento],
    voceFolder || null,
    baseFilename,
  ].filter(Boolean) as string[];
  const path = pathParts.join('/');

  // 4) Risolvi provider storage del tenant (Bertaiola usa Nextcloud).
  //    Service-role per leggere tenants.storage_config (bypass RLS).
  const service = createServiceSupabase();
  const { data: tenantRow, error: tenantErr } = await service
    .from('tenants')
    .select('storage_provider, storage_config')
    .eq('id', ctx.tenantId)
    .maybeSingle();
  if (tenantErr || !tenantRow) {
    throw new Error('Configurazione storage del tenant non disponibile');
  }
  const providerName =
    (tenantRow.storage_provider as StorageProviderName) ?? 'supabase';
  const cfg =
    (tenantRow.storage_config as Record<string, string> | null) ?? {};

  let storage: StorageProvider;
  try {
    if (providerName === 'nextcloud') {
      if (!cfg.baseUrl || !cfg.user || !cfg.appPassword) {
        throw new Error('Configurazione Nextcloud incompleta');
      }
      storage = getStorageProvider({
        provider: 'nextcloud',
        baseUrl: cfg.baseUrl,
        user: cfg.user,
        appPassword: cfg.appPassword,
      });
    } else if (providerName === 'supabase') {
      storage = getStorageProvider({
        provider: 'supabase',
        bucket: (cfg.bucket as string | undefined) ?? 'commesse',
      });
    } else {
      throw new Error(`Provider storage non supportato: ${providerName}`);
    }
  } catch (e) {
    throw new Error(
      `Impossibile inizializzare lo storage del tenant: ${
        e instanceof Error ? e.message : 'unknown'
      }`,
    );
  }

  // 5) Upload (best-effort, ma se fallisce NON inseriamo file_refs:
  //    una foto in DB senza file fisico è inutile).
  const buffer = new Uint8Array(await input.file.arrayBuffer());
  let upload: { path: string };
  try {
    upload = await storage.uploadFile(path, buffer, {
      contentType: input.file.type || 'image/jpeg',
      cacheControl: '3600',
      upsert: false,
    });
  } catch (e) {
    throw new Error(
      `Upload foto fallito su ${providerName}: ${
        e instanceof Error ? e.message : 'unknown'
      }`,
    );
  }

  // TODO: generate compressed thumbnail (sharp/squoosh) e salva su Supabase
  // Storage `commesse-thumbs` bucket; popola `file_refs.thumbnail_url`.

  // 5) Insert file_refs (tenant_id derivato lato DB da JWT in trigger? no:
  //    qui lo passiamo esplicitamente perché RLS richiede match)
  const { data: ref, error: rErr } = await supabase
    .from('file_refs')
    .insert({
      tenant_id: ctx.tenantId,
      commessa_id: input.commessaId,
      voce_id: input.faseVoceId,
      momento: input.momento,
      path: upload.path,
      filename: baseFilename,
      mime: input.file.type || 'image/jpeg',
      size_bytes: input.file.size,
      uploaded_by: ctx.userId,
      taken_at: ts.toISOString(),
      geo_lat: input.geo?.lat ?? null,
      geo_lng: input.geo?.lng ?? null,
    })
    .select('id')
    .single();

  if (rErr || !ref) {
    // Best-effort cleanup del file caricato
    try {
      await storage.delete(upload.path);
    } catch {
      /* swallow */
    }
    throw new Error(`Inserimento metadata foto fallito: ${rErr?.message ?? 'unknown'}`);
  }

  // Audit: upload foto + provider usato (utile per debug multi-tenant).
  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'file_ref',
    entity_id: ref.id,
    action: 'file.upload',
    metadata: {
      commessa_id: input.commessaId,
      momento: input.momento,
      voce_id: input.faseVoceId,
      path: upload.path,
      size_bytes: input.file.size,
      mime: input.file.type || 'image/jpeg',
      storage: { provider: providerName },
    },
  });

  // Nota opzionale: salviamo come secondo record in `note` di commessa_voci
  // se non c'è ancora una nota. (Scelta semplice: skip per MVP, il campo
  // textarea è cosmetico e potrà essere persistito altrove in fase 2.)
  void input.nota;

  // 6) Annotazione pre-upload (opzionale) → INSERT file_annotations
  if (
    input.annotation &&
    Array.isArray(input.annotation.layer) &&
    input.annotation.layer.length > 0 &&
    Number.isFinite(input.annotation.width) &&
    Number.isFinite(input.annotation.height)
  ) {
    const { data: annRow, error: annErr } = await supabase
      .from('file_annotations')
      .insert({
        tenant_id: ctx.tenantId,
        file_ref_id: ref.id,
        version: 1,
        layer_json: input.annotation.layer,
        width_px: Math.round(input.annotation.width),
        height_px: Math.round(input.annotation.height),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select('id')
      .single();

    if (!annErr && annRow) {
      await supabase.from('audit_events').insert({
        tenant_id: ctx.tenantId,
        actor_user_id: ctx.userId,
        actor_role: ctx.role,
        entity_type: 'file_annotation',
        entity_id: annRow.id,
        action: 'annotation.create',
        metadata: {
          file_ref_id: ref.id,
          commessa_id: input.commessaId,
          version: 1,
          shapes_count: input.annotation.layer.length,
          via: 'pre_upload',
        },
      });
    }
    // Se fallisce l'INSERT annotation NON facciamo rollback della foto:
    // il file è già su storage, la foto è valida senza overlay e il
    // tecnico potrà ri-annotare dopo dall'ufficio.
  }

  revalidatePath(`/mobile/commessa/${input.commessaId}`);
  revalidatePath('/mobile');

  return { ok: true, fileRefId: ref.id, path: upload.path };
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function sanitizeFolderSegment(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);
}

function formatTimestampForFile(d: Date): string {
  // YYYYMMDD_HHmmss
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function guessExtension(mime: string, filename: string): string {
  const fromName = filename.match(/\.[a-zA-Z0-9]+$/)?.[0];
  if (fromName) return fromName.toLowerCase();
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/heic' || mime === 'image/heif') return '.heic';
  return '.jpg';
}

function stripLeading(p: string): string {
  return p.replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * Variante "form action": riceve un FormData (utile per <form action={...}>).
 * Permette al client di restare server-component-friendly e a `useFormStatus`
 * di funzionare per il progress.
 */
export async function uploadFotoFromForm(formData: FormData): Promise<UploadFotoResult> {
  const commessaId = String(formData.get('commessaId') ?? '');
  const faseVoceIdRaw = formData.get('faseVoceId');
  const faseVoceId = faseVoceIdRaw && faseVoceIdRaw !== '' ? Number(faseVoceIdRaw) : null;
  const momento = String(formData.get('momento') ?? 'in_corso') as MomentoFoto;
  const file = formData.get('file');
  const nota = formData.get('nota');
  const lat = formData.get('geo_lat');
  const lng = formData.get('geo_lng');
  const annotationLayerRaw = formData.get('annotation_layer');
  const annotationWidthRaw = formData.get('annotation_width');
  const annotationHeightRaw = formData.get('annotation_height');

  if (!(file instanceof File) || file.size === 0) {
    throw new Error('Foto mancante');
  }
  if (!commessaId) {
    throw new Error('commessaId mancante');
  }

  const geo =
    lat && lng
      ? { lat: Number(lat), lng: Number(lng) }
      : null;

  let annotation: UploadFotoInput['annotation'] = null;
  if (
    typeof annotationLayerRaw === 'string' &&
    annotationLayerRaw.length > 0 &&
    annotationWidthRaw &&
    annotationHeightRaw
  ) {
    try {
      const parsed = JSON.parse(annotationLayerRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        annotation = {
          layer: parsed,
          width: Number(annotationWidthRaw),
          height: Number(annotationHeightRaw),
        };
      }
    } catch {
      // JSON malformato → ignora silenziosamente, l'upload foto va avanti
    }
  }

  return uploadFoto({
    commessaId,
    faseVoceId,
    momento,
    file,
    geo,
    nota: nota ? String(nota) : null,
    annotation,
  });
}
