'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { waitUntil } from '@vercel/functions';
import { z } from 'zod';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import type { AppRole } from '@kommessa/api';
import {
  CODICI_PERMESSO,
  numeroAttestatoObbligatorio,
  tipoPermesso,
} from '@kommessa/api/permessi-tipi';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
} from '@kommessa/integrations/storage';

import { tenantHasModule } from '@/app/_lib/modules';
import { leggiConfigDipendenti } from '@/app/_lib/dipendenti-config';
import { PALETTE_GRUPPI } from '@/app/_lib/palette-gruppi';
import { auditTenant } from '@/app/_actions/_lib/audit';
import { inviaPushAUtente } from '@/lib/push';

/**
 * Server actions di Ferie e permessi (modulo Dipendenti, sotto-flag ferie_attiva).
 * Le mutazioni usano service-role con guardie esplicite (richiedente / approvatore
 * / office). Le tabelle non sono nei tipi generati → `as never`.
 */

const OFFICE = new Set<AppRole>(['admin', 'office']);
const PATH_PERMESSI = '/office/personale/permessi';
const PATH_GRUPPI = '/office/personale/gruppi';
const PATH_TIPI = '/office/personale/tipi-permesso';

type Ok = { ok: true } | { ok: false; error: string };

async function requireFerieContext() {
  const ctx = await requireTenantContext();
  if (!(await tenantHasModule('dipendenti'))) throw new Error('Modulo Dipendenti non attivo');
  const cfg = await leggiConfigDipendenti(createServerSupabase(), ctx.tenantId);
  if (!cfg.ferieAttiva) throw new Error('Ferie e permessi non attivi per questo tenant');
  return ctx;
}

// =====================================================================
// GRUPPI DI APPROVAZIONE (solo office/admin)
// =====================================================================

const GruppoSchema = z.object({
  nome: z.string().trim().min(1, 'Nome obbligatorio').max(120),
  approverUserId: z.string().uuid().nullable().optional(),
  colore: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export async function creaGruppo(input: unknown): Promise<Ok> {
  const parsed = GruppoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  let ctx;
  try {
    ctx = await requireFerieContext();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!OFFICE.has(ctx.role)) return { ok: false, error: 'Solo admin/office' };
  const svc = createServiceSupabase();
  // Colore: quello passato o il prossimo della palette (per numero di gruppi).
  let colore = parsed.data.colore ?? null;
  if (!colore) {
    const { count } = await svc
      .from('gruppi_approvazione' as never)
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId);
    colore = PALETTE_GRUPPI[(count ?? 0) % PALETTE_GRUPPI.length] ?? PALETTE_GRUPPI[0]!;
  }
  const { error } = await svc.from('gruppi_approvazione' as never).insert({
    tenant_id: ctx.tenantId,
    nome: parsed.data.nome,
    approver_user_id: parsed.data.approverUserId ?? null,
    colore,
    note: parsed.data.note ?? null,
  } as never);
  if (error) return { ok: false, error: error.message };
  await auditTenant(createServerSupabase(), {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'gruppo_approvazione',
    action: 'gruppo.crea',
    after: { nome: parsed.data.nome },
  });
  revalidatePath(PATH_GRUPPI);
  return { ok: true };
}

const AggiornaGruppoSchema = GruppoSchema.partial().extend({ id: z.string().uuid() });

export async function aggiornaGruppo(input: unknown): Promise<Ok> {
  const parsed = AggiornaGruppoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  let ctx;
  try {
    ctx = await requireFerieContext();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!OFFICE.has(ctx.role)) return { ok: false, error: 'Solo admin/office' };
  const svc = createServiceSupabase();
  const patch: Record<string, unknown> = {};
  if (parsed.data.nome !== undefined) patch.nome = parsed.data.nome;
  if (parsed.data.approverUserId !== undefined) patch.approver_user_id = parsed.data.approverUserId;
  if (parsed.data.colore !== undefined) patch.colore = parsed.data.colore;
  if (parsed.data.note !== undefined) patch.note = parsed.data.note;
  const { error } = await svc
    .from('gruppi_approvazione' as never)
    .update(patch as never)
    .eq('id', parsed.data.id)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH_GRUPPI);
  return { ok: true };
}

export async function eliminaGruppo(id: string): Promise<Ok> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'ID non valido' };
  let ctx;
  try {
    ctx = await requireFerieContext();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!OFFICE.has(ctx.role)) return { ok: false, error: 'Solo admin/office' };
  const svc = createServiceSupabase();
  const { error } = await svc
    .from('gruppi_approvazione' as never)
    .delete()
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  await auditTenant(createServerSupabase(), {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'gruppo_approvazione',
    entityId: id,
    action: 'gruppo.elimina',
  });
  revalidatePath(PATH_GRUPPI);
  return { ok: true };
}

const MembriSchema = z.object({
  gruppoId: z.string().uuid(),
  dipendentiIds: z.array(z.string().uuid()).default([]),
});

/** Imposta i membri di un gruppo (sostituisce). Un dipendente sta in un solo
 *  gruppo: viene "spostato" (rimosso da eventuali altri gruppi). */
