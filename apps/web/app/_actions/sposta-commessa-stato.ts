'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import type { AppRole } from '@kommessa/api';
import type { StatoCommessa } from '@kommessa/api/types';
import {
  getStorageProvider,
  type StorageProvider,
  type StorageProviderName,
} from '@kommessa/integrations/storage';

import {
  cloudFolderForStato,
  extractStatusFolder,
} from '../_lib/commessa-stato-folder';

/**
 * Cambia lo stato di una commessa e sposta atomicamente la cartella
 * fisica su Nextcloud nello "scaffold di stato" corrispondente
 * (01_Richieste / 02_In_Lavorazione / 03_Completate / 04_Archivio).
 *
 * Lo stato "critica" è trasversale (badge UI): la commessa critica resta
 * fisicamente dove sta. Per impostare "critica" usiamo un toggle separato
 * — questa action non lo gestisce.
 *
 * Sequenza:
 *  1. Auth + ruolo (owner/admin/office/capo)
 *  2. Carica commessa, calcola cartella destinazione
 *  3. Se la cartella destinazione = corrente → solo UPDATE stato in DB
 *     (es. da bozza → aperta entrambi sono 01_Richieste)
 *  4. MOVE WebDAV: <macro>/<oldFolder>/<nome> → <macro>/<newFolder>/<nome>
 *     - createFolder destinazione (idempotente)
 *     - move() — Nextcloud WebDAV MOVE atomico
 *  5. UPDATE atomico in DB:
 *     - commesse.cloud_folder_path = nuovo path
 *     - commesse.stato = nuovo stato
 *     - file_refs.path: REPLACE del prefisso vecchio → nuovo
 *  6. Audit event commessa.stato.cambiato
 *  7. revalidatePath delle pagine office + mobile
 */

const Input = z.object({
  commessaId: z.string().uuid(),
  newStato: z.enum([
    'bozza',
    'aperta',
    'in_corso',
    'collaudo',
    'completata',
    'archiviata',
  ]),
});

const RUOLI_AMMESSI: ReadonlySet<AppRole> = new Set<AppRole>([
  'admin',
  'office',
]);

export type SpostaCommessaResult =
  | { ok: true; newCloudFolderPath: string; movedFiles: number }
  | { ok: false; error: string };

