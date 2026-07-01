import { z } from 'zod';
import type { createServerSupabase } from '@kommessa/api/server';
import { SOGLIA_PAUSA_PRANZO_ORE, statoTurno, type StatoTurno } from '@kommessa/api/kantiere-ore';
import { romeDay, romeDayBoundsUtc } from '@kommessa/api/rome-time';

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
 * Timestamp ISO della COPPIA-PAUSA (uscita → ingresso) di durata `minuti`,
 * centrata nell'intervallo [startIso, endIso]. Sorgente unica del calcolo:
 * riusata sia dalla pausa dichiarata in chiusura turno sia dalla correzione
 * anomalia dell'ufficio, così la pausa è posizionata in modo identico ovunque.
 */
export function coppiaPausaCentrata(
  startIso: string,
  endIso: string,
  minuti: number,
): { uscitaIso: string; ingressoIso: string } {
  const mid = (Date.parse(startIso) + Date.parse(endIso)) / 2;
  const half = (minuti * 60000) / 2;
  return {
    uscitaIso: new Date(mid - half).toISOString(),
    ingressoIso: new Date(mid + half).toISOString(),
  };
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
  const { uscitaIso, ingressoIso } = coppiaPausaCentrata(opts.startIso, opts.endIso, opts.minuti);
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
    { ...base, tipo: 'uscita', ts: uscitaIso },
    { ...base, tipo: 'ingresso', ts: ingressoIso },
  ] as never);
}

/**
 * Rete di sicurezza per la pausa pranzo DIMENTICATA (app chiusa): se il turno
 * del dipendente in `data` è ancora in pausa e sono passati almeno `sogliaOre`
 * dall'inizio pausa, materializza la RIPRESA (ingresso pausa) a
 * `inizioPausa + sogliaOre`, così l'orologio riparte e vengono scalati
 * esattamente `sogliaOre` di pausa. La riga è `origine='manuale'`,
 * `auto_chiusa=true`, `creato_da=null`.
 *
 * Idempotente: agisce solo quando lo stato turno è `pausa` (ultimo evento =
 * uscita pausa). Dopo l'inserimento l'ultimo evento diventa un ingresso, quindi
 * al ricalcolo successivo non re-inserisce nulla. Vale anche per giorni passati
 * (al primo ricalcolo la pausa viene chiusa). Ritorna true se ha inserito.
 */
export async function chiudiPausaScadutaSePresente(
  supabase: Supa,
  opts: { tenantId: string; dipendenteId: string; data: string; sogliaOre: number },
): Promise<boolean> {
  const soglia =
    Number.isFinite(opts.sogliaOre) && opts.sogliaOre >= 0.5 ? opts.sogliaOre : 1.5;
  const { fromIso, toIso } = romeDayBoundsUtc(opts.data);
  const { data: rows } = await supabase
    .from('timbrature' as never)
    .select('tipo, ts, pausa, commessa_id, cantiere_id')
    .eq('tenant_id', opts.tenantId)
    .eq('dipendente_id', opts.dipendenteId)
    .gte('ts', fromIso)
    .lt('ts', toIso)
    .order('ts', { ascending: true });
  const eventi =
    (rows as
      | {
          tipo: 'ingresso' | 'uscita';
          ts: string;
          pausa: boolean | null;
          commessa_id: string | null;
          cantiere_id: string | null;
        }[]
      | null) ?? [];
  if (eventi.length === 0) return false;

  const info = statoTurno(eventi);
  if (info.stato !== 'pausa' || !info.inizioPausa) return false;

  const scadenzaMs = Date.parse(info.inizioPausa) + soglia * 3600000;
  if (Date.now() < scadenzaMs) return false;

  // Riga di inizio pausa = ultima uscita pausa (per ereditare commessa/cantiere).
  const start = eventi
    .filter((e) => e.tipo === 'uscita' && e.pausa)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
    .pop();

  const { error } = await supabase.from('timbrature' as never).insert({
    tenant_id: opts.tenantId,
    dipendente_id: opts.dipendenteId,
    commessa_id: start?.commessa_id ?? null,
    cantiere_id: start?.cantiere_id ?? null,
    tipo: 'ingresso',
    pausa: true,
    origine: 'manuale',
    auto_chiusa: true,
    creato_da: null,
    ts: new Date(scadenzaMs).toISOString(),
  } as never);
  if (error) return false;
  return true;
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
