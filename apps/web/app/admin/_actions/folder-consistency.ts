'use server';

import { z } from 'zod';

import { createServiceSupabase } from '@kommessa/api/service';
import { NextcloudStorageProvider } from '@kommessa/integrations/storage';

import { requirePlatformAdmin } from '../_lib/guard';

/**
 * Verifica consistenza fra cloud_folder_path nel DB e posizione reale
 * delle cartelle sul cloud Nextcloud. Pensata per il pannello super-admin
 * → Tab Storage.
 *
 * Fa 4 PROPFIND (uno per ogni cartella di stato 01/02/03/04), poi
 * confronta i nomi delle sottocartelle con `nome_cartella` di ogni
 * commessa del tenant. Risultati per ogni commessa:
 *
 *   - ok            → trovata nel posto atteso (in base allo stato)
 *   - wrong_position → esiste ma in un'altra cartella di stato
 *   - missing       → non esiste su cloud
 *
 * Inoltre identifica le cartelle "orfane": presenti su cloud sotto
 * 01_/02_/03_/04_ ma senza commessa nel DB.
 *
 * Le azioni di ripristino (sposta nel posto giusto) sono in
 * `rimettiAPostoCommessa`.
 */

const STATUS_FOLDERS = [
  '01_Richieste',
  '02_In_Lavorazione',
  '03_Completate',
  '04_Archivio',
] as const;
type StatusFolder = (typeof STATUS_FOLDERS)[number];

// Mapping stato commessa → cartella attesa
const STATO_TO_FOLDER: Record<string, StatusFolder> = {
  bozza: '01_Richieste',
  aperta: '01_Richieste',
  in_corso: '02_In_Lavorazione',
  collaudo: '02_In_Lavorazione',
  completata: '03_Completate',
  archiviata: '04_Archivio',
};

export interface CommessaCheck {
  id: string;
  codice_interno: string;
  cliente_ragione_sociale: string | null;
  stato: string;
  nome_cartella: string;
  expected_folder: StatusFolder;
  expected_path: string;
  db_path: string;
  status: 'ok' | 'wrong_position' | 'missing';
  found_in: StatusFolder | null;
  assegnata: boolean;
}

export interface OrphanFolder {
  scaffold: StatusFolder;
  name: string;
  path: string;
}

export interface FolderConsistencyResult {
  ok: boolean;
  error?: string;
  totals: {
    commesse: number;
    ok: number;
    wrong_position: number;
    missing: number;
    orphans: number;
  };
  commesse: CommessaCheck[];
  orphans: OrphanFolder[];
}

const TenantIdInput = z.object({ tenantId: z.string().uuid() });