export async function impostaMembriGruppo(input: unknown): Promise<Ok> {
  const parsed = MembriSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  let ctx;
  try {
    ctx = await requireFerieContext();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!OFFICE.has(ctx.role)) return { ok: false, error: 'Solo admin/office' };
  const svc = createServiceSupabase();
  // Il gruppo dev'essere di chi sta scrivendo. Senza questo controllo si
  // potevano agganciare i propri dipendenti al gruppo di un altro cliente: le
  // loro richieste sarebbero poi finite all'approvatore di quell'altro, che
  // avrebbe ricevuto la notifica push con nome, tipo di assenza e date di una
  // persona che non e' sua.
  const { data: gruppo } = await svc
    .from('gruppi_approvazione' as never)
    .select('id')
    .eq('id', parsed.data.gruppoId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (!gruppo) return { ok: false, error: 'Gruppo non valido' };
  // svuota il gruppo
  await svc
    .from('gruppo_membri' as never)
    .delete()
    .eq('tenant_id', ctx.tenantId)
    .eq('gruppo_id', parsed.data.gruppoId);
  if (parsed.data.dipendentiIds.length > 0) {
    // togli i dipendenti scelti da eventuali altri gruppi (vincolo 1-gruppo)
    await svc
      .from('gruppo_membri' as never)
      .delete()
      .eq('tenant_id', ctx.tenantId)
      .in('dipendente_id', parsed.data.dipendentiIds);
    const { error } = await svc.from('gruppo_membri' as never).insert(
      parsed.data.dipendentiIds.map((d) => ({
        gruppo_id: parsed.data.gruppoId,
        dipendente_id: d,
        tenant_id: ctx.tenantId,
      })) as never,
    );
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath(PATH_GRUPPI);
  return { ok: true };
}

const ApprovatoreSchema = z.object({ userId: z.string().uuid(), value: z.boolean() });

/** Concede/revoca la capacità "approva permessi" a un utente del tenant. */
export async function toggleApprovatore(input: unknown): Promise<Ok> {
  const parsed = ApprovatoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  let ctx;
  try {
    ctx = await requireFerieContext();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!OFFICE.has(ctx.role)) return { ok: false, error: 'Solo admin/office' };
  const svc = createServiceSupabase();
  // scoping: l'utente deve essere dello stesso tenant
  const { error } = await svc
    .from('users')
    .update({ puo_approvare_permessi: parsed.data.value } as never)
    .eq('id', parsed.data.userId)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  await auditTenant(createServerSupabase(), {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'user',
    entityId: parsed.data.userId,
    action: 'permessi.approvatore.toggle',
    after: { puo_approvare_permessi: parsed.data.value },
  });
  revalidatePath(PATH_GRUPPI);
  return { ok: true };
}

// =====================================================================
// TIPI PERMESSO ATTIVI (quali mostrare ai dipendenti)
// =====================================================================

const TipiAttiviSchema = z.object({
  codici: z.array(z.enum(CODICI_PERMESSO as [string, ...string[]])).max(50),
});

/** Imposta i tipi di permesso mostrati ai dipendenti (config del modulo). */
export async function aggiornaTipiPermessoAttivi(input: unknown): Promise<Ok> {
  const parsed = TipiAttiviSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  let ctx;
  try {
    ctx = await requireFerieContext();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!OFFICE.has(ctx.role)) return { ok: false, error: 'Solo admin/office' };
  const svc = createServiceSupabase();
  const { data: row } = await svc
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', ctx.tenantId)
    .eq('module_code', 'dipendenti')
    .maybeSingle();
  if (!row) return { ok: false, error: 'Modulo Dipendenti non attivo' };
  const existing = ((row as { config: Record<string, unknown> | null }).config) ?? {};
  const newConfig = { ...existing, permesso_tipi_attivi: parsed.data.codici };
  const { error } = await svc
    .from('tenant_modules' as never)
    .update({ config: newConfig } as never)
    .eq('tenant_id', ctx.tenantId)
    .eq('module_code', 'dipendenti');
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH_TIPI);
  revalidatePath('/mobile/permessi');
  return { ok: true };
}

// =====================================================================
// TIPI PERMESSO PERSONALIZZATI (creati dall'ufficio)
// =====================================================================

function slugCustom(label: string): string {
  const base = label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return 'custom_' + (base || 'tipo');
}

const TipoCustomSchema = z.object({
  label: z.string().trim().min(2, 'Nome troppo corto').max(60),
  unita: z.enum(['giorni', 'ore', 'entrambi']),
  oreDefault: z.number().min(0.5).max(24).nullable().optional(),
  /** Se l'azienda vuole un documento a giustificare questo tipo di assenza. */
  richiedeGiustificativo: z.boolean().optional(),
});

/** Crea un tipo di permesso personalizzato del tenant (config). */
export async function creaTipoPermessoCustom(input: unknown): Promise<Ok> {
  const parsed = TipoCustomSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  let ctx;
  try {
    ctx = await requireFerieContext();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!OFFICE.has(ctx.role)) return { ok: false, error: 'Solo admin/office' };
  const svc = createServiceSupabase();
  const { data: row } = await svc
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', ctx.tenantId)
    .eq('module_code', 'dipendenti')
    .maybeSingle();
  if (!row) return { ok: false, error: 'Modulo Dipendenti non attivo' };
  const existing = ((row as { config: Record<string, unknown> | null }).config) ?? {};
  const list = Array.isArray(existing['permesso_tipi_custom'])
    ? (existing['permesso_tipi_custom'] as { codice?: string }[])
    : [];
  // codice univoco
  let codice = slugCustom(parsed.data.label);
  const usati = new Set(list.map((t) => t.codice));
  if (usati.has(codice)) {
    let n = 2;
    while (usati.has(`${codice}_${n}`)) n++;
    codice = `${codice}_${n}`;
  }
  const nuovo = {
    codice,
    label: parsed.data.label,
    unita: parsed.data.unita,
    oreDefault: parsed.data.unita === 'ore' ? parsed.data.oreDefault ?? null : null,
    richiedeGiustificativo: parsed.data.richiedeGiustificativo === true,
  };
  const newConfig = { ...existing, permesso_tipi_custom: [...list, nuovo] };
  const { error } = await svc
    .from('tenant_modules' as never)
    .update({ config: newConfig } as never)
    .eq('tenant_id', ctx.tenantId)
    .eq('module_code', 'dipendenti');
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH_TIPI);
  revalidatePath('/office/impostazioni/personale');
  revalidatePath('/mobile/permessi');
  return { ok: true };
}

