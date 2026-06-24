'use server';

import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { getTenantContext, type TenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import {
  prossimoTipoTimbratura,
  statoTurno,
  SOGLIA_PAUSA_PRANZO_ORE,
  type StatoTurno,
} from '@kommessa/api/kantiere-ore';
import { puoTimbrarePer, targetTimbratura } from '@kommessa/api/kantiere';
import { romeDay, romeDayBoundsUtc } from '@kommessa/api/rome-time';
import { ricomputaRapportinoAuto } from './_lib/ricomputa-rapportino';

/** Azione esplicita scelta dal tecnico quando il turno è già attivo. */
export type AzioneTimbra = 'inizio' | 'fine' | 'pausa' | 'ripresa';

type Ok = { ok: true; tipo: 'ingresso' | 'uscita'; pausa: boolean; ts: string };
type Result = Ok | { ok: false; error: string };

const GeoSchema = z.object({ lat: z.number(), lng: z.number() }).partial().optional();

// ── lookup token (pubblico, service) → target polimorfico + tenant ──────
async function risolviToken(token: string) {
  const svc = createServiceSupabase();
  const { data } = await svc
    .from('cantiere_qr' as never)
    .select('commessa_id, cantiere_id, tenant_id, attivo')
    .eq('token', token)
    .maybeSingle();
  return data as {
    commessa_id: string | null;
    cantiere_id: string | null;
    tenant_id: string;
    attivo: boolean;
  } | null;
}

type CtxOk = { ctx: TenantContext };
type CtxErr = { error: string };

// ── helper comune: contesto + dipendente corrente ───────────────────────
async function ctxConModulo(): Promise<CtxOk | CtxErr> {
  const ctx = await getTenantContext();
  if (!ctx) return { error: 'NON_AUTENTICATO' };
  if (!(await tenantHasModule('kantiere'))) return { error: 'MODULO_OFF' };
  return { ctx };
}

async function dipendenteDi(
  supabase: ReturnType<typeof createServerSupabase>,
  tenantId: string,
  userId: string,
): Promise<{ id: string; nome: string; cognome: string } | null> {
  const { data } = await supabase
    .from('dipendenti' as never)
    .select('id, nome, cognome')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { id: string; nome: string; cognome: string } | null) ?? null;
}

type EventoOggi = { tipo: 'ingresso' | 'uscita'; ts: string; pausa: boolean | null };

/** Timbrature del giorno calendario italiano (Europe/Rome) per dipendente+target. */
async function eventiOggi(
  supabase: ReturnType<typeof createServerSupabase>,
  dipendenteId: string,
  target: { tipo: 'commessa' | 'cantiere'; id: string },
): Promise<EventoOggi[]> {
  const { fromIso, toIso } = romeDayBoundsUtc(romeDay(new Date()));
  const q = supabase
    .from('timbrature' as never)
    .select('tipo, ts, pausa')
    .eq('dipendente_id', dipendenteId)
    .gte('ts', fromIso)
    .lt('ts', toIso)
    .order('ts', { ascending: true });
  const { data } =
    target.tipo === 'commessa'
      ? await q.eq('commessa_id', target.id)
      : await q.eq('cantiere_id', target.id);
  return (data as EventoOggi[] | null) ?? [];
}

/** Azioni ammesse per stato turno (validazione server contro stato stantio). */
const AZIONI_AMMESSE: Record<AzioneTimbra, StatoTurno[]> = {
  inizio: ['idle'],
  fine: ['lavoro', 'pausa'],
  pausa: ['lavoro'],
  ripresa: ['pausa'],
};

/**
 * Inserisce una pausa pranzo "dichiarata" in uscita come coppia di timbrature
 * (uscita pausa → ingresso pausa) centrata nel turno. Riusa il modello pausa
 * esistente: il calcolo ore esclude già il gap, quindi sottrae esattamente i
 * minuti dichiarati. Marcata `origine='manuale'` per distinguerla nel tracking.
 */
