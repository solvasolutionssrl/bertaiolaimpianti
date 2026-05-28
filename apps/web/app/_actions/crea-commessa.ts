'use server';

import { revalidatePath } from 'next/cache';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import type { AppRole, Json } from '@kommessa/api';
import {
  getStorageProvider,
  SCAFFOLD_TREE,
  type StorageProviderName,
} from '@kommessa/integrations/storage';

import {
  creaCommessaServerInputSchema,
  type CreaCommessaServerInput,
  type CreaCommessaServerResult,
} from './crea-commessa.schemas';
import {
  STATUS_FOLDER_RICHIESTE,
  ensureStatusFolders,
} from '../_lib/commessa-stato-folder';

/**
 * Server Action canonica per la creazione di una commessa.
 *
 * Funziona sia per il flusso "ufficio" (form desktop) sia per il flusso
 * "PWA capo" (wizard sopralluogo). Tutta la logica gira inline contro
 * Postgres / Supabase: NESSUNA Edge Function viene invocata.
 *
 * La cartella cloud NON viene creata realmente: il provider di storage
 * finale è ancora TBD (vedi Comparativa_Storage.md). Salviamo solo il
 * nome cartella + path teorico in DB e li mostriamo all'utente come
 * "cartella prevista".
 *
 * Riferimenti:
 *  - Flusso_Operativo.md §2 (7 step del capo)
 *  - Tassonomia_Lavori.md §2-3 (Sezione A sempre attiva / Sezione B opzionale)
 *  - Architettura_Soluzione.md §4 (codice interno + nome cartella)
 */

const RUOLI_AMMESSI: ReadonlySet<AppRole> = new Set<AppRole>([
  'admin',
  'office',
]);

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/**
 * NFD-normalizza, rimuove diacritici, scarta non-alphanum, taglia a 30.
 * Usato per i 3 segmenti di nome_cartella.
 */
function sanitize(input: string, max = 40): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .slice(0, max);
}

/**
 * Estrae il segmento "cliente" del nome cartella.
 * Persona fisica: Nome+Cognome (capitalized, sanitized) — evita collisioni
 *   tra omonimi sullo stesso cognome.
 * Azienda: ragione sociale intera sanitizzata.
 *
 * Esempi (post-sanitize):
 *   "Mario Rossi" persona_fisica → "MarioRossi"
 *   "Comune di Castagnole" azienda → "ComuneDiCastagnole"
 *   "Edilizia Tre S.r.l." azienda → "EdiliziaTreSrl"
 */
function estraiSegmentoCliente(
  ragioneSociale: string,
  _tipo: 'persona_fisica' | 'azienda',
): string {
  return ragioneSociale.trim();
}