/** Elimina un tipo di permesso personalizzato. */
export async function eliminaTipoPermessoCustom(codice: string): Promise<Ok> {
  if (!codice || typeof codice !== 'string') return { ok: false, error: 'Codice non valido' };
  let ctx;
  try {
    ctx = await requireFerieContext();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!OFFICE.has(ctx.role)) return { ok: false, error: 'Solo admin/office' };
  const svc = createServiceSupabase();
  const { data: row } = await svc
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', ctx.tenantId)
    .eq('module_code', 'dipendenti')
    .maybeSingle();
  if (!row) return { ok: false, error: 'Modulo Dipendenti non attivo' };
  const existing = ((row as { config: Record<string, unknown> | null }).config) ?? {};
  const list = Array.isArray(existing['permesso_tipi_custom'])
    ? (existing['permesso_tipi_custom'] as { codice?: string }[])
    : [];

  // Togliere un tipo ancora in uso lo farebbe sparire dalle assenze che lo
  // portano: l'elenco mostrerebbe il codice grezzo al posto del nome, e la
  // pastiglia del giustificativo svanirebbe anche dove un documento c'e' gia'
  // — restando l'unico modo per raggiungerlo. Stesso principio delle causali
  // paghe, che non si tolgono finche' qualcuno le usa.
  const { count } = await svc
    .from('permesso_richieste' as never)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('tipo', codice);
  if ((count ?? 0) > 0) {
    const quante = count ?? 0;
    return {
      ok: false,
      error: `Questo tipo è usato da ${quante} ${quante === 1 ? 'assenza' : 'assenze'}: toglierlo le lascerebbe senza nome e senza giustificativo. Prima cambia il tipo a quelle assenze.`,
    };
  }

  const newConfig = {
    ...existing,
    permesso_tipi_custom: list.filter((t) => t.codice !== codice),
  };
  const { error } = await svc
    .from('tenant_modules' as never)
    .update({ config: newConfig } as never)
    .eq('tenant_id', ctx.tenantId)
    .eq('module_code', 'dipendenti');
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH_TIPI);
  revalidatePath('/office/impostazioni/personale');
  revalidatePath('/mobile/permessi');
  return { ok: true };
}

// =====================================================================
// RICHIESTE
// =====================================================================

const RichiestaSchema = z
  .object({
    dipendenteId: z.string().uuid(),
    // Accetta built-in e tipi personalizzati (slug); la UI offre solo tipi validi.
    tipo: z.string().trim().min(1).max(60),
    dataInizio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dataFine: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    tuttoIlGiorno: z.boolean().default(true),
    oraInizio: z.string().optional().nullable(),
    oraFine: z.string().optional().nullable(),
    motivo: z.string().trim().max(1000).optional().nullable(),
  })
  .refine((d) => d.dataFine >= d.dataInizio, { message: 'La data di fine deve essere ≥ inizio' });

/** Crea una richiesta. Requester = il dipendente stesso (mobile) oppure
 *  office/admin per conto suo. La richiesta è instradata all'approvatore del
 *  gruppo del dipendente. */
