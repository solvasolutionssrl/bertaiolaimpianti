import { redirect } from 'next/navigation';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import {
  risolviRegoleEffettive,
  calcolaCostoGiornataCond,
  aggregaCosti,
  eFestivo,
  giornoSettimanaISO,
  type RegolaOre,
  type RegolaAmbito,
  type RigaCosto,
  type RegolaCond,
} from '@kommessa/api/kantiere-costi';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';
import { assicuraRegoleDefault } from '@/app/office/_actions/kantiere-regole';
import { OreCostiClient } from './_components/ore-costi-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kantiere · Ore e costi' };

// ── Tipi righe DB ─────────────────────────────────────────────────────────
type RegolaRow = {
  id: string;
  nome: string;
  tipo: RegolaOre['tipo'];
  attiva: boolean;
  params: Record<string, unknown> | null;
  maggiorazione_pct: number;
  priorita: number;
  giorni_settimana: number[] | null;
  ora_da: string | null;
  ora_a: string | null;
  festivo_match: 'qualsiasi' | 'solo_festivo' | 'solo_feriale';
  applica_a: 'tutte' | 'ordinario' | 'straordinario';
  a_turni: 'qualsiasi' | 'si' | 'no';
};
type AmbitoRow = {
  id: string;
  regola_id: string;
  tipo_target: RegolaAmbito['tipo_target'];
  target_id: string | null;
};
type DipendenteRow = {
  id: string;
  nome: string;
  cognome: string;
  stato_attivo: boolean;
  costo_orario: number | null;
  a_turni: boolean;
};
type CantiereRow = { id: string; nome: string; codice: string | null };
type RapportinoRow = { id: string; dipendente_id: string; data: string; stato: string };
type RigaRow = {
  rapportino_id: string;
  commessa_id: string | null;
  cantiere_id: string | null;
  ore_ordinarie: number;
  ore_straordinarie: number;
  ore_viaggio: number;
};
type CommessaRow = {
  id: string;
  codice_interno: string | null;
  nome_cartella: string | null;
  descrizione_ai_finale: string | null;
  descrizione_ai_proposta: string | null;
  note_iniziali: string | null;
};

function toYYYYMMDD(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d);
}
function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), 1);
  return { from: toYYYYMMDD(from), to: toYYYYMMDD(to) };
}

export type RegolaView = RegolaRow & { ambiti: AmbitoRow[] };
export type DipendenteView = DipendenteRow;
export type CantiereView = CantiereRow;
export type AggregataCostoRiga = {
  chiave: string;
  ore_ordinarie: number;
  ore_straordinarie: number;
  ore_viaggio: number;
  ore_pesate: number;
  costo_totale: number | null;
};

interface PageProps {
  searchParams: { from?: string; to?: string; per?: string; tab?: string };
}

