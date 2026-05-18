// =====================================================================
// create-commessa — POST /create-commessa
// Crea una commessa completa partendo dalla scelta del capo:
//  1. Risolve / crea il cliente (matching email/telefono/ragione)
//  2. Genera codice_interno via SQL `genera_codice_commessa`
//  3. Costruisce nome_cartella univoco per tenant (suffisso _2, _3, ...)
//  4. Inserisce `commesse` + `commessa_voci` (A default + B selezionate)
//  5. Crea l'albero cartelle sul provider storage del tenant
//  6. Audit + return
//
// Auth: Bearer JWT. Solo ruoli con permesso di creare commesse.
// Spec: Architettura_Soluzione.md §6, Tassonomia_Lavori.md §2 e §5.
// =====================================================================

import { corsHeaders, errorResponse, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { resolveJwtContext, serviceClient, userClient } from '../_shared/supabase.ts';
import {
  buildStorageProvider,
  extraFoldersFromTemplates,
  SCAFFOLD_TREE,
  type StorageProvider,
} from '../_shared/storage.ts';
import { cognomeOrRagione, sanitizeFolderSegment, todayIsoEuropeRome } from '../_shared/sanitize.ts';

interface ClienteNew {
  ragione_sociale: string;
  tipo?: 'persona_fisica' | 'azienda';
  partita_iva?: string;
  codice_fiscale?: string;
  indirizzo?: string;
  citta?: string;
  cap?: string;
  provincia?: string;
  telefoni?: string[];
  email?: string[];
  note?: string;
}

export interface CreateCommessaRequest {
  clienteId?: string;
  clienteNew?: ClienteNew;
  voci: number[]; // tipicamente le voci B selezionate; A sono aggiunte d'ufficio
  descrizioneFinale: string;
  indirizzoCantiere?: string;
  note?: string;
  presetId?: string;
  /** Opzionale: ticket di origine (usato da convert-ticket). */
  ticketId?: string;
}

const ALLOWED_ROLES = new Set(['owner', 'admin', 'office', 'capo']);

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');

  let authHeader: string | null;
  let ctx;
  try {
    authHeader = req.headers.get('Authorization');
    const sb = userClient(authHeader);
    ctx = await resolveJwtContext(sb);
  } catch {
    return errorResponse(401, 'Missing Authorization');
  }
  if (!ctx) return errorResponse(401, 'Unauthenticated');
  if (!ALLOWED_ROLES.has(ctx.role)) {
    return errorResponse(403, `Role ${ctx.role} cannot create commesse`);
  }

  let body: CreateCommessaRequest;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, 'Invalid JSON body');
  }
  if (!body.descrizioneFinale || typeof body.descrizioneFinale !== 'string') {
    return errorResponse(400, 'descrizioneFinale required');
  }
  if (!Array.isArray(body.voci)) body.voci = [];

  try {
    const result = await createCommessa(ctx, body);
    return jsonResponse(result, { headers: corsHeaders });
  } catch (e) {
    console.error('[create-commessa] failed', e);
    return errorResponse(500, 'create_commessa_failed', String(e));
  }
});

// ----------------------------------------------------------------------
// Logica core riusabile (chiamata anche da convert-ticket).
// ----------------------------------------------------------------------

export interface CreateCommessaResult {
  commessa: Record<string, unknown>;
  cloudFolderPath: string;
  codiceInterno: string;
  nomeCartella: string;
}

