'use server';

import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { getTenantContext, type TenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import {
  prossimoTipoTimbratura,
  statoTurno,
  type StatoTurno,
} from '@kommessa/api/kantiere-ore';
import { calcolaSegmentiSplit } from '@kommessa/api/kantiere-split';
import { puoTimbrarePer, targetTimbratura } from '@kommessa/api/kantiere';
import { romeDay, romeDayBoundsUtc } from '@kommessa/api/rome-time';
import {
  leggiSogliaPausaPranzoOre,
  leggiRoutingProvider,
  leggiImpostazioniTurno,
} from '@/app/_lib/kantiere-config';
import { getRoutingProvider } from '@/app/_lib/routing';
import type { PickerCantiere } from '@/app/mobile/kantiere/_components/cantiere-picker';
import { ricomputaRapportinoAuto } from './_lib/ricomputa-rapportino';
import {
  ViaggioSchema,
  validaViaggio,
  inserisciViaggioRow,
  inserisciPausaDichiarata,
  inizioSeEleggibilePausa,
  type ViaggioInput,
} from './_lib/viaggio-timbra';

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

// `inserisciPausaDichiarata` e `inizioSeEleggibilePausa` sono condivise in
// ./_lib/viaggio-timbra (riusate da QR, self e capo) → niente duplicazione.

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
// ViaggioSchema condiviso (vedi ./_lib/viaggio-timbra): riusato da timbra,
// terminaTurnoMio e dal flusso capo.
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

  // Il viaggio si registra solo per la timbratura PERSONALE su un cantiere, e
  // solo all'inizio/fine turno (mai in pausa/ripresa). Lo VALIDIAMO subito, PRIMA
  // di qualsiasi scrittura (pausa o uscita): un viaggio non valido non deve
  // lasciare una coppia-pausa orfana. Validazione condivisa con self/capo.
  const viaggio =
    self &&
    target.tipo === 'cantiere' &&
    !pausa &&
    azione !== 'ripresa' &&
    parsed.data.viaggio
      ? parsed.data.viaggio
      : null;
  if (viaggio) {
    const v = await validaViaggio(supabase, viaggio);
    if (!v.ok) return { ok: false, error: v.error };
  }

  // Pausa pranzo dichiarata in uscita (ripiego: turno lungo senza pausa
  // timbrata). Solo flusso self, azione fine. Inserita PRIMA dell'uscita di
  // fine così il ricalcolo la sottrae. Se non eleggibile, ignorata in silenzio.
  if (azione === 'fine' && self && parsed.data.pausaPranzoMin) {
    const sogliaOre = await leggiSogliaPausaPranzoOre(supabase, ctx.tenantId);
    const inizio = inizioSeEleggibilePausa(statoTurno(eventi), eventi, ts, sogliaOre);
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
  /** Viaggio di RITORNO (chiusura da app): sede, stima, autista, mezzo, km. */
  viaggio: ViaggioSchema.optional(),
  /**
   * Split "cosa hai fatto oggi": ore per cantiere (somma = netto). Presente
   * solo se il tecnico DIVIDE la giornata tra più cantieri alla chiusura. Il
   * primo cantiere è quello del turno. Min 2 (con 1 solo non è uno split).
   */
  split: z
    .array(z.object({ cantiereId: z.string().uuid(), minuti: z.number().int().nonnegative() }))
    .min(2)
    .max(12)
    .optional(),
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

  // Viaggio di ritorno (chiusura da app): valida PRIMA di qualsiasi scrittura
  // (pausa o uscita), così un viaggio non valido non lascia una pausa orfana.
  const viaggio = parsed.data.viaggio ?? null;
  if (viaggio) {
    const v = await validaViaggio(supabase, viaggio);
    if (!v.ok) return { ok: false, error: v.error };
  }

  // ── SPLIT "cosa hai fatto oggi": più cantieri dichiarati alla chiusura ──
  //    Sintetizza i segmenti timbrati (il ricalcolo deriva le ore da lì).
  //    Solo a turno "al lavoro" e giornata pulita (un solo ingresso, nessun
  //    altro evento). La pausa dichiarata è inclusa nei segmenti.
  const split = parsed.data.split;
  if (split && split.length >= 2 && info.stato === 'lavoro' && info.ingressoAperto) {
    return terminaConSplit(supabase, ctx.tenantId, ctx.userId, me.id, {
      cantiereId: parsed.data.cantiereId,
      ts,
      ingressoIso: info.ingressoAperto,
      pausaMin: parsed.data.pausaPranzoMin ?? 0,
      split,
      viaggio,
    });
  }

  // Pausa pranzo dichiarata (ripiego): inserita prima dell'uscita di fine così
  // il ricalcolo la sottrae. Ignorata se non eleggibile.
  if (parsed.data.pausaPranzoMin) {
    const sogliaOre = await leggiSogliaPausaPranzoOre(supabase, ctx.tenantId);
    const inizio = inizioSeEleggibilePausa(info, eventi, ts, sogliaOre);
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

  const { data: inserita, error } = await supabase
    .from('timbrature' as never)
    .insert({
      tenant_id: ctx.tenantId,
      dipendente_id: me.id,
      cantiere_id: parsed.data.cantiereId,
      commessa_id: null,
      tipo: 'uscita',
      pausa: false,
      // Chiusura da app (non da QR): origine 'cronometro' per tracciare la fonte.
      origine: 'cronometro',
      ts,
      creato_da: ctx.userId,
    } as never)
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  // Tratta di ritorno collegata. Compensazione: se fallisce, annulla l'uscita.
  if (viaggio) {
    const timbraturaId = (inserita as { id: string }).id;
    const res = await inserisciViaggioRow(supabase, {
      tenantId: ctx.tenantId,
      dipendenteId: me.id,
      cantiereId: parsed.data.cantiereId,
      timbraturaId,
      ts,
      tipo: 'uscita',
      viaggio,
    });
    if (!res.ok) {
      await supabase.from('timbrature' as never).delete().eq('id', timbraturaId);
      return { ok: false, error: res.error };
    }
  }

  try {
    await ricomputaRapportinoAuto(supabase, ctx.tenantId, me.id, romeDay(new Date(ts)));
  } catch {
    // best-effort
  }
  return { ok: true, tipo: 'uscita', pausa: false, ts };
}

// Chiusura turno CON split "cosa hai fatto oggi": sintetizza i segmenti timbrati
// (via `calcolaSegmentiSplit`, logica pura unit-testata) così il ricalcolo deriva
// le righe per cantiere. Additivo su giornata pulita; nessun delete distruttivo.
async function terminaConSplit(
  supabase: ReturnType<typeof createServerSupabase>,
  tenantId: string,
  userId: string,
  dipendenteId: string,
  opts: {
    cantiereId: string;
    ts: string;
    ingressoIso: string;
    pausaMin: number;
    split: { cantiereId: string; minuti: number }[];
    viaggio: ViaggioInput | null;
  },
): Promise<Result> {
  // 1. Giornata pulita: un solo evento oggi (l'ingresso aperto). Niente split su
  //    giornate con pause/uscite/switch già timbrati.
  const { fromIso, toIso } = romeDayBoundsUtc(romeDay(new Date()));
  const { count } = await supabase
    .from('timbrature' as never)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('dipendente_id', dipendenteId)
    .gte('ts', fromIso)
    .lt('ts', toIso);
  if ((count ?? 0) !== 1) return { ok: false, error: 'SPLIT_NON_APPLICABILE' };

  // 2. Il primo cantiere dello split è quello del turno (ingresso reale).
  if (opts.split[0]?.cantiereId !== opts.cantiereId) {
    return { ok: false, error: 'SPLIT_PRIMO_CANTIERE' };
  }

  // 3. Tutti i cantieri appartengono al tenant.
  const ids = [...new Set(opts.split.map((s) => s.cantiereId))];
  const { data: ccRows } = await supabase
    .from('cantieri' as never)
    .select('id')
    .in('id', ids)
    .eq('tenant_id', tenantId);
  if (((ccRows as { id: string }[] | null)?.length ?? 0) !== ids.length) {
    return { ok: false, error: 'CANTIERE_NON_VALIDO' };
  }

  // 4. Sintesi segmenti (pura, unit-testata).
  const calc = calcolaSegmentiSplit({
    ingressoMs: Date.parse(opts.ingressoIso),
    uscitaMs: Date.parse(opts.ts),
    pausaMin: opts.pausaMin,
    segmenti: opts.split,
  });
  if (!calc.ok) {
    return { ok: false, error: calc.error === 'SOMMA_NON_TORNA' ? 'SPLIT_SOMMA' : 'SPLIT_NETTO' };
  }
  if (calc.eventi.length === 0) return { ok: false, error: 'SPLIT_NON_APPLICABILE' };

  // 5. Inserisce gli eventi sintetici (origine 'manuale'). L'ultima uscita a
  //    parte per collegarci il viaggio di ritorno.
  const base = {
    tenant_id: tenantId,
    dipendente_id: dipendenteId,
    commessa_id: null as string | null,
    origine: 'manuale',
    creato_da: userId,
  };
  const eventi = calc.eventi;
  const last = eventi[eventi.length - 1]!;
  const prima = eventi.slice(0, -1);
  if (prima.length > 0) {
    const { error } = await supabase.from('timbrature' as never).insert(
      prima.map((e) => ({
        ...base,
        cantiere_id: e.cantiereId,
        tipo: e.tipo,
        pausa: e.pausa,
        ts: new Date(e.ms).toISOString(),
      })) as never,
    );
    if (error) return { ok: false, error: error.message };
  }
  const uscitaIso = new Date(last.ms).toISOString();
  const { data: lastRow, error: eLast } = await supabase
    .from('timbrature' as never)
    .insert({ ...base, cantiere_id: last.cantiereId, tipo: 'uscita', pausa: false, ts: uscitaIso } as never)
    .select('id')
    .single();
  if (eLast) return { ok: false, error: eLast.message };

  // 6. Viaggio di ritorno sull'ultima uscita (best-effort: non annulla lo split).
  if (opts.viaggio) {
    await inserisciViaggioRow(supabase, {
      tenantId,
      dipendenteId,
      cantiereId: last.cantiereId,
      timbraturaId: (lastRow as { id: string }).id,
      ts: uscitaIso,
      tipo: 'uscita',
      viaggio: opts.viaggio,
    });
  }

  // 7. Ricalcolo: deriva le righe per cantiere dai segmenti.
  try {
    await ricomputaRapportinoAuto(supabase, tenantId, dipendenteId, romeDay(new Date(opts.ts)));
  } catch {
    // best-effort
  }
  return { ok: true, tipo: 'uscita', pausa: false, ts: opts.ts };
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

// ── 4) turno manuale self: avvio senza QR + cambio cantiere ─────────────────
// Il tecnico avvia un turno scegliendo un cantiere qualsiasi (senza QR) e, se
// durante la giornata si sposta, "cambia cantiere": chiude il segmento corrente
// e ne apre uno nuovo (ore giuste dai timestamp reali). I km A→B sono attribuiti
// al cantiere di DESTINAZIONE come tratta manuale (durata 0 = niente ore-viaggio,
// solo km), senza toccare lo schema. Le timbrature restano la verità: il
// rapportino si ricalcola da sé.

/** true se il dipendente ha almeno un turno aperto oggi (qualsiasi target). */
async function turnoApertoQualsiasi(
  supabase: ReturnType<typeof createServerSupabase>,
  dipendenteId: string,
): Promise<boolean> {
  const { fromIso, toIso } = romeDayBoundsUtc(romeDay(new Date()));
  const { data } = await supabase
    .from('timbrature' as never)
    .select('cantiere_id, commessa_id, tipo, ts, pausa')
    .eq('dipendente_id', dipendenteId)
    .gte('ts', fromIso)
    .lt('ts', toIso)
    .order('ts', { ascending: true });
  const rows =
    (data as {
      cantiere_id: string | null;
      commessa_id: string | null;
      tipo: 'ingresso' | 'uscita';
      pausa: boolean | null;
    }[] | null) ?? [];
  const aperti = new Set<string>();
  for (const t of rows) {
    const key = t.cantiere_id ? `k:${t.cantiere_id}` : t.commessa_id ? `c:${t.commessa_id}` : null;
    if (!key) continue;
    if (t.tipo === 'ingresso') aperti.add(key);
    else if (t.pausa) {
      // uscita di pausa: il turno resta APERTO (in pausa)
    } else aperti.delete(key); // uscita di fine turno
  }
  return aperti.size > 0;
}

/**
 * Attribuisce i km del tragitto cantiere→cantiere (dello switch) al cantiere di
 * DESTINAZIONE, come tratta di viaggio MANUALE (timbratura_id null, sede null,
 * `durata_confermata_min = 0` così NON conta ore di viaggio: contano solo i km).
 * Best-effort: se mancano le coordinate (cantieri "privati") o il provider non
 * risponde, non scrive nulla (niente km, come richiesto). Non deve mai bloccare.
 */
async function attribuisciKmSwitch(
  supabase: ReturnType<typeof createServerSupabase>,
  opts: {
    tenantId: string;
    dipendenteId: string;
    daCantiereId: string;
    aCantiereId: string;
    data: string;
  },
): Promise<void> {
  try {
    const { data: rows } = await supabase
      .from('cantieri' as never)
      .select('id, indirizzo_lat, indirizzo_lng')
      .in('id', [opts.daCantiereId, opts.aCantiereId])
      .eq('tenant_id', opts.tenantId);
    const cc =
      (rows as { id: string; indirizzo_lat: number | null; indirizzo_lng: number | null }[] | null) ??
      [];
    const a = cc.find((r) => r.id === opts.daCantiereId);
    const b = cc.find((r) => r.id === opts.aCantiereId);
    if (!a?.indirizzo_lat || !a?.indirizzo_lng || !b?.indirizzo_lat || !b?.indirizzo_lng) return;

    const choice = await leggiRoutingProvider(supabase, opts.tenantId);
    const provider = getRoutingProvider({ provider: choice });
    const stima = await provider.stima(
      { lat: Number(a.indirizzo_lat), lng: Number(a.indirizzo_lng) },
      { lat: Number(b.indirizzo_lat), lng: Number(b.indirizzo_lng) },
    );
    if (!stima) return;

    await supabase.from('timbratura_viaggio' as never).insert({
      tenant_id: opts.tenantId,
      timbratura_id: null,
      dipendente_id: opts.dipendenteId,
      cantiere_id: opts.aCantiereId,
      // Cantiere di PARTENZA → la UI mostra "A → B" invece di "Sede → B".
      da_cantiere_id: opts.daCantiereId,
      data: opts.data,
      direzione: 'andata',
      sede_id: null,
      durata_stimata_min: null,
      // 0 = non conta ore di viaggio (l'utente ha scelto di ignorare i tempi):
      // qui interessa solo la distanza.
      durata_confermata_min: 0,
      distanza_km: stima.km,
      autista: false,
      mezzo_id: null,
    } as never);
  } catch {
    // best-effort: mai bloccare lo switch per i km
  }
}

const AvviaTurnoSchema = z.object({ cantiereId: z.string().uuid() });

/** Avvia un turno sul cantiere scelto (senza QR). Origine 'manuale'. */
export async function avviaTurnoMio(input: unknown): Promise<Result> {
  const parsed = AvviaTurnoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  const r = await ctxConModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;

  const supabase = createServerSupabase();
  const me = await dipendenteDi(supabase, ctx.tenantId, ctx.userId);
  if (!me) return { ok: false, error: 'NESSUN_DIPENDENTE' };

  // Un solo turno aperto per volta.
  if (await turnoApertoQualsiasi(supabase, me.id)) {
    return { ok: false, error: 'TURNO_GIA_APERTO' };
  }

  // Il cantiere deve appartenere al tenant.
  const { data: cant } = await supabase
    .from('cantieri' as never)
    .select('id')
    .eq('id', parsed.data.cantiereId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (!cant) return { ok: false, error: 'CANTIERE_NON_VALIDO' };

  const ts = new Date().toISOString();
  const { error } = await supabase.from('timbrature' as never).insert({
    tenant_id: ctx.tenantId,
    dipendente_id: me.id,
    cantiere_id: parsed.data.cantiereId,
    commessa_id: null,
    tipo: 'ingresso',
    pausa: false,
    origine: 'manuale',
    ts,
    creato_da: ctx.userId,
  } as never);
  if (error) return { ok: false, error: error.message };

  try {
    await ricomputaRapportinoAuto(supabase, ctx.tenantId, me.id, romeDay(new Date(ts)));
  } catch {
    // best-effort
  }
  return { ok: true, tipo: 'ingresso', pausa: false, ts };
}

const CambiaCantiereSchema = z.object({
  daCantiereId: z.string().uuid(),
  aCantiereId: z.string().uuid(),
});

/**
 * Cambia cantiere a turno aperto: chiude il turno sul cantiere corrente e ne
 * apre uno nuovo sul cantiere scelto, ORA. Le ore per segmento escono dai
 * timestamp reali (ricalcolo automatico). I km del tragitto vanno alla
 * destinazione (best-effort). Richiede il turno "al lavoro" (non in pausa).
 */
export async function cambiaCantiereMio(input: unknown): Promise<Result> {
  const parsed = CambiaCantiereSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  if (parsed.data.daCantiereId === parsed.data.aCantiereId) {
    return { ok: false, error: 'STESSO_CANTIERE' };
  }
  const r = await ctxConModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;

  const supabase = createServerSupabase();
  const me = await dipendenteDi(supabase, ctx.tenantId, ctx.userId);
  if (!me) return { ok: false, error: 'NESSUN_DIPENDENTE' };

  // Il turno sul cantiere di partenza deve essere aperto e AL LAVORO.
  const eventi = await eventiOggi(supabase, me.id, {
    tipo: 'cantiere',
    id: parsed.data.daCantiereId,
  });
  const info = statoTurno(eventi);
  if (info.stato === 'idle') return { ok: false, error: 'NESSUN_TURNO_APERTO' };
  if (info.stato === 'pausa') return { ok: false, error: 'IN_PAUSA' };

  // Il cantiere di destinazione deve appartenere al tenant.
  const { data: dest } = await supabase
    .from('cantieri' as never)
    .select('id')
    .eq('id', parsed.data.aCantiereId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (!dest) return { ok: false, error: 'CANTIERE_NON_VALIDO' };

  // Timestamp: uscita (fine A) → ingresso (inizio B), strettamente dopo
  // l'ultima timbratura e nel giorno corrente.
  const ultima = eventi[eventi.length - 1];
  const lastMs = ultima ? Date.parse(ultima.ts) : 0;
  const baseMs = Math.max(Date.now(), lastMs + 2000);
  const uscitaTs = new Date(baseMs).toISOString();
  const ingressoTs = new Date(baseMs + 1000).toISOString();
  if (romeDay(new Date(ingressoTs)) !== romeDay(new Date())) {
    return { ok: false, error: 'ORA_NON_VALIDA' };
  }

  // Chiude A.
  const { error: errUscita } = await supabase.from('timbrature' as never).insert({
    tenant_id: ctx.tenantId,
    dipendente_id: me.id,
    cantiere_id: parsed.data.daCantiereId,
    commessa_id: null,
    tipo: 'uscita',
    pausa: false,
    origine: 'manuale',
    ts: uscitaTs,
    creato_da: ctx.userId,
  } as never);
  if (errUscita) return { ok: false, error: errUscita.message };

  // Apre B. Se fallisce, riapre A (compensazione) togliendo l'uscita.
  const { error: errIngresso } = await supabase.from('timbrature' as never).insert({
    tenant_id: ctx.tenantId,
    dipendente_id: me.id,
    cantiere_id: parsed.data.aCantiereId,
    commessa_id: null,
    tipo: 'ingresso',
    pausa: false,
    origine: 'manuale',
    ts: ingressoTs,
    creato_da: ctx.userId,
  } as never);
  if (errIngresso) {
    await supabase
      .from('timbrature' as never)
      .delete()
      .eq('dipendente_id', me.id)
      .eq('cantiere_id', parsed.data.daCantiereId)
      .eq('tipo', 'uscita')
      .eq('ts', uscitaTs);
    return { ok: false, error: errIngresso.message };
  }

  // Km A→B alla destinazione (best-effort, non blocca). Opt-in: solo se l'ufficio
  // ha attivato "km del tragitto tra cantieri".
  const impTurno = await leggiImpostazioniTurno(supabase, ctx.tenantId);
  if (impTurno.kmSwitchAttivo) {
    await attribuisciKmSwitch(supabase, {
      tenantId: ctx.tenantId,
      dipendenteId: me.id,
      daCantiereId: parsed.data.daCantiereId,
      aCantiereId: parsed.data.aCantiereId,
      data: romeDay(new Date(ingressoTs)),
    });
  }

  try {
    await ricomputaRapportinoAuto(supabase, ctx.tenantId, me.id, romeDay(new Date(ingressoTs)));
  } catch {
    // best-effort
  }
  return { ok: true, tipo: 'ingresso', pausa: false, ts: ingressoTs };
}

/**
 * Elenco cantieri per i picker di avvio/cambio turno (tutti i cantieri operativi
 * del tenant: il tecnico può avviare un turno su qualsiasi cantiere). Ordinati
 * per nome. Sola lettura, gated dal modulo.
 */
export async function elencoCantieriTurno(): Promise<
  { ok: true; cantieri: PickerCantiere[] } | { ok: false; error: string }
> {
  const r = await ctxConModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from('cantieri' as never)
    .select('id, codice, codice_commessa, nome, cliente_nome, indirizzo, categoria')
    .eq('tenant_id', ctx.tenantId)
    .in('stato', ['attivo', 'sospeso'])
    .order('nome', { ascending: true });
  return { ok: true, cantieri: (data as PickerCantiere[] | null) ?? [] };
}

// ── 5) caso 4: registra l'intera giornata SENZA timbrature ──────────────────
// Il tecnico non ha mai timbrato: dichiara inizio/fine + cantieri/ore. Si
// sintetizza la giornata (ingresso reale + segmenti via calcolaSegmentiSplit)
// così il ricalcolo deriva le righe. Solo su GIORNATA VUOTA (0 eventi oggi).
const RegistraGiornataSchema = z.object({
  inizioIso: z.string().datetime(),
  fineIso: z.string().datetime(),
  pausaMin: z.number().int().min(0).max(600).optional(),
  split: z
    .array(z.object({ cantiereId: z.string().uuid(), minuti: z.number().int().nonnegative() }))
    .min(1)
    .max(12),
});

export async function registraGiornataDaZero(input: unknown): Promise<Result> {
  const parsed = RegistraGiornataSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  const r = await ctxConModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;

  const supabase = createServerSupabase();
  const me = await dipendenteDi(supabase, ctx.tenantId, ctx.userId);
  if (!me) return { ok: false, error: 'NESSUN_DIPENDENTE' };

  const imp = await leggiImpostazioniTurno(supabase, ctx.tenantId);
  if (!imp.registraGiornataAttivo) return { ok: false, error: 'REGISTRA_OFF' };

  const { inizioIso, fineIso } = parsed.data;
  const pausaMin = parsed.data.pausaMin ?? 0;
  // Inizio/fine dello stesso giorno (Europe/Rome), fine dopo inizio.
  const oggi = romeDay(new Date());
  if (romeDay(new Date(inizioIso)) !== oggi || romeDay(new Date(fineIso)) !== oggi) {
    return { ok: false, error: 'ORA_NON_VALIDA' };
  }
  if (Date.parse(fineIso) <= Date.parse(inizioIso)) return { ok: false, error: 'ORA_NON_VALIDA' };

  // Giornata VUOTA: nessuna timbratura oggi (altrimenti si userebbe lo split).
  const { fromIso, toIso } = romeDayBoundsUtc(oggi);
  const { count } = await supabase
    .from('timbrature' as never)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('dipendente_id', me.id)
    .gte('ts', fromIso)
    .lt('ts', toIso);
  if ((count ?? 0) !== 0) return { ok: false, error: 'GIORNATA_NON_VUOTA' };

  // Cantieri del tenant.
  const ids = [...new Set(parsed.data.split.map((s) => s.cantiereId))];
  const { data: ccRows } = await supabase
    .from('cantieri' as never)
    .select('id')
    .in('id', ids)
    .eq('tenant_id', ctx.tenantId);
  if (((ccRows as { id: string }[] | null)?.length ?? 0) !== ids.length) {
    return { ok: false, error: 'CANTIERE_NON_VALIDO' };
  }

  // Sintesi segmenti (calc.eventi ESCLUDE l'ingresso iniziale → lo prependo).
  const calc = calcolaSegmentiSplit({
    ingressoMs: Date.parse(inizioIso),
    uscitaMs: Date.parse(fineIso),
    pausaMin,
    segmenti: parsed.data.split,
  });
  if (!calc.ok) {
    return { ok: false, error: calc.error === 'SOMMA_NON_TORNA' ? 'SPLIT_SOMMA' : 'SPLIT_NETTO' };
  }

  const base = {
    tenant_id: ctx.tenantId,
    dipendente_id: me.id,
    commessa_id: null as string | null,
    origine: 'manuale',
    creato_da: ctx.userId,
  };
  const primoCantiere = parsed.data.split[0]!.cantiereId;
  const rows = [
    { ...base, cantiere_id: primoCantiere, tipo: 'ingresso', pausa: false, ts: inizioIso },
    ...calc.eventi.map((e) => ({
      ...base,
      cantiere_id: e.cantiereId,
      tipo: e.tipo,
      pausa: e.pausa,
      ts: new Date(e.ms).toISOString(),
    })),
  ];
  const { error } = await supabase.from('timbrature' as never).insert(rows as never);
  if (error) return { ok: false, error: error.message };

  try {
    await ricomputaRapportinoAuto(supabase, ctx.tenantId, me.id, oggi);
  } catch {
    // best-effort
  }
  return { ok: true, tipo: 'uscita', pausa: false, ts: fineIso };
}