function dataIsoOggi(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------
// Server Action
// ---------------------------------------------------------------------

export async function creaCommessa(
  input: CreaCommessaServerInput,
): Promise<CreaCommessaServerResult> {
  // 1) Auth + ruolo
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'Sessione non valida. Effettua nuovamente il login.' };
  }
  if (!RUOLI_AMMESSI.has(ctx.role)) {
    return { ok: false, error: 'Permessi insufficienti per creare una commessa.' };
  }

  // 2) Validazione input
  const parsed = creaCommessaServerInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join(' · '),
    };
  }
  const data = parsed.data;
  const supabase = createServerSupabase();

  // 3) Risolvi/crea cliente
  let clienteId: string;
  let clienteRagione: string;
  let clienteTipo: 'persona_fisica' | 'azienda';

  if (data.clienteId) {
    const { data: cli, error } = await supabase
      .from('clienti')
      .select('id, ragione_sociale, tipo')
      .eq('id', data.clienteId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();
    if (error) return { ok: false, error: `Cliente non leggibile: ${error.message}` };
    if (!cli) return { ok: false, error: 'Cliente selezionato non trovato.' };
    clienteId = cli.id;
    clienteRagione = cli.ragione_sociale;
    clienteTipo = cli.tipo as 'persona_fisica' | 'azienda';
  } else {
    const nuovo = data.clienteNew!;
    // Dedup: stessa ragione sociale + overlap email/telefono nello stesso tenant
    const emailNorm = (nuovo.email ?? []).map((e) => e.trim()).filter(Boolean);
    const telNorm = (nuovo.telefoni ?? []).map((t) => t.trim()).filter(Boolean);

    const { data: candidates } = await supabase
      .from('clienti')
      .select('id, ragione_sociale, tipo, email, telefoni')
      .eq('tenant_id', ctx.tenantId)
      .ilike('ragione_sociale', nuovo.ragione_sociale.trim())
      .limit(5);

    const match = (candidates ?? []).find((c) => {
      if (emailNorm.length === 0 && telNorm.length === 0) return true; // solo ragione
      const cEmails = (c.email ?? []) as string[];
      const cTels = (c.telefoni ?? []) as string[];
      const emailHit = emailNorm.some((e) => cEmails.includes(e));
      const telHit = telNorm.some((t) => cTels.includes(t));
      return emailHit || telHit;
    });

    if (match) {
      clienteId = match.id;
      clienteRagione = match.ragione_sociale;
      clienteTipo = match.tipo as 'persona_fisica' | 'azienda';
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from('clienti')
        .insert({
          tenant_id: ctx.tenantId,
          ragione_sociale: nuovo.ragione_sociale.trim(),
          tipo: nuovo.tipo,
          indirizzo: nuovo.indirizzo ?? null,
          citta: nuovo.citta ?? null,
          cap: nuovo.cap ?? null,
          provincia: nuovo.provincia ?? null,
          telefoni: telNorm,
          email: emailNorm,
          note: nuovo.note ?? null,
        })
        .select('id, ragione_sociale, tipo')
        .single();
      if (insErr || !inserted) {
        return { ok: false, error: `Creazione cliente fallita: ${insErr?.message ?? 'errore'}` };
      }
      clienteId = inserted.id;
      clienteRagione = inserted.ragione_sociale;
      clienteTipo = inserted.tipo as 'persona_fisica' | 'azienda';
    }
  }

  // I referenti estratti dall'AI vengono inseriti più avanti (vedi 6b),
  // perché vogliamo legarli alla commessa appena creata (scope commessa),
  // non al cliente. Niente da fare qui.

  // 4) Codice progressivo via RPC (atomico, format BER-YY-NNN, reset annuale)
  const annoCorrente = new Date().getFullYear() % 100; // 26 per 2026
  const { data: codiceRpc, error: rpcErr } = await supabase.rpc('genera_codice_commessa', {
    p_tenant_slug: ctx.tenantSlug,
    p_anno: annoCorrente,
  });
  if (rpcErr || !codiceRpc) {
    return {
      ok: false,
      error: `Generazione codice fallita: ${rpcErr?.message ?? 'risposta vuota'}`,
    };
  }
  const codiceInterno = codiceRpc as unknown as string;

  // 5) Costruisci nome_cartella nel formato canonico:
  //    <codiceInterno>_<segCliente>_<segDescrizione>
  //    Esempio: BER-0526-001_MarioRossi_SistemazioneBagno
  //
  //    Il codice fa già da identificatore univoco (RPC atomica); il cliente
  //    e la descrizione servono SOLO per leggibilità nel filesystem
  //    (Esplora Risorse Windows / Finder Mac / Nextcloud Files).
  //    Niente data nel nome: è già implicita nel codice (-MM AA-).
  const segCliente = sanitize(estraiSegmentoCliente(clienteRagione, clienteTipo)) || 'Cliente';
  const segDesc = sanitize(data.descrizioneFinale) || 'Commessa';
  const baseName = `${codiceInterno}_${segCliente}_${segDesc}`;

  const nomeCartella = await trovaNomeCartellaLibero(supabase, ctx.tenantId, baseName);
  // Nuovo schema: la commessa nasce sempre dentro 01_Richieste; le 4 cartelle
  // di stato (Richieste / In_Lavorazione / Completate / Archivio) sono create
  // se mancanti via ensureStatusFolders (lazy init, idempotente).
  const statusFolder = STATUS_FOLDER_RICHIESTE;
  const cloudFolderPath = `/${statusFolder}/${nomeCartella}/`;

  // Lazy init: assicura che le 4 cartelle di stato esistano sotto la macro
  // del tenant. Non blocchiamo se fallisce: non è critico per la creazione DB.
  try {
    const svcForInit = createServiceSupabase();
    const { data: t } = await svcForInit
      .from('tenants')
      .select('storage_provider, storage_config')
      .eq('id', ctx.tenantId)
      .maybeSingle();
    if (t?.storage_provider === 'nextcloud') {
      const cfg = (t.storage_config as Record<string, string> | null) ?? {};
      if (cfg.baseUrl && cfg.user && cfg.appPassword) {
        const storage = getStorageProvider({
          provider: 'nextcloud',
          baseUrl: cfg.baseUrl,
          user: cfg.user,
          appPassword: cfg.appPassword,
        basePath: typeof cfg.basePath === "string" ? cfg.basePath : undefined,
        });
        await ensureStatusFolders(storage);
      }
    }
  } catch (e) {
    console.warn('[crea-commessa] ensureStatusFolders failed (non-fatal):', e);
  }

  // 6) INSERT commessa
  const { data: commessa, error: comErr } = await supabase
    .from('commesse')
    .insert({
      tenant_id: ctx.tenantId,
      cliente_id: clienteId,
      codice_interno: codiceInterno,
      nome_cartella: nomeCartella,
      cloud_folder_path: cloudFolderPath,
      cliente_indirizzo_cantiere: data.indirizzoCantiere ?? null,
      responsabile_id: ctx.userId,
      stato: 'aperta',
      data_apertura: dataIsoOggi(),
      descrizione_ai_proposta: null,
      descrizione_ai_finale: data.descrizioneFinale,
      note_iniziali: data.noteIniziali?.trim() || null,
      preset_id: data.presetId ?? null,
    })
    .select('id')
    .single();
  if (comErr || !commessa) {
    return { ok: false, error: `Creazione commessa fallita: ${comErr?.message ?? 'errore'}` };
  }

  // 6b) Referenti estratti dall'AI: legati a QUESTA commessa
  // (scope commessa, non cliente). Razionale: chi parla in un sopralluogo
  // nuovo nomina persone specifiche del cantiere (geometra, capocantiere,
  // referente in loco), non l'anagrafica permanente del cliente.
  // L'utente può sempre "promuovere" un referente a contatto del cliente
  // dalla scheda anagrafica.
  if (data.referenti && data.referenti.length > 0) {
    const toInsert = data.referenti
      .filter((r) => r.nome && r.nome.trim().length > 0)
      .map((r, idx) => ({
        tenant_id: ctx.tenantId,
        cliente_id: clienteId,
        commessa_id: commessa.id,
        nome: r.nome.trim(),
        ruolo: r.ruolo?.trim() || null,
        telefono: r.telefono?.trim() || null,
        email: r.email?.trim() || null,
        is_primary: false, // primary ha senso solo a scope cliente
        ordine: idx,
      }));
    if (toInsert.length > 0) {
      const { error: refErr } = await supabase
        .from('contatto_cliente' as never)
        .insert(toInsert as never);
      if (refErr) {
        console.warn(
          '[crea-commessa] INSERT referenti commessa fallito (non-fatal):',
          refErr.message,
        );
      }
    }
  }

  // 7) Unione voci A (default) + voci B selezionate, recuperando metadati
  //    dalla `voci_catalogo` (per eventuale `min_foto_richieste` futuro).
  const { data: vociCatRaw } = await supabase
    .from('voci_catalogo')
    .select('id, "default"');
  const vociCat = vociCatRaw ?? [];
  const vociA = vociCat.filter((v) => v.default).map((v) => v.id as number);
  const vociUnion = Array.from(new Set<number>([...vociA, ...data.voci]));

  if (vociUnion.length > 0) {
    const rows = vociUnion.map((voceId) => ({
      commessa_id: commessa.id,
      voce_id: voceId,
      tenant_id: ctx.tenantId,
      stato: 'da_iniziare' as const,
      note: null as string | null,
    }));
    const { error: voceErr } = await supabase.from('commessa_voci').insert(rows);
    if (voceErr) {
      // commessa già creata: non rollback, ma segnaliamo errore parziale
      return {
        ok: false,
        error: `Commessa creata ma voci non inserite: ${voceErr.message}`,
      };
    }
  }

  // 8) Creazione cartelle su cloud storage (best-effort; non blocca se fallisce).
  // Oltre allo SCAFFOLD base passiamo l'unione voci A+B: il provisioning
  // creerà le sottocartelle extra delle voci selezionate (es. la voce 11
  // "Colonne sanitario" → Foto/In corso/ColonneSanitario), applicando
  // l'override cartella_template del tenant se presente.
  const storageResult = await provisionaCartelle({
    tenantId: ctx.tenantId,
    nomeCartella,
    cloudFolderPath,
    vociAttive: vociUnion,
  });

  // 9) Audit
  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'commessa',
    entity_id: commessa.id,
    action: 'create',
    after_data: {
      codice_interno: codiceInterno,
      nome_cartella: nomeCartella,
      cliente_id: clienteId,
      voci: vociUnion,
      storage: storageResult,
    } as unknown as Json,
  });

  // 10) Revalidate
  revalidatePath('/office/commesse');
  revalidatePath('/mobile');

  return {
    ok: true,
    data: {
      commessaId: commessa.id,
      codiceInterno,
      nomeCartella,
      cloudFolderPath,
      codiceCliente: clienteId,
    },
  };
}