export default async function OreCostiPage({ searchParams }: PageProps) {
  if (!(await tenantHasModule('kantiere'))) redirect('/office');

  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  // Seed idempotente delle regole di default al primo accesso.
  await assicuraRegoleDefault();

  // ── Regole + ambiti ──────────────────────────────────────────────────────
  const { data: regoleData } = (await supabase
    .from('kantiere_regole_ore' as never)
    .select('id, nome, tipo, attiva, params, maggiorazione_pct, priorita, giorni_settimana, ora_da, ora_a, festivo_match, applica_a, a_turni')
    .eq('tenant_id', ctx.tenantId)
    .order('priorita', { ascending: false })
    .order('nome')) as { data: RegolaRow[] | null };
  const regole = regoleData ?? [];

  const { data: ambitiData } = (await supabase
    .from('kantiere_regola_ambito' as never)
    .select('id, regola_id, tipo_target, target_id')
    .eq('tenant_id', ctx.tenantId)) as { data: AmbitoRow[] | null };
  const ambiti = ambitiData ?? [];

  const ambitiPerRegola = new Map<string, AmbitoRow[]>();
  for (const a of ambiti) {
    const arr = ambitiPerRegola.get(a.regola_id) ?? [];
    arr.push(a);
    ambitiPerRegola.set(a.regola_id, arr);
  }
  const regoleView: RegolaView[] = regole.map((r) => ({ ...r, ambiti: ambitiPerRegola.get(r.id) ?? [] }));

  // ── Dipendenti (con costo orario + a_turni) ──────────────────────────────
  const { data: dipData } = (await supabase
    .from('dipendenti' as never)
    .select('id, nome, cognome, stato_attivo, costo_orario, a_turni')
    .eq('tenant_id', ctx.tenantId)
    .order('cognome')) as { data: DipendenteRow[] | null };
  const dipendenti = dipData ?? [];

  // ── Cantieri (per il picker di ambito) ───────────────────────────────────
  const { data: cantData } = (await supabase
    .from('cantieri' as never)
    .select('id, nome, codice')
    .eq('tenant_id', ctx.tenantId)
    .order('codice')) as { data: CantiereRow[] | null };
  const cantieri = cantData ?? [];

  // ── Costi aggregati nel range ────────────────────────────────────────────
  const def = defaultRange();
  const from = searchParams.from ?? def.from;
  const to = searchParams.to ?? def.to;
  const per = (searchParams.per === 'commessa' ? 'commessa' : 'dipendente') as 'dipendente' | 'commessa';

  // Mappe di supporto
  const dipNomeMap = new Map<string, string>(
    dipendenti.map((d) => [d.id, `${d.nome} ${d.cognome}`.trim()]),
  );
  const dipCostoMap = new Map<string, number | null>(dipendenti.map((d) => [d.id, d.costo_orario]));
  const dipATurniMap = new Map<string, boolean>(dipendenti.map((d) => [d.id, d.a_turni]));
  const cantNomeMap = new Map<string, string>(cantieri.map((k) => [k.id, k.nome || k.codice || k.id]));

  // Regole pure (input al vecchio solver, usato solo per risolviRegoleEffettive viaggio)
  const regolePure: RegolaOre[] = regole.map((r) => ({
    id: r.id,
    nome: r.nome,
    tipo: r.tipo,
    attiva: r.attiva,
    params: r.params ?? {},
    maggiorazione_pct: Number(r.maggiorazione_pct),
    priorita: r.priorita,
  }));
  const ambitiPure: RegolaAmbito[] = ambiti.map((a) => ({
    regola_id: a.regola_id,
    tipo_target: a.tipo_target,
    target_id: a.target_id,
  }));

  // Regole condizionali per il nuovo motore (esclude viaggio e soglia)
  const regoleCond: RegolaCond[] = regole
    .filter((r) => r.tipo !== 'maggiorazione_viaggio' && r.tipo !== 'soglia_giornaliera')
    .map((r) => ({
      id: r.id,
      nome: r.nome,
      attiva: r.attiva,
      maggiorazione_pct: Number(r.maggiorazione_pct),
      priorita: r.priorita,
      giorni_settimana: r.giorni_settimana,
      ora_da: r.ora_da,
      ora_a: r.ora_a,
      festivo_match: r.festivo_match,
      applica_a: r.applica_a,
      a_turni: r.a_turni,
      params: r.params ?? {},
    }));

  // Carica rapportini inviati/approvati nel range
  const { data: rapData } = (await supabase
    .from('rapportini' as never)
    .select('id, dipendente_id, data, stato')
    .eq('tenant_id', ctx.tenantId)
    .gte('data', from)
    .lte('data', to)
    .in('stato', ['inviato', 'approvato'])
    .limit(2000)) as { data: RapportinoRow[] | null };
  const rapportini = rapData ?? [];

  const rapMeta = new Map<string, { dipendente_id: string; data: string }>(
    rapportini.map((r) => [r.id, { dipendente_id: r.dipendente_id, data: r.data }]),
  );
  const rapportinoIds = rapportini.map((r) => r.id);

  let righeData: RigaRow[] = [];
  if (rapportinoIds.length > 0) {
    const { data } = (await supabase
      .from('rapportino_righe' as never)
      .select('rapportino_id, commessa_id, cantiere_id, ore_ordinarie, ore_straordinarie, ore_viaggio')
      .in('rapportino_id', rapportinoIds)) as { data: RigaRow[] | null };
    righeData = data ?? [];
  }

  // Titoli commesse
  const commessaIds = [...new Set(righeData.map((r) => r.commessa_id).filter((id): id is string => id != null))];
  const commesseTitoloMap = new Map<string, string>();
  if (commessaIds.length > 0) {
    const { data } = (await supabase
      .from('commesse' as never)
      .select('id, codice_interno, nome_cartella, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali')
      .in('id', commessaIds)) as { data: CommessaRow[] | null };
    for (const c of data ?? []) {
      commesseTitoloMap.set(
        c.id,
        risolviTitoloCommessa({
          descrizione_ai_finale: c.descrizione_ai_finale,
          descrizione_ai_proposta: c.descrizione_ai_proposta,
          note_iniziali: c.note_iniziali,
          nome_cartella: c.nome_cartella,
          codice_interno: c.codice_interno,
        }) || c.codice_interno || c.id,
      );
    }
  }

  // Cache % viaggio per (dipendente|cantiere) — via vecchio solver per rispettare ambiti
  const pctViaggioCache = new Map<string, number>();
  function getPctViaggio(dipendenteId: string | null, cantiereId: string | null): number {
    const key = `${dipendenteId ?? ''}|${cantiereId ?? ''}`;
    let v = pctViaggioCache.get(key);
    if (v === undefined) {
      const regEff = risolviRegoleEffettive(regolePure, ambitiPure, { dipendenteId, cantiereId });
      v = regEff.get('maggiorazione_viaggio')?.maggiorazione_pct ?? 0;
      pctViaggioCache.set(key, v);
    }
    return v;
  }

  const righeCosto: RigaCosto[] = righeData.map((r) => {
    const meta = rapMeta.get(r.rapportino_id);
    const dipId = meta?.dipendente_id ?? '';
    const giorno = meta?.data ?? '';
    const festivo = giorno ? eFestivo(giorno) : false;
    const giornoSettimana = giorno ? giornoSettimanaISO(giorno) : 1;
    const aTurni = dipATurniMap.get(dipId) ?? false;
    const targetLabel = r.commessa_id
      ? commesseTitoloMap.get(r.commessa_id) ?? r.commessa_id
      : r.cantiere_id
        ? cantNomeMap.get(r.cantiere_id) ?? r.cantiere_id
        : 'Sconosciuto';

    return calcolaCostoGiornataCond({
      chiaveDipendente: dipNomeMap.get(dipId) ?? dipId,
      chiaveCommessa: targetLabel,
      ore_ordinarie: Number(r.ore_ordinarie ?? 0),
      ore_straordinarie: Number(r.ore_straordinarie ?? 0),
      ore_viaggio: Number(r.ore_viaggio ?? 0),
      giornoSettimana,
      festivo,
      aTurni,
      pctViaggio: getPctViaggio(dipId, r.cantiere_id),
      costoOrario: dipCostoMap.get(dipId) ?? null,
      regole: regoleCond,
    });
  });

  const aggMap = aggregaCosti(righeCosto, per);
  const aggregati: AggregataCostoRiga[] = [...aggMap.entries()].map(([chiave, a]) => ({
    chiave,
    ore_ordinarie: a.ore_ordinarie,
    ore_straordinarie: a.ore_straordinarie,
    ore_viaggio: a.ore_viaggio,
    ore_pesate: a.ore_pesate,
    costo_totale: a.costo_totale,
  }));

  return (
    <div className="w-full space-y-5">
      <header>
        <h1 className="text-lg font-semibold">Ore e costi</h1>
        <p className="text-sm text-muted-foreground">
          Regole di maggiorazione, tariffe orarie dei dipendenti e costo del lavoro per periodo.
        </p>
      </header>
      <OreCostiClient
        regole={regoleView}
        dipendenti={dipendenti}
        cantieri={cantieri}
        aggregati={aggregati}
        filtri={{ from, to, per }}
        tabIniziale={searchParams.tab === 'tariffe' || searchParams.tab === 'costi' ? searchParams.tab : 'regole'}
      />
    </div>
  );
}
