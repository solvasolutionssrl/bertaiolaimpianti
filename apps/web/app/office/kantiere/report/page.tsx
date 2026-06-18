import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { aggregaOre, type RigaAgg } from '@kommessa/api/kantiere-report';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';
import { ReportClient } from './_components/report-client';

export const dynamic = 'force-dynamic';

type RapportinoRow = {
  id: string;
  dipendente_id: string;
  data: string;
  stato: string;
};

type RigaRow = {
  rapportino_id: string;
  commessa_id: string;
  ore_ordinarie: number;
  ore_straordinarie: number;
  ore_viaggio: number;
};

type DipendenteRow = {
  id: string;
  nome: string;
  cognome: string;
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
  // Giorno calendario in Europe/Rome (il server gira UTC): en-CA → YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d);
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), 1); // primo giorno del mese corrente
  return { from: toYYYYMMDD(from), to: toYYYYMMDD(to) };
}

interface PageProps {
  searchParams: { from?: string; to?: string; per?: string; stato?: string };
}

export type AggregataRiga = {
  chiave: string;
  ordinarie: number;
  straordinarie: number;
  viaggio: number;
  totale: number;
};

export type KpiTotali = {
  ordinarie: number;
  straordinarie: number;
  viaggio: number;
  totale: number;
};

export default async function ReportPage({ searchParams }: PageProps) {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  const def = defaultRange();
  const from = searchParams.from ?? def.from;
  const to = searchParams.to ?? def.to;
  const per = (searchParams.per === 'commessa' ? 'commessa' : 'dipendente') as
    | 'dipendente'
    | 'commessa';
  // Per default include sia inviato che approvato
  const statoParam = searchParams.stato ?? '';

  // Carica rapportini nel range (inviato + approvato di default)
  let rapQuery = supabase
    .from('rapportini' as never)
    .select('id, dipendente_id, data, stato')
    .eq('tenant_id', ctx.tenantId)
    .gte('data', from)
    .lte('data', to)
    .limit(1000);

  if (statoParam) {
    rapQuery = rapQuery.eq('stato', statoParam);
  } else {
    rapQuery = rapQuery.in('stato', ['inviato', 'approvato']);
  }

  const { data: rapportiniData } = (await rapQuery) as { data: RapportinoRow[] | null };
  const rapportini = rapportiniData ?? [];

  const rapportinoIds = rapportini.map((r) => r.id);
  const dipIds = [...new Set(rapportini.map((r) => r.dipendente_id))];

  // Batch-load righe
  let righeData: RigaRow[] = [];
  if (rapportinoIds.length > 0) {
    const { data } = (await supabase
      .from('rapportino_righe' as never)
      .select('rapportino_id, commessa_id, ore_ordinarie, ore_straordinarie, ore_viaggio')
      .in('rapportino_id', rapportinoIds)) as { data: RigaRow[] | null };
    righeData = data ?? [];
  }

  const commessaIds = [...new Set(righeData.map((r) => r.commessa_id))];

  // Batch-load dipendenti
  const dipendentiMap = new Map<string, string>();
  if (dipIds.length > 0) {
    const { data } = (await supabase
      .from('dipendenti' as never)
      .select('id, nome, cognome')
      .in('id', dipIds)) as { data: DipendenteRow[] | null };
    for (const d of data ?? []) {
      dipendentiMap.set(d.id, `${d.nome} ${d.cognome}`.trim());
    }
  }

  // Batch-load commesse
  const commesseTitoloMap = new Map<string, string>();
  if (commessaIds.length > 0) {
    const { data } = (await supabase
      .from('commesse' as never)
      .select('id, codice_interno, nome_cartella, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali')
      .in('id', commessaIds)) as { data: CommessaRow[] | null };
    for (const c of data ?? []) {
      const titolo =
        risolviTitoloCommessa({
          descrizione_ai_finale: c.descrizione_ai_finale,
          descrizione_ai_proposta: c.descrizione_ai_proposta,
          note_iniziali: c.note_iniziali,
          nome_cartella: c.nome_cartella,
          codice_interno: c.codice_interno,
        }) || c.codice_interno || c.id;
      commesseTitoloMap.set(c.id, titolo);
    }
  }

  // Mappa rapportino_id -> dipendente_id
  const rapportinoDipMap = new Map<string, string>(rapportini.map((r) => [r.id, r.dipendente_id]));

  // Costruisci RigaAgg[]
  const righeAgg: RigaAgg[] = righeData.map((r) => {
    const dipId = rapportinoDipMap.get(r.rapportino_id) ?? '';
    return {
      chiaveDipendente: dipendentiMap.get(dipId) ?? dipId,
      chiaveCommessa: commesseTitoloMap.get(r.commessa_id) ?? r.commessa_id,
      ore_ordinarie: r.ore_ordinarie ?? 0,
      ore_straordinarie: r.ore_straordinarie ?? 0,
      ore_viaggio: r.ore_viaggio ?? 0,
    };
  });

  const aggregatiMap = aggregaOre(righeAgg, per);
  const aggregati: AggregataRiga[] = [...aggregatiMap.entries()].map(([chiave, agg]) => ({
    chiave,
    ...agg,
  }));

  // KPI totali
  const kpi: KpiTotali = righeAgg.reduce(
    (acc, r) => ({
      ordinarie: acc.ordinarie + r.ore_ordinarie,
      straordinarie: acc.straordinarie + r.ore_straordinarie,
      viaggio: acc.viaggio + r.ore_viaggio,
      totale: acc.totale + r.ore_ordinarie + r.ore_straordinarie + r.ore_viaggio,
    }),
    { ordinarie: 0, straordinarie: 0, viaggio: 0, totale: 0 },
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Report ore</h1>
        <p className="text-sm text-muted-foreground">
          Ore aggregate per dipendente o commessa nel periodo selezionato.
        </p>
      </header>
      <ReportClient
        aggregati={aggregati}
        kpi={kpi}
        filtri={{ from, to, per, stato: statoParam }}
      />
    </div>
  );
}