/**
 * Provisiona la struttura cartelle scaffold su cloud storage del tenant.
 * Best-effort: se fallisce, la commessa resta valida nel DB con il
 * `cloud_folder_path` teorico. L'audit cattura l'esito per debug.
 *
 * Usa service-role per leggere tenants.storage_config (RLS scope-tenant
 * rispetto al ruolo platform_admin; con service-role bypass garantito).
 */
type StorageProvisionResult =
  | { provisioned: true; provider: StorageProviderName; created: number; path: string }
  | { provisioned: false; provider: StorageProviderName | 'none'; reason: string };

async function provisionaCartelle(opts: {
  tenantId: string;
  nomeCartella: string;
  cloudFolderPath: string;
  /** Voci attive della commessa (Sezione A + B). Per ognuna che ha
   *  cartella_template valorizzato (o override per il tenant), viene
   *  creata la sottocartella corrispondente sotto la root commessa. */
  vociAttive: number[];
}): Promise<StorageProvisionResult> {
  try {
    const service = createServiceSupabase();
    const { data: tenant, error } = await service
      .from('tenants')
      .select('storage_provider, storage_config')
      .eq('id', opts.tenantId)
      .maybeSingle();
    if (error || !tenant) {
      return { provisioned: false, provider: 'none', reason: 'tenant_config_unreadable' };
    }
    const providerName = (tenant.storage_provider as StorageProviderName) ?? 'supabase';
    const cfg = (tenant.storage_config as Record<string, string> | null) ?? {};

    // Path canonico cloud: rimuoviamo leading/trailing slash da
    // cloudFolderPath (es. "/01_Richieste/BER-26-001_Prova/" →
    // "01_Richieste/BER-26-001_Prova"). Questo include la cartella di
    // stato come prefisso — il bug precedente usava solo nomeCartella
    // e creava la commessa nella root del basePath invece che dentro
    // 01_Richieste, scollando il frontend (cloud_folder_path in DB
    // diverso dal path reale su Nextcloud).
    const rootPath = opts.cloudFolderPath.replace(/^\/+|\/+$/g, '');

    // Calcola le sottocartelle extra dalle voci attive (cartella_template
    // con override del tenant). Filtra quelle già nello SCAFFOLD per non
    // duplicare. Mantieni l'ordine d'inserimento per leggibilità.
    const extraFolders = await calcolaCartelleVoci(
      service,
      opts.tenantId,
      opts.vociAttive,
    );
    const scaffoldSet = new Set(
      (SCAFFOLD_TREE as unknown as string[]).map((s) =>
        s.replace(/^\/+|\/+$/g, ''),
      ),
    );
    const extraToCreate = extraFolders.filter((c) => !scaffoldSet.has(c));

    if (providerName === 'nextcloud') {
      if (!cfg.baseUrl || !cfg.user || !cfg.appPassword) {
        return { provisioned: false, provider: providerName, reason: 'nextcloud_config_incomplete' };
      }
      const provider = getStorageProvider({
        provider: 'nextcloud',
        baseUrl: cfg.baseUrl,
        user: cfg.user,
        appPassword: cfg.appPassword,
        basePath: typeof cfg.basePath === 'string' ? cfg.basePath : undefined,
      });
      await provider.createFolderTree(rootPath, SCAFFOLD_TREE as unknown as string[]);
      // Cartelle extra delle voci (createFolder è ricorsivo + idempotente)
      for (const sub of extraToCreate) {
        try {
          await provider.createFolder(`${rootPath}/${sub}`);
        } catch (e) {
          // Non-fatal: se una cartella extra fallisce, ne loggiamo ma
          // procediamo. Le foto verranno comunque caricate (Nextcloud
          // crea i parent al PUT).
          console.warn(
            `[crea-commessa] createFolder extra fallita "${sub}":`,
            e instanceof Error ? e.message : e,
          );
        }
      }
      return {
        provisioned: true,
        provider: 'nextcloud',
        created: SCAFFOLD_TREE.length + 1 + extraToCreate.length,
        path: rootPath,
      };
    }

    if (providerName === 'supabase') {
      const provider = getStorageProvider({
        provider: 'supabase',
        bucket: (cfg.bucket as string | undefined) ?? 'commesse',
      });
      await provider.createFolderTree(rootPath, SCAFFOLD_TREE as unknown as string[]);
      for (const sub of extraToCreate) {
        try {
          await provider.createFolder(`${rootPath}/${sub}`);
        } catch (e) {
          console.warn(
            `[crea-commessa] createFolder extra fallita "${sub}":`,
            e instanceof Error ? e.message : e,
          );
        }
      }
      return {
        provisioned: true,
        provider: 'supabase',
        created: SCAFFOLD_TREE.length + 1 + extraToCreate.length,
        path: rootPath,
      };
    }

    return { provisioned: false, provider: providerName, reason: 'provider_not_supported' };
  } catch (err) {
    return {
      provisioned: false,
      provider: 'none',
      reason: err instanceof Error ? err.message.slice(0, 200) : 'unknown_error',
    };
  }
}

