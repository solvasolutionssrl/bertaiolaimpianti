'use server';

import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { getTenantContext, type TenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import {
  minutiPerCommessa,
  calcolaOreGiornata,
  minutiViaggioPerTarget,
} from '@kommessa/api/kantiere-ore';
import { targetTimbratura } from '@kommessa/api/kantiere';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';
import { scriviVersioneRapportino } from './_lib/scrivi-versione-rapportino';

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

// ── soglia ore ordinarie del tenant ─────────────────────────────────────────

async function sogliaOreTenant(tenantId: string): Promise<number> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('module_code', 'kantiere')
    .maybeSingle();
  const row = data as { config: Record<string, unknown> | null } | null;
  const val = row?.config?.['soglia_ore_ordinarie'];
  if (typeof val === 'number' && val > 0) return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 8;
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

// ── chiave sintetica target ──────────────────────────────────────────────────
// Rappresenta il target di una riga/timbratura come stringa univoca per
// permettere il grouping con minutiPerCommessa/calcolaOreGiornata.

function chiaveTarget(row: { commessa_id: string | null; cantiere_id: string | null }): string {
  const t = targetTimbratura(row);
  if (!t) return '';
  return t.tipo === 'cantiere' ? `cantiere:${t.id}` : `commessa:${t.id}`;
}

function decodeChiave(key: string): { commessa_id: string | null; cantiere_id: string | null } {
  if (key.startsWith('cantiere:')) {
    return { commessa_id: null, cantiere_id: key.slice('cantiere:'.length) };
  }
  if (key.startsWith('commessa:')) {
    return { commessa_id: key.slice('commessa:'.length), cantiere_id: null };
  }
  // fallback: trattalo come commessa_id puro (compatibilità eventuale)
  return { commessa_id: key || null, cantiere_id: null };
}

// ── minuti → ore (2 decimali) ────────────────────────────────────────────────

function oreDaMin(min: number): number {
  return Math.round((min / 60) * 100) / 100;
}

// ── viaggio per target dalle timbrature del giorno ───────────────────────────
// Somma durata_confermata_min di timbratura_viaggio, attribuita al target
// (commessa/cantiere) della timbratura collegata.

async function calcolaViaggioPerTarget(
  supabase: ReturnType<typeof createServerSupabase>,
  timbrature: { id: string; commessa_id: string | null; cantiere_id: string | null }[],
): Promise<Map<string, number>> {
  if (timbrature.length === 0) return new Map();
  const idToKey = new Map<string, string>();
  for (const t of timbrature) {
    const key = chiaveTarget(t);
    if (key) idToKey.set(t.id, key);
  }
  const ids = Array.from(idToKey.keys());
  if (ids.length === 0) return new Map();

  const { data } = await supabase
    .from('timbratura_viaggio' as never)
    .select('timbratura_id, durata_confermata_min')
    .in('timbratura_id', ids);

  const rows =
    (data as { timbratura_id: string; durata_confermata_min: number }[] | null) ?? [];
  const viaggi = rows.map((r) => ({
    targetKey: idToKey.get(r.timbratura_id) ?? '',
    minuti: Number(r.durata_confermata_min) || 0,
  }));
  return minutiViaggioPerTarget(viaggi);
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

  // Cerca rapportino esistente
  const { data: esistente } = await supabase
    .from('rapportini' as never)
    .select('id, data, stato, note')
    .eq('dipendente_id', me.id)
    .eq('data', data)
    .maybeSingle();

  const rapp = esistente as {
    id: string;
    data: string;
    stato: string;
    note: string | null;
  } | null;

  if (rapp) {
    // Carica righe esistenti senza ricalcolare
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

    return { ok: true, rapportino: { ...rapp, righe } };
  }

  // Crea nuovo rapportino in bozza
  const { data: nuovoRaw, error: errInserisci } = await supabase
    .from('rapportini' as never)
    .insert({
      tenant_id: ctx.tenantId,
      dipendente_id: me.id,
      data,
      stato: 'bozza',
    } as never)
    .select('id, data, stato, note')
    .single();

  if (errInserisci || !nuovoRaw)
    return { ok: false, error: errInserisci?.message ?? 'ERRORE_CREAZIONE' };

  const nuovo = nuovoRaw as { id: string; data: string; stato: string; note: string | null };

  // Query timbrature del giorno — sia commessa_id che cantiere_id.
  // Usiamo date-string bounds (${data}T00:00:00Z .. T23:59:59Z) — approssimazione nota:
  // per i tenant in Europe/Rome (UTC+1/+2) le timbrature nelle prime/ultime ore locali
  // al confine del giorno UTC potrebbero essere incluse/escluse con un delta di 1-2h.
  // Accettabile per il suggerimento precompilato (l'utente può correggere manualmente).
  const dataSuccessiva = new Date(`${data}T00:00:00Z`);
  dataSuccessiva.setUTCDate(dataSuccessiva.getUTCDate() + 1);
  const dataSuccessivaStr = dataSuccessiva.toISOString().slice(0, 10);

  const { data: timbratureRaw } = await supabase
    .from('timbrature' as never)
    .select('id, commessa_id, cantiere_id, tipo, ts')
    .eq('dipendente_id', me.id)
    .gte('ts', `${data}T00:00:00Z`)
    .lt('ts', `${dataSuccessivaStr}T00:00:00Z`)
    .order('ts', { ascending: true });

  const timbratureDB = (timbratureRaw as {
    id: string;
    commessa_id: string | null;
    cantiere_id: string | null;
    tipo: 'ingresso' | 'uscita';
    ts: string;
  }[]) ?? [];

  // Minuti di viaggio (andata + ritorno) per target, dal collegamento
  // timbratura_viaggio. Il viaggio è EXTRA: alimenta ore_viaggio della riga
  // senza concorrere alla soglia degli straordinari (gestita su lavoro).
  const viaggioPerTarget = await calcolaViaggioPerTarget(supabase, timbratureDB);

  const righe: RigaRapportino[] = [];

  if (timbratureDB.length > 0) {
    // Mappa a chiave sintetica per il grouping polimorfico
    const timbratureSintetiche = timbratureDB
      .map((t) => {
        const chiave = chiaveTarget(t);
        if (!chiave) return null;
        return { commessa_id: chiave, tipo: t.tipo, ts: t.ts };
      })
      .filter((t): t is { commessa_id: string; tipo: 'ingresso' | 'uscita'; ts: string } => t !== null);

    const minutiMap = minutiPerCommessa(timbratureSintetiche);
    const minutiLavorati = Array.from(minutiMap.entries()).map(([chiave, minuti]) => ({
      commessa_id: chiave,
      minuti,
    }));

    const soglia = await sogliaOreTenant(ctx.tenantId);
    const risultato = calcolaOreGiornata({
      minutiLavoratiPerCommessa: minutiLavorati,
      sogliaOreOrdinarie: soglia,
    });

    // Fonde righe di lavoro (ord/straord) + viaggio per target. I target con
    // solo viaggio (nessuna coppia ingresso/uscita completa) ottengono comunque
    // una riga con le sole ore_viaggio.
    const righeMap = new Map<string, { ord: number; straord: number; viaggioMin: number }>();
    for (const rr of risultato.righe) {
      righeMap.set(rr.commessa_id, {
        ord: rr.ore_ordinarie,
        straord: rr.ore_straordinarie,
        viaggioMin: 0,
      });
    }
    for (const [key, min] of viaggioPerTarget) {
      const e = righeMap.get(key) ?? { ord: 0, straord: 0, viaggioMin: 0 };
      e.viaggioMin = min;
      righeMap.set(key, e);
    }

    if (righeMap.size > 0) {
      // Decodifica le chiavi sintetiche → FK reali
      const righeInsert = Array.from(righeMap.entries()).map(([key, v]) => {
        const fk = decodeChiave(key);
        return {
          rapportino_id: nuovo.id,
          commessa_id: fk.commessa_id,
          cantiere_id: fk.cantiere_id,
          ore_ordinarie: v.ord,
          ore_straordinarie: v.straord,
          ore_viaggio: oreDaMin(v.viaggioMin),
        };
      });

      const { data: righeInserite, error: errRighe } = await supabase
        .from('rapportino_righe' as never)
        .insert(righeInsert as never)
        .select('id, commessa_id, cantiere_id, ore_ordinarie, ore_straordinarie, ore_viaggio, note');

      if (errRighe) return { ok: false, error: errRighe.message };

      const righeRows = (righeInserite as {
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

      for (const rr of righeRows) {
        righe.push({
          id: rr.id,
          commessa_id: rr.commessa_id,
          cantiere_id: rr.cantiere_id,
          target_label: labelRiga(rr, mappaCommesse, mappaCantieri),
          ore_ordinarie: Number(rr.ore_ordinarie),
          ore_straordinarie: Number(rr.ore_straordinarie),
          ore_viaggio: Number(rr.ore_viaggio),
          note: rr.note,
        });
      }
    }
  }

  return { ok: true, rapportino: { ...nuovo, righe } };
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

// Approvazione/respinta/riapertura rapportini: implementate lato ufficio in
// `app/office/_actions/kantiere-rapportini.ts` (Fase F), gated office/admin.
