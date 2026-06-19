import { redirect } from 'next/navigation';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import {
  risolviRegoleEffettive,
  calcolaCostoGiornata,
  aggregaCosti,
  eFestivo,
  eWeekend,
  type RegolaOre,
  type RegolaAmbito,
  type RigaCosto,
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
  ore_weekend: number;
  ore_festivo: number;
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
    .select('id, nome, tipo, attiva, params, maggiorazione_pct, priorita')
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

  // ── Dipendenti (con costo orario) ────────────────────────────────────────
  const { data: dipData } = (await supabase
    .from('dipendenti' as never)
    .select('id, nome, cognome, stato_attivo, costo_orario')
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
  const cantNomeMap = new Map<string, string>(cantieri.map((k) => [k.id, k.nome || k.codice || k.id]));

  // Regole pure (input al solver)
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

  // Cache delle regole effettive per (dipendente|cantiere)
  const regoleEffCache = new Map<string, ReturnType<typeof risolviRegoleEffettive>>();
  function regoleEff(dipendenteId: string | null, cantiereId: string | null) {
    const key = `${dipendenteId ?? ''}|${cantiereId ?? ''}`;
    let v = regoleEffCache.get(key);
    if (!v) {
      v = risolviRegoleEffettive(regolePure, ambitiPure, { dipendenteId, cantiereId });
      regoleEffCache.set(key, v);
    }
    return v;
  }

  const righeCosto: RigaCosto[] = righeData.map((r) => {
    const meta = rapMeta.get(r.rapportino_id);
    const dipId = meta?.dipendente_id ?? '';
    const giorno = meta?.data ?? '';
    const festivo = giorno ? eFestivo(giorno) : false;
    const weekend = giorno ? eWeekend(giorno) : false;
    const targetLabel = r.commessa_id
      ? commesseTitoloMap.get(r.commessa_id) ?? r.commessa_id
      : r.cantiere_id
        ? cantNomeMap.get(r.cantiere_id) ?? r.cantiere_id
        : 'Sconosciuto';

    const ordin = Number(r.ore_ordinarie ?? 0);
    const straord = Number(r.ore_straordinarie ?? 0);
    const viaggio = Number(r.ore_viaggio ?? 0);
    // In giorno festivo/weekend le ore ordinarie+straordinarie vengono
    // classificate come festivo/weekend per applicare quella maggiorazione.
    const baseLavoro = ordin + straord;
    const oreFestivo = festivo ? baseLavoro : 0;
    const oreWeekend = !festivo && weekend ? baseLavoro : 0;
    const oreOrdin = festivo || weekend ? 0 : ordin;
    const oreStraord = festivo || weekend ? 0 : straord;

    return calcolaCostoGiornata({
      chiaveDipendente: dipNomeMap.get(dipId) ?? dipId,
      chiaveCommessa: targetLabel,
      ore_ordinarie: oreOrdin,
      ore_straordinarie: oreStraord,
      ore_viaggio: viaggio,
      ore_weekend: oreWeekend,
      ore_festivo: oreFestivo,
      costoOrario: dipCostoMap.get(dipId) ?? null,
      regole: regoleEff(dipId, r.cantiere_id),
    });
  });

  const aggMap = aggregaCosti(righeCosto, per);
  const aggregati: AggregataCostoRiga[] = [...aggMap.entries()].map(([chiave, a]) => ({ chiave, ...a }));

  return (
    <div className="w-full space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Ore e costi</h1>
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
