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

import type { Shape } from '../_lib/annotation-shapes';

/**
 * Server Actions per `file_annotations`.
 *
 * Lock pessimistico best-effort:
 *  - `acquisisciLock` setta editing_by/editing_until = now() + 5m.
 *  - Se un altro utente ha già un lock NON scaduto → restituisce
 *    `{ ok: false, lockedBy }`.
 *  - `rilasciaLock` azzera. Chiamato su close esplicito.
 *  - `salvaAnnotazione` non controlla il lock (il client lo fa già): nel
 *    pre-check vediamo solo che nessun altro lo abbia "vinto" nel frattempo.
 *
 * Limitazione nota: il lock è applicativo, non hard. Due upsert simultanee
 * passano comunque (l'INSERT vince con vincolo UNIQUE (file_ref_id, version)
 * oppure l'UPDATE serializza). Per il caso d'uso "ufficio + capo che
 * annotano la stessa foto" l'esperienza è accettabile.
 */

const LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minuti

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export interface SalvaAnnotazioneInput {
  fileRefId: string;
  layer: Shape[];
  width: number;
  height: number;
  /** 'image' (foto, default per retro-compat) o 'pdf'. */
  kind?: 'image' | 'pdf';
  /** Pagina 1-based — obbligatorio se kind === 'pdf'. */
  page?: number;
}

export interface CaricaAnnotazioniFileResult {
  ok: true;
  kind: 'image' | 'pdf';
  /** Per pdf: una entry per pagina annotata. Per image: una sola entry con page=null. */
  pages: Array<{
    page: number | null;
    layer: Shape[];
    width: number;
    height: number;
  }>;
}

export type SalvaAnnotazioneResult =
  | { ok: true; annotationId: string; version: number }
  | { ok: false; error: string };

export interface LockInfo {
  userId: string;
  displayName: string | null;
  until: string; // ISO
  remainingSec: number;
}

export type AcquisisciLockResult =
  | { ok: true; lockUntil: string }
  | { ok: false; lockedBy: LockInfo };

// ---------------------------------------------------------------------
// Salva annotazione (UPSERT su file_annotations)
// ---------------------------------------------------------------------

export async function salvaAnnotazione(
  input: SalvaAnnotazioneInput,
): Promise<SalvaAnnotazioneResult> {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'Sessione non valida' };
  }

  if (!input.fileRefId) return { ok: false, error: 'fileRefId mancante' };
  if (!Array.isArray(input.layer)) return { ok: false, error: 'layer non valido' };
  if (!Number.isFinite(input.width) || input.width <= 0)
    return { ok: false, error: 'width non valido' };
  if (!Number.isFinite(input.height) || input.height <= 0)
    return { ok: false, error: 'height non valido' };

  const kind: 'image' | 'pdf' = input.kind ?? 'image';
  const page: number | null =
    kind === 'pdf'
      ? typeof input.page === 'number' && input.page >= 1
        ? Math.floor(input.page)
        : null
      : null;
  if (kind === 'pdf' && page === null) {
    return { ok: false, error: 'page obbligatoria per annotazioni PDF' };
  }

  const supabase = createServerSupabase();

  // 1) Verifica che il file_ref esista e sia accessibile al tenant (RLS)
  const { data: fileRef, error: frErr } = await supabase
    .from('file_refs')
    .select('id, tenant_id, commessa_id')
    .eq('id', input.fileRefId)
    .single();

  if (frErr || !fileRef) {
    return { ok: false, error: 'File non trovato o non accessibile' };
  }

  // 2) Cerca riga max-version esistente per QUESTA pagina
  // (per kind=image page è NULL → filtra IS NULL; per kind=pdf filtra eq).
  const existingQuery = supabase
    .from('file_annotations')
    .select('id, version, editing_by, editing_until')
    .eq('file_ref_id', input.fileRefId);

  const { data: existing } =
    page === null
      ? await existingQuery
          .is('page', null)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle()
      : await existingQuery
          .eq('page', page)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle();

  // Se esiste un lock attivo di un altro utente, blocca il save
  if (
    existing &&
    existing.editing_by &&
    existing.editing_by !== ctx.userId &&
    existing.editing_until &&
    new Date(existing.editing_until).getTime() > Date.now()
  ) {
    return {
      ok: false,
      error: 'La foto è bloccata in modifica da un altro utente. Riprova fra qualche minuto.',
    };
  }

  let annotationId: string;
  let version: number;
  let isCreate: boolean;

  if (existing) {
    // UPDATE in-place sulla version esistente (no version bump per ora:
    // semplifica il flusso; lo storico è comunque tracciato in audit_events).
    const { data: updated, error: updErr } = await supabase
      .from('file_annotations')
      .update({
        layer_json: input.layer,
        width_px: Math.round(input.width),
        height_px: Math.round(input.height),
        updated_by: ctx.userId,
        editing_by: null,
        editing_until: null,
      })
      .eq('id', existing.id)
      .select('id, version')
      .single();
    if (updErr || !updated) {
      return { ok: false, error: `Salvataggio fallito: ${updErr?.message ?? 'errore'}` };
    }
    annotationId = updated.id;
    version = updated.version;
    isCreate = false;
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from('file_annotations')
      .insert({
        tenant_id: ctx.tenantId,
        file_ref_id: input.fileRefId,
        version: 1,
        layer_json: input.layer,
        width_px: Math.round(input.width),
        height_px: Math.round(input.height),
        kind,
        page,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select('id, version')
      .single();
    if (insErr || !inserted) {
      return { ok: false, error: `Creazione annotazione fallita: ${insErr?.message ?? 'errore'}` };
    }
    annotationId = inserted.id;
    version = inserted.version;
    isCreate = true;
  }

  // 3) Audit
  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'file_annotation',
    entity_id: annotationId,
    action: isCreate ? 'annotation.create' : 'annotation.update',
    metadata: {
      file_ref_id: input.fileRefId,
      commessa_id: fileRef.commessa_id,
      version,
      shapes_count: input.layer.length,
    },
  });

  if (fileRef.commessa_id) {
    revalidatePath(`/office/commesse/${fileRef.commessa_id}/foto`);
    revalidatePath(`/office/commesse/${fileRef.commessa_id}/documenti`);
    revalidatePath(`/office/commesse/${fileRef.commessa_id}`);
  }

  return { ok: true, annotationId, version };
}