async function inserisciPausaDichiarata(
  supabase: ReturnType<typeof createServerSupabase>,
  opts: {
    tenantId: string;
    dipendenteId: string;
    commessaId: string | null;
    cantiereId: string | null;
    creatoDa: string;
    startIso: string;
    endIso: string;
    minuti: number;
  },
): Promise<void> {
  const start = Date.parse(opts.startIso);
  const end = Date.parse(opts.endIso);
  const mid = (start + end) / 2;
  const half = (opts.minuti * 60000) / 2;
  const pausaOut = new Date(mid - half).toISOString();
  const pausaIn = new Date(mid + half).toISOString();
  const base = {
    tenant_id: opts.tenantId,
    dipendente_id: opts.dipendenteId,
    commessa_id: opts.commessaId,
    cantiere_id: opts.cantiereId,
    pausa: true,
    origine: 'manuale',
    creato_da: opts.creatoDa,
  };
  await supabase.from('timbrature' as never).insert([
    { ...base, tipo: 'uscita', ts: pausaOut },
    { ...base, tipo: 'ingresso', ts: pausaIn },
  ] as never);
}

/** Eleggibilità del prompt pausa: turno aperto al lavoro, senza pausa oggi, più
 *  lungo della soglia. Ritorna l'ISO di inizio turno se eleggibile, altrimenti null. */
function inizioSeEleggibilePausa(
  info: { stato: StatoTurno; ingressoAperto: string | null },
  eventi: EventoOggi[],
  exitIso: string,
): string | null {
  if (info.stato !== 'lavoro' || !info.ingressoAperto) return null;
  if (eventi.some((e) => e.pausa)) return null;
  const durataMs = Date.parse(exitIso) - Date.parse(info.ingressoAperto);
  if (durataMs < SOGLIA_PAUSA_PRANZO_ORE * 3600000) return null;
  return info.ingressoAperto;
}

/** Mappa azione → (tipo, pausa) della riga timbratura. */
function azioneATimbra(a: AzioneTimbra): { tipo: 'ingresso' | 'uscita'; pausa: boolean } {
  switch (a) {
    case 'inizio':
      return { tipo: 'ingresso', pausa: false };
    case 'fine':
      return { tipo: 'uscita', pausa: false };
    case 'pausa':
      return { tipo: 'uscita', pausa: true };
    case 'ripresa':
      return { tipo: 'ingresso', pausa: true };
  }
}

// ── 1) timbra da QR (sé o, per il capo, un membro) ──────────────────────
const ViaggioSchema = z.object({
  sedeId: z.string().uuid(),
  durataStimataMin: z.number().int().nonnegative().nullable(),
  durataConfermataMin: z.number().int().nonnegative(),
  giustificazione: z.string().max(500).optional(),
  autista: z.boolean(),
  mezzoId: z.string().uuid().nullable().optional(),
  /** Distanza in km dalla stima API: DEFINITIVA (non corretta dal tecnico). */
  distanzaKm: z.number().nonnegative().max(100000).nullable().optional(),
});

const TimbraSchema = z.object({
  token: z.string().min(1),
  dipendenteId: z.string().uuid().optional(),
  geo: GeoSchema,
  viaggio: ViaggioSchema.optional(),
  /** Azione esplicita (flusso self con turno attivo). Assente = toggle classico
   *  (inizio/fine), usato dal capo per i membri e per retrocompatibilità. */
  azione: z.enum(['inizio', 'fine', 'pausa', 'ripresa']).optional(),
  /** Pausa pranzo dichiarata in uscita (solo self, turno lungo senza pausa). */
  pausaPranzoMin: z.union([z.literal(30), z.literal(45), z.literal(60)]).optional(),
});

