import { createServerSupabase } from '@kommessa/api/server';
import { appaiaTimbrature, statoTurno } from '@kommessa/api/kantiere-ore';
import { romeDay, romeDayBoundsUtc } from '@kommessa/api/rome-time';

import type { DettaglioPresenza, StatoPresenza } from './presenze-types';

/**
 * Helper presenze "live" per la PWA Kantiere (office/admin).
 *
 * Determina lo stato di un dipendente dalle sue timbrature di OGGI (Europe/Rome)
 * riusando la logica pausa-aware condivisa (`statoTurno`/`appaiaTimbrature`):
 *  - chi rientra dalla pausa torna "lavoro";
 *  - chi è in pausa pranzo è "pausa" (non conteggiato tra chi lavora);
 *  - chi ha chiuso il turno è "idle".
 *
 * NB confini-giorno su ora italiana: corretto per turni diurni (FPM). I turni a
 * cavallo della mezzanotte non sono gestiti qui (coerente col resto di Kantiere).
 */

export type EventoOggi = {
  tipo: 'ingresso' | 'uscita';
  ts: string;
  pausa: boolean | null;
  cantiere_id: string | null;
};

function fmtOra(ts: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

function oreLabel(min: number): string {
  if (min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m}m` : `${h}h ${m.toString().padStart(2, '0')}m`;
}

/** Stato presenza corrente dalle timbrature di oggi. */
export function statoDaEventi(eventi: EventoOggi[]): StatoPresenza {
  return statoTurno(eventi).stato;
}

/** Cantiere corrente (id) se il turno è aperto, altrimenti null. */
export function cantiereDaEventi(eventi: EventoOggi[]): string | null {
  if (statoTurno(eventi).stato === 'idle') return null;
  const ultimo = eventi[eventi.length - 1];
  return ultimo?.cantiere_id ?? null;
}

/** Dettaglio presenza "di oggi" pronto per il render. */
export function dettaglioPresenza(eventi: EventoOggi[]): DettaglioPresenza {
  const info = statoTurno(eventi);
  const riepilogo = appaiaTimbrature(eventi);
  let dalleLabel: string | null = null;
  if (info.stato === 'lavoro' && info.ingressoAperto) {
    dalleLabel = `dalle ${fmtOra(info.ingressoAperto)}`;
  } else if (info.stato === 'pausa' && info.inizioPausa) {
    dalleLabel = `in pausa dalle ${fmtOra(info.inizioPausa)}`;
  }
  return {
    stato: info.stato,
    dalleLabel,
    oreLavorate: oreLabel(riepilogo.minutiTotali),
    coppie: riepilogo.coppie.map((c) => ({
      ingresso: fmtOra(c.ingresso),
      uscita: c.uscita ? fmtOra(c.uscita) : null,
    })),
  };
}

/** Eventi di oggi raggruppati per dipendente, per un insieme di dipendenti. */
export async function eventiOggiPerDip(
  supabase: ReturnType<typeof createServerSupabase>,
  tenantId: string,
  dipIds: string[],
): Promise<Map<string, EventoOggi[]>> {
  const out = new Map<string, EventoOggi[]>();
  if (dipIds.length === 0) return out;
  const { fromIso, toIso } = romeDayBoundsUtc(romeDay(new Date()));
  const { data } = await supabase
    .from('timbrature' as never)
    .select('dipendente_id, tipo, ts, pausa, cantiere_id')
    .eq('tenant_id', tenantId)
    .in('dipendente_id', dipIds)
    .gte('ts', fromIso)
    .lt('ts', toIso)
    .order('ts', { ascending: true });
  const rows = (data as (EventoOggi & { dipendente_id: string })[] | null) ?? [];
  for (const r of rows) {
    const arr = out.get(r.dipendente_id) ?? [];
    arr.push({ tipo: r.tipo, ts: r.ts, pausa: r.pausa, cantiere_id: r.cantiere_id });
    out.set(r.dipendente_id, arr);
  }
  return out;
}

/** Eventi di oggi su UN cantiere, raggruppati per dipendente. */
export async function eventiOggiCantiere(
  supabase: ReturnType<typeof createServerSupabase>,
  tenantId: string,
  cantiereId: string,
): Promise<Map<string, EventoOggi[]>> {
  const out = new Map<string, EventoOggi[]>();
  const { fromIso, toIso } = romeDayBoundsUtc(romeDay(new Date()));
  const { data } = await supabase
    .from('timbrature' as never)
    .select('dipendente_id, tipo, ts, pausa, cantiere_id')
    .eq('tenant_id', tenantId)
    .eq('cantiere_id', cantiereId)
    .gte('ts', fromIso)
    .lt('ts', toIso)
    .order('ts', { ascending: true });
  const rows = (data as (EventoOggi & { dipendente_id: string })[] | null) ?? [];
  for (const r of rows) {
    const arr = out.get(r.dipendente_id) ?? [];
    arr.push({ tipo: r.tipo, ts: r.ts, pausa: r.pausa, cantiere_id: r.cantiere_id });
    out.set(r.dipendente_id, arr);
  }
  return out;
}