export async function richiediPermesso(
  input: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = RichiestaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  const ctx = await requireTenantContext();
  if (!(await tenantHasModule('dipendenti'))) return { ok: false, error: 'Modulo non attivo' };
  if (!(await leggiConfigDipendenti(createServerSupabase(), ctx.tenantId)).ferieAttiva) {
    return { ok: false, error: 'Ferie e permessi non attivi' };
  }

  const svc = createServiceSupabase();
  const d = parsed.data;

  // Autorizzazione: office/admin possono per chiunque; altrimenti solo per sé.
  if (!OFFICE.has(ctx.role)) {
    const { data: mio } = await svc
      .from('dipendenti' as never)
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('user_id', ctx.userId)
      .maybeSingle();
    const mioId = (mio as { id: string } | null)?.id ?? null;
    if (!mioId || mioId !== d.dipendenteId) {
      return { ok: false, error: 'Puoi richiedere solo per te stesso' };
    }
  }

  const oraria = !d.tuttoIlGiorno;
  if (oraria && (!d.oraInizio || !d.oraFine)) {
    return { ok: false, error: 'Indica ora di inizio e fine' };
  }
  if (oraria && d.dataInizio !== d.dataFine) {
    return { ok: false, error: 'Un permesso a ore riguarda un solo giorno' };
  }

  // Il dipendente dev'essere di questo cliente. Il ramo office accettava un id
  // qualunque: con quello di un'altra azienda nasceva una richiesta del tenant
  // A puntata a una persona di B, e alla decisione partiva la notifica push al
  // dipendente dell'altro cliente. `registraAssenzaUfficio` lo controlla gia'.
  const { data: dipRow } = await svc
    .from('dipendenti' as never)
    .select('id, tenant_id')
    .eq('id', d.dipendenteId)
    .maybeSingle();
  if ((dipRow as { tenant_id: string } | null)?.tenant_id !== ctx.tenantId) {
    return { ok: false, error: 'Dipendente non valido' };
  }

  // Risolvi gruppo → approvatore del dipendente.
  const { data: mem } = await svc
    .from('gruppo_membri' as never)
    .select('gruppo_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('dipendente_id', d.dipendenteId)
    .maybeSingle();
  const gruppoId = (mem as { gruppo_id: string } | null)?.gruppo_id ?? null;
  let approverUserId: string | null = null;
  if (gruppoId) {
    const { data: grp } = await svc
      .from('gruppi_approvazione' as never)
      .select('approver_user_id')
      .eq('id', gruppoId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();
    approverUserId = (grp as { approver_user_id: string | null } | null)?.approver_user_id ?? null;
  }

  const { data: row, error } = await svc
    .from('permesso_richieste' as never)
    .insert({
      tenant_id: ctx.tenantId,
      dipendente_id: d.dipendenteId,
      tipo: d.tipo,
      data_inizio: d.dataInizio,
      data_fine: d.dataFine,
      tutto_il_giorno: d.tuttoIlGiorno,
      ora_inizio: oraria ? d.oraInizio : null,
      ora_fine: oraria ? d.oraFine : null,
      motivo: d.motivo?.trim() || null,
      stato: 'in_attesa',
      gruppo_id: gruppoId,
      approver_user_id: approverUserId,
      creato_da: ctx.userId,
    } as never)
    .select('id')
    .single();
  if (error || !row) return { ok: false, error: error?.message ?? 'Richiesta non creata' };

  // Notifica l'approvatore (se assegnato).
  if (approverUserId) {
    const tipoLabel = tipoPermesso(d.tipo)?.label ?? d.tipo;
    const { data: dip } = await svc
      .from('dipendenti' as never)
      .select('nome, cognome')
      .eq('id', d.dipendenteId)
      .maybeSingle();
    const nome = dip ? `${(dip as { cognome: string }).cognome} ${(dip as { nome: string }).nome}` : 'Un dipendente';
    const title = 'Nuova richiesta permesso';
    const body = `${nome} · ${tipoLabel} · ${fmtRange(d.dataInizio, d.dataFine)}`;
    const url = '/office/personale/permessi';
    const { error: eNotifica } = await svc.from('notifiche' as never).insert({
      tenant_id: ctx.tenantId,
      user_id: approverUserId,
      type: 'permesso_richiesto',
      payload: { title, body, url },
    } as never);
    if (eNotifica) console.error('[ferie-permessi] notifica non registrata:', eNotifica.message);
    // Senza waitUntil la function si ferma dopo la risposta e il push si perde.
    waitUntil(
      inviaPushAUtente(svc as never, approverUserId, { title, body, url }).catch((e) =>
        console.error('[ferie-permessi] push non inviato:', e),
      ),
    );
  }

  revalidatePath(PATH_PERMESSI);
  revalidatePath('/mobile/permessi');
  // L'id torna al chiamante: serve a chi, nello stesso gesto, allega subito il
  // certificato all'assenza appena creata.
  return { ok: true, id: (row as unknown as { id: string }).id };
}

const DecisioneSchema = z.object({
  id: z.string().uuid(),
  esito: z.enum(['approvato', 'rifiutato', 'modifica_richiesta']),
  nota: z.string().trim().max(1000).optional().nullable(),
});

/** Decide una richiesta. Autorizzato: admin/office, oppure l'approvatore
 *  instradato (approver_user_id) con capacità puo_approvare_permessi. */
export async function decidiPermesso(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = DecisioneSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  const ctx = await requireTenantContext();
  if (!(await tenantHasModule('dipendenti'))) return { ok: false, error: 'Modulo non attivo' };
  if (!(await leggiConfigDipendenti(createServerSupabase(), ctx.tenantId)).ferieAttiva) {
    return { ok: false, error: 'Ferie e permessi non attivi' };
  }
  const svc = createServiceSupabase();

  const { data: rich } = await svc
    .from('permesso_richieste' as never)
    .select('id, tenant_id, dipendente_id, approver_user_id, tipo, data_inizio, data_fine, stato')
    .eq('id', parsed.data.id)
    .maybeSingle();
  const r = rich as {
    tenant_id: string;
    dipendente_id: string;
    approver_user_id: string | null;
    tipo: string;
    data_inizio: string;
    data_fine: string;
  } | null;
  if (!r || r.tenant_id !== ctx.tenantId) return { ok: false, error: 'Richiesta non trovata' };

  // Autorizzazione
  let autorizzato = OFFICE.has(ctx.role);
  if (!autorizzato && r.approver_user_id === ctx.userId) {
    const { data: u } = await svc
      .from('users')
      .select('puo_approvare_permessi')
      .eq('id', ctx.userId)
      .maybeSingle();
    autorizzato = (u as { puo_approvare_permessi?: boolean } | null)?.puo_approvare_permessi === true;
  }
  if (!autorizzato) return { ok: false, error: 'Non sei autorizzato ad approvare questa richiesta' };

  const { error } = await svc
    .from('permesso_richieste' as never)
    .update({
      stato: parsed.data.esito,
      deciso_da: ctx.userId,
      deciso_at: new Date().toISOString(),
      decisione_nota: parsed.data.nota?.trim() || null,
    } as never)
    .eq('id', parsed.data.id)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };

  // Chi ha deciso resta su `deciso_da`, ma senza un evento non si puo' cercare
  // «tutte le decisioni del mese» ne' sapere da quale stato si e' partiti.
  await auditTenant(svc, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'permesso_richiesta',
    entityId: parsed.data.id,
    action: 'permesso.decisione',
    after: { stato: parsed.data.esito, nota: parsed.data.nota?.trim() || null },
    metadata: {
      dipendenteId: r.dipendente_id,
      tipo: r.tipo,
      dal: r.data_inizio,
      al: r.data_fine,
    },
  });

  // Notifica il richiedente (dipendente.user_id).
  const { data: dip } = await svc
    .from('dipendenti' as never)
    .select('user_id')
    .eq('id', r.dipendente_id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  const targetUser = (dip as { user_id: string | null } | null)?.user_id ?? null;
  if (targetUser) {
    const esitoLabel =
      parsed.data.esito === 'approvato'
        ? 'approvata'
        : parsed.data.esito === 'rifiutato'
          ? 'rifiutata'
          : 'da modificare';
    const title = 'Esito richiesta permesso';
    const body = `La tua richiesta (${tipoPermesso(r.tipo)?.label ?? r.tipo}) è ${esitoLabel}.`;
    const url = '/mobile/permessi';
    const { error: eNotifica } = await svc.from('notifiche' as never).insert({
      tenant_id: ctx.tenantId,
      user_id: targetUser,
      type: 'permesso_esito',
      payload: { title, body, url },
    } as never);
    if (eNotifica) console.error('[ferie-permessi] notifica non registrata:', eNotifica.message);
    waitUntil(
      inviaPushAUtente(svc as never, targetUser, { title, body, url }).catch((e) =>
        console.error('[ferie-permessi] push non inviato:', e),
      ),
    );
  }

  revalidatePath(PATH_PERMESSI);
  revalidatePath('/mobile/permessi');
  return { ok: true };
}

/** Annulla una richiesta ancora in attesa (richiedente stesso o office). */
export async function annullaRichiesta(id: string): Promise<Ok> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'ID non valido' };
  const ctx = await requireTenantContext();
  if (!(await tenantHasModule('dipendenti'))) return { ok: false, error: 'Modulo non attivo' };
  if (!(await leggiConfigDipendenti(createServerSupabase(), ctx.tenantId)).ferieAttiva) {
    return { ok: false, error: 'Ferie e permessi non attivi' };
  }
  const svc = createServiceSupabase();
  const { data: rich } = await svc
    .from('permesso_richieste' as never)
    .select('tenant_id, dipendente_id, stato')
    .eq('id', id)
    .maybeSingle();
  const r = rich as { tenant_id: string; dipendente_id: string; stato: string } | null;
  if (!r || r.tenant_id !== ctx.tenantId) return { ok: false, error: 'Richiesta non trovata' };
  if (r.stato !== 'in_attesa') return { ok: false, error: 'Solo le richieste in attesa si annullano' };
  if (!OFFICE.has(ctx.role)) {
    const { data: mio } = await svc
      .from('dipendenti' as never)
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('user_id', ctx.userId)
      .maybeSingle();
    if ((mio as { id: string } | null)?.id !== r.dipendente_id) {
      return { ok: false, error: 'Non autorizzato' };
    }
  }

  // Il giustificativo se ne va con l'assenza: vedi `eliminaGiustificativiDi`
  // per il perche' lasciarlo indietro sarebbe peggio che cancellarlo.
  await eliminaGiustificativiDi(svc, ctx.tenantId, id);

  const { error } = await svc
    .from('permesso_richieste' as never)
    .delete()
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  // ⚠️ Questa e' una cancellazione FISICA: senza evento, di una richiesta
  // annullata non resta assolutamente niente, nemmeno che sia esistita.
  await auditTenant(svc, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'permesso_richiesta',
    entityId: id,
    action: 'permesso.annulla',
    before: { dipendenteId: r.dipendente_id, stato: r.stato },
  });
  revalidatePath(PATH_PERMESSI);
  revalidatePath('/mobile/permessi');
  return { ok: true };
}