export async function timbra(input: unknown): Promise<Result> {
  const parsed = TimbraSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  const r = await ctxConModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;

  const qr = await risolviToken(parsed.data.token);
  const target = qr ? targetTimbratura(qr) : null;
  if (!qr || !qr.attivo || !target) return { ok: false, error: 'QR_NON_VALIDO' };
  if (qr.tenant_id !== ctx.tenantId) return { ok: false, error: 'QR_ALTRO_TENANT' };

  const supabase = createServerSupabase();
  const me = await dipendenteDi(supabase, ctx.tenantId, ctx.userId);

  const bersaglioId = parsed.data.dipendenteId ?? me?.id;
  if (!bersaglioId) return { ok: false, error: 'NESSUN_DIPENDENTE' };

  // autorizzazione
  const self = !!me && bersaglioId === me.id;
  let capoSquadra = false;
  let bersaglioInSquadra = false;
  if (!self) {
    if (!me) return { ok: false, error: 'NON_CAPO' };
    if (target.tipo === 'commessa') {
      const { data: righe } = await supabase
        .from('commessa_squadra' as never)
        .select('dipendente_id, ruolo_commessa')
        .eq('commessa_id', target.id);
      const rows = (righe as { dipendente_id: string; ruolo_commessa: 'capo' | 'membro' }[]) ?? [];
      capoSquadra = rows.some((x) => x.dipendente_id === me.id && x.ruolo_commessa === 'capo');
      bersaglioInSquadra = rows.some((x) => x.dipendente_id === bersaglioId);
    } else {
      const { data: righe } = await supabase
        .from('cantiere_squadra' as never)
        .select('dipendente_id, ruolo')
        .eq('cantiere_id', target.id);
      const rows = (righe as { dipendente_id: string; ruolo: 'capo' | 'membro' }[]) ?? [];
      capoSquadra = rows.some((x) => x.dipendente_id === me.id && x.ruolo === 'capo');
      bersaglioInSquadra = rows.some((x) => x.dipendente_id === bersaglioId);
    }
  }
  if (!puoTimbrarePer({ self, capoSquadra, bersaglioInSquadra }))
    return { ok: false, error: 'NON_AUTORIZZATO' };

  // Eventi di oggi (per stato turno + anti doppio-tap).
  const eventi = await eventiOggi(supabase, bersaglioId, target);
  const ultima = eventi[eventi.length - 1];
  const azione = parsed.data.azione;

  // Helper: una ri-sottomissione (< 25s) della STESSA azione è idempotente.
  const recente = (tipo: 'ingresso' | 'uscita', pausa: boolean) =>
    !!ultima &&
    ultima.tipo === tipo &&
    !!ultima.pausa === pausa &&
    Date.now() - Date.parse(ultima.ts) < 25000;

  // Determina tipo + pausa.
  let tipo: 'ingresso' | 'uscita';
  let pausa: boolean;
  if (azione) {
    // Flusso self esplicito: valida l'azione contro lo stato reale del turno
    // (difende da uno stato client stantio / timbratura su un altro device).
    const info = statoTurno(eventi);
    const target2 = azioneATimbra(azione);
    if (!AZIONI_AMMESSE[azione].includes(info.stato)) {
      // Doppio-tap della stessa azione su rete lenta: idempotente, non un errore.
      if (recente(target2.tipo, target2.pausa)) {
        return { ok: true, tipo: target2.tipo, pausa: target2.pausa, ts: ultima!.ts };
      }
      return { ok: false, error: 'AZIONE_NON_VALIDA' };
    }
    ({ tipo, pausa } = target2);
  } else {
    // Capo per i membri / retrocompat: semplice toggle, mai pausa.
    tipo = prossimoTipoTimbratura(eventi);
    pausa = false;
  }

  // Anti doppio-tap / retry su rete lenta (stessa azione, < 25s).
  if (recente(tipo, pausa)) {
    return { ok: true, tipo, pausa, ts: ultima!.ts };
  }

  const ts = new Date().toISOString();

  // Pausa pranzo dichiarata in uscita (ripiego: turno lungo senza pausa
  // timbrata). Solo flusso self, azione fine. Inserita PRIMA dell'uscita di
  // fine così il ricalcolo la sottrae. Se non eleggibile, ignorata in silenzio.
  if (azione === 'fine' && self && parsed.data.pausaPranzoMin) {
    const inizio = inizioSeEleggibilePausa(statoTurno(eventi), eventi, ts);
    if (inizio) {
      await inserisciPausaDichiarata(supabase, {
        tenantId: ctx.tenantId,
        dipendenteId: bersaglioId,
        commessaId: target.tipo === 'commessa' ? target.id : null,
        cantiereId: target.tipo === 'cantiere' ? target.id : null,
        creatoDa: ctx.userId,
        startIso: inizio,
        endIso: ts,
        minuti: parsed.data.pausaPranzoMin,
      });
    }
  }

  // Il viaggio si registra solo per la timbratura PERSONALE su un cantiere, e
  // solo all'inizio/fine turno (mai in pausa/ripresa).
  const viaggio =
    self &&
    target.tipo === 'cantiere' &&
    !pausa &&
    azione !== 'ripresa' &&
    parsed.data.viaggio
      ? parsed.data.viaggio
      : null;

  // Validazione viaggio: giustificazione se ha corretto la stima + sede/mezzo
  // devono appartenere al tenant (la lettura RLS-scoped torna null altrimenti).
  if (viaggio) {
    const modificato =
      viaggio.durataStimataMin != null &&
      viaggio.durataConfermataMin !== viaggio.durataStimataMin;
    if (modificato && (viaggio.giustificazione ?? '').trim().length < 3) {
      return { ok: false, error: 'GIUSTIFICAZIONE_RICHIESTA' };
    }
    const { data: sedeOk } = await supabase
      .from('sedi' as never)
      .select('id')
      .eq('id', viaggio.sedeId)
      .maybeSingle();
    if (!sedeOk) return { ok: false, error: 'SEDE_NON_VALIDA' };
    if (viaggio.autista && viaggio.mezzoId) {
      const { data: mezzoOk } = await supabase
        .from('mezzi' as never)
        .select('id')
        .eq('id', viaggio.mezzoId)
        .maybeSingle();
      if (!mezzoOk) return { ok: false, error: 'MEZZO_NON_VALIDO' };
    }
  }

  const { data: inserita, error } = await supabase
    .from('timbrature' as never)
    .insert({
      tenant_id: ctx.tenantId,
      dipendente_id: bersaglioId,
      commessa_id: target.tipo === 'commessa' ? target.id : null,
      cantiere_id: target.tipo === 'cantiere' ? target.id : null,
      tipo,
      pausa,
      origine: self ? 'qr' : 'capo',
      ts,
      geo_lat: parsed.data.geo?.lat ?? null,
      geo_lng: parsed.data.geo?.lng ?? null,
      creato_da: ctx.userId,
    } as never)
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  // Tratta di viaggio collegata (andata = ingresso, ritorno = uscita).
  if (viaggio) {
    const timbraturaId = (inserita as { id: string }).id;
    const { error: errViaggio } = await supabase.from('timbratura_viaggio' as never).insert({
      tenant_id: ctx.tenantId,
      timbratura_id: timbraturaId,
      dipendente_id: bersaglioId,
      // Destinazione/origine: il cantiere del viaggio (andata = sede→cantiere,
      // ritorno = cantiere→sede). Senza questo lo storico mostrava "n.d.".
      cantiere_id: target.tipo === 'cantiere' ? target.id : null,
      // Giorno calendario italiano: senza questo lo storico mostrava 01/01/1970.
      data: romeDay(new Date(ts)),
      direzione: tipo === 'ingresso' ? 'andata' : 'ritorno',
      sede_id: viaggio.sedeId,
      durata_stimata_min: viaggio.durataStimataMin,
      durata_confermata_min: viaggio.durataConfermataMin,
      distanza_km: viaggio.distanzaKm ?? null,
      giustificazione: viaggio.giustificazione?.trim() || null,
      autista: viaggio.autista,
      mezzo_id: viaggio.autista ? viaggio.mezzoId ?? null : null,
    } as never);
    if (errViaggio) {
      // Compensazione: senza il viaggio la timbratura resta incoerente col flusso.
      await supabase.from('timbrature' as never).delete().eq('id', timbraturaId);
      return { ok: false, error: errViaggio.message };
    }
  }

  // Auto-compila/ricalcola il rapportino del giorno dalle timbrature (best-effort:
  // non deve mai far fallire la timbratura). Giorno calendario in Europe/Rome.
  try {
    const giorno = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(ts));
    await ricomputaRapportinoAuto(supabase, ctx.tenantId, bersaglioId, giorno);
  } catch {
    // ignora: il rapportino verrà comunque ricalcolato all'apertura della tab Ore
  }

  return { ok: true, tipo, pausa, ts };
}