export async function spostaCommessaInStato(
  input: unknown,
): Promise<SpostaCommessaResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Input non valido' };
  }
  const { commessaId, newStato } = parsed.data;

  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'Sessione non valida' };
  }
  if (!RUOLI_AMMESSI.has(ctx.role)) {
    return { ok: false, error: 'Permessi insufficienti per cambiare lo stato' };
  }

  const supabase = createServerSupabase();
  const { data: commessa, error: cErr } = await supabase
    .from('commesse')
    .select('id, tenant_id, codice_interno, nome_cartella, cloud_folder_path, stato')
    .eq('id', commessaId)
    .maybeSingle();

  if (cErr || !commessa) {
    return { ok: false, error: 'Commessa non trovata' };
  }
  if (!commessa.nome_cartella) {
    return { ok: false, error: 'Commessa senza nome_cartella' };
  }

  const currentFolder = extractStatusFolder(commessa.cloud_folder_path ?? '');
  const targetFolder = cloudFolderForStato(newStato as StatoCommessa);

  // Caso 1: stesso "scaffold" (es. bozza → aperta) → solo UPDATE stato.
  if (currentFolder === targetFolder) {
    const { error: uErr } = await supabase
      .from('commesse')
      .update({ stato: newStato as StatoCommessa })
      .eq('id', commessaId);
    if (uErr) return { ok: false, error: `Update stato fallito: ${uErr.message}` };
    await audit(supabase, ctx, commessaId, commessa.codice_interno, {
      from_stato: commessa.stato,
      to_stato: newStato,
      moved: false,
    });
    revalidatePath(`/office/commesse/${commessaId}`);
    revalidatePath(`/mobile/commessa/${commessaId}`);
    return { ok: true, newCloudFolderPath: commessa.cloud_folder_path ?? '', movedFiles: 0 };
  }

  // Caso 2: cambio cartella fisica.
  const oldCloudPath = (commessa.cloud_folder_path ?? '').replace(/\/+$/, '');
  // Path nuova: /<targetFolder>/<nome_cartella>/
  const newCloudPath = `/${targetFolder}/${commessa.nome_cartella}`;

  // 1) Setup provider Nextcloud
  const service = createServiceSupabase();
  const { data: tenantRow } = await service
    .from('tenants')
    .select('storage_provider, storage_config')
    .eq('id', commessa.tenant_id)
    .maybeSingle();
  if (!tenantRow) return { ok: false, error: 'Configurazione storage non disponibile' };

  let storage: StorageProvider;
  try {
    storage = buildStorageProvider(
      (tenantRow.storage_provider as StorageProviderName) ?? 'nextcloud',
      (tenantRow.storage_config as Record<string, string> | null) ?? {},
    );
  } catch (e) {
    return {
      ok: false,
      error: `Storage config: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }

  // 2) Crea cartella di stato destinazione (idempotente)
  try {
    await storage.createFolder(targetFolder);
  } catch (e) {
    return {
      ok: false,
      error: `Creazione cartella ${targetFolder} fallita: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }

  // 3) MOVE WebDAV
  try {
    const fromPath = oldCloudPath.replace(/^\/+/, '');
    const toPath = newCloudPath.replace(/^\/+/, '');
    await storage.move(fromPath, toPath);
  } catch (e) {
    const tecnico = e instanceof Error ? e.message : 'unknown';
    // Il dettaglio WebDAV serve a noi, non all'utente: resta nei log.
    // eslint-disable-next-line no-console
    console.error(
      `[sposta-commessa-stato] MOVE fallito · commessa ${commessa.codice_interno} · ` +
        `da "${oldCloudPath}" a "${newCloudPath}" · ${tecnico}`,
    );
    const spiegazione = await spiegaMoveFallito({
      storage,
      oldCloudPath,
      currentFolder,
      codiceInterno: commessa.codice_interno,
      nomeCartella: commessa.nome_cartella,
      tecnico,
    });
    await audit(supabase, ctx, commessaId, commessa.codice_interno, {
      from_stato: commessa.stato,
      to_stato: newStato,
      moved: false,
      esito: 'errore_move',
      causa: spiegazione.causa,
      cartella_attesa: commessa.nome_cartella,
      cartella_trovata: spiegazione.nomeReale ?? null,
      errore_tecnico: tecnico,
    });
    return { ok: false, error: spiegazione.messaggio };
  }

  // 4) UPDATE atomico DB
  //    a. commesse.cloud_folder_path + stato
  //    b. file_refs.path: REPLACE prefix
  const newCloudFolderPathSlash = `${newCloudPath}/`;
  const { error: commUpd } = await supabase
    .from('commesse')
    .update({
      cloud_folder_path: newCloudFolderPathSlash,
      stato: newStato as StatoCommessa,
    })
    .eq('id', commessaId);

  if (commUpd) {
    // Rollback MOVE? Best-effort: tentiamo di rimettere indietro.
    try {
      await storage.move(
        newCloudPath.replace(/^\/+/, ''),
        oldCloudPath.replace(/^\/+/, ''),
      );
    } catch {
      /* swallow: log + rimaniamo in stato inconsistente — l'admin riconcilia */
    }
    return { ok: false, error: `Update commessa fallito: ${commUpd.message}` };
  }

  // file_refs.path: tutte le righe con prefix = oldCloudPath → sostituisci con newCloudPath
  // Usiamo SQL diretto via rpc per UPDATE in massa con REPLACE.
  // In assenza di una RPC, facciamo SELECT + UPDATE in batch.
  const { data: refs } = await supabase
    .from('file_refs')
    .select('id, path')
    .eq('commessa_id', commessaId)
    .like('path', `${oldCloudPath.replace(/^\/+/, '')}/%`);

  let movedFiles = 0;
  for (const r of refs ?? []) {
    if (!r.path) continue;
    const newPath = r.path.replace(
      oldCloudPath.replace(/^\/+/, ''),
      newCloudPath.replace(/^\/+/, ''),
    );
    const { error: fUpd } = await supabase
      .from('file_refs')
      .update({ path: newPath })
      .eq('id', r.id);
    if (!fUpd) movedFiles++;
  }

  // 5) Audit + revalidate
  await audit(supabase, ctx, commessaId, commessa.codice_interno, {
    from_stato: commessa.stato,
    to_stato: newStato,
    from_path: oldCloudPath,
    to_path: newCloudPath,
    moved_files: movedFiles,
    moved: true,
  });

  revalidatePath(`/office/commesse/${commessaId}`);
  revalidatePath(`/mobile/commessa/${commessaId}`);
  revalidatePath('/office/commesse');
  revalidatePath('/mobile');

  return { ok: true, newCloudFolderPath: newCloudFolderPathSlash, movedFiles };
}