export async function verificaCartelle(
  input: unknown,
): Promise<FolderConsistencyResult> {
  await requirePlatformAdmin();
  const parsed = TenantIdInput.safeParse(input);
  if (!parsed.success) {
    return empty('Input non valido');
  }

  const service = createServiceSupabase();

  // 1. Storage config
  const { data: tenant } = await service
    .from('tenants')
    .select('storage_provider, storage_config')
    .eq('id', parsed.data.tenantId)
    .maybeSingle();
  if (!tenant) return empty('Tenant non trovato');
  if (tenant.storage_provider !== 'nextcloud') {
    return empty('Verifica disponibile solo per Nextcloud al momento');
  }
  const cfg = (tenant.storage_config ?? {}) as Record<string, unknown>;
  const baseUrl = String(cfg.baseUrl ?? cfg.base_url ?? '');
  const user = String(cfg.user ?? '');
  const appPassword = String(cfg.appPassword ?? cfg.app_password ?? '');
  if (!baseUrl || !user || !appPassword) {
    return empty('Config Nextcloud incompleta');
  }
  const basePath =
    typeof cfg.basePath === 'string' && cfg.basePath.length > 0
      ? cfg.basePath
      : undefined;

  const provider = new NextcloudStorageProvider({
    baseUrl,
    user,
    appPassword,
    basePath,
  });

  // 2. Lista contenuto delle 4 cartelle di stato (4 PROPFIND parallele)
  const lists = await Promise.all(
    STATUS_FOLDERS.map(async (f) => {
      try {
        const entries = await provider.listFolder(`/${f}`);
        return entries.filter((e) => e.isDirectory).map((e) => e.name);
      } catch {
        return [] as string[];
      }
    }),
  );
  const cloudByScaffold = new Map<StatusFolder, Set<string>>();
  STATUS_FOLDERS.forEach((f, i) => {
    cloudByScaffold.set(f, new Set(lists[i]));
  });

  // 3. Lista commesse + dati per cliente
  const { data: commesseRaw } = await service
    .from('commesse')
    .select(
      `id, codice_interno, nome_cartella, cloud_folder_path, stato,
       cliente:clienti ( ragione_sociale )`,
    )
    .eq('tenant_id', parsed.data.tenantId)
    .order('codice_interno', { ascending: false })
    .limit(500);

  // 4. Lista commesse con tecnici assegnati (per flag "assegnata")
  const { data: tecniciAssRaw } = await service
    .from('commessa_tecnici')
    .select('commessa_id')
    .eq('tenant_id', parsed.data.tenantId);
  const assegnate = new Set(
    ((tecniciAssRaw ?? []) as Array<{ commessa_id: string }>).map(
      (r) => r.commessa_id,
    ),
  );

  // 5. Match commesse → cartella
  const dbNames = new Set<string>();
  const commesseCheck: CommessaCheck[] = ((commesseRaw ?? []) as Array<any>).map(
    (c) => {
      dbNames.add(c.nome_cartella);
      const cl = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
      const expected = STATO_TO_FOLDER[c.stato] ?? '01_Richieste';
      const expectedPath = `/${expected}/${c.nome_cartella}/`;

      let status: CommessaCheck['status'] = 'missing';
      let foundIn: StatusFolder | null = null;

      // Verifica nel posto atteso
      if (cloudByScaffold.get(expected)?.has(c.nome_cartella)) {
        status = 'ok';
        foundIn = expected;
      } else {
        // Cerca nelle altre 3 scaffold
        for (const f of STATUS_FOLDERS) {
          if (f === expected) continue;
          if (cloudByScaffold.get(f)?.has(c.nome_cartella)) {
            status = 'wrong_position';
            foundIn = f;
            break;
          }
        }
      }

      return {
        id: c.id as string,
        codice_interno: c.codice_interno as string,
        cliente_ragione_sociale:
          (cl?.ragione_sociale as string | undefined) ?? null,
        stato: c.stato as string,
        nome_cartella: c.nome_cartella as string,
        expected_folder: expected,
        expected_path: expectedPath,
        db_path: (c.cloud_folder_path as string | null) ?? '—',
        status,
        found_in: foundIn,
        assegnata: assegnate.has(c.id as string),
      };
    },
  );

  // 6. Orfani: cartelle su cloud che non hanno match DB
  const orphans: OrphanFolder[] = [];
  for (const f of STATUS_FOLDERS) {
    const set = cloudByScaffold.get(f) ?? new Set<string>();
    for (const name of set) {
      if (!dbNames.has(name)) {
        orphans.push({ scaffold: f, name, path: `/${f}/${name}/` });
      }
    }
  }

  const totals = {
    commesse: commesseCheck.length,
    ok: commesseCheck.filter((c) => c.status === 'ok').length,
    wrong_position: commesseCheck.filter((c) => c.status === 'wrong_position').length,
    missing: commesseCheck.filter((c) => c.status === 'missing').length,
    orphans: orphans.length,
  };

  return {
    ok: true,
    totals,
    commesse: commesseCheck,
    orphans,
  };
}

// ─── Azione: rimetti a posto la cartella di una commessa ────────────

const FixInput = z.object({
  tenantId: z.string().uuid(),
  commessaId: z.string().uuid(),
});