// ---------------------------------------------------------------------
// Acquisisci lock
// ---------------------------------------------------------------------

export async function acquisisciLock(
  fileRefId: string,
): Promise<AcquisisciLockResult> {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return {
      ok: false,
      lockedBy: { userId: '', displayName: null, until: '', remainingSec: 0 },
    };
  }

  const supabase = createServerSupabase();

  // Cerca riga corrente (max version)
  const { data: existing } = await supabase
    .from('file_annotations')
    .select('id, editing_by, editing_until, version')
    .eq('file_ref_id', fileRefId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nowMs = Date.now();
  const lockUntil = new Date(nowMs + LOCK_DURATION_MS);

  if (existing) {
    // Se lockato da altri e non scaduto → blocca
    if (
      existing.editing_by &&
      existing.editing_by !== ctx.userId &&
      existing.editing_until &&
      new Date(existing.editing_until).getTime() > nowMs
    ) {
      // Recupera display_name del lock owner (best-effort)
      const { data: owner } = await supabase
        .from('users')
        .select('display_name')
        .eq('id', existing.editing_by)
        .maybeSingle();
      return {
        ok: false,
        lockedBy: {
          userId: existing.editing_by,
          displayName: owner?.display_name ?? null,
          until: existing.editing_until,
          remainingSec: Math.max(
            0,
            Math.round(
              (new Date(existing.editing_until).getTime() - nowMs) / 1000,
            ),
          ),
        },
      };
    }

    // Acquisisce / rinnova
    const { error } = await supabase
      .from('file_annotations')
      .update({
        editing_by: ctx.userId,
        editing_until: lockUntil.toISOString(),
      })
      .eq('id', existing.id);
    if (error) {
      return {
        ok: false,
        lockedBy: {
          userId: '',
          displayName: null,
          until: '',
          remainingSec: 0,
        },
      };
    }
  }
  // Se non esiste ancora alcuna riga annotations, il lock implicito è "libero":
  // il client può procedere e a salva-time verrà creata la riga v=1.

  return { ok: true, lockUntil: lockUntil.toISOString() };
}

// ---------------------------------------------------------------------
// Rilascia lock
// ---------------------------------------------------------------------

export async function rilasciaLock(fileRefId: string): Promise<{ ok: boolean }> {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false };
  }

  const supabase = createServerSupabase();
  await supabase
    .from('file_annotations')
    .update({ editing_by: null, editing_until: null })
    .eq('file_ref_id', fileRefId)
    .eq('editing_by', ctx.userId); // rilascia solo se lock è mio

  return { ok: true };
}

// ---------------------------------------------------------------------
// Signed URL per la foto sorgente (usato dall'editor)
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Risoluzione file_ref per i PDF letti dallo storage (documenti tab)
// ---------------------------------------------------------------------

/**
 * Il tab Documenti elenca file leggendo direttamente dallo storage
 * provider (listFolder), senza passare da `file_refs`. Per annotare un
 * PDF abbiamo però bisogno di una row in `file_refs` (FK delle annotazioni).
 *
 * Strategia: lookup per (tenant_id, commessa_id, path); se non esiste,
 * INSERT minimale (filename + mime application/pdf + size_bytes 0 come
 * placeholder — verrà aggiornato la prima volta che il file viene
 * sincronizzato/riletto).
 *
 * Idempotente: chiamabile più volte; secondo run ritorna la stessa id.
 */
export async function risolviFileRefPerPath(input: {
  commessaId: string;
  path: string;
  filename: string;
  mime?: string;
  sizeBytes?: number;
}): Promise<
  { ok: true; fileRefId: string } | { ok: false; error: string }