export async function createCommessa(
  ctx: { userId: string; tenantId: string; tenantSlug: string; role: string },
  body: CreateCommessaRequest,
): Promise<CreateCommessaResult> {
  const admin = serviceClient();

  // 1) Risolvi tenant info (slug + storage config) ------------------------
  const { data: tenant, error: terr } = await admin
    .from('tenants')
    .select('id,slug,storage_provider,storage_config')
    .eq('id', ctx.tenantId)
    .single();
  if (terr || !tenant) throw new Error(`Tenant lookup failed: ${terr?.message ?? 'not found'}`);

  // 2) Risolvi / crea cliente --------------------------------------------
  const cliente = await resolveCliente(admin, ctx.tenantId, body);

  // 3) Genera codice interno ---------------------------------------------
  const { data: codiceData, error: cerr } = await admin.rpc('genera_codice_commessa', {
    p_tenant_slug: tenant.slug,
  });
  if (cerr || !codiceData) throw new Error(`genera_codice_commessa failed: ${cerr?.message}`);
  const codiceInterno = String(codiceData);

  // 4) Build nome_cartella univoco ---------------------------------------
  const dataIso = todayIsoEuropeRome();
  const baseNome = [
    cognomeOrRagione({ ragione_sociale: cliente.ragione_sociale, tipo: cliente.tipo }),
    dataIso,
    sanitizeFolderSegment(body.descrizioneFinale),
  ]
    .filter(Boolean)
    .join('_');

  const nomeCartella = await uniqueFolderName(admin, ctx.tenantId, baseNome);

  // 5) Insert commessa ----------------------------------------------------
  const { data: commessa, error: ierr } = await admin
    .from('commesse')
    .insert({
      tenant_id: ctx.tenantId,
      cliente_id: cliente.id,
      codice_interno: codiceInterno,
      nome_cartella: nomeCartella,
      cliente_indirizzo_cantiere: body.indirizzoCantiere ?? null,
      descrizione_ai_finale: body.descrizioneFinale,
      stato: 'aperta',
      responsabile_id: ctx.userId,
      ticket_id: body.ticketId ?? null,
      preset_id: body.presetId ?? null,
      data_apertura: dataIso,
    })
    .select('*')
    .single();
  if (ierr || !commessa) throw new Error(`commesse insert failed: ${ierr?.message}`);

  // 6) Insert commessa_voci (A default + B selezionate, deduplicato) -----
  const { data: vociCat, error: verr } = await admin
    .from('voci_catalogo')
    .select('id,nome,cartella_template,"default"');
  if (verr || !vociCat) throw new Error(`voci_catalogo lookup failed: ${verr?.message}`);

  const selectedB = new Set(body.voci);
  const activeVoci = vociCat.filter(
    (v: { id: number; default: boolean }) => v.default || selectedB.has(v.id),
  );

  if (activeVoci.length > 0) {
    const { error: vinsErr } = await admin.from('commessa_voci').insert(
      activeVoci.map((v: { id: number }) => ({
        commessa_id: commessa.id,
        voce_id: v.id,
        tenant_id: ctx.tenantId,
        stato: 'da_iniziare' as const,
      })),
    );
    if (vinsErr) throw new Error(`commessa_voci insert failed: ${vinsErr.message}`);
  }

  // 7) Provisioning cartelle cloud ---------------------------------------
  const storage: StorageProvider = buildStorageProvider({
    storage_provider: tenant.storage_provider,
    storage_config: (tenant.storage_config ?? {}) as Record<string, unknown>,
  });

  const rootPath = nomeCartella; // path relativo nel bucket o nella root WebDAV del tenant
  const extraFolders = extraFoldersFromTemplates(
    activeVoci.map((v: { cartella_template: string | null }) => v.cartella_template),
  );
  const fullTree = [...SCAFFOLD_TREE, ...extraFolders];

  try {
    await storage.createFolderTree(rootPath, fullTree);
  } catch (e) {
    // Compensa: log + audit, ma non rollback (le righe DB sono valide,
    // l'admin può ripetere il provisioning con una funzione di repair).
    console.error('[create-commessa] storage provisioning failed', e);
    await admin.from('audit_events').insert({
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.userId,
      actor_role: ctx.role,
      entity_type: 'commessa',
      entity_id: commessa.id,
      action: 'storage_provision_failed',
      metadata: { error: String(e), provider: storage.name },
    });
  }

  // 8) Salva cloud_folder_path ------------------------------------------
  const cloudFolderPath = rootPath;
  await admin
    .from('commesse')
    .update({ cloud_folder_path: cloudFolderPath })
    .eq('id', commessa.id);

  // 9) Audit ------------------------------------------------------------
  await admin.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'commessa',
    entity_id: commessa.id,
    action: 'create',
    after_data: {
      codice_interno: codiceInterno,
      nome_cartella: nomeCartella,
      voci: activeVoci.map((v: { id: number }) => v.id),
      cliente_id: cliente.id,
      provider: storage.name,
    },
  });

  return {
    commessa: { ...commessa, cloud_folder_path: cloudFolderPath },
    cloudFolderPath,
    codiceInterno,
    nomeCartella,
  };
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
async function resolveCliente(admin: any, tenantId: string, body: CreateCommessaRequest) {
  if (body.clienteId) {
    const { data, error } = await admin
      .from('clienti')
      .select('*')
      .eq('id', body.clienteId)
      .eq('tenant_id', tenantId)
      .single();
    if (error || !data) throw new Error(`Cliente ${body.clienteId} non trovato`);
    return data;
  }

  if (!body.clienteNew?.ragione_sociale) {
    throw new Error('clienteId o clienteNew.ragione_sociale richiesto');
  }
  const c = body.clienteNew;

  // Matching: prova prima per email/telefono (più affidabili), poi ragione sociale esatta.
  const emails = (c.email ?? []).filter(Boolean);
  const phones = (c.telefoni ?? []).filter(Boolean);

  if (emails.length || phones.length) {
    const orFilters: string[] = [];
    if (emails.length) orFilters.push(`email.ov.{${emails.join(',')}}`);
    if (phones.length) orFilters.push(`telefoni.ov.{${phones.join(',')}}`);
    const { data: existing } = await admin
      .from('clienti')
      .select('*')
      .eq('tenant_id', tenantId)
      .or(orFilters.join(','))
      .limit(1);
    if (existing && existing.length > 0) return existing[0];
  }

  // Match esatto su ragione sociale (case-insensitive)
  const { data: byName } = await admin
    .from('clienti')
    .select('*')
    .eq('tenant_id', tenantId)
    .ilike('ragione_sociale', c.ragione_sociale)
    .limit(1);
  if (byName && byName.length > 0) return byName[0];

  // Nuovo cliente
  const { data: created, error: cerr } = await admin
    .from('clienti')
    .insert({
      tenant_id: tenantId,
      ragione_sociale: c.ragione_sociale,
      tipo: c.tipo ?? 'persona_fisica',
      partita_iva: c.partita_iva ?? null,
      codice_fiscale: c.codice_fiscale ?? null,
      indirizzo: c.indirizzo ?? null,
      citta: c.citta ?? null,
      cap: c.cap ?? null,
      provincia: c.provincia ?? null,
      telefoni: phones,
      email: emails,
      note: c.note ?? null,
    })
    .select('*')
    .single();
  if (cerr || !created) throw new Error(`clienti insert failed: ${cerr?.message}`);
  return created;
}

// deno-lint-ignore no-explicit-any
async function uniqueFolderName(admin: any, tenantId: string, base: string): Promise<string> {
  let candidate = base;
  for (let i = 2; i < 50; i++) {
    const { data } = await admin
      .from('commesse')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('nome_cartella', candidate)
      .limit(1);
    if (!data || data.length === 0) return candidate;
    candidate = `${base}_${i}`;
  }
  throw new Error(`Impossibile generare un nome cartella univoco per "${base}"`);
}
