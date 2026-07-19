'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import type { AppRole } from '@kommessa/api';
import {
  risolviFascia,
  normalizzaOra,
  intervalliSovrapposti,
  sovrapposizioniPerCandidato,
  giorniSettimana,
  addGiorni,
  type Fascia,
  type VoceOccupazione,
} from '@kommessa/api/pianificazione';
import { labelTipoPermesso } from '@kommessa/api/permessi-tipi';

import { tenantHasModule } from '@/app/_lib/modules';
import { leggiConfigDipendenti } from '@/app/_lib/dipendenti-config';
import { auditTenant } from '@/app/_actions/_lib/audit';
import { inviaPushAUtente } from '@/lib/push';
import {
  caricaBlocchiRange,
  caricaBloccoById,
  type BloccoView,
} from '@/app/office/personale/pianificazione/_lib/query';

/**
 * Server actions della Pianificazione settimanale (modulo Dipendenti).
 * Gated: admin/office + modulo `dipendenti` + sotto-flag `pianificazione_attiva`.
 * Le tabelle nuove non sono nei tipi generati → `as never` su `.from()`.
 */

const MANAGE_ROLES = new Set<AppRole>(['admin', 'office']);
const PATH = '/office/personale/pianificazione';

export type SalvaResult =
  | { ok: true }
  | { ok: false; error: string }
  | { ok: false; conflitti: string[] }; // conflitti "soft": ri-inviare con forza=true

async function guard() {
  const ctx = await requireTenantContext();
  if (!MANAGE_ROLES.has(ctx.role)) throw new Error('Solo admin/office possono pianificare');
  if (!(await tenantHasModule('dipendenti')))
    throw new Error('Modulo Dipendenti non attivo per questo tenant');
  const supabase = createServerSupabase();
  const cfg = await leggiConfigDipendenti(supabase, ctx.tenantId);
  if (!cfg.pianificazioneAttiva) throw new Error('Pianificazione non attiva per questo tenant');
  return { ctx, supabase };
}

/** Mappa dipendenteId → "Cognome Nome" per messaggi di conflitto leggibili. */
async function nomiDipendenti(
  supabase: ReturnType<typeof createServerSupabase>,
  tenantId: string,
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('dipendenti' as never)
    .select('id, nome, cognome')
    .eq('tenant_id', tenantId);
  const rows = (data ?? []) as unknown as { id: string; nome: string; cognome: string }[];
  return new Map(rows.map((r) => [r.id, `${r.cognome} ${r.nome}`.trim()]));
}

/** Etichetta breve di un blocco esistente (cantiere o evento) per i messaggi. */
function etichettaBlocco(b: BloccoView): string {
  const nome = b.tipo === 'cantiere' ? b.cantiereNome ?? 'cantiere' : b.titolo ?? 'evento';
  return `${nome} (${b.oraInizio}-${b.oraFine})`;
}

/**
 * Calcola i messaggi di conflitto (persona già occupata / mezzo doppio) di un
 * candidato rispetto ai blocchi esistenti dello stesso giorno. `escludiId` per
 * la modifica (non confliggo con me stesso).
 */
function messaggiConflitto(opts: {
  data: string;
  inizio: string;
  fine: string;
  dipendenti: string[];
  mezzi: string[];
  esistenti: BloccoView[];
  escludiId?: string;
  nomiDip: Map<string, string>;
  nomiMezzo: Map<string, string>;
}): string[] {
  const vociDip: VoceOccupazione[] = [];
  const vociMezzo: VoceOccupazione[] = [];
  const etichetta = new Map<string, string>();
  for (const b of opts.esistenti) {
    if (b.id === opts.escludiId) continue;
    etichetta.set(b.id, etichettaBlocco(b));
    for (const d of b.membri)
      vociDip.push({ entita: d, data: b.data, inizio: b.oraInizio, fine: b.oraFine, refId: b.id });
    for (const m of b.mezzi)
      vociMezzo.push({ entita: m, data: b.data, inizio: b.oraInizio, fine: b.oraFine, refId: b.id });
  }
  const msg: string[] = [];
  for (const d of opts.dipendenti) {
    const sov = sovrapposizioniPerCandidato(
      { entita: d, data: opts.data, inizio: opts.inizio, fine: opts.fine, refId: opts.escludiId },
      vociDip,
    );
    for (const s of sov) {
      msg.push(
        `${opts.nomiDip.get(d) ?? 'Dipendente'} è già assegnato a ${etichetta.get(s.refId) ?? 'un altro blocco'}.`,
      );
    }
  }
  for (const m of opts.mezzi) {
    const sov = sovrapposizioniPerCandidato(
      { entita: m, data: opts.data, inizio: opts.inizio, fine: opts.fine, refId: opts.escludiId },
      vociMezzo,
    );
    for (const s of sov) {
      msg.push(
        `Il mezzo ${opts.nomiMezzo.get(m) ?? ''} è già usato in ${etichetta.get(s.refId) ?? 'un altro blocco'}.`.replace(
          / +/g,
          ' ',
        ),
      );
    }
  }
  return msg;
}