/**
 * Cerca un nome_cartella libero appendendo _2, _3, … se collide con
 * l'UNIQUE (tenant_id, nome_cartella). Max 50 tentativi (di fatto
 * impossibile arrivare lì in produzione).
 */
async function trovaNomeCartellaLibero(
  supabase: ReturnType<typeof createServerSupabase>,
  tenantId: string,
  base: string,
): Promise<string> {
  let candidate = base;
  for (let i = 2; i <= 50; i++) {
    const { data, error } = await supabase
      .from('commesse')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('nome_cartella', candidate)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') {
      // PGRST116 = nessuna riga, qualsiasi altro errore lo ignoriamo qui
      // tanto l'INSERT in commesse fallirà con un messaggio chiaro.
      return candidate;
    }
    if (!data) return candidate;
    candidate = `${base}_${i}`;
  }
  return candidate;
}

/**
 * Risolve le cartelle effettive delle voci attive su una commessa.
 *
 * Per ogni voce ID nell'elenco, legge:
 *  - voci_catalogo.cartella_template (path di default del catalogo)
 *  - tenant_voci_override.cartella_template_override (override locale)
 *
 * Restituisce array di path puliti (slash leading/trailing rimossi), nessun
 * duplicato, nell'ordine delle voci. I path vuoti/null sono filtrati: le
 * voci "solo dato" (Cliente, Ticket, Tracciatura cantiere) non producono
 * cartelle.
 */