function fmtRange(inizio: string, fine: string): string {
  const f = (iso: string) => {
    const [Y, M, D] = iso.split('-').map(Number);
    return new Date(Date.UTC(Y!, M! - 1, D!)).toLocaleDateString('it-IT', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Europe/Rome',
    });
  };
  return inizio === fine ? f(inizio) : `${f(inizio)} - ${f(fine)}`;
}

// =====================================================================
// ASSENZE REGISTRATE DALL'UFFICIO
// =====================================================================

/**
 * L'ufficio registra un'assenza gia' avvenuta, tipicamente una malattia.
 *
 * **Non e' una richiesta.** Quando l'ufficio mette qualcuno in malattia sta
 * prendendo atto di un fatto, non chiedendo un permesso a se stesso: farla
 * passare per «in attesa» vorrebbe dire approvare la propria scrittura un
 * minuto dopo averla fatta. Nasce quindi gia' approvata, con l'ufficio come
 * decisore. Se invece e' il tecnico a chiedere, resta il percorso di sempre
 * (`richiediPermesso` → in attesa → `decidiPermesso`).
 *
 * La persona viene avvisata lo stesso: e' la sua assenza, deve poterla vedere
 * e dire se c'e' un errore.
 */
export async function registraAssenzaUfficio(
  input: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = RichiestaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  }
  let ctx;
  try {
    ctx = await requireFerieContext();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!OFFICE.has(ctx.role)) return { ok: false, error: 'Solo admin/office' };

  const d = parsed.data;
  const oraria = !d.tuttoIlGiorno;
  if (oraria && (!d.oraInizio || !d.oraFine)) {
    return { ok: false, error: 'Indica ora di inizio e fine' };
  }
  if (oraria && d.dataInizio !== d.dataFine) {
    return { ok: false, error: 'Un permesso a ore riguarda un solo giorno' };
  }

  const svc = createServiceSupabase();
  const { data: dipRow } = await svc
    .from('dipendenti' as never)
    .select('id, tenant_id, user_id, nome, cognome')
    .eq('id', d.dipendenteId)
    .maybeSingle();
  const dip = dipRow as {
    tenant_id: string;
    user_id: string | null;
    nome: string;
    cognome: string;
  } | null;
  if (!dip || dip.tenant_id !== ctx.tenantId) {
    return { ok: false, error: 'Dipendente non valido' };
  }

  // Il gruppo si registra lo stesso, anche se qui nessuno deve approvare:
  // serve a ritrovare l'assenza nei conteggi per reparto.
  const { data: mem } = await svc
    .from('gruppo_membri' as never)
    .select('gruppo_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('dipendente_id', d.dipendenteId)
    .maybeSingle();

  const adesso = new Date().toISOString();
  const { data: row, error } = await svc
    .from('permesso_richieste' as never)
    .insert({
      tenant_id: ctx.tenantId,
      dipendente_id: d.dipendenteId,
      tipo: d.tipo,
      data_inizio: d.dataInizio,
      data_fine: d.dataFine,
      tutto_il_giorno: d.tuttoIlGiorno,
      ora_inizio: oraria ? d.oraInizio : null,
      ora_fine: oraria ? d.oraFine : null,
      motivo: d.motivo?.trim() || null,
      stato: 'approvato',
      gruppo_id: (mem as { gruppo_id: string } | null)?.gruppo_id ?? null,
      // Nessun approvatore esterno: l'ha scritta l'ufficio, e l'ufficio la firma.
      approver_user_id: null,
      creato_da: ctx.userId,
      deciso_da: ctx.userId,
      deciso_at: adesso,
      decisione_nota: 'Registrata dall’ufficio',
    } as never)
    .select('id')
    .single();
  if (error || !row) return { ok: false, error: error?.message ?? 'Assenza non registrata' };
  const id = (row as { id: string }).id;

  await auditTenant(svc, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'permesso_richiesta',
    entityId: id,
    action: 'permesso.registra_ufficio',
    after: { tipo: d.tipo, dal: d.dataInizio, al: d.dataFine, dipendente: d.dipendenteId },
  });

  if (dip.user_id) {
    const tipoLabel = tipoPermesso(d.tipo)?.label ?? d.tipo;
    const title = 'Assenza registrata';
    const body = `${tipoLabel} · ${fmtRange(d.dataInizio, d.dataFine)}. L'ha inserita l'ufficio.`;
    const url = '/mobile/permessi';
    const { error: eNotifica } = await svc.from('notifiche' as never).insert({
      tenant_id: ctx.tenantId,
      user_id: dip.user_id,
      type: 'permesso_esito',
      payload: { title, body, url },
    } as never);
    if (eNotifica) console.error('[ferie-permessi] notifica non registrata:', eNotifica.message);
    waitUntil(
      inviaPushAUtente(svc as never, dip.user_id, { title, body, url }).catch((e) =>
        console.error('[ferie-permessi] push non inviato:', e),
      ),
    );
  }

  revalidatePath(PATH_PERMESSI);
  revalidatePath('/mobile/permessi');
  return { ok: true, id };
}