async function nomiMezzi(
  supabase: ReturnType<typeof createServerSupabase>,
  tenantId: string,
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('mezzi' as never)
    .select('id, targa, modello')
    .eq('tenant_id', tenantId);
  const rows = (data ?? []) as unknown as { id: string; targa: string; modello: string | null }[];
  return new Map(rows.map((r) => [r.id, [r.targa, r.modello].filter(Boolean).join(' ')]));
}

/**
 * Dipendenti con ferie/permesso APPROVATO che si sovrappone al giorno/orario del
 * blocco → non assegnabili (blocco HARD). Ritorna i nomi (con tipo) in conflitto.
 */
async function assenzeInConflitto(
  supabase: ReturnType<typeof createServerSupabase>,
  tenantId: string,
  data: string,
  dipendentiIds: string[],
  inizio: string,
  fine: string,
): Promise<string[]> {
  if (dipendentiIds.length === 0) return [];
  const { data: rows } = await supabase
    .from('permesso_richieste' as never)
    .select('dipendente_id, tutto_il_giorno, ora_inizio, ora_fine, tipo')
    .eq('tenant_id', tenantId)
    .eq('stato', 'approvato')
    .lte('data_inizio', data)
    .gte('data_fine', data)
    .in('dipendente_id', dipendentiIds);
  const list = (rows ?? []) as unknown as {
    dipendente_id: string;
    tutto_il_giorno: boolean;
    ora_inizio: string | null;
    ora_fine: string | null;
    tipo: string;
  }[];
  if (list.length === 0) return [];
  const nomi = await nomiDipendenti(supabase, tenantId);
  const out: string[] = [];
  for (const r of list) {
    let overlap = r.tutto_il_giorno;
    if (!overlap && r.ora_inizio && r.ora_fine) {
      const ai = normalizzaOra(r.ora_inizio);
      const af = normalizzaOra(r.ora_fine);
      if (ai && af) overlap = intervalliSovrapposti(inizio, fine, ai, af);
    }
    if (overlap) out.push(`${nomi.get(r.dipendente_id) ?? 'Dipendente'} (${labelTipoPermesso(r.tipo)})`);
  }
  return out;
}

// ── Schema comune ────────────────────────────────────────────────────

const BloccoSchema = z.object({
  tipo: z.enum(['cantiere', 'evento', 'formazione']),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data non valida'),
  fascia: z.enum(['giornata', 'mattina', 'pomeriggio', 'custom']),
  oraInizio: z.string().optional().nullable(),
  oraFine: z.string().optional().nullable(),
  cantiereId: z.string().uuid().optional().nullable(),
  titolo: z.string().trim().max(160).optional().nullable(),
  luogo: z.string().trim().max(200).optional().nullable(),
  luogoLat: z.number().optional().nullable(),
  luogoLng: z.number().optional().nullable(),
  dipendentiIds: z.array(z.string().uuid()).default([]),
  mezziIds: z.array(z.string().uuid()).default([]),
  note: z.string().trim().max(1000).optional().nullable(),
  forza: z.boolean().optional(),
});

type BloccoInput = z.infer<typeof BloccoSchema>;

/** Risolve/valida gli orari dal preset di fascia. */
function risolviOrari(input: {
  fascia: Fascia;
  oraInizio?: string | null;
  oraFine?: string | null;
}): { inizio: string; fine: string } | { errore: string } {
  const { inizio, fine } = risolviFascia(input.fascia, {
    inizio: input.oraInizio,
    fine: input.oraFine,
  });
  const i = normalizzaOra(inizio);
  const f = normalizzaOra(fine);
  if (!i || !f) return { errore: 'Orari non validi' };
  if (i >= f) return { errore: "L'orario di fine deve essere dopo l'inizio" };
  return { inizio: i, fine: f };
}