async function calcolaCartelleVoci(
  service: ReturnType<typeof createServiceSupabase>,
  tenantId: string,
  vociIds: number[],
): Promise<string[]> {
  if (vociIds.length === 0) return [];

  const [baseRes, overrideRes] = await Promise.all([
    service
      .from('voci_catalogo')
      .select('id, cartella_template')
      .in('id', vociIds),
    service
      .from('tenant_voci_override' as never)
      .select('voce_id, cartella_template_override, attiva')
      .eq('tenant_id', tenantId)
      .in('voce_id', vociIds),
  ]);

  const base = new Map<number, string | null>();
  for (const v of (baseRes.data ?? []) as Array<{
    id: number;
    cartella_template: string | null;
  }>) {
    base.set(v.id, v.cartella_template);
  }
  const override = new Map<
    number,
    { cartella?: string | null; attiva: boolean }
  >();
  for (const o of (overrideRes.data ?? []) as unknown as Array<{
    voce_id: number;
    cartella_template_override: string | null;
    attiva: boolean;
  }>) {
    override.set(o.voce_id, {
      cartella: o.cartella_template_override,
      attiva: o.attiva,
    });
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of vociIds) {
    const ovr = override.get(id);
    // Se il tenant ha disattivato la voce, niente cartella anche se attiva
    // nella selezione (rispettiamo l'override).
    if (ovr && ovr.attiva === false) continue;
    const cartella =
      ovr?.cartella !== undefined && ovr.cartella !== null
        ? ovr.cartella
        : base.get(id) ?? null;
    if (!cartella || cartella.trim().length === 0) continue;
    const clean = cartella.replace(/^\/+|\/+$/g, '').trim();
    if (clean.length === 0) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}