// =====================================================================
// GIUSTIFICATIVI: numero dell'attestato + documento del medico
// =====================================================================
//
// Il documento vive in `paghe_certificati`. Il nome e' un'eredita': la tabella
// e' nata con l'export verso il consulente del lavoro, ma il certificato medico
// non e' roba di paghe — e' roba di chi gestisce le assenze, e deve funzionare
// anche per un cliente che l'export non ce l'ha. Qui sotto ci sono le azioni
// **generiche**, aperte a chiunque abbia il modulo Dipendenti; quelle in
// `office/_actions/paghe.ts` restano per la pagina dell'export.
// Rinominare la tabella si puo', ma le migrazioni le applica una persona a
// mano: farlo vorrebbe dire una finestra in cui il codice e' online e la
// tabella ha ancora il vecchio nome, e la pagina paghe si rompe.

/** Il magazzino documenti del cliente, con quello di piattaforma come ripiego. */
async function risolviR2(svc: ReturnType<typeof createServiceSupabase>, tenantId: string) {
  const { data } = await svc.from('tenants').select('r2_config').eq('id', tenantId).maybeSingle();
  return (
    getR2ProviderFromTenantConfig((data?.r2_config as Record<string, unknown> | null) ?? null) ??
    getR2ProviderFromEnv()
  );
}

/**
 * Toglie i giustificativi di un'assenza, documento archiviato compreso.
 *
 * Serve quando l'assenza sparisce. La chiave esterna e' `on delete set null`,
 * quindi senza questo la riga del certificato sopravviverebbe **scollegata**:
 * invisibile nella pagina (che li indicizza per assenza) e percio' non piu'
 * cancellabile, ma ancora pescabile dall'export, che in mancanza del
 * collegamento ripiega sulle date — e il PUC di un'assenza annullata finirebbe
 * sul record di un'altra assenza, nel file che va al consulente del lavoro.
 */