export async function rimettiAPostoCommessa(
  input: unknown,
): Promise<{ ok: true; new_path: string } | { ok: false; error: string }> {
  const ctx = await requirePlatformAdmin();
  const parsed = FixInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const service = createServiceSupabase();

  // Carica commessa + tenant config
  const { data: c } = await service
    .from('commesse')
    .select('id, nome_cartella, stato, tenant_id, cloud_folder_path')
    .eq('id', parsed.data.commessaId)
    .eq('tenant_id', parsed.data.tenantId)
    .maybeSingle();
  if (!c) return { ok: false, error: 'Commessa non trovata' };

  const { data: t } = await service
    .from('tenants')
    .select('storage_provider, storage_config')
    .eq('id', parsed.data.tenantId)
    .maybeSingle();
  if (!t || t.storage_provider !== 'nextcloud') {
    return { ok: false, error: 'Provider non supportato' };
  }
  const cfg = (t.storage_config ?? {}) as Record<string, unknown>;
  const baseUrl = String(cfg.baseUrl ?? '');
  const user = String(cfg.user ?? '');
  const appPassword = String(cfg.appPassword ?? '');
  const basePath =
    typeof cfg.basePath === 'string' && cfg.basePath.length > 0
      ? cfg.basePath
      : undefined;
  if (!baseUrl || !user || !appPassword) {
    return { ok: false, error: 'Config Nextcloud incompleta' };
  }
  const provider = new NextcloudStorageProvider({
    baseUrl,
    user,
    appPassword,
    basePath,
  });

  const expected = STATO_TO_FOLDER[c.stato as string] ?? '01_Richieste';
  const expectedPath = `/${expected}/${c.nome_cartella}/`;
  const expectedPathClean = expectedPath.replace(/^\/+|\/+$/g, '');

  // Verifica posizione corrente
  let foundIn: string | null = null;
  for (const f of STATUS_FOLDERS) {
    try {
      const entries = await provider.listFolder(`/${f}`);
      if (entries.some((e) => e.isDirectory && e.name === c.nome_cartella)) {
        foundIn = f;
        break;
      }
    } catch {
      /* ignora errori per singola scaffold */
    }
  }

  if (foundIn === null) {
    // Mancante: crea ex-novo nella posizione attesa
    try {
      await provider.createFolder(expectedPathClean);
    } catch (e) {
      return {
        ok: false,
        error: `Creazione cartella fallita: ${e instanceof Error ? e.message : 'unknown'}`,
      };
    }
  } else if (foundIn !== expected) {
    // Posizione sbagliata: MOVE
    const fromPath = `${foundIn}/${c.nome_cartella}`;
    try {
      // Assicura che la cartella di stato destinazione esista
      await provider.createFolder(expected);
      await provider.move(fromPath, expectedPathClean);
    } catch (e) {
      return {
        ok: false,
        error: `MOVE fallito: ${e instanceof Error ? e.message : 'unknown'}`,
      };
    }
  }

  // Aggiorna cloud_folder_path nel DB se diverso
  if (c.cloud_folder_path !== expectedPath) {
    await service
      .from('commesse')
      .update({ cloud_folder_path: expectedPath })
      .eq('id', c.id);
  }

  // Audit
  await service.from('audit_events').insert({
    tenant_id: parsed.data.tenantId,
    actor_user_id: ctx.userId,
    actor_role: 'admin',
    entity_type: 'commessa',
    entity_id: c.id,
    action: 'platform.folder.fix',
    metadata: {
      platform: true,
      actor_email: ctx.email,
      from: foundIn,
      to: expected,
      new_path: expectedPath,
    } as Record<string, unknown>,
  } as never);

  return { ok: true, new_path: expectedPath };
}

// ─── Azione: cancella cartella orfana ───────────────────────────────

const CancellaOrfanaInput = z.object({
  tenantId: z.string().uuid(),
  path: z.string().min(2),
});

export async function cancellaCartellaOrfana(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requirePlatformAdmin();
  const parsed = CancellaOrfanaInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  // Validazione difensiva: path deve iniziare con uno dei 4 scaffold
  const startsOk = STATUS_FOLDERS.some((f) =>
    parsed.data.path.replace(/^\/+/, '').startsWith(f + '/'),
  );
  if (!startsOk) {
    return {
      ok: false,
      error: 'Path non riconosciuto come cartella di scaffold',
    };
  }

  const service = createServiceSupabase();
  const { data: t } = await service
    .from('tenants')
    .select('storage_provider, storage_config')
    .eq('id', parsed.data.tenantId)
    .maybeSingle();
  if (!t || t.storage_provider !== 'nextcloud') {
    return { ok: false, error: 'Provider non supportato' };
  }
  const cfg = (t.storage_config ?? {}) as Record<string, unknown>;
  const baseUrl = String(cfg.baseUrl ?? '');
  const user = String(cfg.user ?? '');
  const appPassword = String(cfg.appPassword ?? '');
  const basePath =
    typeof cfg.basePath === 'string' && cfg.basePath.length > 0
      ? cfg.basePath
      : undefined;

  const provider = new NextcloudStorageProvider({
    baseUrl,
    user,
    appPassword,
    basePath,
  });

  const cleanPath = parsed.data.path.replace(/^\/+|\/+$/g, '');
  try {
    await provider.delete(cleanPath);
  } catch (e) {
    return {
      ok: false,
      error: `Delete fallita: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }

  await service.from('audit_events').insert({
    tenant_id: parsed.data.tenantId,
    actor_user_id: ctx.userId,
    actor_role: 'admin',
    entity_type: 'tenant',
    entity_id: parsed.data.tenantId,
    action: 'platform.folder.delete_orphan',
    metadata: {
      platform: true,
      actor_email: ctx.email,
      path: cleanPath,
    } as Record<string, unknown>,
  } as never);

  return { ok: true };
}

// helpers
function empty(error: string): FolderConsistencyResult {
  return {
    ok: false,
    error,
    totals: { commesse: 0, ok: 0, wrong_position: 0, missing: 0, orphans: 0 },
    commesse: [],
    orphans: [],
  };
}

