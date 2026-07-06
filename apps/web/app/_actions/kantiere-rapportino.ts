'use server';

import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { getTenantContext, type TenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';
import { romeDayBoundsUtc } from '@kommessa/api/rome-time';
import { scriviVersioneRapportino } from './_lib/scrivi-versione-rapportino';
import { ricomputaRapportinoAuto, marcaRapportinoManuale } from './_lib/ricomputa-rapportino';
import { inserisciPausaDichiarata, sedeAmmessaPerCantiere } from './_lib/viaggio-timbra';

// Stati in cui il tecnico può ancora modificare il proprio rapportino
// (fino all'approvazione dell'ufficio; dopo, lo tocca solo l'ufficio).
const STATI_MODIFICABILI_TECNICO = new Set(['bozza', 'inviato', 'respinto']);

// ── tipi di ritorno ──────────────────────────────────────────────────────────

type RigaRapportino = {
  id: string;
  commessa_id: string | null;
  cantiere_id: string | null;
  target_label: string;
  ore_ordinarie: number;
  ore_straordinarie: number;
  ore_viaggio: number;
  note: string | null;
};

type RapportinoPayload = {
  id: string;
  data: string;
  stato: string;
  note: string | null;
  righe: RigaRapportino[];
};

type ResultOk = { ok: true; rapportino: RapportinoPayload };
type ResultSimple = { ok: true };
type ResultErr = { ok: false; error: string };

// ── helper guard ─────────────────────────────────────────────────────────────

type CtxOk = { ctx: TenantContext };
type CtxErr = { error: string };

async function ctxConModulo(): Promise<CtxOk | CtxErr> {
  const ctx = await getTenantContext();
  if (!ctx) return { error: 'NON_AUTENTICATO' };
  if (!(await tenantHasModule('kantiere'))) return { error: 'MODULO_OFF' };
  return { ctx };
}

// ── helper dipendente corrente ───────────────────────────────────────────────

async function dipendenteDi(
  supabase: ReturnType<typeof createServerSupabase>,
  tenantId: string,
  userId: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('dipendenti' as never)
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { id: string } | null) ?? null;
}

async function nomeDipendente(
  supabase: ReturnType<typeof createServerSupabase>,
  id: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('dipendenti' as never)
    .select('nome, cognome')
    .eq('id', id)
    .maybeSingle();
  const d = data as { nome: string; cognome: string } | null;
  return d ? `${d.nome} ${d.cognome}`.trim() : null;
}

// ── helper carica titoli commesse ────────────────────────────────────────────

async function titoliCommesse(
  supabase: ReturnType<typeof createServerSupabase>,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase
    .from('commesse' as never)
    .select('id, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali, nome_cartella, codice_interno')
    .in('id', ids);
  const rows = (data as {
    id: string;
    descrizione_ai_finale: string | null;
    descrizione_ai_proposta: string | null;
    note_iniziali: string | null;
    nome_cartella: string | null;
    codice_interno: string | null;
  }[]) ?? [];
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.id, risolviTitoloCommessa(row) || row.codice_interno || row.id);
  }
  return map;
}

// ── helper carica nomi cantieri ──────────────────────────────────────────────

async function nomiCantieri(
  supabase: ReturnType<typeof createServerSupabase>,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase
    .from('cantieri' as never)
    .select('id, nome, codice')
    .in('id', ids);
  const rows = (data as { id: string; nome: string | null; codice: string | null }[]) ?? [];
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.id, row.nome || row.codice || row.id);
  }
  return map;
}

// ── helper risolve label di una riga righe (con entrambe le mappe) ───────────

function labelRiga(
  row: { commessa_id: string | null; cantiere_id: string | null },
  mappaCommesse: Map<string, string>,
  mappaCantieri: Map<string, string>,
): string {
  if (row.cantiere_id) return mappaCantieri.get(row.cantiere_id) ?? row.cantiere_id;
  if (row.commessa_id) return mappaCommesse.get(row.commessa_id) ?? row.commessa_id;
  return '';
}

// ── data locale Europe/Rome ──────────────────────────────────────────────────

function oggiRome(): string {
  // en-CA locale produce YYYY-MM-DD; more reliable than toISOString() (UTC)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
}

// Finestra di auto-modifica del tecnico: oggi + i N giorni precedenti.
const FINESTRA_MODIFICA_GIORNI = 3;

/**
 * Giorni (YYYY-MM-DD) in cui il tecnico può ancora modificare la propria
 * giornata: oggi + i `FINESTRA_MODIFICA_GIORNI` precedenti. Confini Europe/Rome,
 * TZ-safe (ancoraggio a mezzogiorno UTC del giorno italiano corrente, così lo
 * scivolamento di data non capita mai vicino alla mezzanotte).
 */