/**
 * Toggle del flag "critica" (urgenza trasversale).
 *
 * Non sposta cartelle fisiche: critica è un attributo UI/badge
 * ortogonale al workflow stato.
 */
const InputCritica = z.object({
  commessaId: z.string().uuid(),
  isCritica: z.boolean(),
});

export async function toggleCommessaCritica(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = InputCritica.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'Sessione non valida' };
  }
  if (!RUOLI_AMMESSI.has(ctx.role)) {
    return { ok: false, error: 'Permessi insufficienti' };
  }

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('commesse')
    .update({ is_critica: parsed.data.isCritica })
    .eq('id', parsed.data.commessaId);

  if (error) return { ok: false, error: `Update fallito: ${error.message}` };

  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'commessa',
    entity_id: parsed.data.commessaId,
    action: 'commessa.critica.toggle',
    metadata: { is_critica: parsed.data.isCritica } as unknown as never,
  });

  revalidatePath(`/office/commesse/${parsed.data.commessaId}`);
  revalidatePath(`/mobile/commessa/${parsed.data.commessaId}`);
  return { ok: true };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildStorageProvider(
  providerName: StorageProviderName,
  cfg: Record<string, string>,
): StorageProvider {
  if (providerName === 'nextcloud') {
    if (!cfg.baseUrl || !cfg.user || !cfg.appPassword) {
      throw new Error('Nextcloud config incompleta');
    }
    return getStorageProvider({
      provider: 'nextcloud',
      baseUrl: cfg.baseUrl,
      user: cfg.user,
      appPassword: cfg.appPassword,
        basePath: typeof cfg.basePath === "string" ? cfg.basePath : undefined,
    });
  }
  if (providerName === 'supabase') {
    return getStorageProvider({
      provider: 'supabase',
      bucket: cfg.bucket ?? 'commesse',
    });
  }
  throw new Error(`Provider ${providerName} non supportato per move`);
}

async function audit(
  supabase: ReturnType<typeof createServerSupabase>,
  ctx: { tenantId: string; userId: string; role: AppRole },
  commessaId: string,
  codiceInterno: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'commessa',
    entity_id: commessaId,
    action: 'commessa.stato.cambiato',
    metadata: {
      commessa_id: commessaId,
      codice_interno: codiceInterno,
      ...metadata,
    } as unknown as never,
  });
}

/** Le quattro cartelle di stato: dove cercare una cartella che non risponde. */
const CARTELLE_STATO = [
  '01_Richieste',
  '02_In_Lavorazione',
  '03_Completate',
  '04_Archivio',
] as const;

interface SpiegazioneMove {
  /** Etichetta breve per l'audit. */
  causa: 'rinominata' | 'altrove' | 'sparita' | 'altro';
  /** Messaggio per l'utente: dice cos'è successo e cosa può fare. */
  messaggio: string;
  /** Nome reale della cartella, se ritrovata. */
  nomeReale?: string;
}