function validaTarget(input: BloccoInput): string | null {
  if (input.tipo === 'cantiere' && !input.cantiereId) return 'Scegli un cantiere';
  if (input.tipo !== 'cantiere' && !(input.titolo && input.titolo.trim()))
    return input.tipo === 'formazione' ? 'Dai un titolo alla formazione' : 'Dai un titolo all’evento';
  return null;
}

// ── creaBlocco ───────────────────────────────────────────────────────

export async function creaBlocco(input: unknown): Promise<SalvaResult> {
  const parsed = BloccoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  const data = parsed.data;

  let g;
  try {
    g = await guard();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const { ctx, supabase } = g;

  const targetErr = validaTarget(data);
  if (targetErr) return { ok: false, error: targetErr };
  const orari = risolviOrari(data);
  if ('errore' in orari) return { ok: false, error: orari.errore };
  if (data.dipendentiIds.length === 0) return { ok: false, error: 'Seleziona almeno un dipendente' };

  // Blocco HARD: chi è in ferie/permesso approvato quel giorno non è assegnabile.
  const assenti = await assenzeInConflitto(
    supabase,
    ctx.tenantId,
    data.data,
    data.dipendentiIds,
    orari.inizio,
    orari.fine,
  );
  if (assenti.length > 0) {
    return {
      ok: false,
      error: `Non assegnabile: in ferie o permesso quel giorno · ${assenti.join(', ')}`,
    };
  }

  // Conflitti soft (persona/mezzo già occupati nello stesso giorno).
  if (!data.forza) {
    const esistenti = await caricaBlocchiRange(supabase, ctx.tenantId, data.data, data.data);
    const conflitti = messaggiConflitto({
      data: data.data,
      inizio: orari.inizio,
      fine: orari.fine,
      dipendenti: data.dipendentiIds,
      mezzi: data.mezziIds,
      esistenti,
      nomiDip: await nomiDipendenti(supabase, ctx.tenantId),
      nomiMezzo: await nomiMezzi(supabase, ctx.tenantId),
    });
    if (conflitti.length > 0) return { ok: false, conflitti };
  }

  // Insert blocco → membri → mezzi (cleanup best-effort se figli falliscono).
  const { data: bloccoRow, error: errBlocco } = await supabase
    .from('pianificazione_blocchi' as never)
    .insert({
      tenant_id: ctx.tenantId,
      data: data.data,
      tipo: data.tipo,
      cantiere_id: data.tipo === 'cantiere' ? data.cantiereId : null,
      titolo: data.tipo !== 'cantiere' ? data.titolo?.trim() : null,
      luogo: data.tipo !== 'cantiere' ? data.luogo?.trim() ?? null : null,
      luogo_lat: data.tipo !== 'cantiere' ? data.luogoLat ?? null : null,
      luogo_lng: data.tipo !== 'cantiere' ? data.luogoLng ?? null : null,
      fascia: data.fascia,
      ora_inizio: orari.inizio,
      ora_fine: orari.fine,
      note: data.note?.trim() || null,
      stato: 'bozza',
      created_by: ctx.userId,
    } as never)
    .select('id')
    .single();
  if (errBlocco || !bloccoRow) return { ok: false, error: errBlocco?.message ?? 'Blocco non creato' };
  const bloccoId = (bloccoRow as unknown as { id: string }).id;

  const errFigli = await inserisciFigli(supabase, ctx.tenantId, bloccoId, data.dipendentiIds, data.mezziIds);
  if (errFigli) {
    await supabase.from('pianificazione_blocchi' as never).delete().eq('id', bloccoId);
    return { ok: false, error: errFigli };
  }

  await auditTenant(supabase, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'pianificazione_blocco',
    entityId: bloccoId,
    action: 'pianificazione.blocco.crea',
    after: { data: data.data, tipo: data.tipo, membri: data.dipendentiIds.length },
  });

  revalidatePath(PATH);
  return { ok: true };
}

