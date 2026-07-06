import 'server-only';

import { createServerSupabase } from '@kommessa/api/server';
import { romeDay, romeDayBoundsUtc } from '@kommessa/api/rome-time';
import { titoloCase } from '@/app/mobile/_lib/display-case';
import {
  leggiSogliaPausaPranzoOre,
  leggiSogliaAutoSpegnimentoPausa,
  leggiImpostazioniTurno,
} from '@/app/_lib/kantiere-config';

export interface TurnoAzioniContesto {
  sedi: { id: string; nome: string; tipo: string }[];
  mezzi: { id: string; targa: string; modello: string | null }[];
  sedeDefaultId: string | null;
  sogliaPausaPranzoOre: number;
  sogliaAutoSpegnimentoPausaOre: number;
  pausaOggiFatta: boolean;
  /** true se oggi c'è UN SOLO evento (l'ingresso aperto) → split proponibile. */
  giornataPulita: boolean;
  /** Split "cosa hai fatto oggi" attivo (impostazione ufficio). */
  splitAttivo: boolean;
  /** Tolleranza (min) sulla somma dello split. */
  tolleranzaChiusuraMin: number;
  /** Passo (min) degli stepper ore. */
  passoMinuti: number;
}

/**
 * Contesto per le azioni di fine turno IN-APP (pausa pranzo + viaggio di
 * ritorno): sedi selezionabili (default tenant + sedi associate al cantiere,
 * solo attive), parco mezzi attivo, soglie per-tenant e se oggi il dipendente
 * ha già timbrato la pausa su questo cantiere. Mirror della logica del QR
 * (`/t/[token]`).
 *
 * Condiviso da scheda cantiere, home Kantiere e tab Ore, così la stessa card
 * "Turno in corso" (con pausa e fine turno) funziona ovunque senza duplicare la
 * query. Il chiamante è già gated dal layout Kantiere mobile.
 */
export async function caricaTurnoAzioniContesto(
  tenantId: string,
  userId: string,
  cantiereId: string,
): Promise<TurnoAzioniContesto> {
  const supabase = createServerSupabase();

  const [sogliaPausaPranzoOre, sogliaAutoSpegnimentoPausaOre, impostazioniTurno] = await Promise.all([
    leggiSogliaPausaPranzoOre(supabase, tenantId),
    leggiSogliaAutoSpegnimentoPausa(supabase, tenantId),
    leggiImpostazioniTurno(supabase, tenantId),
  ]);

  const [sediRes, assocRes, mezziRes, meRes] = await Promise.all([
    supabase
      .from('sedi' as never)
      .select('id, nome, tipo, is_default')
      .eq('tenant_id', tenantId)
      .eq('attivo', true),
    supabase
      .from('cantiere_sede' as never)
      .select('sede_id')
      .eq('cantiere_id', cantiereId)
      .eq('tenant_id', tenantId),
    supabase
      .from('mezzi' as never)
      .select('id, targa, modello')
      .eq('tenant_id', tenantId)
      .eq('attivo', true)
      .order('targa'),
    supabase
      .from('dipendenti' as never)
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const allSedi =
    (sediRes.data as
      | { id: string; nome: string; tipo: string; is_default: boolean }[]
      | null) ?? [];
  const assocIds = new Set(
    ((assocRes.data as { sede_id: string }[] | null) ?? []).map((r) => r.sede_id),
  );
  const sedi = allSedi
    .filter((s) => s.is_default || assocIds.has(s.id))
    .map((s) => ({ id: s.id, nome: titoloCase(s.nome), tipo: s.tipo }));
  const sedeDefaultId = allSedi.find((s) => s.is_default)?.id ?? null;
  const mezzi = (
    (mezziRes.data as { id: string; targa: string; modello: string | null }[] | null) ?? []
  ).map((m) => ({ id: m.id, targa: m.targa, modello: m.modello }));

  // Oggi risulta già una pausa timbrata su questo cantiere? + giornata pulita
  // (un solo evento oggi = l'ingresso aperto) → lo split è proponibile.
  let pausaOggiFatta = false;
  let giornataPulita = false;
  const dipId = (meRes.data as { id: string } | null)?.id;
  if (dipId) {
    const { fromIso, toIso } = romeDayBoundsUtc(romeDay(new Date()));
    const [{ data: evRows }, { count }] = await Promise.all([
      supabase
        .from('timbrature' as never)
        .select('pausa')
        .eq('tenant_id', tenantId)
        .eq('dipendente_id', dipId)
        .eq('cantiere_id', cantiereId)
        .gte('ts', fromIso)
        .lt('ts', toIso),
      supabase
        .from('timbrature' as never)
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('dipendente_id', dipId)
        .gte('ts', fromIso)
        .lt('ts', toIso),
    ]);
    pausaOggiFatta = ((evRows as { pausa: boolean | null }[] | null) ?? []).some((e) => e.pausa);
    giornataPulita = (count ?? 0) === 1;
  }

  return {
    sedi,
    mezzi,
    sedeDefaultId,
    sogliaPausaPranzoOre,
    sogliaAutoSpegnimentoPausaOre,
    pausaOggiFatta,
    giornataPulita,
    splitAttivo: impostazioniTurno.splitAttivo,
    tolleranzaChiusuraMin: impostazioniTurno.tolleranzaChiusuraMin,
    passoMinuti: impostazioniTurno.passoMinuti,
  };
}