// ── 1b) terminaTurnoMio: chiusura turno dal banner "turno in corso" ──────
// Self-service: il tecnico termina il turno aperto su un cantiere, all'ora
// attuale o a un'ora indicata (es. è uscito dimenticando di scansionare).
// Inserisce un'uscita di fine turno (pausa=false). Nessun viaggio.

const TerminaTurnoSchema = z.object({
  cantiereId: z.string().uuid(),
  // ISO opzionale: se assente, ora attuale. Deve essere oggi (Europe/Rome) e
  // dopo l'apertura del turno.
  ts: z.string().datetime().optional(),
  /** Pausa pranzo dichiarata (turno lungo senza pausa timbrata). */
  pausaPranzoMin: z.union([z.literal(30), z.literal(45), z.literal(60)]).optional(),
});

export async function terminaTurnoMio(input: unknown): Promise<Result> {
  const parsed = TerminaTurnoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  const r = await ctxConModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;

  const supabase = createServerSupabase();
  const me = await dipendenteDi(supabase, ctx.tenantId, ctx.userId);
  if (!me) return { ok: false, error: 'NESSUN_DIPENDENTE' };

  const target = { tipo: 'cantiere' as const, id: parsed.data.cantiereId };
  const eventi = await eventiOggi(supabase, me.id, target);
  const info = statoTurno(eventi);
  if (info.stato === 'idle') return { ok: false, error: 'NESSUN_TURNO_APERTO' };

  const ts = parsed.data.ts ?? new Date().toISOString();
  // L'ora di fine deve cadere oggi (Europe/Rome) e dopo l'ultima timbratura.
  const oggi = romeDay(new Date());
  if (romeDay(new Date(ts)) !== oggi) return { ok: false, error: 'ORA_NON_VALIDA' };
  const ultima = eventi[eventi.length - 1];
  if (ultima && Date.parse(ts) <= Date.parse(ultima.ts)) {
    return { ok: false, error: 'ORA_NON_VALIDA' };
  }

  // Pausa pranzo dichiarata (ripiego): inserita prima dell'uscita di fine così
  // il ricalcolo la sottrae. Ignorata se non eleggibile.
  if (parsed.data.pausaPranzoMin) {
    const inizio = inizioSeEleggibilePausa(info, eventi, ts);
    if (inizio) {
      await inserisciPausaDichiarata(supabase, {
        tenantId: ctx.tenantId,
        dipendenteId: me.id,
        commessaId: null,
        cantiereId: parsed.data.cantiereId,
        creatoDa: ctx.userId,
        startIso: inizio,
        endIso: ts,
        minuti: parsed.data.pausaPranzoMin,
      });
    }
  }

  const { error } = await supabase.from('timbrature' as never).insert({
    tenant_id: ctx.tenantId,
    dipendente_id: me.id,
    cantiere_id: parsed.data.cantiereId,
    commessa_id: null,
    tipo: 'uscita',
    pausa: false,
    origine: 'qr',
    ts,
    creato_da: ctx.userId,
  } as never);
  if (error) return { ok: false, error: error.message };

  try {
    await ricomputaRapportinoAuto(supabase, ctx.tenantId, me.id, romeDay(new Date(ts)));
  } catch {
    // best-effort
  }
  return { ok: true, tipo: 'uscita', pausa: false, ts };
}

