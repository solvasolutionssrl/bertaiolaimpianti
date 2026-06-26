'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import {
  scriviVersioneRapportino,
  type AzioneVersione,
} from '@/app/_actions/_lib/scrivi-versione-rapportino';
import {
  ricomputaRapportinoAuto,
  marcaRapportinoManuale,
} from '@/app/_actions/_lib/ricomputa-rapportino';
import { coppiaPausaCentrata } from '@/app/_actions/_lib/viaggio-timbra';
import { romeDay, romeDayBoundsUtc, romeWallToUtcIso } from '@kommessa/api/rome-time';

type Result = { ok: true } | { ok: false; error: string };

async function nomeUtente(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('users' as never)
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  return (data as { display_name: string | null } | null)?.display_name ?? null;
}

// ── schema per registraOrePerDipendente ─────────────────────────────────────

const RegistraOreSchema = z
  .object({
    dipendenteId: z.string().uuid(),
    commessaId: z.string().uuid().optional(),
    cantiereId: z.string().uuid().optional(),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato data non valido (YYYY-MM-DD)'),
    ore_ordinarie: z.number().min(0).max(24),
    ore_viaggio: z.number().min(0).max(24),
    ore_straordinarie: z.number().min(0).max(24),
    note: z.string().max(1000).optional(),
  })
  .refine(
    (d) => {
      const hasCommessa = !!d.commessaId;
      const hasCantiere = !!d.cantiereId;
      return hasCommessa !== hasCantiere; // XOR: esattamente uno valorizzato
    },
    { message: 'Specificare esattamente uno tra commessa e cantiere' },
  );

async function guard() {
  const ctx = await requireTenantContext();
  if (!['admin', 'office'].includes(ctx.role)) throw new Error('FORBIDDEN');
  if (!(await tenantHasModule('kantiere'))) throw new Error('MODULO_OFF');
  return ctx;
}

// ── regole di approvazione di una giornata ──────────────────────────────────
// Una giornata si approva solo se: NON è il giorno stesso (dalla mezzanotte in
// poi), NON ha un turno ancora aperto, e ha almeno un turno chiuso. L'uscita di
// pausa pranzo non chiude il turno.

async function statoGiornata(
  supabase: ReturnType<typeof createServerSupabase>,
  tenantId: string,
  dipendenteId: string,
  data: string,
): Promise<{ haTurnoAperto: boolean; turniChiusi: number }> {
  const { fromIso, toIso } = romeDayBoundsUtc(data);
  const { data: timbRaw } = await supabase
    .from('timbrature' as never)
    .select('commessa_id, cantiere_id, tipo, ts, pausa')
    .eq('tenant_id', tenantId)
    .eq('dipendente_id', dipendenteId)
    .gte('ts', fromIso)
    .lt('ts', toIso)
    .order('ts', { ascending: true });
  const timb =
    (timbRaw as {
      commessa_id: string | null;
      cantiere_id: string | null;
      tipo: 'ingresso' | 'uscita';
      ts: string;
      pausa: boolean | null;
    }[] | null) ?? [];

  const aperti = new Map<string, boolean>();
  let turniChiusi = 0;
  for (const t of timb) {
    const key = t.cantiere_id ? `k:${t.cantiere_id}` : t.commessa_id ? `c:${t.commessa_id}` : '';
    if (!key) continue;
    if (t.tipo === 'ingresso') {
      if (!aperti.get(key)) aperti.set(key, true);
    } else if (!t.pausa) {
      // fine turno: chiude il turno aperto su quel target.
      if (aperti.get(key)) {
        aperti.set(key, false);
        turniChiusi += 1;
      }
    }
  }
  return { haTurnoAperto: Array.from(aperti.values()).some((v) => v), turniChiusi };
}