/**
 * Traduce un MOVE fallito in una frase che l'ufficio possa capire e agire.
 *
 * ─── Perché esiste (10/08/2026) ────────────────────────────────────────────
 * Spostando BER-26-038 da "Non presa" a "In corso" compariva un dump WebDAV
 * ("Sabre\DAV\Exception\NotFound…"): incomprensibile e, soprattutto, muto sulla
 * causa vera. La causa era che qualcuno aveva **rinominato la cartella a mano**
 * su Nextcloud (`_Cobi_` → `_Cobit_`, correggendo il nome del cliente): l'app
 * cerca il nome che conosce e non lo trova più.
 *
 * Il caso è riconoscibile senza ambiguità — la cartella del DB non risponde, ma
 * nelle cartelle di stato ce n'è una che inizia con lo stesso codice commessa —
 * quindi si può dire all'utente **come si chiama adesso**. Il dettaglio tecnico
 * resta nei log e nell'audit, dove serve a noi.
 */
async function spiegaMoveFallito(opzioni: {
  storage: StorageProvider;
  oldCloudPath: string;
  /** Cartella di stato attuale secondo il DB (null se il path è malformato). */
  currentFolder: string | null;
  codiceInterno: string;
  nomeCartella: string;
  tecnico: string;
}): Promise<SpiegazioneMove> {
  const { storage, oldCloudPath, currentFolder, codiceInterno, nomeCartella } =
    opzioni;

  const generico: SpiegazioneMove = {
    causa: 'altro',
    messaggio:
      'Non sono riuscito a spostare la cartella su Nextcloud. Lo stato della commessa non è stato cambiato: riprova fra qualche minuto. Se l’errore continua, segnala a SOLVA il codice ' +
      `${codiceInterno} (il dettaglio tecnico è già nei log).`,
  };

  try {
    // La cartella di partenza c'è davvero? Se sì il problema è un altro
    // (destinazione, permessi, rete) e non ha senso indovinare.
    if (await storage.exists(oldCloudPath.replace(/^\/+/, ''))) return generico;

    // Cerchiamo una cartella che inizi con lo stesso codice commessa: è il
    // segno inequivocabile di una rinomina fatta a mano.
    const prefisso = `${codiceInterno}_`;
    const daCercare: string[] = [
      ...(currentFolder ? [currentFolder] : []),
      ...CARTELLE_STATO.filter((c) => c !== currentFolder),
    ];

    for (const cartella of daCercare) {
      let voci;
      try {
        voci = await storage.listFolder(cartella);
      } catch {
        continue; // cartella di stato non leggibile: si prova la prossima
      }
      const trovata = voci.find(
        (v) => v.isDirectory && v.name.startsWith(prefisso) && v.name !== nomeCartella,
      );
      if (!trovata) continue;

      if (cartella === currentFolder) {
        return {
          causa: 'rinominata',
          nomeReale: trovata.name,
          messaggio:
            'La cartella di questa commessa è stata rinominata direttamente su Nextcloud, quindi l’app non la trova più.\n\n' +
            `Kommessa cerca:  ${nomeCartella}\n` +
            `Su Nextcloud c’è:  ${trovata.name}\n\n` +
            'Nessun file è perso e lo stato non è stato cambiato. Per proseguire subito, rinomina la cartella com’era prima; ' +
            'se invece il nome nuovo è quello giusto, chiedi a SOLVA di riallineare l’app (i nomi delle cartelle non vanno cambiati a mano, ' +
            'perché sono il collegamento fra l’app e i file).',
        };
      }
      return {
        causa: 'altrove',
        nomeReale: trovata.name,
        messaggio:
          `La cartella di questa commessa non è dove l’app la cerca: si trova in ${cartella} ` +
          `col nome "${trovata.name}". Qualcuno l’ha spostata o rinominata direttamente su Nextcloud.\n\n` +
          'Nessun file è perso e lo stato non è stato cambiato. Segnala a SOLVA per riallineare l’app.',
      };
    }

    return {
      causa: 'sparita',
      messaggio:
        `Non trovo più la cartella "${nomeCartella}" su Nextcloud` +
        (currentFolder ? ` (dovrebbe essere in ${currentFolder}).` : '.') +
        '\n\n' +
        'Potrebbe essere stata spostata, rinominata o finita nel cestino. Lo stato della commessa non è stato cambiato: ' +
        'controlla su Nextcloud, oppure segnala a SOLVA il codice ' +
        `${codiceInterno}.`,
    };
  } catch {
    return generico;
  }
}
