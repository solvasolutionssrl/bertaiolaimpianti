'use server';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import { titoloCase } from '@/app/mobile/_lib/display-case';

/**
 * Turni attivi = dipendenti con un INGRESSO aperto su un cantiere (hanno
 * timbrato ingresso ma non ancora uscita). Si popolano all'arrivo e si
 * spopolano alla timbratura di uscita. Usato dalla Panoramica Kantiere con
 * polling per una vista "live".
 */

export type TurnoAttivo = {
  dipendenteId: string;
  dipendenteNome: string;
  inizioTs: string;
  viaggio: {
    sedeNome: string | null;
    km: number | null;
    durataMin: number | null;
    autista: boolean;
    mezzoTarga: string | null;
  } | null;
};

export type GruppoTurni = {
  cantiereId: string;
  cantiereNome: string;
  turni: TurnoAttivo[];
};

type Result = { ok: true; gruppi: GruppoTurni[]; totale: number } | { ok: false; error: string };

type TimbRow = {
  id: string;
  dipendente_id: string;
  cantiere_id: string | null;
  tipo: 'ingresso' | 'uscita';
  ts: string;
};

export async function turniAttivi(): Promise<Result> {
  const ctx = await requireTenantContext();
  if (!['admin', 'office'].includes(ctx.role)) return { ok: false, error: 'FORBIDDEN' };
  if (!(await tenantHasModule('kantiere'))) return { ok: false, error: 'MODULO_OFF' };

  const supabase = createServerSupabase();

  // Finestra ampia (20h) per coprire i turni iniziati in giornata, evitando
  // ambiguità di fuso sul confine giorno. Solo timbrature su CANTIERE.
  const since = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
  const { data: timbRaw } = await supabase
    .from('timbrature' as never)
    .select('id, dipendente_id, cantiere_id, tipo, ts')
    .eq('tenant_id', ctx.tenantId)
    .not('cantiere_id', 'is', null)
    .gte('ts', since)
    .order('ts', { ascending: true });

  const righe = (timbRaw as TimbRow[] | null) ?? [];

  // Per ogni (dipendente, cantiere): l'ingresso resta "aperto" finché non
  // arriva un'uscita. Gli aperti a fine scansione = turni attivi.
  const aperti = new Map<string, { dipId: string; cantId: string; inizioTs: string; ingressoId: string }>();
  for (const t of righe) {
    if (!t.cantiere_id) continue;
    const key = `${t.dipendente_id}:${t.cantiere_id}`;
    if (t.tipo === 'ingresso') {
      aperti.set(key, {
        dipId: t.dipendente_id,
        cantId: t.cantiere_id,
        inizioTs: t.ts,
        ingressoId: t.id,
      });
    } else {
      aperti.delete(key);
    }
  }

  const attivi = Array.from(aperti.values());
  if (attivi.length === 0) return { ok: true, gruppi: [], totale: 0 };

  const dipIds = [...new Set(attivi.map((a) => a.dipId))];
  const cantIds = [...new Set(attivi.map((a) => a.cantId))];
  const ingressoIds = attivi.map((a) => a.ingressoId);

  const [dipRes, cantRes, viaRes] = await Promise.all([
    supabase.from('dipendenti' as never).select('id, nome, cognome').in('id', dipIds),
    supabase.from('cantieri' as never).select('id, nome, codice').in('id', cantIds),
    supabase
      .from('timbratura_viaggio' as never)
      .select('timbratura_id, sede_id, distanza_km, durata_confermata_min, autista, mezzo_id')
      .in('timbratura_id', ingressoIds),
  ]);

  const dipMap = new Map<string, string>();
  for (const d of (dipRes.data as { id: string; nome: string; cognome: string }[] | null) ?? [])
    dipMap.set(d.id, titoloCase(`${d.nome} ${d.cognome}`));

  const cantMap = new Map<string, string>();
  for (const c of (cantRes.data as { id: string; nome: string | null; codice: string | null }[] | null) ?? [])
    cantMap.set(c.id, titoloCase(c.nome || c.codice || c.id));

  type ViaRow = {
    timbratura_id: string;
    sede_id: string | null;
    distanza_km: number | null;
    durata_confermata_min: number | null;
    autista: boolean;
    mezzo_id: string | null;
  };
  const viaRows = (viaRes.data as ViaRow[] | null) ?? [];
  const viaByIngresso = new Map<string, ViaRow>();
  for (const v of viaRows) viaByIngresso.set(v.timbratura_id, v);

  // Risolvi sedi + mezzi referenziati dai viaggi
  const sedeIds = [...new Set(viaRows.flatMap((v) => (v.sede_id ? [v.sede_id] : [])))];
  const mezzoIds = [...new Set(viaRows.flatMap((v) => (v.mezzo_id ? [v.mezzo_id] : [])))];
  const [sediRes, mezziRes] = await Promise.all([
    sedeIds.length
      ? supabase.from('sedi' as never).select('id, nome').in('id', sedeIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    mezzoIds.length
      ? supabase.from('mezzi' as never).select('id, targa').in('id', mezzoIds)
      : Promise.resolve({ data: [] as { id: string; targa: string }[] }),
  ]);
  const sedeMap = new Map<string, string>();
  for (const s of (sediRes.data as { id: string; nome: string }[] | null) ?? []) sedeMap.set(s.id, s.nome);
  const mezzoMap = new Map<string, string>();
  for (const m of (mezziRes.data as { id: string; targa: string }[] | null) ?? []) mezzoMap.set(m.id, m.targa);

  // Raggruppa per cantiere
  const gruppiMap = new Map<string, GruppoTurni>();
  for (const a of attivi) {
    const via = viaByIngresso.get(a.ingressoId) ?? null;
    const turno: TurnoAttivo = {
      dipendenteId: a.dipId,
      dipendenteNome: dipMap.get(a.dipId) ?? a.dipId,
      inizioTs: a.inizioTs,
      viaggio: via
        ? {
            sedeNome: via.sede_id ? sedeMap.get(via.sede_id) ?? null : null,
            km: via.distanza_km != null ? Number(via.distanza_km) : null,
            durataMin: via.durata_confermata_min != null ? Number(via.durata_confermata_min) : null,
            autista: via.autista,
            mezzoTarga: via.mezzo_id ? mezzoMap.get(via.mezzo_id) ?? null : null,
          }
        : null,
    };
    const g = gruppiMap.get(a.cantId) ?? {
      cantiereId: a.cantId,
      cantiereNome: cantMap.get(a.cantId) ?? a.cantId,
      turni: [],
    };
    g.turni.push(turno);
    gruppiMap.set(a.cantId, g);
  }

  // Ordina i turni per ora inizio (più recente in alto) e i gruppi per nome
  const gruppi = Array.from(gruppiMap.values())
    .map((g) => ({
      ...g,
      turni: g.turni.sort((x, y) => Date.parse(y.inizioTs) - Date.parse(x.inizioTs)),
    }))
    .sort((a, b) => a.cantiereNome.localeCompare(b.cantiereNome));

  return { ok: true, gruppi, totale: attivi.length };
}