function calcolaGiorniModificabili(): string[] {
  const noon = Date.parse(`${oggiRome()}T12:00:00Z`);
  const out: string[] = [];
  for (let i = 0; i <= FINESTRA_MODIFICA_GIORNI; i += 1) {
    out.push(new Date(noon - i * 86400000).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Esiste già un rapportino per (dipendente, giorno) OPPURE almeno una timbratura
 * in quel giorno? Serve a `precompilaMioRapportino` per NON creare un rapportino
 * "guscio" vuoto solo perché il tecnico apre la vista di una giornata in cui non
 * ha (ancora) timbrato. Confini-giorno in Europe/Rome.
 */
async function esisteRapportinoOTimbrature(
  supabase: ReturnType<typeof createServerSupabase>,
  tenantId: string,
  dipendenteId: string,
  data: string,
): Promise<boolean> {
  const { data: rapp } = await supabase
    .from('rapportini' as never)
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('dipendente_id', dipendenteId)
    .eq('data', data)
    .maybeSingle();
  if (rapp) return true;
  const { fromIso, toIso } = romeDayBoundsUtc(data);
  const { count } = await supabase
    .from('timbrature' as never)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('dipendente_id', dipendenteId)
    .gte('ts', fromIso)
    .lt('ts', toIso);
  return (count ?? 0) > 0;
}

// Carica le righe di un rapportino esistente come payload per il client.
async function caricaPayloadRapportino(
  supabase: ReturnType<typeof createServerSupabase>,
  rapp: { id: string; data: string; stato: string; note: string | null },
): Promise<RapportinoPayload> {
  const { data: righeRaw } = await supabase
    .from('rapportino_righe' as never)
    .select('id, commessa_id, cantiere_id, ore_ordinarie, ore_straordinarie, ore_viaggio, note')
    .eq('rapportino_id', rapp.id);
  const righeRows = (righeRaw as {
    id: string;
    commessa_id: string | null;
    cantiere_id: string | null;
    ore_ordinarie: number;
    ore_straordinarie: number;
    ore_viaggio: number;
    note: string | null;
  }[]) ?? [];
  const commessaIds = righeRows.flatMap((r) => (r.commessa_id ? [r.commessa_id] : []));
  const cantiereIds = righeRows.flatMap((r) => (r.cantiere_id ? [r.cantiere_id] : []));
  const [mappaCommesse, mappaCantieri] = await Promise.all([
    titoliCommesse(supabase, commessaIds),
    nomiCantieri(supabase, cantiereIds),
  ]);
  const righe: RigaRapportino[] = righeRows.map((rr) => ({
    id: rr.id,
    commessa_id: rr.commessa_id,
    cantiere_id: rr.cantiere_id,
    target_label: labelRiga(rr, mappaCommesse, mappaCantieri),
    ore_ordinarie: Number(rr.ore_ordinarie),
    ore_straordinarie: Number(rr.ore_straordinarie),
    ore_viaggio: Number(rr.ore_viaggio),
    note: rr.note,
  }));
  return { ...rapp, righe };
}

// ── 1) precompilaMioRapportino ───────────────────────────────────────────────

const PrecompilaSchema = z.object({
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function precompilaMioRapportino(
  input: unknown,
): Promise<ResultOk | ResultErr> {
  const parsed = PrecompilaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const r = await ctxConModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;

  const supabase = createServerSupabase();
  const me = await dipendenteDi(supabase, ctx.tenantId, ctx.userId);
  if (!me) return { ok: false, error: 'NESSUN_DIPENDENTE' };

  const data = parsed.data.data ?? oggiRome();

  // Auto-deriva (o ricalcola, se ancora automatico) il rapportino del giorno
  // dalle timbrature, poi carica il payload per il client. MA: se per quel
  // giorno non esiste un rapportino NÉ alcuna timbratura, NON creiamo un guscio
  // vuoto solo perché il tecnico ha aperto la vista — mostriamo un payload vuoto
  // NON persistito. La riga nascerà al primo timbro o con la registrazione
  // manuale (`registraOreManuali`, che crea da sé). Così non si accumulano più
  // giornate-fantasma a 0 ore.
  const rapp = (await esisteRapportinoOTimbrature(supabase, ctx.tenantId, me.id, data))
    ? await ricomputaRapportinoAuto(supabase, ctx.tenantId, me.id, data)
    : null;
  if (!rapp) {
    return { ok: true, rapportino: { id: '', data, stato: 'bozza', note: null, righe: [] } };
  }

  return { ok: true, rapportino: await caricaPayloadRapportino(supabase, rapp) };
}

// ── 2) salvaMioRapportino ────────────────────────────────────────────────────

const RigaSalvaSchema = z
  .object({
    commessa_id: z.string().uuid().nullable().optional(),
    cantiere_id: z.string().uuid().nullable().optional(),
    ore_ordinarie: z.number().min(0).max(24),
    ore_straordinarie: z.number().min(0).max(24),
    ore_viaggio: z.number().min(0).max(24),
    note: z.string().optional(),
  })
  .refine(
    (d) => {
      const hasCommessa = !!d.commessa_id;
      const hasCantiere = !!d.cantiere_id;
      return hasCommessa !== hasCantiere; // XOR: esattamente uno valorizzato
    },
    { message: 'Ogni riga deve avere esattamente uno tra commessa_id e cantiere_id' },
  );

const SalvaSchema = z.object({
  rapportinoId: z.string().uuid(),
  righe: z.array(RigaSalvaSchema),
  note: z.string().optional(),
});

export async function salvaMioRapportino(
  input: unknown,
): Promise<ResultSimple | ResultErr> {
  const parsed = SalvaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const r = await ctxConModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;

  const supabase = createServerSupabase();
  const me = await dipendenteDi(supabase, ctx.tenantId, ctx.userId);
  if (!me) return { ok: false, error: 'NESSUN_DIPENDENTE' };

  // Verifica proprietà e stato bozza
  const { data: rapp } = await supabase
    .from('rapportini' as never)
    .select('id, dipendente_id, stato')
    .eq('id', parsed.data.rapportinoId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  const rappRow = rapp as { id: string; dipendente_id: string; stato: string } | null;
  if (!rappRow) return { ok: false, error: 'NON_TROVATO' };
  if (rappRow.dipendente_id !== me.id) return { ok: false, error: 'FORBIDDEN' };
  // Editabile finché l'ufficio non ha approvato (bozza/inviato/respinto).
  if (!STATI_MODIFICABILI_TECNICO.has(rappRow.stato)) {
    return { ok: false, error: 'NON_MODIFICABILE' };
  }

  // Se si modifica un rapportino già inviato/respinto, conserva uno snapshot
  // della versione corrente PRIMA di sovrascrivere (storico per l'ufficio).
  const eraGiaInviato = rappRow.stato !== 'bozza';
  if (eraGiaInviato) {
    await scriviVersioneRapportino({
      supabase,
      rapportinoId: rappRow.id,
      tenantId: ctx.tenantId,
      azione: 'modifica_tecnico',
      modificatoDa: ctx.userId,
      modificatoDaNome: await nomeDipendente(supabase, me.id),
    });
  }

  // Replace righe: elimina e reinserisci
  const { error: errDel } = await supabase
    .from('rapportino_righe' as never)
    .delete()
    .eq('rapportino_id', parsed.data.rapportinoId);

  if (errDel) return { ok: false, error: errDel.message };

  if (parsed.data.righe.length > 0) {
    const nuoveRighe = parsed.data.righe.map((rr) => ({
      rapportino_id: parsed.data.rapportinoId,
      commessa_id: rr.commessa_id ?? null,
      cantiere_id: rr.cantiere_id ?? null,
      ore_ordinarie: rr.ore_ordinarie,
      ore_straordinarie: rr.ore_straordinarie,
      ore_viaggio: rr.ore_viaggio,
      note: rr.note ?? null,
    }));

    const { error: errIns } = await supabase
      .from('rapportino_righe' as never)
      .insert(nuoveRighe as never);

    if (errIns) return { ok: false, error: errIns.message };
  }

  // Aggiorna nota testata
  const { error: errUpd } = await supabase
    .from('rapportini' as never)
    .update({ note: parsed.data.note ?? null } as never)
    .eq('id', parsed.data.rapportinoId);

  if (errUpd) return { ok: false, error: errUpd.message };

  // Il tecnico ha salvato a mano: stop all'auto-ricalcolo dalle timbrature.
  await marcaRapportinoManuale(supabase, parsed.data.rapportinoId);

  return { ok: true };
}

// ── 3) inviaMioRapportino ────────────────────────────────────────────────────

const InviaSchema = z.object({
  rapportinoId: z.string().uuid(),
});

export async function inviaMioRapportino(
  input: unknown,
): Promise<ResultSimple | ResultErr> {
  const parsed = InviaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const r = await ctxConModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;

  const supabase = createServerSupabase();
  const me = await dipendenteDi(supabase, ctx.tenantId, ctx.userId);
  if (!me) return { ok: false, error: 'NESSUN_DIPENDENTE' };

  const { data: rapp } = await supabase
    .from('rapportini' as never)
    .select('id, dipendente_id, stato')
    .eq('id', parsed.data.rapportinoId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  const rappRow = rapp as { id: string; dipendente_id: string; stato: string } | null;
  if (!rappRow) return { ok: false, error: 'NON_TROVATO' };
  if (rappRow.dipendente_id !== me.id) return { ok: false, error: 'FORBIDDEN' };
  // Inviabile da bozza o (ri-inviabile) da respinto.
  if (rappRow.stato !== 'bozza' && rappRow.stato !== 'respinto') {
    return { ok: false, error: 'NON_MODIFICABILE' };
  }

  const { error: errUpd } = await supabase
    .from('rapportini' as never)
    .update({
      stato: 'inviato',
      inviato_da: ctx.userId,
      inviato_at: new Date().toISOString(),
    } as never)
    .eq('id', parsed.data.rapportinoId);

  if (errUpd) return { ok: false, error: errUpd.message };

  // Snapshot dell'invio (la "prima versione" che l'ufficio consulta).
  await scriviVersioneRapportino({
    supabase,
    rapportinoId: rappRow.id,
    tenantId: ctx.tenantId,
    azione: 'invio',
    modificatoDa: ctx.userId,
    modificatoDaNome: await nomeDipendente(supabase, me.id),
  });

  return { ok: true };
}

// ── 4) registraOreManuali ────────────────────────────────────────────────────
// Il dipendente registra a mano la giornata (es. se non ha timbrato il QR):
// ore di lavoro + tratte di viaggio (stesso flusso sede/autista/mezzo, ma
// tempo inserito a mano). Editabile finché l'ufficio non approva.

const ViaggioManualeSchema = z.object({
  direzione: z.enum(['andata', 'ritorno']),
  sedeId: z.string().uuid(),
  minuti: z.number().int().min(0).max(24 * 60),
  autista: z.boolean(),
  mezzoId: z.string().uuid().nullable().optional(),
  /** km dalla stima API (definitivi). */
  distanzaKm: z.number().nonnegative().max(100000).nullable().optional(),
});

const RegistraManualeSchema = z.object({
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  cantiereId: z.string().uuid(),
  ore_ordinarie: z.number().min(0).max(24),
  ore_straordinarie: z.number().min(0).max(24),
  viaggi: z.array(ViaggioManualeSchema).max(2),
});

export async function registraOreManuali(
  input: unknown,
): Promise<ResultSimple | ResultErr> {
  const parsed = RegistraManualeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const r = await ctxConModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;

  const supabase = createServerSupabase();
  const me = await dipendenteDi(supabase, ctx.tenantId, ctx.userId);
  if (!me) return { ok: false, error: 'NESSUN_DIPENDENTE' };

  const data = parsed.data.data ?? oggiRome();
  const { cantiereId, ore_ordinarie, ore_straordinarie, viaggi } = parsed.data;

  // Valida che cantiere/sedi/mezzi appartengano al tenant (letture RLS-scoped)
  const { data: cantOk } = await supabase
    .from('cantieri' as never)
    .select('id')
    .eq('id', cantiereId)
    .maybeSingle();
  if (!cantOk) return { ok: false, error: 'CANTIERE_NON_VALIDO' };

  for (const v of viaggi) {
    // Sede AMMESSA per il cantiere: predefinita o associata (non una sede di un
    // altro cantiere). Stessa regola delle UI e di `validaViaggio`.
    if (!(await sedeAmmessaPerCantiere(supabase, v.sedeId, cantiereId))) {
      return { ok: false, error: 'SEDE_NON_VALIDA' };
    }
    if (v.autista && v.mezzoId) {
      const { data: mezzoOk } = await supabase
        .from('mezzi' as never)
        .select('id')
        .eq('id', v.mezzoId)
        .maybeSingle();
      if (!mezzoOk) return { ok: false, error: 'MEZZO_NON_VALIDO' };
    }
  }

  // Recupera o crea il rapportino del giorno
  const { data: esistente } = await supabase
    .from('rapportini' as never)
    .select('id, stato')
    .eq('tenant_id', ctx.tenantId)
    .eq('dipendente_id', me.id)
    .eq('data', data)
    .maybeSingle();

  const rapp = esistente as { id: string; stato: string } | null;
  let rapportinoId: string;

  if (rapp) {
    if (!STATI_MODIFICABILI_TECNICO.has(rapp.stato)) {
      return { ok: false, error: 'NON_MODIFICABILE' };
    }
    if (rapp.stato !== 'bozza') {
      await scriviVersioneRapportino({
        supabase,
        rapportinoId: rapp.id,
        tenantId: ctx.tenantId,
        azione: 'modifica_tecnico',
        modificatoDa: ctx.userId,
        modificatoDaNome: await nomeDipendente(supabase, me.id),
      });
    }
    rapportinoId = rapp.id;
  } else {
    const { data: nuovoRaw, error: insErr } = await supabase
      .from('rapportini' as never)
      .insert({
        tenant_id: ctx.tenantId,
        dipendente_id: me.id,
        data,
        stato: 'bozza',
      } as never)
      .select('id')
      .single();
    if (insErr || !nuovoRaw) return { ok: false, error: insErr?.message ?? 'ERRORE_CREAZIONE' };
    rapportinoId = (nuovoRaw as { id: string }).id;
  }

  const oreViaggio =
    Math.round((viaggi.reduce((s, v) => s + v.minuti, 0) / 60) * 100) / 100;

  // Upsert riga per il cantiere
  const { data: rigaRaw } = await supabase
    .from('rapportino_righe' as never)
    .select('id')
    .eq('rapportino_id', rapportinoId)
    .eq('cantiere_id', cantiereId)
    .maybeSingle();
  const riga = rigaRaw as { id: string } | null;

  if (riga) {
    const { error: updErr } = await supabase
      .from('rapportino_righe' as never)
      .update({ ore_ordinarie, ore_straordinarie, ore_viaggio: oreViaggio } as never)
      .eq('id', riga.id);
    if (updErr) return { ok: false, error: updErr.message };
  } else {
    const { error: insRigaErr } = await supabase.from('rapportino_righe' as never).insert({
      rapportino_id: rapportinoId,
      commessa_id: null,
      cantiere_id: cantiereId,
      ore_ordinarie,
      ore_straordinarie,
      ore_viaggio: oreViaggio,
    } as never);
    if (insRigaErr) return { ok: false, error: insRigaErr.message };
  }

  // Tratte di viaggio manuali (senza timbratura, con cantiere+data).
  // Ripulisci prima le manuali precedenti per (dipendente, cantiere, data) così
  // un risalvataggio non accumula duplicati.
  await supabase
    .from('timbratura_viaggio' as never)
    .delete()
    .eq('tenant_id', ctx.tenantId)
    .eq('dipendente_id', me.id)
    .eq('cantiere_id', cantiereId)
    .eq('data', data)
    .is('timbratura_id', null);

  for (const v of viaggi) {
    if (v.minuti <= 0) continue;
    await supabase.from('timbratura_viaggio' as never).insert({
      tenant_id: ctx.tenantId,
      timbratura_id: null,
      cantiere_id: cantiereId,
      data,
      dipendente_id: me.id,
      direzione: v.direzione,
      sede_id: v.sedeId,
      durata_stimata_min: null,
      durata_confermata_min: v.minuti,
      distanza_km: v.distanzaKm ?? null,
      giustificazione: null,
      autista: v.autista,
      mezzo_id: v.autista ? v.mezzoId ?? null : null,
    } as never);
  }

  // Inserimento a mano: stop all'auto-ricalcolo dalle timbrature.
  await marcaRapportinoManuale(supabase, rapportinoId);

  return { ok: true };
}

// ── 5) mioStoricoRapportini ──────────────────────────────────────────────────
// Storico degli ultimi N giorni del dipendente corrente (default 30): per ogni
// rapportino, totale ore ord/straord/viaggio + stato. Per la PWA "Le mie ore".

const StoricoSchema = z.object({ giorni: z.number().int().min(1).max(90).optional() });

export type GiornoStorico = {
  id: string;
  data: string;
  stato: string;
  ord: number;
  straord: number;
  viaggio: number;
};

export async function mioStoricoRapportini(
  input: unknown,
): Promise<{ ok: true; giorni: GiornoStorico[] } | ResultErr> {
  const parsed = StoricoSchema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const r = await ctxConModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;

  const supabase = createServerSupabase();
  const me = await dipendenteDi(supabase, ctx.tenantId, ctx.userId);
  if (!me) return { ok: false, error: 'NESSUN_DIPENDENTE' };

  const n = parsed.data.giorni ?? 30;
  const from = new Date();
  from.setDate(from.getDate() - (n - 1));
  const fromStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(from);

  const { data: rappsRaw } = await supabase
    .from('rapportini' as never)
    .select('id, data, stato')
    .eq('tenant_id', ctx.tenantId)
    .eq('dipendente_id', me.id)
    .gte('data', fromStr)
    .order('data', { ascending: false });
  const rows = (rappsRaw as { id: string; data: string; stato: string }[] | null) ?? [];
  if (rows.length === 0) return { ok: true, giorni: [] };

  const ids = rows.map((x) => x.id);
  const { data: righeRaw } = await supabase
    .from('rapportino_righe' as never)
    .select('rapportino_id, ore_ordinarie, ore_straordinarie, ore_viaggio')
    .in('rapportino_id', ids);

  const tot = new Map<string, { ord: number; straord: number; viaggio: number }>();
  for (const rr of (righeRaw as {
    rapportino_id: string;
    ore_ordinarie: number;
    ore_straordinarie: number;
    ore_viaggio: number;
  }[] | null) ?? []) {
    const e = tot.get(rr.rapportino_id) ?? { ord: 0, straord: 0, viaggio: 0 };
    e.ord += Number(rr.ore_ordinarie) || 0;
    e.straord += Number(rr.ore_straordinarie) || 0;
    e.viaggio += Number(rr.ore_viaggio) || 0;
    tot.set(rr.rapportino_id, e);
  }

  return {
    ok: true,
    giorni: rows.map((x) => {
      const t = tot.get(x.id) ?? { ord: 0, straord: 0, viaggio: 0 };
      return { id: x.id, data: x.data, stato: x.stato, ord: t.ord, straord: t.straord, viaggio: t.viaggio };
    }),
  };
}

// ── 6) caricaMiaGiornata (loader del dialog di modifica) ─────────────────────
// Dettaglio per-cantiere di una giornata (oggi + i 3 gg precedenti) per
// precompilare il dialog di modifica del tecnico. Riflette le timbrature come
// `precompilaMioRapportino`, e indica se c'è già una pausa e se la giornata è
// chiusa (per abilitare l'aggiunta della pausa pranzo).

const CaricaGiornataSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type RigaGiornataModifica = {
  commessa_id: string | null;
  cantiere_id: string | null;
  target_label: string;
  ore_lavoro: number;
  ore_viaggio: number;
};

export async function caricaMiaGiornata(
  input: unknown,
): Promise<
  | {
      ok: true;
      data: string;
      stato: string;
      modificabile: boolean;
      pausaPresente: boolean;
      /** Durata (min) della pausa già registrata, o null se assente. */
      pausaMinutiEsistente: number | null;
      giornataChiusa: boolean;
      righe: RigaGiornataModifica[];
    }
  | ResultErr
> {
  const parsed = CaricaGiornataSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const r = await ctxConModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;

  const supabase = createServerSupabase();
  const me = await dipendenteDi(supabase, ctx.tenantId, ctx.userId);
  if (!me) return { ok: false, error: 'NESSUN_DIPENDENTE' };

  const { data } = parsed.data;
  const modificabile = calcolaGiorniModificabili().includes(data);

  // Righe correnti (riflettono le timbrature, come la vista "oggi").
  const rapp = (await esisteRapportinoOTimbrature(supabase, ctx.tenantId, me.id, data))
    ? await ricomputaRapportinoAuto(supabase, ctx.tenantId, me.id, data)
    : null;

  let righe: RigaGiornataModifica[] = [];
  let stato = 'bozza';
  if (rapp) {
    const payload = await caricaPayloadRapportino(supabase, rapp);
    stato = payload.stato;
    righe = payload.righe.map((rr) => ({
      commessa_id: rr.commessa_id,
      cantiere_id: rr.cantiere_id,
      target_label: rr.target_label,
      ore_lavoro: rr.ore_ordinarie + rr.ore_straordinarie,
      ore_viaggio: rr.ore_viaggio,
    }));
  }

  // Pausa già presente? Giornata chiusa (ingresso + uscita reali)?
  const { fromIso, toIso } = romeDayBoundsUtc(data);
  const { data: timbRaw } = await supabase
    .from('timbrature' as never)
    .select('tipo, pausa, ts')
    .eq('tenant_id', ctx.tenantId)
    .eq('dipendente_id', me.id)
    .gte('ts', fromIso)
    .lt('ts', toIso);
  const timb =
    (timbRaw as { tipo: 'ingresso' | 'uscita'; pausa: boolean | null; ts: string }[] | null) ?? [];
  const pausaPresente = timb.some((t) => t.pausa);
  const lavori = timb.filter((t) => !t.pausa);
  const giornataChiusa =
    lavori.some((t) => t.tipo === 'ingresso') && lavori.some((t) => t.tipo === 'uscita');

  // Durata della pausa già registrata (coppia uscita→ingresso con pausa=true),
  // così il dialog può precompilarla e permetterne la modifica.
  let pausaMinutiEsistente: number | null = null;
  const pause = timb.filter((t) => t.pausa);
  const usPausa = pause.find((t) => t.tipo === 'uscita');
  const igPausa = pause.find((t) => t.tipo === 'ingresso');
  if (usPausa && igPausa) {
    const m = Math.round((Date.parse(igPausa.ts) - Date.parse(usPausa.ts)) / 60000);
    if (m > 0) pausaMinutiEsistente = m;
  }

  return {
    ok: true,
    data,
    stato,
    modificabile,
    pausaPresente,
    pausaMinutiEsistente,
    giornataChiusa,
    righe,
  };
}

// ── 7) modificaMiaGiornata (tecnico: modifica ultimi 3 giorni) ───────────────
// Il tecnico corregge le proprie ore (e/o aggiunge la pausa pranzo) di oggi o
// dei 3 giorni precedenti. La modifica è immediata, versionata e avvisa
// l'ufficio (notifica di sistema). Gate di proprietà + finestra + stato.

const RigaModificaSchema = z
  .object({
    commessa_id: z.string().uuid().nullable().optional(),
    cantiere_id: z.string().uuid().nullable().optional(),
    ore_lavoro: z.number().min(0).max(24),
    ore_viaggio: z.number().min(0).max(24),
  })
  .refine((d) => !!d.commessa_id !== !!d.cantiere_id, {
    message: 'Ogni riga deve avere esattamente uno tra commessa_id e cantiere_id',
  });

const ModificaGiornataSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  righe: z.array(RigaModificaSchema).max(50),
  pausaMinuti: z.number().int().min(5).max(240).nullable().optional(),
});

/**
 * Notifica di sistema all'ufficio (utenti office/admin del tenant, escluso chi
 * modifica) che un tecnico ha corretto le ore di una giornata. Best-effort via
 * service role (l'attore tecnico non vede le righe `notifiche` altrui).
 */
async function notificaModificaTecnicoOffice(
  tenantId: string,
  attoreUserId: string,
  info: { rapportinoId: string; dipendenteId: string; dipendenteNome: string; data: string },
): Promise<void> {
  try {
    const service = createServiceSupabase();
    const { data: destRaw } = await service
      .from('users')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('role', ['admin', 'office'])
      .eq('attivo', true);
    const dest = ((destRaw as { id: string }[] | null) ?? []).filter(
      (u) => u.id !== attoreUserId,
    );
    if (dest.length === 0) return;

    const url = `/office/kantiere/rapportini?giorno=${info.data}`;
    const rows = dest.map((u) => ({
      tenant_id: tenantId,
      user_id: u.id,
      type: 'kantiere_modifica_tecnico',
      payload: {
        rapportinoId: info.rapportinoId,
        dipendenteId: info.dipendenteId,
        dipendenteNome: info.dipendenteNome,
        data: info.data,
        url,
      },
    }));
    await service.from('notifiche').insert(rows);
  } catch (e) {
    console.warn('[modificaMiaGiornata] notifica office fallita', e);
  }
}

export async function modificaMiaGiornata(
  input: unknown,
): Promise<ResultSimple | ResultErr> {
  const parsed = ModificaGiornataSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const r = await ctxConModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;

  const supabase = createServerSupabase();
  const me = await dipendenteDi(supabase, ctx.tenantId, ctx.userId);
  if (!me) return { ok: false, error: 'NESSUN_DIPENDENTE' };

  const { data, righe, pausaMinuti } = parsed.data;

  // Finestra: oggi + i 3 giorni precedenti (Europe/Rome).
  if (!calcolaGiorniModificabili().includes(data)) {
    return { ok: false, error: 'FUORI_FINESTRA' };
  }

  // Stato: bloccata SOLO se l'ufficio l'ha approvata/respinta a mano
  // (`approvato_da` valorizzato). Le giornate auto-approvate dal sistema
  // (`approvato_da` NULL) restano modificabili: si riapre e si riversiona.
  const { data: rappPre } = await supabase
    .from('rapportini' as never)
    .select('id, stato, approvato_da')
    .eq('tenant_id', ctx.tenantId)
    .eq('dipendente_id', me.id)
    .eq('data', data)
    .maybeSingle();
  const pre = rappPre as { id: string; stato: string; approvato_da: string | null } | null;
  if (pre?.approvato_da) return { ok: false, error: 'NON_MODIFICABILE' };

  // 1) Pausa pranzo dichiarata: coppia-pausa centrata nel turno reale (come
  //    fa l'ufficio in `aggiungiPausaGiornata`). Se una pausa esiste già, la si
  //    SOSTITUISCE (il tecnico può correggerne la durata): rimozione della
  //    coppia pausa=true del giorno + reinserimento centrato.
  if (pausaMinuti && pausaMinuti > 0) {
    const { fromIso, toIso } = romeDayBoundsUtc(data);
    const { data: timbRaw } = await supabase
      .from('timbrature' as never)
      .select('commessa_id, cantiere_id, tipo, ts, pausa')
      .eq('tenant_id', ctx.tenantId)
      .eq('dipendente_id', me.id)
      .gte('ts', fromIso)
      .lt('ts', toIso)
      .order('ts', { ascending: true });
    const timb =
      (timbRaw as
        | {
            commessa_id: string | null;
            cantiere_id: string | null;
            tipo: 'ingresso' | 'uscita';
            ts: string;
            pausa: boolean | null;
          }[]
        | null) ?? [];
    // Il turno reale è dato dalle timbrature di lavoro (pausa esclusa).
    const lavori = timb.filter((t) => !t.pausa);
    const primoIngresso = lavori.find((t) => t.tipo === 'ingresso');
    const ultimaUscita = [...lavori].reverse().find((t) => t.tipo === 'uscita');
    if (!primoIngresso || !ultimaUscita) return { ok: false, error: 'GIORNATA_NON_CHIUSA' };
    const durataMin = (Date.parse(ultimaUscita.ts) - Date.parse(primoIngresso.ts)) / 60000;
    if (!(durataMin > 0)) return { ok: false, error: 'TURNO_NON_VALIDO' };
    if (pausaMinuti >= durataMin) return { ok: false, error: 'PAUSA_TROPPO_LUNGA' };

    // Sostituzione: se esiste già una pausa, rimuovo la coppia pausa=true del
    // giorno (user client, la policy `for all` sulle timbrature lo consente al
    // tecnico nel proprio tenant), poi reinserisco la nuova durata centrata.
    if (timb.some((t) => t.pausa)) {
      await supabase
        .from('timbrature' as never)
        .delete()
        .eq('tenant_id', ctx.tenantId)
        .eq('dipendente_id', me.id)
        .eq('pausa', true)
        .gte('ts', fromIso)
        .lt('ts', toIso);
    }
    await inserisciPausaDichiarata(supabase, {
      tenantId: ctx.tenantId,
      dipendenteId: me.id,
      commessaId: primoIngresso.commessa_id,
      cantiereId: primoIngresso.cantiere_id,
      creatoDa: ctx.userId,
      startIso: primoIngresso.ts,
      endIso: ultimaUscita.ts,
      minuti: pausaMinuti,
    });
  }

  // 2) Ricalcolo: riflette timbrature + pausa e ri-valuta l'auto-approvazione.
  const rappBase = await ricomputaRapportinoAuto(supabase, ctx.tenantId, me.id, data);
  if (!rappBase) return { ok: false, error: 'ERRORE_RAPPORTINO' };
  const rapportinoId = rappBase.id;

  // 3) Applica le ore inserite dal tecnico (override esplicito, per target).
  //    Upsert come `registraOreManuali`: aggiorna la riga se esiste, altrimenti
  //    la crea. Le ore di lavoro finiscono in `ore_ordinarie` (il tecnico non
  //    distingue ord/straord dal suo dialog).
  for (const rr of righe) {
    const filtroCol = rr.cantiere_id ? 'cantiere_id' : 'commessa_id';
    const filtroVal = rr.cantiere_id ?? (rr.commessa_id as string);
    const { data: rigaRaw } = await supabase
      .from('rapportino_righe' as never)
      .select('id')
      .eq('rapportino_id', rapportinoId)
      .eq(filtroCol, filtroVal)
      .maybeSingle();
    const riga = rigaRaw as { id: string } | null;
    if (riga) {
      await supabase
        .from('rapportino_righe' as never)
        .update({
          ore_ordinarie: rr.ore_lavoro,
          ore_straordinarie: 0,
          ore_viaggio: rr.ore_viaggio,
        } as never)
        .eq('id', riga.id);
    } else {
      await supabase.from('rapportino_righe' as never).insert({
        rapportino_id: rapportinoId,
        commessa_id: rr.commessa_id ?? null,
        cantiere_id: rr.cantiere_id ?? null,
        ore_ordinarie: rr.ore_lavoro,
        ore_straordinarie: 0,
        ore_viaggio: rr.ore_viaggio,
      } as never);
    }
  }

  // Modifica a mano del tecnico: stop all'auto-ricalcolo (le sue ore restano).
  if (righe.length > 0) {
    await marcaRapportinoManuale(supabase, rapportinoId);
  }

  // 4) Versione tracciata (storico per l'ufficio).
  const modificatoDaNome = await nomeDipendente(supabase, me.id);
  await scriviVersioneRapportino({
    supabase,
    rapportinoId,
    tenantId: ctx.tenantId,
    azione: 'modifica_tecnico',
    modificatoDa: ctx.userId,
    modificatoDaNome,
  });

  // 5) Notifica di sistema all'ufficio (campanella office). Chi modifica NON
  //    la riceve.
  await notificaModificaTecnicoOffice(ctx.tenantId, ctx.userId, {
    rapportinoId,
    dipendenteId: me.id,
    dipendenteNome: modificatoDaNome ?? 'Un tecnico',
    data,
  });

  return { ok: true };
}

// Approvazione/respinta/riapertura rapportini: implementate lato ufficio in
// `app/office/_actions/kantiere-rapportini.ts` (Fase F), gated office/admin.