> {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'Sessione non valida' };
  }
  if (!input.commessaId || !input.path) {
    return { ok: false, error: 'commessaId/path mancanti' };
  }

  const supabase = createServerSupabase();

  const { data: existing } = await supabase
    .from('file_refs')
    .select('id')
    .eq('commessa_id', input.commessaId)
    .eq('path', input.path)
    .maybeSingle();

  if (existing) return { ok: true, fileRefId: existing.id };

  const { data: inserted, error } = await supabase
    .from('file_refs')
    .insert({
      tenant_id: ctx.tenantId,
      commessa_id: input.commessaId,
      path: input.path,
      filename: input.filename,
      mime: input.mime ?? 'application/pdf',
      size_bytes: input.sizeBytes ?? 0,
      uploaded_by: ctx.userId,
    })
    .select('id')
    .single();

  if (error || !inserted)
    return { ok: false, error: error?.message ?? 'Creazione file_ref fallita' };
  return { ok: true, fileRefId: inserted.id };
}

// ---------------------------------------------------------------------
// Carica tutte le annotazioni per un file (multi-pagina per i PDF)
// ---------------------------------------------------------------------

/**
 * Restituisce TUTTE le righe `file_annotations` per un file_ref_id,
 * raggruppate per pagina (NULL = immagine).
 *
 * Per ogni (page) tiene solo la max version (mirror del comportamento
 * di salvaAnnotazione, che fa UPDATE in-place su (file_ref_id, page)).
 *
 * Usato dal PdfAnnotator per pre-caricare lo stato di tutte le pagine
 * e renderizzare badge "M pagine annotate" sull'header.
 */
export async function caricaAnnotazioniFile(
  fileRefId: string,
): Promise<
  | CaricaAnnotazioniFileResult
  | { ok: false; error: string }
> {
  try {
    await requireTenantContext();
  } catch {
    return { ok: false, error: 'Sessione non valida' };
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('file_annotations')
    .select('layer_json, width_px, height_px, kind, page, version')
    .eq('file_ref_id', fileRefId)
    .order('page', { ascending: true, nullsFirst: true })
    .order('version', { ascending: false });

  if (error) return { ok: false, error: error.message };

  // Riduci a max-version per pagina (NULL = una sola entry, per immagini)
  const byPage = new Map<
    string,
    {
      page: number | null;
      layer: Shape[];
      width: number;
      height: number;
      version: number;
    }
  >();
  let kind: 'image' | 'pdf' = 'image';
  for (const row of data ?? []) {
    const k = row.page === null ? 'null' : String(row.page);
    const prev = byPage.get(k);
    if (!prev || row.version > prev.version) {
      // deserializeLayer non importato qui per evitare bundle client-only.
      // Best-effort: passiamo layer_json grezzo (Shape[] o array vuoto).
      const layer = Array.isArray(row.layer_json) ? (row.layer_json as Shape[]) : [];
      byPage.set(k, {
        page: row.page,
        layer,
        width: row.width_px,
        height: row.height_px,
        version: row.version,
      });
    }
    if (row.kind === 'pdf') kind = 'pdf';
  }

  return {
    ok: true,
    kind,
    pages: Array.from(byPage.values()).map(({ version: _v, ...rest }) => rest),
  };
}

// ---------------------------------------------------------------------
// Signed URL per la foto/PDF sorgente (usato dall'editor)
// ---------------------------------------------------------------------

export async function ottieniSignedUrl(
  fileRefId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'Sessione non valida' };
  }

  const supabase = createServerSupabase();
  const { data: ref, error } = await supabase
    .from('file_refs')
    .select('path')
    .eq('id', fileRefId)
    .single();
  if (error || !ref) return { ok: false, error: 'File non trovato' };

  try {
    // Provider storage del tenant (Bertaiola: Nextcloud). Service-role per
    // leggere `tenants.storage_config` bypassando RLS.
    const service = createServiceSupabase();
    const { data: tenantRow } = await service
      .from('tenants')
      .select('storage_provider, storage_config')
      .eq('id', ctx.tenantId)
      .maybeSingle();

    const providerName =
      (tenantRow?.storage_provider as StorageProviderName) ?? 'supabase';
    const cfg =
      (tenantRow?.storage_config as Record<string, string> | null) ?? {};

    let storage: StorageProvider;
    if (providerName === 'nextcloud') {
      if (!cfg.baseUrl || !cfg.user || !cfg.appPassword) {
        return { ok: false, error: 'Storage Nextcloud non configurato' };
      }
      storage = getStorageProvider({
        provider: 'nextcloud',
        baseUrl: cfg.baseUrl,
        user: cfg.user,
        appPassword: cfg.appPassword,
      });
    } else {
      storage = getStorageProvider({
        provider: 'supabase',
        bucket: (cfg.bucket as string | undefined) ?? 'commesse',
      });
    }

    const signed = await storage.getDownloadUrl(ref.path, 3600);
    return { ok: true, url: signed.url };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'URL non disponibile',
    };
  }
}
