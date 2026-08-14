'use server';

import { waitUntil } from '@vercel/functions';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import { isKantiereOnly } from '@/app/_lib/app-mode';
import {
  buildR2Key,
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
} from '@kommessa/integrations/storage';

import { creaCommessa } from './crea-commessa';
import {
  creaCommessaServerInputSchema,
  type CreaCommessaServerInput,
} from './crea-commessa.schemas';
import { deriveThumbKey } from '../_lib/thumbnails';
import { syncOneFile } from '../_lib/sync-r2-to-nextcloud';

/**
 * Finalizza una bozza: la trasforma in commessa UFFICIALE.
 *
 * Flusso (vedi docs/superpowers/specs/2026-06-08-bozze-autosave-commesse-design.md §4):
 *  1. Carica la bozza (RLS author-scoped) e valida i campi minimi.
 *  2. Riusa `creaCommessa()` per materializzare la commessa vera:
 *     codice gapless, nome_cartella, cliente/dedup, voci, referenti,
 *     cartelle cloud, audit.
 *  3. Sposta i file da staging R2 alla chiave/cartella definitiva
 *     (CopyObject + delete), ri-aggancia file_refs (bozza_id→null,
 *     commessa_id valorizzato, path Nextcloud reale) e li rimette in
 *     stato 'uploaded' così il sync worker li porta su Nextcloud.
 *  4. Marca la bozza 'finalizzata' col riferimento alla commessa.
 *
 * Il codice ufficiale viene quindi bruciato SOLO qui: le bozze abbandonate
 * non lasciano buchi nella numerazione.
 */

export type FinalizzaBozzaResult =
  | {
      ok: true;
      commessaId: string;
      codiceInterno: string;
      nomeCartella: string;
      cloudFolderPath: string;
    }
  | { ok: false; error: string };

interface BozzaRow {
  id: string;
  stato: string;
  payload: unknown;
  commessa_id: string | null;
}

interface BozzaFileRow {
  id: string;
  filename: string;
  path: string;
  mime: string | null;
  r2_key: string | null;
  r2_thumb_key: string | null;
  status: string;
}