async function eliminaGiustificativiDi(
  svc: ReturnType<typeof createServiceSupabase>,
  tenantId: string,
  permessoId: string,
): Promise<void> {
  const { data } = await svc
    .from('paghe_certificati' as never)
    .select('id, r2_key')
    .eq('tenant_id', tenantId)
    .eq('permesso_id', permessoId);
  const righe = (data ?? []) as unknown as { id: string; r2_key: string | null }[];
  if (righe.length === 0) return;

  const { error } = await svc
    .from('paghe_certificati' as never)
    .delete()
    .eq('tenant_id', tenantId)
    .eq('permesso_id', permessoId);
  // Se la riga non se ne va, il file resta dov'e': meglio un documento in piu'
  // in archivio che una riga che punta a un file che non c'e'.
  if (error) return;

  const chiavi = righe.map((r) => r.r2_key).filter((k): k is string => !!k);
  if (chiavi.length === 0) return;
  const r2 = await risolviR2(svc, tenantId);
  for (const chiave of chiavi) await r2?.delete(chiave).catch(() => undefined);
}

/** Gli stessi limiti dell'allegato in area paghe: e' lo stesso documento. */
const GIUSTIFICATIVO_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
];
const GIUSTIFICATIVO_MAX_BYTE = 15 * 1024 * 1024;

const GiustificativoSchema = z.object({
  permessoId: z.string().uuid(),
  /** `P` attestato telematico (il PUC), `M` protocollo cartaceo, `C` codice fiscale. */
  tipoInfo: z.enum(['C', 'P', 'M']).default('P'),
  numero: z.string().trim().max(30).nullable().optional(),
  nota: z.string().trim().max(500).nullable().optional(),
});

/**
 * Salva il numero dell'attestato di un'assenza (per la malattia e' il PUC).
 *
 * Le date e la persona **non si prendono dal chiamante**: si leggono
 * dall'assenza a cui il giustificativo si aggancia. Un certificato con date
 * diverse da quelle dell'assenza non vuol dire niente, e lasciarle scrivere
 * dal browser sarebbe solo un modo per farle divergere.
 */
export async function salvaGiustificativo(
  input: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = GiustificativoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  }
  let ctx;
  try {
    ctx = await requireFerieContext();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!OFFICE.has(ctx.role)) return { ok: false, error: 'Solo admin/office' };

  const d = parsed.data;
  const svc = createServiceSupabase();
  const { data: richRow } = await svc
    .from('permesso_richieste' as never)
    .select('id, tenant_id, dipendente_id, tipo, data_inizio, data_fine')
    .eq('id', d.permessoId)
    .maybeSingle();
  const rich = richRow as {
    tenant_id: string;
    dipendente_id: string;
    tipo: string;
    data_inizio: string;
    data_fine: string;
  } | null;
  if (!rich || rich.tenant_id !== ctx.tenantId) {
    return { ok: false, error: 'Assenza non trovata' };
  }

  const numero = d.numero?.trim() || null;
  // Per la malattia il numero e' obbligatorio: senza, il consulente del lavoro
  // non chiude la busta e deve inseguirlo a mano. Non si inventa mai, quindi
  // l'unica strada e' chiederlo a chi ha il certificato davanti.
  if (!numero && numeroAttestatoObbligatorio(rich.tipo)) {
    return {
      ok: false,
      error:
        'Il numero dell’attestato è obbligatorio per la malattia. Se il certificato è cartaceo, scegli «Protocollo».',
    };
  }

  const riga = {
    tenant_id: ctx.tenantId,
    dipendente_id: rich.dipendente_id,
    permesso_id: d.permessoId,
    dal: rich.data_inizio,
    al: rich.data_fine,
    tipo_info: d.tipoInfo,
    numero,
    nota: d.nota?.trim() || null,
    creato_da: ctx.userId,
  };

  // Uno per assenza: se c'e' gia' si aggiorna, cosi' correggere un numero
  // sbagliato non lascia due attestati sullo stesso periodo.
  const { data: esistente } = await svc
    .from('paghe_certificati' as never)
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('permesso_id', d.permessoId)
    .maybeSingle();
  const idEsistente = (esistente as { id: string } | null)?.id ?? null;

  if (idEsistente) {
    const { error } = await svc
      .from('paghe_certificati' as never)
      .update(riga as never)
      .eq('id', idEsistente)
      .eq('tenant_id', ctx.tenantId);
    if (error) return { ok: false, error: error.message };
    await auditTenant(svc, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      entityType: 'permesso_giustificativo',
      entityId: idEsistente,
      action: 'permesso.giustificativo.modifica',
      after: { permessoId: d.permessoId, tipoInfo: d.tipoInfo, conNumero: Boolean(numero) },
    });
    revalidatePath(PATH_PERMESSI);
    return { ok: true, id: idEsistente };
  }

  const { data: creato, error } = await svc
    .from('paghe_certificati' as never)
    .insert(riga as never)
    .select('id')
    .single();
  if (error || !creato) return { ok: false, error: error?.message ?? 'Giustificativo non salvato' };
  const id = (creato as { id: string }).id;

  await auditTenant(svc, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'permesso_giustificativo',
    entityId: id,
    action: 'permesso.giustificativo.crea',
    after: { permessoId: d.permessoId, tipoInfo: d.tipoInfo, conNumero: Boolean(numero) },
  });

  revalidatePath(PATH_PERMESSI);
  return { ok: true, id };
}