async function inserisciFigli(
  supabase: ReturnType<typeof createServerSupabase>,
  tenantId: string,
  bloccoId: string,
  dipendentiIds: string[],
  mezziIds: string[],
): Promise<string | null> {
  if (dipendentiIds.length > 0) {
    const { error } = await supabase.from('pianificazione_membri' as never).insert(
      dipendentiIds.map((d) => ({ blocco_id: bloccoId, dipendente_id: d, tenant_id: tenantId })) as never,
    );
    if (error) return error.message;
  }
  if (mezziIds.length > 0) {
    const { error } = await supabase.from('pianificazione_blocco_mezzi' as never).insert(
      mezziIds.map((m) => ({ blocco_id: bloccoId, mezzo_id: m, tenant_id: tenantId })) as never,
    );
    if (error) return error.message;
  }
  return null;
}

// ── creaBlocchiRicorrenti (ripeti su più giorni) ─────────────────────

/** Etichetta breve di un giorno per i messaggi ("Gio 24/07"). */
const NOMI_GG = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
function giornoBreve(iso: string): string {
  const [Y, M, D] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(Y!, M! - 1, D!)).getUTCDay(); // 0=dom..6=sab
  return `${NOMI_GG[(dow + 6) % 7]} ${String(D).padStart(2, '0')}/${String(M).padStart(2, '0')}`;
}

const RicorrenteSchema = BloccoSchema.extend({
  date: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(31),
});

export type RicorrenteResult =
  | { ok: true; creati: number; saltati: { data: string; motivo: string }[] }
  | { ok: false; error: string }
  | { ok: false; conflitti: string[] };

/**
 * Crea lo STESSO blocco (squadra + mezzi + cantiere/evento + fascia) su più
 * giorni. Per ogni giorno: chi è in ferie/permesso approvato è **saltato** (mai
 * forzato); i conflitti soft (persona/mezzo già occupati) bloccano come nella
 * creazione singola finché non si conferma con `forza` ("Salva comunque"), poi
 * si crea comunque. Tutti i blocchi nascono in bozza.
 */
export async function creaBlocchiRicorrenti(input: unknown): Promise<RicorrenteResult> {
  const parsed = RicorrenteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  const data = parsed.data;

  let g;
  try {
    g = await guard();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const { ctx, supabase } = g;

  const targetErr = validaTarget(data);
  if (targetErr) return { ok: false, error: targetErr };
  const orari = risolviOrari(data);
  if ('errore' in orari) return { ok: false, error: orari.errore };
  if (data.dipendentiIds.length === 0) return { ok: false, error: 'Seleziona almeno un dipendente' };

  const date = Array.from(new Set(data.date)).sort();
  const nomiDip = await nomiDipendenti(supabase, ctx.tenantId);
  const nomiMezzo = await nomiMezzi(supabase, ctx.tenantId);

  const saltati: { data: string; motivo: string }[] = [];
  const daCreare: string[] = [];
  const conflittiTotali: string[] = [];

  for (const giorno of date) {
    // Ferie/permesso = HARD → salta sempre (anche con forza).
    const assenti = await assenzeInConflitto(
      supabase,
      ctx.tenantId,
      giorno,
      data.dipendentiIds,
      orari.inizio,
      orari.fine,
    );
    if (assenti.length > 0) {
      saltati.push({ data: giorno, motivo: `in ferie/permesso: ${assenti.join(', ')}` });
      continue;
    }
    // Conflitti soft: raccolti (con prefisso giorno) e bloccanti finché non forza.
    if (!data.forza) {
      const esistenti = await caricaBlocchiRange(supabase, ctx.tenantId, giorno, giorno);
      const conflitti = messaggiConflitto({
        data: giorno,
        inizio: orari.inizio,
        fine: orari.fine,
        dipendenti: data.dipendentiIds,
        mezzi: data.mezziIds,
        esistenti,
        nomiDip,
        nomiMezzo,
      });
      for (const c of conflitti) conflittiTotali.push(`${giornoBreve(giorno)} · ${c}`);
    }
    daCreare.push(giorno);
  }

  if (!data.forza && conflittiTotali.length > 0) return { ok: false, conflitti: conflittiTotali };

  let creati = 0;
  for (const giorno of daCreare) {
    const { data: bloccoRow, error: errBlocco } = await supabase
      .from('pianificazione_blocchi' as never)
      .insert({
        tenant_id: ctx.tenantId,
        data: giorno,
        tipo: data.tipo,
        cantiere_id: data.tipo === 'cantiere' ? data.cantiereId : null,
        titolo: data.tipo !== 'cantiere' ? data.titolo?.trim() : null,
        luogo: data.tipo !== 'cantiere' ? data.luogo?.trim() ?? null : null,
        luogo_lat: data.tipo !== 'cantiere' ? data.luogoLat ?? null : null,
        luogo_lng: data.tipo !== 'cantiere' ? data.luogoLng ?? null : null,
        fascia: data.fascia,
        ora_inizio: orari.inizio,
        ora_fine: orari.fine,
        note: data.note?.trim() || null,
        stato: 'bozza',
        created_by: ctx.userId,
      } as never)
      .select('id')
      .single();
    if (errBlocco || !bloccoRow) continue;
    const bloccoId = (bloccoRow as unknown as { id: string }).id;
    const errFigli = await inserisciFigli(
      supabase,
      ctx.tenantId,
      bloccoId,
      data.dipendentiIds,
      data.mezziIds,
    );
    if (errFigli) {
      await supabase.from('pianificazione_blocchi' as never).delete().eq('id', bloccoId);
      continue;
    }
    creati++;
  }

  if (creati > 0) {
    await auditTenant(supabase, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      entityType: 'pianificazione',
      action: 'pianificazione.blocco.ripeti',
      after: { tipo: data.tipo, giorni: creati, saltati: saltati.length },
    });
    revalidatePath(PATH);
  }

  return { ok: true, creati, saltati };
}