export async function finalizzaBozza(
  bozzaId: string,
  opts?: { keepFileRefIds?: string[] },
): Promise<FinalizzaBozzaResult> {
  // 1) Auth
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'Sessione non valida. Effettua nuovamente il login.' };
  }
  if (await isKantiereOnly()) {
    return { ok: false, error: 'Le commesse non sono disponibili in questo spazio di lavoro.' };
  }

  const supabase = createServerSupabase();

  // 2) Carica la bozza (RLS: solo l'autore la vede)
  const { data: bozzaRaw, error: bErr } = await supabase
    .from('commessa_bozze' as never)
    .select('id, stato, payload, commessa_id')
    .eq('id', bozzaId)
    .maybeSingle();
  const bozza = bozzaRaw as unknown as BozzaRow | null;

  if (bErr || !bozza) {
    return { ok: false, error: 'Bozza non trovata.' };
  }
  // Idempotenza: se già finalizzata, restituisci la commessa collegata.
  if (bozza.stato === 'finalizzata' && bozza.commessa_id) {
    const { data: comRaw } = await supabase
      .from('commesse')
      .select('id, codice_interno, nome_cartella, cloud_folder_path')
      .eq('id', bozza.commessa_id)
      .maybeSingle();
    const com = comRaw as {
      id: string;
      codice_interno: string;
      nome_cartella: string;
      cloud_folder_path: string | null;
    } | null;
    if (com) {
      return {
        ok: true,
        commessaId: com.id,
        codiceInterno: com.codice_interno,
        nomeCartella: com.nome_cartella,
        cloudFolderPath: com.cloud_folder_path ?? '',
      };
    }
  }
  if (bozza.stato !== 'attiva') {
    return { ok: false, error: 'Bozza non in stato valido per la finalizzazione.' };
  }

  // 3) Valida il payload come input di creaCommessa (cliente + descrizione
  //    obbligatori). Se incompleto, l'errore torna al form che chiede i campi.
  const parsed = creaCommessaServerInputSchema.safeParse(bozza.payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Completa i campi obbligatori: ${parsed.error.issues
        .map((i) => i.message)
        .join(' · ')}`,
    };
  }
  const input: CreaCommessaServerInput = parsed.data;

  // 4) Materializza la commessa vera riusando la logica canonica.
  const res = await creaCommessa(input);
  if (!res.ok) {
    return { ok: false, error: res.error };
  }
  const { commessaId, codiceInterno, nomeCartella, cloudFolderPath } = res.data;

  // 5) Sposta i file da staging R2 alla chiave/cartella definitiva.
  //    keepFileRefIds: se passato, i file staged NON nell'elenco (rimossi
  //    dall'utente prima di finalizzare) vengono eliminati, non spostati.
  await spostaFileBozza({
    bozzaId,
    tenantId: ctx.tenantId,
    tenantSlug: ctx.tenantSlug,
    commessaId,
    codiceInterno,
    nomeCartella,
    cloudFolderPath,
    keepFileRefIds: opts?.keepFileRefIds,
  });

  // 6) Marca la bozza finalizzata (service: la bozza resta dell'autore ma
  //    questo aggiornamento di chiusura passa comunque per RLS author-scoped).
  await supabase
    .from('commessa_bozze' as never)
    .update({ stato: 'finalizzata', commessa_id: commessaId } as never)
    .eq('id', bozzaId);

  return { ok: true, commessaId, codiceInterno, nomeCartella, cloudFolderPath };
}

/**
 * Sposta gli oggetti R2 dei file di una bozza nella posizione definitiva e
 * ri-aggancia le righe file_refs alla commessa. Best-effort per singolo
 * file: un fallimento isolato non annulla la finalizzazione (la commessa è
 * già creata), viene loggato e il file resta recuperabile.
 */
async function spostaFileBozza(opts: {
  bozzaId: string;
  tenantId: string;
  tenantSlug: string;
  commessaId: string;
  codiceInterno: string;
  nomeCartella: string;
  cloudFolderPath: string;
  keepFileRefIds?: string[];
}): Promise<void> {
  const service = createServiceSupabase();

  const { data: filesRaw } = await service
    .from('file_refs')
    .select('id, filename, path, mime, r2_key, r2_thumb_key, status')
    .eq('bozza_id', opts.bozzaId as never)
    .is('deleted_at', null);
  const allFiles = (filesRaw as unknown as BozzaFileRow[]) ?? [];
  if (allFiles.length === 0) return;

  // Partiziona: i file da tenere (presenti nel keep-set) vs quelli rimossi
  // dall'utente. Senza keep-set, teniamo tutto (retrocompat).
  const keepSet = opts.keepFileRefIds ? new Set(opts.keepFileRefIds) : null;
  const files = keepSet ? allFiles.filter((f) => keepSet.has(f.id)) : allFiles;
  const drop = keepSet ? allFiles.filter((f) => !keepSet.has(f.id)) : [];

  const { data: tenantRow } = await service
    .from('tenants')
    .select('r2_config')
    .eq('id', opts.tenantId)
    .maybeSingle();
  const r2 =
    getR2ProviderFromTenantConfig(
      (tenantRow?.r2_config as Record<string, unknown> | null) ?? null,
    ) ?? getR2ProviderFromEnv();
  if (!r2) {
    console.error('[finalizza-bozza] R2 non configurato: file non spostati');
    return;
  }

  // Elimina i file staged rimossi dall'utente prima di finalizzare
  // (R2 originale + thumb + riga DB). Non finiscono nella commessa.
  if (drop.length > 0) {
    await Promise.all(
      drop.flatMap((f) => [
        f.r2_key ? r2.delete(f.r2_key).catch(() => {}) : Promise.resolve(),
        f.r2_thumb_key ? r2.delete(f.r2_thumb_key).catch(() => {}) : Promise.resolve(),
      ]),
    );
    await service
      .from('file_refs')
      .delete()
      .in(
        'id',
        drop.map((f) => f.id),
      );
  }

  const root = opts.cloudFolderPath.replace(/^\/+|\/+$/g, '');

  /**
   * Spostamento a gruppi, non in fila (11/08/2026).
   *
   * Ogni file costa quattro viaggi verso R2 (copia originale, cancella
   * staging, copia miniatura, cancella miniatura) piu' una scrittura su DB.
   * In fila, con venti foto, sono ~100 andate e ritorni **mentre l'utente
   * guarda la rotella**: da qui il "ci mette tantissimo" segnalato dal
   * cliente. A gruppi di sei il tempo scende di 4-5 volte e R2 non se ne
   * accorge nemmeno.
   *
   * Il gruppo resta piccolo di proposito: e' una Server Action su Vercel,
   * non serve saturare la connessione.
   */
  const PARALLELI = 6;

  const spostaUno = async (f: BozzaFileRow) => {
    try {
      if (!f.r2_key) return;
      // Path Nextcloud definitivo: il path della bozza è RELATIVO (Foto/...);
      // prefissiamo la cartella reale della commessa.
      const relPath = f.path.replace(/^\/+/, '');
      const newPath = `${root}/${relPath}`;
      const newKey = buildR2Key({
        tenantId: opts.tenantId,
        commessaId: opts.commessaId,
        fileRefId: f.id,
        filename: f.filename,
        tenantSlug: opts.tenantSlug,
        codiceInterno: opts.codiceInterno,
        nomeCartella: opts.nomeCartella,
        sectionLabel: 'media',
      });

      // Copia originale R2 → R2 (server-side, no banda Vercel) e rimuovi staging.
      await r2.copyObject(f.r2_key, newKey);
      await r2.delete(f.r2_key).catch(() => {});

      // Sposta anche il thumbnail, se già generato durante la bozza.
      let newThumbKey: string | null = null;
      if (f.r2_thumb_key) {
        newThumbKey = deriveThumbKey(newKey, f.id);
        await r2.copyObject(f.r2_thumb_key, newThumbKey).catch(() => {
          newThumbKey = null; // se la copia fallisce, lascia che venga rigenerato
        });
        if (newThumbKey) await r2.delete(f.r2_thumb_key).catch(() => {});
      }

      // Ri-aggancia la riga: ora è un file di commessa "uploaded" pronto al sync.
      await service
        .from('file_refs')
        .update({
          bozza_id: null,
          commessa_id: opts.commessaId,
          r2_key: newKey,
          r2_thumb_key: newThumbKey,
          path: newPath,
          status: 'uploaded',
        } as never)
        .eq('id', f.id);

      // Avvia il sync verso Nextcloud (best-effort, non blocca).
      waitUntil(syncOneFile(f.id).catch(() => {}));
    } catch (e) {
      console.error(
        `[finalizza-bozza] spostamento file ${f.id} fallito:`,
        e instanceof Error ? e.message : e,
      );
    }
  };

  for (let i = 0; i < files.length; i += PARALLELI) {
    await Promise.all(files.slice(i, i + PARALLELI).map(spostaUno));
  }
}
