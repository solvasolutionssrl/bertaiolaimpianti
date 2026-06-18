'use server';

import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { getTenantContext, type TenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import { minutiPerCommessa, calcolaOreGiornata } from '@kommessa/api/kantiere-ore';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';

// ── tipi di ritorno ──────────────────────────────────────────────────────────

type RigaRapportino = {
  id: string;
  commessa_id: string;
  commessa_titolo: string;
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
      .select('id, commessa_id, ore_ordinarie, ore_straordinarie, ore_viaggio, note')
      .eq('rapportino_id', rapp.id);

    const righeRows = (righeRaw as {
      id: string;
      commessa_id: string;
      ore_ordinarie: number;
      ore_straordinarie: number;
      ore_viaggio: number;
      note: string | null;
    }[]) ?? [];

    const commessaIds = righeRows.map((r) => r.commessa_id);
    const titoli = await titoliCommesse(supabase, commessaIds);

    const righe: RigaRapportino[] = righeRows.map((rr) => ({
      id: rr.id,
      commessa_id: rr.commessa_id,
      commessa_titolo: titoli.get(rr.commessa_id) ?? rr.commessa_id,
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

  // Query timbrature del giorno.
  // Usiamo date-string bounds (${data}T00:00:00Z .. T23:59:59Z) — approssimazione nota:
  // per i tenant in Europe/Rome (UTC+1/+2) le timbrature nelle prime/ultime ore locali
  // al confine del giorno UTC potrebbero essere incluse/escluse con un delta di 1-2h.
  // Accettabile per il suggerimento precompilato (l'utente può correggere manualmente).
  const dataSuccessiva = new Date(`${data}T00:00:00Z`);
  dataSuccessiva.setUTCDate(dataSuccessiva.getUTCDate() + 1);
  const dataSuccessivaStr = dataSuccessiva.toISOString().slice(0, 10);

  const { data: timbratureRaw } = await supabase
    .from('timbrature' as never)
    .select('commessa_id, tipo, ts')
    .eq('dipendente_id', me.id)
    .gte('ts', `${data}T00:00:00Z`)
    .lt('ts', `${dataSuccessivaStr}T00:00:00Z`)
    .order('ts', { ascending: true });

  const timbrature = (timbratureRaw as {
    commessa_id: string;
    tipo: 'ingresso' | 'uscita';
    ts: string;
  }[]) ?? [];

  const righe: RigaRapportino[] = [];

  if (timbrature.length > 0) {
    const minutiMap = minutiPerCommessa(timbrature);
    const minutiLavorati = Array.from(minutiMap.entries()).map(([commessa_id, minuti]) => ({
      commessa_id,
      minuti,
    }));

    const soglia = await sogliaOreTenant(ctx.tenantId);
    const risultato = calcolaOreGiornata({
      minutiLavoratiPerCommessa: minutiLavorati,
      sogliaOreOrdinarie: soglia,
    });

    if (risultato.righe.length > 0) {
      const righeInsert = risultato.righe.map((rr) => ({
        rapportino_id: nuovo.id,
        commessa_id: rr.commessa_id,
        ore_ordinarie: rr.ore_ordinarie,
        ore_straordinarie: rr.ore_straordinarie,
        ore_viaggio: 0,
      }));

      const { data: righeInserite, error: errRighe } = await supabase
        .from('rapportino_righe' as never)
        .insert(righeInsert as never)
        .select('id, commessa_id, ore_ordinarie, ore_straordinarie, ore_viaggio, note');

      if (errRighe) return { ok: false, error: errRighe.message };

      const righeRows = (righeInserite as {
        id: string;
        commessa_id: string;
        ore_ordinarie: number;
        ore_straordinarie: number;
        ore_viaggio: number;
        note: string | null;
      }[]) ?? [];

      const commessaIds = righeRows.map((r) => r.commessa_id);
      const titoli = await titoliCommesse(supabase, commessaIds);

      for (const rr of righeRows) {
        righe.push({
          id: rr.id,
          commessa_id: rr.commessa_id,
          commessa_titolo: titoli.get(rr.commessa_id) ?? rr.commessa_id,
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

const RigaSalvaSchema = z.object({
  commessa_id: z.string().uuid(),
  ore_ordinarie: z.number().min(0).max(24),
  ore_straordinarie: z.number().min(0).max(24),
  ore_viaggio: z.number().min(0).max(24),
  note: z.string().optional(),
});

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
  if (rappRow.stato !== 'bozza') return { ok: false, error: 'NON_MODIFICABILE' };

  // Replace righe: elimina e reinserisci
  const { error: errDel } = await supabase
    .from('rapportino_righe' as never)
    .delete()
    .eq('rapportino_id', parsed.data.rapportinoId);

  if (errDel) return { ok: false, error: errDel.message };

  if (parsed.data.righe.length > 0) {
    const nuoveRighe = parsed.data.righe.map((rr) => ({
      rapportino_id: parsed.data.rapportinoId,
      commessa_id: rr.commessa_id,
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
  if (rappRow.stato !== 'bozza') return { ok: false, error: 'NON_MODIFICABILE' };

  const { error: errUpd } = await supabase
    .from('rapportini' as never)
    .update({
      stato: 'inviato',
      inviato_da: ctx.userId,
      inviato_at: new Date().toISOString(),
    } as never)
    .eq('id', parsed.data.rapportinoId);

  if (errUpd) return { ok: false, error: errUpd.message };

  return { ok: true };
}

// Approvazione/respinta/riapertura rapportini: implementate lato ufficio in
// `app/office/_actions/kantiere-rapportini.ts` (Fase F), gated office/admin.