// ── aggiornaBlocco ───────────────────────────────────────────────────

const AggiornaSchema = BloccoSchema.extend({ id: z.string().uuid() });

export async function aggiornaBlocco(input: unknown): Promise<SalvaResult> {
  const parsed = AggiornaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  const data = parsed.data;

  let g;
  try {
    g = await guard();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const { ctx, supabase } = g;

  const targetErr = validaTarget(data);
  if (targetErr) return { ok: false, error: targetErr };
  const orari = risolviOrari(data);
  if ('errore' in orari) return { ok: false, error: orari.errore };
  if (data.dipendentiIds.length === 0) return { ok: false, error: 'Seleziona almeno un dipendente' };

  // Blocco HARD: chi è in ferie/permesso approvato quel giorno non è assegnabile.
  const assenti = await assenzeInConflitto(
    supabase,
    ctx.tenantId,
    data.data,
    data.dipendentiIds,
    orari.inizio,
    orari.fine,
  );
  if (assenti.length > 0) {
    return {
      ok: false,
      error: `Non assegnabile: in ferie o permesso quel giorno · ${assenti.join(', ')}`,
    };
  }

  if (!data.forza) {
    const esistenti = await caricaBlocchiRange(supabase, ctx.tenantId, data.data, data.data);
    const conflitti = messaggiConflitto({
      data: data.data,
      inizio: orari.inizio,
      fine: orari.fine,
      dipendenti: data.dipendentiIds,
      mezzi: data.mezziIds,
      esistenti,
      escludiId: data.id,
      nomiDip: await nomiDipendenti(supabase, ctx.tenantId),
      nomiMezzo: await nomiMezzi(supabase, ctx.tenantId),
    });
    if (conflitti.length > 0) return { ok: false, conflitti };
  }

  const { error: errUpd } = await supabase
    .from('pianificazione_blocchi' as never)
    .update({
      data: data.data,
      tipo: data.tipo,
      cantiere_id: data.tipo === 'cantiere' ? data.cantiereId : null,
      titolo: data.tipo !== 'cantiere' ? data.titolo?.trim() : null,
      luogo: data.tipo !== 'cantiere' ? data.luogo?.trim() ?? null : null,
      luogo_lat: data.tipo !== 'cantiere' ? data.luogoLat ?? null : null,
      luogo_lng: data.tipo !== 'cantiere' ? data.luogoLng ?? null : null,
      fascia: data.fascia,
      ora_inizio: orari.inizio,
      ora_fine: orari.fine,
      note: data.note?.trim() || null,
    } as never)
    .eq('id', data.id)
    .eq('tenant_id', ctx.tenantId);
  if (errUpd) return { ok: false, error: errUpd.message };

  // Riscrive membri e mezzi (delete + insert).
  await supabase.from('pianificazione_membri' as never).delete().eq('blocco_id', data.id);
  await supabase.from('pianificazione_blocco_mezzi' as never).delete().eq('blocco_id', data.id);
  const errFigli = await inserisciFigli(supabase, ctx.tenantId, data.id, data.dipendentiIds, data.mezziIds);
  if (errFigli) return { ok: false, error: errFigli };

  await auditTenant(supabase, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'pianificazione_blocco',
    entityId: data.id,
    action: 'pianificazione.blocco.modifica',
    after: { data: data.data, tipo: data.tipo, membri: data.dipendentiIds.length },
  });

  revalidatePath(PATH);
  return { ok: true };
}