// ── 1c) pausa/ripresa dal banner o dalla scheda cantiere (self, senza QR) ──
// Gemelle di terminaTurnoMio: l'utente avvia la pausa pranzo o riprende il
// turno con un tap, senza riscansionare il QR. Validano l'azione contro lo
// stato reale del turno (idle/lavoro/pausa) e ricalcolano il rapportino.

const TurnoCantiereSchema = z.object({ cantiereId: z.string().uuid() });

async function cambiaStatoTurnoMio(
  input: unknown,
  azione: 'pausa' | 'ripresa',
): Promise<Result> {
  const parsed = TurnoCantiereSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  const r = await ctxConModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;

  const supabase = createServerSupabase();
  const me = await dipendenteDi(supabase, ctx.tenantId, ctx.userId);
  if (!me) return { ok: false, error: 'NESSUN_DIPENDENTE' };

  const target = { tipo: 'cantiere' as const, id: parsed.data.cantiereId };
  const eventi = await eventiOggi(supabase, me.id, target);
  const info = statoTurno(eventi);
  if (!AZIONI_AMMESSE[azione].includes(info.stato)) {
    return { ok: false, error: 'AZIONE_NON_VALIDA' };
  }

  const { tipo, pausa } = azioneATimbra(azione);
  const ts = new Date().toISOString();
  const { error } = await supabase.from('timbrature' as never).insert({
    tenant_id: ctx.tenantId,
    dipendente_id: me.id,
    cantiere_id: parsed.data.cantiereId,
    commessa_id: null,
    tipo,
    pausa,
    origine: 'qr',
    ts,
    creato_da: ctx.userId,
  } as never);
  if (error) return { ok: false, error: error.message };

  try {
    await ricomputaRapportinoAuto(supabase, ctx.tenantId, me.id, romeDay(new Date(ts)));
  } catch {
    // best-effort
  }
  return { ok: true, tipo, pausa, ts };
}