/** Ritorna un messaggio se il giorno NON è approvabile, altrimenti null. */
async function motivoNonApprovabile(
  supabase: ReturnType<typeof createServerSupabase>,
  tenantId: string,
  dipendenteId: string,
  data: string,
): Promise<string | null> {
  if (data >= romeDay(new Date())) {
    return 'Non si può approvare il giorno stesso: attendi la fine della giornata.';
  }
  const { haTurnoAperto, turniChiusi } = await statoGiornata(supabase, tenantId, dipendenteId, data);
  if (haTurnoAperto) {
    return 'C’è ancora un turno aperto in questa giornata: va chiuso prima di approvare.';
  }
  if (turniChiusi === 0) {
    return 'Nessun turno chiuso da approvare in questa giornata.';
  }
  return null;
}

export async function approvaRapportino(input: unknown): Promise<Result> {
  const parsed = z.object({ rapportinoId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  const ctx = await guard();
  const supabase = createServerSupabase();

  const { data: row, error: fetchError } = await supabase
    .from('rapportini' as never)
    .select('id, stato, data, dipendente_id')
    .eq('id', parsed.data.rapportinoId)
    .eq('tenant_id', ctx.tenantId)
    .single();
  if (fetchError || !row) return { ok: false, error: 'NON_TROVATO' };
  const rr = row as { id: string; stato: string; data: string; dipendente_id: string };
  // I rapportini Kantiere sono auto-derivati dalle timbrature e restano in
  // bozza: l'ufficio è la fonte autoritativa e può approvarli direttamente
  // (oltre a quelli inviati dal tecnico).
  if (!['bozza', 'inviato'].includes(rr.stato)) return { ok: false, error: 'STATO_NON_VALIDO' };

  // Regole: niente giorno stesso, niente turno aperto, almeno un turno chiuso.
  const motivo = await motivoNonApprovabile(supabase, ctx.tenantId, rr.dipendente_id, rr.data);
  if (motivo) return { ok: false, error: motivo };

  const { error } = await supabase
    .from('rapportini' as never)
    .update({
      stato: 'approvato',
      approvato_da: ctx.userId,
      approvato_at: new Date().toISOString(),
    } as never)
    .eq('id', parsed.data.rapportinoId)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  await scriviVersioneRapportino({
    supabase,
    rapportinoId: parsed.data.rapportinoId,
    tenantId: ctx.tenantId,
    azione: 'approvazione',
    modificatoDa: ctx.userId,
    modificatoDaNome: await nomeUtente(supabase, ctx.userId),
  });
  revalidatePath('/office/kantiere/rapportini');
  return { ok: true };
}

export async function respingiRapportino(input: unknown): Promise<Result> {
  const parsed = z
    .object({ rapportinoId: z.string().uuid(), motivo: z.string().min(1).max(500) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  const ctx = await guard();
  const supabase = createServerSupabase();

  const { data: row, error: fetchError } = await supabase
    .from('rapportini' as never)
    .select('id, stato')
    .eq('id', parsed.data.rapportinoId)
    .eq('tenant_id', ctx.tenantId)
    .single();
  if (fetchError || !row) return { ok: false, error: 'NON_TROVATO' };
  if (!['bozza', 'inviato'].includes((row as { stato: string }).stato))
    return { ok: false, error: 'STATO_NON_VALIDO' };

  const { error } = await supabase
    .from('rapportini' as never)
    .update({
      stato: 'respinto',
      respinto_motivo: parsed.data.motivo,
      approvato_da: null,
      approvato_at: null,
    } as never)
    .eq('id', parsed.data.rapportinoId)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  await scriviVersioneRapportino({
    supabase,
    rapportinoId: parsed.data.rapportinoId,
    tenantId: ctx.tenantId,
    azione: 'respinta',
    modificatoDa: ctx.userId,
    modificatoDaNome: await nomeUtente(supabase, ctx.userId),
  });
  revalidatePath('/office/kantiere/rapportini');
  return { ok: true };
}

export async function riapriRapportino(input: unknown): Promise<Result> {
  const parsed = z.object({ rapportinoId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  const ctx = await guard();
  const supabase = createServerSupabase();

  const { data: row, error: fetchError } = await supabase
    .from('rapportini' as never)
    .select('id, stato, data, dipendente_id')
    .eq('id', parsed.data.rapportinoId)
    .eq('tenant_id', ctx.tenantId)
    .single();
  if (fetchError || !row) return { ok: false, error: 'NON_TROVATO' };
  const rr = row as { id: string; stato: string; data: string; dipendente_id: string };
  if (!['approvato', 'respinto'].includes(rr.stato)) return { ok: false, error: 'STATO_NON_VALIDO' };

  const { error } = await supabase
    .from('rapportini' as never)
    .update({
      stato: 'bozza',
      inviato_da: null,
      inviato_at: null,
      approvato_da: null,
      approvato_at: null,
      respinto_motivo: null,
    } as never)
    .eq('id', parsed.data.rapportinoId)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  // Riaprendo, ricalcola dalle timbrature correnti: così recupera le ore
  // arrivate dopo l'approvazione (resta invariato se è stato editato a mano).
  await ricomputaRapportinoAuto(supabase, ctx.tenantId, rr.dipendente_id, rr.data);
  await scriviVersioneRapportino({
    supabase,
    rapportinoId: parsed.data.rapportinoId,
    tenantId: ctx.tenantId,
    azione: 'riapertura',
    modificatoDa: ctx.userId,
    modificatoDaNome: await nomeUtente(supabase, ctx.userId),
  });
  revalidatePath('/office/kantiere/rapportini');
  return { ok: true };
}

// ── approvaRapportiniBulk: approva in blocco i selezionati ──────────────────
// Approva tutti i rapportini idonei (bozza/inviato) tra gli ID passati.
// Ignora silenziosamente quelli già approvati/respinti. Ritorna il conteggio.

export async function approvaRapportiniBulk(
  input: unknown,
): Promise<{ ok: true; approvati: number; saltati: number } | { ok: false; error: string }> {
  const parsed = z
    .object({ rapportinoIds: z.array(z.string().uuid()).min(1).max(500) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  const ctx = await guard();
  const supabase = createServerSupabase();

  const { data: rows } = await supabase
    .from('rapportini' as never)
    .select('id, stato, data, dipendente_id')
    .eq('tenant_id', ctx.tenantId)
    .in('id', parsed.data.rapportinoIds);

  const candidati = ((rows as { id: string; stato: string; data: string; dipendente_id: string }[] | null) ?? [])
    .filter((r) => r.stato === 'bozza' || r.stato === 'inviato');

  // Applica le stesse regole del singolo: salta giorno stesso / turno aperto / no turni chiusi.
  const idonei: string[] = [];
  let saltati = 0;
  for (const r of candidati) {
    const motivo = await motivoNonApprovabile(supabase, ctx.tenantId, r.dipendente_id, r.data);
    if (motivo) saltati += 1;
    else idonei.push(r.id);
  }
  if (idonei.length === 0) return { ok: true, approvati: 0, saltati };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('rapportini' as never)
    .update({ stato: 'approvato', approvato_da: ctx.userId, approvato_at: now } as never)
    .eq('tenant_id', ctx.tenantId)
    .in('id', idonei);
  if (error) return { ok: false, error: error.message };

  const nome = await nomeUtente(supabase, ctx.userId);
  for (const id of idonei) {
    await scriviVersioneRapportino({
      supabase,
      rapportinoId: id,
      tenantId: ctx.tenantId,
      azione: 'approvazione',
      modificatoDa: ctx.userId,
      modificatoDaNome: nome,
    });
  }

  revalidatePath('/office/kantiere/rapportini');
  return { ok: true, approvati: idonei.length, saltati };
}

// ── registraOrePerDipendente ─────────────────────────────────────────────────
// L'ufficio inserisce ore per conto di un dipendente (cantiere O commessa).
// Il rapportino risultante ha stato=approvato se creato ex-novo, oppure viene
// mantenuto nello stato esistente (salvo bozza → approvato).
// Una riga per lo stesso target sullo stesso rapportino viene AGGIORNATA.

export async function registraOrePerDipendente(input: unknown): Promise<Result> {
  const parsed = RegistraOreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };

  const ctx = await guard();
  const supabase = createServerSupabase();

  const { dipendenteId, commessaId, cantiereId, data, ore_ordinarie, ore_viaggio, ore_straordinarie, note } =
    parsed.data;

  // Verifica che il dipendente appartenga al tenant
  const { data: dipRow, error: dipErr } = await supabase
    .from('dipendenti' as never)
    .select('id')
    .eq('id', dipendenteId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (dipErr || !dipRow) return { ok: false, error: 'Dipendente non trovato' };

  const now = new Date().toISOString();

  // Cerca rapportino esistente per (dipendente_id, data)
  const { data: esistenteRaw } = await supabase
    .from('rapportini' as never)
    .select('id, stato')
    .eq('tenant_id', ctx.tenantId)
    .eq('dipendente_id', dipendenteId)
    .eq('data', data)
    .maybeSingle();

  const esistente = esistenteRaw as { id: string; stato: string } | null;

  let rapportinoId: string;

  if (esistente) {
    rapportinoId = esistente.id;
    // Se era in bozza, portarlo ad approvato (l'ufficio è fonte autoritativa)
    if (esistente.stato === 'bozza') {
      const { error: updErr } = await supabase
        .from('rapportini' as never)
        .update({
          stato: 'approvato',
          inviato_da: ctx.userId,
          inviato_at: now,
          approvato_da: ctx.userId,
          approvato_at: now,
        } as never)
        .eq('id', rapportinoId)
        .eq('tenant_id', ctx.tenantId);
      if (updErr) return { ok: false, error: updErr.message };
    }
    // Negli altri stati (inviato/approvato/respinto/ecc.) non tocchiamo lo stato:
    // l'aggiunta di una riga da parte dell'ufficio è comunque valida.
  } else {
    // Crea rapportino direttamente approvato
    const { data: nuovoRaw, error: insErr } = await supabase
      .from('rapportini' as never)
      .insert({
        tenant_id: ctx.tenantId,
        dipendente_id: dipendenteId,
        data,
        stato: 'approvato',
        inviato_da: ctx.userId,
        inviato_at: now,
        approvato_da: ctx.userId,
        approvato_at: now,
      } as never)
      .select('id')
      .single();
    if (insErr || !nuovoRaw) return { ok: false, error: insErr?.message ?? 'Errore creazione rapportino' };
    rapportinoId = (nuovoRaw as { id: string }).id;
  }

  // Cerca riga esistente per lo stesso target su questo rapportino
  const { data: righeRaw } = await supabase
    .from('rapportino_righe' as never)
    .select('id, commessa_id, cantiere_id')
    .eq('rapportino_id', rapportinoId);

  type RigaMin = { id: string; commessa_id: string | null; cantiere_id: string | null };
  const righeEsistenti = (righeRaw as RigaMin[]) ?? [];

  const rigaEsistente = righeEsistenti.find((r) => {
    if (commessaId) return r.commessa_id === commessaId;
    if (cantiereId) return r.cantiere_id === cantiereId;
    return false;
  });

  if (rigaEsistente) {
    // Aggiorna la riga esistente
    const { error: updRigaErr } = await supabase
      .from('rapportino_righe' as never)
      .update({
        ore_ordinarie,
        ore_straordinarie,
        ore_viaggio,
        note: note ?? null,
      } as never)
      .eq('id', rigaEsistente.id);
    if (updRigaErr) return { ok: false, error: updRigaErr.message };
  } else {
    // Inserisci nuova riga
    const { error: insRigaErr } = await supabase
      .from('rapportino_righe' as never)
      .insert({
        rapportino_id: rapportinoId,
        commessa_id: commessaId ?? null,
        cantiere_id: cantiereId ?? null,
        ore_ordinarie,
        ore_straordinarie,
        ore_viaggio,
        note: note ?? null,
      } as never);
    if (insRigaErr) return { ok: false, error: insRigaErr.message };
  }

  // L'ufficio ha scritto a mano: marca il rapportino come manuale così l'auto
  // ricalcolo dalle timbrature non sovrascrive/cancella più queste righe.
  await marcaRapportinoManuale(supabase, rapportinoId);

  await scriviVersioneRapportino({
    supabase,
    rapportinoId,
    tenantId: ctx.tenantId,
    azione: 'modifica_ufficio',
    modificatoDa: ctx.userId,
    modificatoDaNome: await nomeUtente(supabase, ctx.userId),
  });

  revalidatePath('/office/kantiere/rapportini');
  return { ok: true };
}

// ── storico versioni di un rapportino (per l'ufficio) ────────────────────────

export type VersioneRapportino = {
  versione: number;
  azione: AzioneVersione;
  modificato_da_nome: string | null;
  created_at: string;
  snapshot: {
    stato?: string;
    note?: string | null;
    totali?: { ore_ordinarie: number; ore_straordinarie: number; ore_viaggio: number };
  };
};

export async function versioniRapportino(
  input: unknown,
): Promise<{ ok: true; versioni: VersioneRapportino[] } | { ok: false; error: string }> {
  const parsed = z.object({ rapportinoId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  const ctx = await guard();
  const supabase = createServerSupabase();

  const { data } = await supabase
    .from('rapportino_versioni' as never)
    .select('versione, azione, modificato_da_nome, created_at, snapshot')
    .eq('rapportino_id', parsed.data.rapportinoId)
    .eq('tenant_id', ctx.tenantId)
    .order('versione', { ascending: true });

  const versioni = (data as VersioneRapportino[] | null) ?? [];
  return { ok: true, versioni };
}

// ── chiudiGiornata: l'ufficio chiude una giornata rimasta aperta ────────────
// Inserisce l'uscita mancante (origine 'manuale') all'orario indicato per i
// target con un ingresso ancora aperto in quel giorno, poi ricalcola il
// rapportino. L'orario è "da muro" italiano (Europe/Rome).

const ChiudiGiornataSchema = z.object({
  dipendenteId: z.string().uuid(),
  giorno: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  oraUscita: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function chiudiGiornata(input: unknown): Promise<Result> {
  const parsed = ChiudiGiornataSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  const ctx = await guard();
  const supabase = createServerSupabase();
  const { dipendenteId, giorno, oraUscita } = parsed.data;

  const { data: dip } = await supabase
    .from('dipendenti' as never)
    .select('id')
    .eq('id', dipendenteId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (!dip) return { ok: false, error: 'DIPENDENTE_NON_TROVATO' };

  // Timbrature del giorno italiano esatto.
  const { fromIso, toIso } = romeDayBoundsUtc(giorno);
  const { data: timbRaw } = await supabase
    .from('timbrature' as never)
    .select('id, commessa_id, cantiere_id, tipo, ts, pausa')
    .eq('tenant_id', ctx.tenantId)
    .eq('dipendente_id', dipendenteId)
    .gte('ts', fromIso)
    .lt('ts', toIso)
    .order('ts', { ascending: true });
  const timb = (timbRaw as {
    id: string;
    commessa_id: string | null;
    cantiere_id: string | null;
    tipo: 'ingresso' | 'uscita';
    ts: string;
    pausa: boolean | null;
  }[] | null) ?? [];

  // Target con turno ancora aperto. L'uscita di PAUSA non chiude il turno
  // (il dipendente è solo a pranzo): solo la fine turno (uscita pausa=false).
  const aperti = new Map<string, { commessa_id: string | null; cantiere_id: string | null; ingressoTs: string }>();
  for (const t of timb) {
    const key = t.cantiere_id ? `k:${t.cantiere_id}` : t.commessa_id ? `c:${t.commessa_id}` : '';
    if (!key) continue;
    if (t.tipo === 'ingresso') {
      if (!aperti.has(key)) {
        aperti.set(key, { commessa_id: t.commessa_id, cantiere_id: t.cantiere_id, ingressoTs: t.ts });
      }
    } else if (!t.pausa) {
      aperti.delete(key);
    }
  }
  if (aperti.size === 0) return { ok: false, error: 'NESSUNA_GIORNATA_APERTA' };

  const uscitaTs = romeWallToUtcIso(giorno, oraUscita);
  for (const a of aperti.values()) {
    if (Date.parse(uscitaTs) <= Date.parse(a.ingressoTs)) {
      return { ok: false, error: 'ORA_USCITA_NON_VALIDA' };
    }
  }

  const inserts = Array.from(aperti.values()).map((a) => ({
    tenant_id: ctx.tenantId,
    dipendente_id: dipendenteId,
    commessa_id: a.commessa_id,
    cantiere_id: a.cantiere_id,
    tipo: 'uscita',
    origine: 'manuale',
    ts: uscitaTs,
    creato_da: ctx.userId,
  }));
  const { error: insErr } = await supabase.from('timbrature' as never).insert(inserts as never);
  if (insErr) return { ok: false, error: insErr.message };

  // Ricalcola il rapportino (resta automatico se il tecnico non l'ha toccato).
  await ricomputaRapportinoAuto(supabase, ctx.tenantId, dipendenteId, giorno);

  revalidatePath('/office/kantiere/rapportini');
  revalidatePath(`/office/kantiere/dipendenti/${dipendenteId}`);
  return { ok: true };
}

// ── giornateAperte: giornate PASSATE con ingresso senza uscita ──────────────
// Promemoria per l'ufficio: chi ha dimenticato di timbrare l'uscita. Esclude
// la giornata odierna (in corso è normale).

export type GiornataAperta = {
  dipendenteId: string;
  dipendenteNome: string;
  giorno: string;
  ingressoTs: string;
  targetLabel: string;
};

export async function giornateAperte(
  input?: unknown,
): Promise<{ ok: true; giorni: GiornataAperta[] } | { ok: false; error: string }> {
  const parsed = z.object({ giorni: z.number().int().min(1).max(60).optional() }).safeParse(input ?? {});
  const n = parsed.success ? parsed.data.giorni ?? 21 : 21;
  let ctx;
  try {
    ctx = await guard();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const supabase = createServerSupabase();

  const oggi = romeDay(new Date());
  const past = new Date(Date.now() - n * 24 * 3600 * 1000);
  const { fromIso } = romeDayBoundsUtc(romeDay(past));

  const { data: timbRaw } = await supabase
    .from('timbrature' as never)
    .select('dipendente_id, commessa_id, cantiere_id, tipo, ts, pausa')
    .eq('tenant_id', ctx.tenantId)
    .gte('ts', fromIso)
    .order('ts', { ascending: true });
  const timb = (timbRaw as {
    dipendente_id: string;
    commessa_id: string | null;
    cantiere_id: string | null;
    tipo: 'ingresso' | 'uscita';
    ts: string;
    pausa: boolean | null;
  }[] | null) ?? [];

  // Pairing per (dipendente, giorno italiano, target). L'uscita di pausa non
  // chiude il turno: resta "aperto" finché non arriva la fine turno.
  const aperti = new Map<
    string,
    { dipId: string; giorno: string; commessaId: string | null; cantiereId: string | null; ingressoTs: string }
  >();
  for (const t of timb) {
    const giorno = romeDay(new Date(t.ts));
    const targetKey = t.cantiere_id ? `k:${t.cantiere_id}` : t.commessa_id ? `c:${t.commessa_id}` : '';
    if (!targetKey) continue;
    const key = `${t.dipendente_id}|${giorno}|${targetKey}`;
    if (t.tipo === 'ingresso') {
      if (!aperti.has(key)) {
        aperti.set(key, {
          dipId: t.dipendente_id,
          giorno,
          commessaId: t.commessa_id,
          cantiereId: t.cantiere_id,
          ingressoTs: t.ts,
        });
      }
    } else if (!t.pausa) {
      aperti.delete(key);
    }
  }

  // Solo giornate PASSATE (oggi in corso è normale).
  const aperte = Array.from(aperti.values()).filter((a) => a.giorno < oggi);
  if (aperte.length === 0) return { ok: true, giorni: [] };

  // Risolvi nomi dipendenti + label target.
  const dipIds = [...new Set(aperte.map((a) => a.dipId))];
  const cantIds = [...new Set(aperte.flatMap((a) => (a.cantiereId ? [a.cantiereId] : [])))];
  const commIds = [...new Set(aperte.flatMap((a) => (a.commessaId ? [a.commessaId] : [])))];

  const [dipRes, cantRes, commRes] = await Promise.all([
    supabase.from('dipendenti' as never).select('id, nome, cognome').in('id', dipIds),
    cantIds.length
      ? supabase.from('cantieri' as never).select('id, nome, codice').in('id', cantIds)
      : Promise.resolve({ data: [] as { id: string; nome: string | null; codice: string | null }[] }),
    commIds.length
      ? supabase.from('commesse' as never).select('id, codice_interno').in('id', commIds)
      : Promise.resolve({ data: [] as { id: string; codice_interno: string | null }[] }),
  ]);
  const dipMap = new Map<string, string>();
  for (const d of (dipRes.data as { id: string; nome: string; cognome: string }[] | null) ?? [])
    dipMap.set(d.id, `${d.cognome} ${d.nome}`.trim());
  const cantMap = new Map<string, string>();
  for (const c of (cantRes.data as { id: string; nome: string | null; codice: string | null }[] | null) ?? [])
    cantMap.set(c.id, c.nome || c.codice || 'Cantiere');
  const commMap = new Map<string, string>();
  for (const c of (commRes.data as { id: string; codice_interno: string | null }[] | null) ?? [])
    commMap.set(c.id, c.codice_interno || 'Commessa');

  const giorni: GiornataAperta[] = aperte
    .map((a) => ({
      dipendenteId: a.dipId,
      dipendenteNome: dipMap.get(a.dipId) ?? a.dipId,
      giorno: a.giorno,
      ingressoTs: a.ingressoTs,
      targetLabel: a.cantiereId
        ? cantMap.get(a.cantiereId) ?? 'Cantiere'
        : a.commessaId
          ? commMap.get(a.commessaId) ?? 'Commessa'
          : '',
    }))
    .sort((x, y) => (x.giorno < y.giorno ? 1 : x.giorno > y.giorno ? -1 : 0));

  return { ok: true, giorni };
}

// ── ricalcolo presenze dalle timbrature (riparazione/manutenzione) ───────────

const RicalcoloSchema = z.object({
  da: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  a: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Ricalcola i rapportini dalle timbrature per il periodo indicato (solo
 * office/admin). Utile per riparare giornate rimaste "bloccate" (es. vecchio
 * flusso manuale con righe vuote): le timbrature sono la verità, qui le
 * riallineiamo. Salta le giornate già approvate/respinte dall'ufficio.
 */
export async function ricalcolaPresenzePeriodo(
  input: z.infer<typeof RicalcoloSchema>,
): Promise<{ ok: true; giorni: number } | { ok: false; error: string }> {
  const parsed = RicalcoloSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'DATI_NON_VALIDI' };
  const { da, a } = parsed.data;

  const ctx = await requireTenantContext();
  if (ctx.role !== 'admin' && ctx.role !== 'office') return { ok: false, error: 'NON_AUTORIZZATO' };
  if (!(await tenantHasModule('kantiere'))) return { ok: false, error: 'MODULO_ASSENTE' };
  if (da > a) return { ok: false, error: 'PERIODO_NON_VALIDO' };

  const supabase = createServerSupabase();
  const fromIso = romeDayBoundsUtc(da).fromIso;
  const toIso = romeDayBoundsUtc(a).toIso;

  const { data: timbRaw } = await supabase
    .from('timbrature' as never)
    .select('dipendente_id, ts')
    .eq('tenant_id', ctx.tenantId)
    .gte('ts', fromIso)
    .lt('ts', toIso)
    .limit(20000);
  const righe = (timbRaw as { dipendente_id: string; ts: string }[] | null) ?? [];

  // coppie distinte (dipendente, giorno italiano)
  const coppie = new Map<string, { dipId: string; giorno: string }>();
  for (const r of righe) {
    const giorno = romeDay(new Date(r.ts));
    const k = `${r.dipendente_id}|${giorno}`;
    if (!coppie.has(k)) coppie.set(k, { dipId: r.dipendente_id, giorno });
  }

  let n = 0;
  for (const { dipId, giorno } of coppie.values()) {
    await ricomputaRapportinoAuto(supabase, ctx.tenantId, dipId, giorno);
    n += 1;
  }

  revalidatePath('/office/kantiere/rapportini');
  revalidatePath('/office/kantiere/dipendenti');
  return { ok: true, giorni: n };
}

// ── correzione anomalia: aggiungi una pausa pranzo dimenticata ───────────────

const AggiungiPausaSchema = z.object({
  dipendenteId: z.string().uuid(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minuti: z.number().int().min(5).max(240),
});

/**
 * L'ufficio aggiunge una PAUSA PRANZO dimenticata a una giornata (caso tipico:
 * turno > 10h perché non è stata timbrata la pausa). Inserisce una coppia-pausa
 * (uscita+ingresso `pausa=true`, origine 'manuale') centrata nel turno, poi
 * ricalcola: le ore lavorate scendono e, se rientrano nella soglia, la giornata
 * si AUTO-APPROVA. Le timbrature restano la verità.
 */
export async function aggiungiPausaGiornata(
  input: z.infer<typeof AggiungiPausaSchema>,
): Promise<{ ok: true; minutiPausa: number } | { ok: false; error: string }> {
  const parsed = AggiungiPausaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'DATI_NON_VALIDI' };
  const { dipendenteId, data, minuti } = parsed.data;

  const ctx = await requireTenantContext();
  if (ctx.role !== 'admin' && ctx.role !== 'office') return { ok: false, error: 'NON_AUTORIZZATO' };
  if (!(await tenantHasModule('kantiere'))) return { ok: false, error: 'MODULO_ASSENTE' };

  const supabase = createServerSupabase();
  const { fromIso, toIso } = romeDayBoundsUtc(data);
  const { data: timbRaw } = await supabase
    .from('timbrature' as never)
    .select('commessa_id, cantiere_id, tipo, ts, pausa')
    .eq('tenant_id', ctx.tenantId)
    .eq('dipendente_id', dipendenteId)
    .gte('ts', fromIso)
    .lt('ts', toIso)
    .order('ts', { ascending: true });
  const timb =
    (timbRaw as {
      commessa_id: string | null;
      cantiere_id: string | null;
      tipo: 'ingresso' | 'uscita';
      ts: string;
      pausa: boolean | null;
    }[] | null) ?? [];

  // Estremi del turno: primo ingresso reale, ultima uscita reale (escludo pause).
  const lavori = timb.filter((t) => !t.pausa);
  const primoIngresso = lavori.find((t) => t.tipo === 'ingresso');
  const ultimaUscita = [...lavori].reverse().find((t) => t.tipo === 'uscita');
  if (!primoIngresso || !ultimaUscita) {
    return { ok: false, error: 'GIORNATA_NON_CHIUSA' };
  }

  const start = Date.parse(primoIngresso.ts);
  const end = Date.parse(ultimaUscita.ts);
  if (!(end > start)) return { ok: false, error: 'TURNO_NON_VALIDO' };
  // La pausa deve starci dentro al turno.
  const durataTurnoMin = (end - start) / 60000;
  if (minuti >= durataTurnoMin) return { ok: false, error: 'PAUSA_TROPPO_LUNGA' };

  // Stessa coppia-pausa centrata della pausa dichiarata in chiusura turno.
  const { uscitaIso, ingressoIso } = coppiaPausaCentrata(primoIngresso.ts, ultimaUscita.ts, minuti);
  const base = {
    tenant_id: ctx.tenantId,
    dipendente_id: dipendenteId,
    commessa_id: primoIngresso.commessa_id,
    cantiere_id: primoIngresso.cantiere_id,
    pausa: true,
    origine: 'manuale',
    creato_da: ctx.userId,
  };
  const { error: insErr } = await supabase.from('timbrature' as never).insert([
    { ...base, tipo: 'uscita', ts: uscitaIso },
    { ...base, tipo: 'ingresso', ts: ingressoIso },
  ] as never);
  if (insErr) return { ok: false, error: insErr.message };

  // Ricalcola la giornata: ore lavorate ridotte → eventuale auto-approvazione.
  await ricomputaRapportinoAuto(supabase, ctx.tenantId, dipendenteId, data);

  revalidatePath('/office/kantiere/rapportini');
  revalidatePath('/office/kantiere/dipendenti');
  revalidatePath('/office/kantiere/anomalie');
  return { ok: true, minutiPausa: minuti };
}