// ── eliminaBlocco ────────────────────────────────────────────────────

export async function eliminaBlocco(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'ID non valido' };
  let g;
  try {
    g = await guard();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const { ctx, supabase } = g;
  const { error } = await supabase
    .from('pianificazione_blocchi' as never)
    .delete()
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  await auditTenant(supabase, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'pianificazione_blocco',
    entityId: id,
    action: 'pianificazione.blocco.elimina',
  });
  revalidatePath(PATH);
  return { ok: true };
}

// ── spostaBlocco (drag & drop su un altro giorno) ────────────────────

const SpostaSchema = z.object({
  id: z.string().uuid(),
  nuovaData: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data non valida'),
});

/**
 * Sposta un blocco (intera squadra) su un altro giorno. Ferie/permesso sul
 * nuovo giorno = blocco HARD (rifiuta). I conflitti soft NON bloccano il gesto
 * (compaiono come ring rosso dopo il refresh). Lo stato (bozza/pubblicato) resta
 * invariato, coerente con `aggiornaBlocco`.
 */
export async function spostaBlocco(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = SpostaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  let g;
  try {
    g = await guard();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const { ctx, supabase } = g;

  const b = await caricaBloccoById(supabase, ctx.tenantId, parsed.data.id);
  if (!b) return { ok: false, error: 'Blocco non trovato' };
  if (b.data === parsed.data.nuovaData) return { ok: true }; // no-op

  const assenti = await assenzeInConflitto(
    supabase,
    ctx.tenantId,
    parsed.data.nuovaData,
    b.membri,
    b.oraInizio,
    b.oraFine,
  );
  if (assenti.length > 0) {
    return {
      ok: false,
      error: `Non spostabile su ${giornoBreve(parsed.data.nuovaData)}: in ferie o permesso · ${assenti.join(', ')}`,
    };
  }

  const { error } = await supabase
    .from('pianificazione_blocchi' as never)
    .update({ data: parsed.data.nuovaData } as never)
    .eq('id', parsed.data.id)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };

  await auditTenant(supabase, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'pianificazione_blocco',
    entityId: parsed.data.id,
    action: 'pianificazione.blocco.sposta',
    before: { data: b.data },
    after: { data: parsed.data.nuovaData },
  });

  revalidatePath(PATH);
  return { ok: true };
}

// ── ripetiBlocco (resize: estende su più giorni) ─────────────────────

const RipetiSchema = z.object({
  id: z.string().uuid(),
  date: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(31),
});