/**
 * Archivia il documento del medico accanto al numero.
 *
 * Prima si scrive la riga, poi si carica il file: se la riga non si salva non
 * resta un documento su un archivio che nessuno guardera' mai, e se il file
 * non si carica il numero e' comunque al sicuro.
 */
export async function caricaGiustificativo(
  formData: FormData,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const giustificativoId = String(formData.get('giustificativoId') ?? '');
  if (!z.string().uuid().safeParse(giustificativoId).success) {
    return { ok: false, error: 'Giustificativo non valido' };
  }
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'File mancante' };
  if (file.size > GIUSTIFICATIVO_MAX_BYTE) return { ok: false, error: 'Il file supera i 15 MB' };
  if (!GIUSTIFICATIVO_MIME.includes(file.type)) {
    return { ok: false, error: 'Sono ammessi PDF e immagini' };
  }

  let ctx;
  try {
    ctx = await requireFerieContext();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!OFFICE.has(ctx.role)) return { ok: false, error: 'Solo admin/office' };

  const svc = createServiceSupabase();
  const { data: certRow } = await svc
    .from('paghe_certificati' as never)
    .select('id, tenant_id, dal, r2_key')
    .eq('id', giustificativoId)
    .maybeSingle();
  const cert = certRow as { tenant_id: string; dal: string; r2_key: string | null } | null;
  if (!cert || cert.tenant_id !== ctx.tenantId) {
    return { ok: false, error: 'Giustificativo non trovato' };
  }

  const { data: tenantRow } = await svc
    .from('tenants')
    .select('slug, r2_config')
    .eq('id', ctx.tenantId)
    .maybeSingle();
  const r2 =
    getR2ProviderFromTenantConfig(
      (tenantRow?.r2_config as Record<string, unknown> | null) ?? null,
    ) ?? getR2ProviderFromEnv();
  if (!r2) return { ok: false, error: 'Archivio documenti non configurato' };

  const nomeSicuro = (file.name || 'giustificativo')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(-80);
  const chiave = `tenants/${tenantRow?.slug ?? ctx.tenantSlug}/personale/giustificativi/${cert.dal.slice(0, 4)}/${giustificativoId}/${randomUUID().slice(0, 8)}_${nomeSicuro}`;

  try {
    await r2.putObject(chiave, Buffer.from(await file.arrayBuffer()), file.type);
  } catch {
    return { ok: false, error: 'Caricamento non riuscito, riprova' };
  }

  const { error } = await svc
    .from('paghe_certificati' as never)
    .update({
      r2_key: chiave,
      nome_file: file.name || nomeSicuro,
      mime: file.type,
      size_bytes: file.size,
    } as never)
    .eq('id', giustificativoId)
    .eq('tenant_id', ctx.tenantId);
  if (error) {
    // Niente file orfani in un archivio che nessuno guarda piu'.
    await r2.delete(chiave).catch(() => undefined);
    return { ok: false, error: error.message };
  }

  // Il popup offre «Sostituisci il documento», e la riga punta a uno solo:
  // senza questa cancellazione il certificato di prima resterebbe su R2 per
  // sempre, senza nessuna riga che lo indichi e nessuna schermata che lo
  // raggiunga. E' un documento sanitario, non un file qualunque: quando smette
  // di servire va tolto, non dimenticato.
  if (cert.r2_key && cert.r2_key !== chiave) {
    await r2.delete(cert.r2_key).catch(() => undefined);
  }

  await auditTenant(svc, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'permesso_giustificativo',
    entityId: giustificativoId,
    action: 'permesso.giustificativo.allegato',
    after: { nome: file.name, bytes: file.size, sostituito: Boolean(cert.r2_key) },
  });

  revalidatePath(PATH_PERMESSI);
  return { ok: true, id: giustificativoId };
}

/** Toglie numero e documento. Il file su R2 se ne va con la riga. */
export async function eliminaGiustificativo(id: string): Promise<Ok> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'ID non valido' };
  let ctx;
  try {
    ctx = await requireFerieContext();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!OFFICE.has(ctx.role)) return { ok: false, error: 'Solo admin/office' };

  const svc = createServiceSupabase();
  const { data: certRow } = await svc
    .from('paghe_certificati' as never)
    .select('id, tenant_id, r2_key, numero, permesso_id, dal, al')
    .eq('id', id)
    .maybeSingle();
  const cert = certRow as {
    tenant_id: string;
    r2_key: string | null;
    numero: string | null;
    permesso_id: string | null;
    dal: string;
    al: string;
  } | null;
  if (!cert || cert.tenant_id !== ctx.tenantId) {
    return { ok: false, error: 'Giustificativo non trovato' };
  }

  const { error } = await svc
    .from('paghe_certificati' as never)
    .delete()
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };

  if (cert.r2_key) {
    const r2 = await risolviR2(svc, ctx.tenantId);
    await r2?.delete(cert.r2_key).catch(() => undefined);
  }

  await auditTenant(svc, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'permesso_giustificativo',
    entityId: id,
    action: 'permesso.giustificativo.elimina',
    // Il numero NON si scrive nel registro: e' il dato del certificato medico,
    // e il registro lo legge anche il super admin di piattaforma. Serve sapere
    // che c'era, non quale fosse.
    before: {
      permessoId: cert.permesso_id,
      dal: cert.dal,
      al: cert.al,
      conNumero: Boolean(cert.numero),
      conAllegato: Boolean(cert.r2_key),
    },
  });

  revalidatePath(PATH_PERMESSI);
  return { ok: true };
}
