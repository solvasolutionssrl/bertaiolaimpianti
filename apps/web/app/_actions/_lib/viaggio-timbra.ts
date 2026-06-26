import { z } from 'zod';
import type { createServerSupabase } from '@kommessa/api/server';
import { SOGLIA_PAUSA_PRANZO_ORE, type StatoTurno } from '@kommessa/api/kantiere-ore';
import { romeDay } from '@kommessa/api/rome-time';

/**
 * Helper condivisi per timbrature di VIAGGIO e PAUSA dichiarata, riusati da
 * tutti i flussi che chiudono un turno: QR (`timbra`), self da app
 * (`terminaTurnoMio`), capo per i membri (`timbraMembro`). Le timbrature
 * restano la verità: qui si limita a validare e inserire le righe.
 */

type Supa = ReturnType<typeof createServerSupabase>;

export type EventoOggi = { tipo: 'ingresso' | 'uscita'; ts: string; pausa: boolean | null };

/** Schema del payload viaggio inviato dal client (sede, stima, autista, mezzo, km). */
export const ViaggioSchema = z.object({
  sedeId: z.string().uuid(),
  durataStimataMin: z.number().int().nonnegative().nullable(),
  durataConfermataMin: z.number().int().nonnegative(),
  giustificazione: z.string().max(500).optional(),
  autista: z.boolean(),
  mezzoId: z.string().uuid().nullable().optional(),
  /** Distanza in km dalla stima API: DEFINITIVA (non corretta dal tecnico). */
  distanzaKm: z.number().nonnegative().max(100000).nullable().optional(),
});
export type ViaggioInput = z.infer<typeof ViaggioSchema>;

/**
 * Eleggibilità del prompt pausa: turno aperto al lavoro, senza pausa oggi, più
 * lungo della soglia (ore, per-tenant; default `SOGLIA_PAUSA_PRANZO_ORE`).
 * Ritorna l'ISO di inizio turno se eleggibile, altrimenti null.
 */
export function inizioSeEleggibilePausa(
  info: { stato: StatoTurno; ingressoAperto: string | null },
  eventi: EventoOggi[],
  exitIso: string,
  sogliaOre: number = SOGLIA_PAUSA_PRANZO_ORE,
): string | null {
  if (info.stato !== 'lavoro' || !info.ingressoAperto) return null;
  if (eventi.some((e) => e.pausa)) return null;
  const durataMs = Date.parse(exitIso) - Date.parse(info.ingressoAperto);
  if (durataMs < sogliaOre * 3600000) return null;
  return info.ingressoAperto;
}

/**
 * Inserisce una pausa pranzo "dichiarata" come coppia di timbrature (uscita
 * pausa → ingresso pausa) centrata nel turno. Il calcolo ore esclude già il gap,
 * quindi sottrae esattamente i minuti dichiarati. `origine='manuale'`.
 */
export async function inserisciPausaDichiarata(
  supabase: Supa,
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
    { ...base, tipo: 'uscita', ts: new Date(mid - half).toISOString() },
    { ...base, tipo: 'ingresso', ts: new Date(mid + half).toISOString() },
  ] as never);
}

/**
 * Valida un payload viaggio: giustificazione se la stima è stata corretta,
 * sede e (se autista) mezzo devono appartenere al tenant (la lettura RLS-scoped
 * torna null altrimenti). Da chiamare PRIMA di inserire la timbratura.
 */
export async function validaViaggio(
  supabase: Supa,
  viaggio: ViaggioInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
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
    if (!mezzoOk) return { ok: false, error: 'MEZZO_NON_VALIDA' };
  }
  return { ok: true };
}

/**
 * Inserisce la riga `timbratura_viaggio` collegata a una timbratura già creata.
 * `tipo` = 'ingresso' (andata) | 'uscita' (ritorno). Il chiamante gestisce
 * l'eventuale compensazione (delete della timbratura) se ritorna errore.
 */
export async function inserisciViaggioRow(
  supabase: Supa,
  opts: {
    tenantId: string;
    dipendenteId: string;
    cantiereId: string | null;
    timbraturaId: string;
    ts: string;
    tipo: 'ingresso' | 'uscita';
    viaggio: ViaggioInput;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { viaggio } = opts;
  const { error } = await supabase.from('timbratura_viaggio' as never).insert({
    tenant_id: opts.tenantId,
    timbratura_id: opts.timbraturaId,
    dipendente_id: opts.dipendenteId,
    cantiere_id: opts.cantiereId,
    data: romeDay(new Date(opts.ts)),
    direzione: opts.tipo === 'ingresso' ? 'andata' : 'ritorno',
    sede_id: viaggio.sedeId,
    durata_stimata_min: viaggio.durataStimataMin,
    durata_confermata_min: viaggio.durataConfermataMin,
    distanza_km: viaggio.distanzaKm ?? null,
    giustificazione: viaggio.giustificazione?.trim() || null,
    autista: viaggio.autista,
    mezzo_id: viaggio.autista ? viaggio.mezzoId ?? null : null,
  } as never);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