/** True se i due insiemi di id contengono gli stessi elementi. */
function stessoInsieme(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/**
 * Estende un blocco su più giorni (resize della card). Agisce SEMPRE sull'intero
 * blocco: se è una squadra clona tutti i membri + mezzi, se è un tecnico singolo
 * clona lui. Ferie = saltato; un blocco equivalente già presente quel giorno =
 * saltato (idempotente). I cloni nascono in bozza.
 */
export async function ripetiBlocco(
  input: unknown,
): Promise<
  | { ok: true; creati: number; saltati: { data: string; motivo: string }[] }
  | { ok: false; error: string }
> {
  const parsed = RipetiSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  let g;
  try {
    g = await guard();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const { ctx, supabase } = g;

  const b = await caricaBloccoById(supabase, ctx.tenantId, parsed.data.id);
  if (!b) return { ok: false, error: 'Blocco non trovato' };

  const date = Array.from(new Set(parsed.data.date))
    .filter((d) => d !== b.data)
    .sort();
  if (date.length === 0) return { ok: true, creati: 0, saltati: [] };

  const saltati: { data: string; motivo: string }[] = [];
  const daCreare: string[] = [];
  for (const giorno of date) {
    const assenti = await assenzeInConflitto(supabase, ctx.tenantId, giorno, b.membri, b.oraInizio, b.oraFine);
    if (assenti.length > 0) {
      saltati.push({ data: giorno, motivo: `in ferie/permesso: ${assenti.join(', ')}` });
      continue;
    }
    // dedup: salta se la stessa squadra è già su un blocco equivalente quel
    // giorno → ridimensionare più volte non duplica.
    const esistenti = await caricaBlocchiRange(supabase, ctx.tenantId, giorno, giorno);
    const giaPresente = esistenti.some(
      (e) =>
        e.tipo === b.tipo &&
        e.cantiereId === b.cantiereId &&
        (e.titolo ?? '') === (b.titolo ?? '') &&
        e.fascia === b.fascia &&
        e.oraInizio === b.oraInizio &&
        e.oraFine === b.oraFine &&
        stessoInsieme(e.membri, b.membri),
    );
    if (giaPresente) {
      saltati.push({ data: giorno, motivo: 'già pianificato' });
      continue;
    }
    daCreare.push(giorno);
  }

  let creati = 0;
  for (const giorno of daCreare) {
    const { data: nuovo, error } = await supabase
      .from('pianificazione_blocchi' as never)
      .insert({
        tenant_id: ctx.tenantId,
        data: giorno,
        tipo: b.tipo,
        cantiere_id: b.cantiereId,
        titolo: b.titolo,
        luogo: b.luogo,
        luogo_lat: b.luogoLat,
        luogo_lng: b.luogoLng,
        fascia: b.fascia,
        ora_inizio: b.oraInizio,
        ora_fine: b.oraFine,
        note: b.note,
        stato: 'bozza',
        created_by: ctx.userId,
      } as never)
      .select('id')
      .single();
    if (error || !nuovo) continue;
    const nuovoId = (nuovo as unknown as { id: string }).id;
    const errFigli = await inserisciFigli(supabase, ctx.tenantId, nuovoId, b.membri, b.mezzi);
    if (errFigli) {
      await supabase.from('pianificazione_blocchi' as never).delete().eq('id', nuovoId);
      continue;
    }
    creati++;
  }

  if (creati > 0) {
    await auditTenant(supabase, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      entityType: 'pianificazione_blocco',
      entityId: parsed.data.id,
      action: 'pianificazione.blocco.ripeti',
      after: { giorni: creati, saltati: saltati.length },
    });
    revalidatePath(PATH);
  }

  return { ok: true, creati, saltati };
}

// ── pubblicaSettimana ────────────────────────────────────────────────

const SettimanaSchema = z.object({ lunediISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export async function pubblicaSettimana(
  input: unknown,
): Promise<{ ok: true; pubblicati: number; notificati: number } | { ok: false; error: string }> {
  const parsed = SettimanaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  let g;
  try {
    g = await guard();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const { ctx, supabase } = g;

  const giorni = giorniSettimana(parsed.data.lunediISO);
  const dataFrom = giorni[0]!;
  const dataTo = giorni[6]!;

  // Porta bozza → pubblicato nel range.
  const { data: pubRows, error: errUpd } = await supabase
    .from('pianificazione_blocchi' as never)
    .update({ stato: 'pubblicato', pubblicato_at: new Date().toISOString(), pubblicato_da: ctx.userId } as never)
    .eq('tenant_id', ctx.tenantId)
    .gte('data', dataFrom)
    .lte('data', dataTo)
    .eq('stato', 'bozza')
    .select('id');
  if (errUpd) return { ok: false, error: errUpd.message };
  const pubblicati = ((pubRows ?? []) as unknown as unknown[]).length;

  // Dipendenti coinvolti nella settimana (tutti i blocchi pubblicati, non solo
  // quelli appena passati a pubblicato → chi era già pubblicato viene riavvisato
  // solo se aggiungiamo persone: qui notifichiamo l'intera settimana ai membri).
  const blocchi = await caricaBlocchiRange(supabase, ctx.tenantId, dataFrom, dataTo);
  const pubblicatiOra = new Set(((pubRows ?? []) as unknown as { id: string }[]).map((r) => r.id));
  const dipCoinvolti = new Set<string>();
  for (const b of blocchi) {
    if (b.stato === 'pubblicato' && pubblicatiOra.has(b.id)) {
      for (const d of b.membri) dipCoinvolti.add(d);
    }
  }

  let notificati = 0;
  if (dipCoinvolti.size > 0) {
    const service = createServiceSupabase();
    const { data: dipRows } = await service
      .from('dipendenti' as never)
      .select('id, user_id')
      .eq('tenant_id', ctx.tenantId)
      .in('id', Array.from(dipCoinvolti));
    const conLogin = ((dipRows ?? []) as unknown as { id: string; user_id: string | null }[]).filter(
      (d) => d.user_id,
    );

    if (conLogin.length > 0) {
      const dal = new Date(dataFrom).toLocaleDateString('it-IT', {
        day: 'numeric',
        month: 'long',
        timeZone: 'Europe/Rome',
      });
      const title = 'Pianificazione aggiornata';
      const body = `La tua settimana dal ${dal} è stata pubblicata.`;
      const url = '/mobile/pianificazione';

      // In-app (service bypassa RLS: inserisce notifiche per altri utenti).
      const { error: errNotif } = await service.from('notifiche' as never).insert(
        conLogin.map((d) => ({
          tenant_id: ctx.tenantId,
          user_id: d.user_id,
          type: 'pianificazione_pubblicata',
          payload: { title, body, url },
        })) as never,
      );
      if (!errNotif) notificati = conLogin.length;

      // Push best-effort (in locale senza VAPID non blocca).
      try {
        await Promise.all(
          conLogin.map((d) =>
            inviaPushAUtente(service as never, d.user_id as string, { title, body, url }).catch(() => null),
          ),
        );
      } catch {
        // push non configurato → ignora
      }
    }
  }

  await auditTenant(supabase, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'pianificazione',
    action: 'pianificazione.pubblica_settimana',
    after: { lunedi: parsed.data.lunediISO, pubblicati, notificati },
  });

  revalidatePath(PATH);
  return { ok: true, pubblicati, notificati };
}

// ── copiaSettimanaPrecedente ─────────────────────────────────────────

const CopiaSchema = z.object({
  lunediISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  forza: z.boolean().optional(),
});

export async function copiaSettimanaPrecedente(input: unknown): Promise<SalvaResult> {
  const parsed = CopiaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  let g;
  try {
    g = await guard();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const { ctx, supabase } = g;

  const giorni = giorniSettimana(parsed.data.lunediISO);
  const targetFrom = giorni[0]!;
  const targetTo = giorni[6]!;
  const prevFrom = addGiorni(targetFrom, -7);
  const prevTo = addGiorni(targetTo, -7);

  // Se la settimana target ha già blocchi, chiedi conferma (evita duplicati).
  if (!parsed.data.forza) {
    const target = await caricaBlocchiRange(supabase, ctx.tenantId, targetFrom, targetTo);
    if (target.length > 0) {
      return {
        ok: false,
        conflitti: [
          `La settimana selezionata ha già ${target.length} ${target.length === 1 ? 'blocco pianificato' : 'blocchi pianificati'}. Copiare comunque aggiunge i blocchi della settimana precedente.`,
        ],
      };
    }
  }

  const sorgente = await caricaBlocchiRange(supabase, ctx.tenantId, prevFrom, prevTo);
  if (sorgente.length === 0)
    return { ok: false, error: 'La settimana precedente non ha blocchi da copiare' };

  let copiati = 0;
  for (const b of sorgente) {
    const { data: nuovo, error } = await supabase
      .from('pianificazione_blocchi' as never)
      .insert({
        tenant_id: ctx.tenantId,
        data: addGiorni(b.data, 7),
        tipo: b.tipo,
        cantiere_id: b.cantiereId,
        titolo: b.titolo,
        luogo: b.luogo,
        fascia: b.fascia,
        ora_inizio: b.oraInizio,
        ora_fine: b.oraFine,
        note: b.note,
        stato: 'bozza',
        created_by: ctx.userId,
      } as never)
      .select('id')
      .single();
    if (error || !nuovo) continue;
    const nuovoId = (nuovo as unknown as { id: string }).id;
    await inserisciFigli(supabase, ctx.tenantId, nuovoId, b.membri, b.mezzi);
    copiati++;
  }

  await auditTenant(supabase, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'pianificazione',
    action: 'pianificazione.copia_settimana',
    after: { lunedi: parsed.data.lunediISO, copiati },
  });

  revalidatePath(PATH);
  return { ok: true };
}