export async function pausaPranzoMia(input: unknown): Promise<Result> {
  return cambiaStatoTurnoMio(input, 'pausa');
}

export async function riprendiTurnoMio(input: unknown): Promise<Result> {
  return cambiaStatoTurnoMio(input, 'ripresa');
}

// ── 2) cronometro (solo sé, senza QR) ───────────────────────────────────
const CronoSchema = z.object({
  commessaId: z.string().uuid(),
  azione: z.enum(['start', 'stop']),
  geo: GeoSchema,
});

export async function timbraCronometro(input: unknown): Promise<Result> {
  const parsed = CronoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  const r = await ctxConModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;
  const supabase = createServerSupabase();
  const me = await dipendenteDi(supabase, ctx.tenantId, ctx.userId);
  if (!me) return { ok: false, error: 'NESSUN_DIPENDENTE' };
  const tipo = parsed.data.azione === 'start' ? 'ingresso' : 'uscita';
  const ts = new Date().toISOString();
  const { error } = await supabase.from('timbrature' as never).insert({
    tenant_id: ctx.tenantId,
    dipendente_id: me.id,
    commessa_id: parsed.data.commessaId,
    tipo,
    origine: 'cronometro',
    ts,
    geo_lat: parsed.data.geo?.lat ?? null,
    geo_lng: parsed.data.geo?.lng ?? null,
    creato_da: ctx.userId,
  } as never);
  if (error) return { ok: false, error: error.message };
  return { ok: true, tipo, pausa: false, ts };
}

// ── 3) manuale (office/admin o capo) ────────────────────────────────────
const ManualeSchema = z.object({
  commessaId: z.string().uuid(),
  dipendenteId: z.string().uuid(),
  tipo: z.enum(['ingresso', 'uscita']),
  ts: z.string().min(1),
});

export async function timbraManuale(input: unknown): Promise<Result> {
  const parsed = ManualeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  const r = await ctxConModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;
  if (!['admin', 'office'].includes(ctx.role)) return { ok: false, error: 'FORBIDDEN' };
  const supabase = createServerSupabase();
  const { error } = await supabase.from('timbrature' as never).insert({
    tenant_id: ctx.tenantId,
    dipendente_id: parsed.data.dipendenteId,
    commessa_id: parsed.data.commessaId,
    tipo: parsed.data.tipo,
    origine: 'manuale',
    ts: parsed.data.ts,
    creato_da: ctx.userId,
  } as never);
  if (error) return { ok: false, error: error.message };
  return { ok: true, tipo: parsed.data.tipo, pausa: false, ts: parsed.data.ts };
}
