'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import type { AppRole } from '@kommessa/api';
import { CODICI_PERMESSO, tipoPermesso } from '@kommessa/api/permessi-tipi';

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
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = RichiestaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  const ctx = await requireTenantContext();
  if (!(await tenantHasModule('dipendenti'))) return { ok: false, error: 'Modulo non attivo' };

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
    await svc.from('notifiche' as never).insert({
      tenant_id: ctx.tenantId,
      user_id: approverUserId,
      type: 'permesso_richiesto',
      payload: { title, body, url },
    } as never);
    inviaPushAUtente(svc as never, approverUserId, { title, body, url }).catch(() => null);
  }

  revalidatePath(PATH_PERMESSI);
  revalidatePath('/mobile/permessi');
  return { ok: true };
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

  // Notifica il richiedente (dipendente.user_id).
  const { data: dip } = await svc
    .from('dipendenti' as never)
    .select('user_id')
    .eq('id', r.dipendente_id)
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
    await svc.from('notifiche' as never).insert({
      tenant_id: ctx.tenantId,
      user_id: targetUser,
      type: 'permesso_esito',
      payload: { title, body, url },
    } as never);
    inviaPushAUtente(svc as never, targetUser, { title, body, url }).catch(() => null);
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
  const { error } = await svc
    .from('permesso_richieste' as never)
    .delete()
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };
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
