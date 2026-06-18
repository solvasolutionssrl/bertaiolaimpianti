import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';
import { RapportiniClient, type RapportiniRiga, type DipendenteItem } from './_components/rapportini-client';

export const dynamic = 'force-dynamic';

type RapportinoRow = {
  id: string;
  dipendente_id: string;
  data: string;
  stato: string;
  inviato_at: string | null;
};

type RigaRow = {
  id: string;
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
  return d.toISOString().slice(0, 10);
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 13); // last 14 days inclusive
  return { from: toYYYYMMDD(from), to: toYYYYMMDD(to) };
}

interface PageProps {
  searchParams: { from?: string; to?: string; stato?: string; dipendente?: string };
}

export default async function RapportiniPage({ searchParams }: PageProps) {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  const def = defaultRange();
  const from = searchParams.from ?? def.from;
  const to = searchParams.to ?? def.to;
  const statoFilter = searchParams.stato ?? '';
  const dipendenteFilter = searchParams.dipendente ?? '';

  // Carica rapportini nel range
  let query = supabase
    .from('rapportini' as never)
    .select('id, dipendente_id, data, stato, inviato_at')
    .eq('tenant_id', ctx.tenantId)
    .gte('data', from)
    .lte('data', to)
    .order('data', { ascending: false })
    .limit(500);

  if (statoFilter) {
    query = query.eq('stato', statoFilter);
  }
  if (dipendenteFilter) {
    query = query.eq('dipendente_id', dipendenteFilter);
  }

  const { data: rapportiniData } = (await query) as { data: RapportinoRow[] | null };
  const rapportini = rapportiniData ?? [];

  // Batch-load righe
  const rapportinoIds = rapportini.map((r) => r.id);
  const dipIds = [...new Set(rapportini.map((r) => r.dipendente_id))];

  let righeData: RigaRow[] = [];
  if (rapportinoIds.length > 0) {
    const { data } = (await supabase
      .from('rapportino_righe' as never)
      .select('id, rapportino_id, commessa_id, ore_ordinarie, ore_straordinarie, ore_viaggio')
      .in('rapportino_id', rapportinoIds)) as { data: RigaRow[] | null };
    righeData = data ?? [];
  }

  const commessaIds = [...new Set(righeData.map((r) => r.commessa_id))];

  // Batch-load dipendenti (per display)
  let dipendentiMap = new Map<string, string>();
  if (dipIds.length > 0) {
    const { data } = (await supabase
      .from('dipendenti' as never)
      .select('id, nome, cognome')
      .in('id', dipIds)) as { data: DipendenteRow[] | null };
    for (const d of data ?? []) {
      dipendentiMap.set(d.id, `${d.nome} ${d.cognome}`.trim());
    }
  }

  // Batch-load commesse (per titolo)
  let commesseTitoloMap = new Map<string, string>();
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

  // Mappa rapportino_id -> righe
  const righeByRapportino = new Map<string, RigaRow[]>();
  for (const r of righeData) {
    const arr = righeByRapportino.get(r.rapportino_id) ?? [];
    arr.push(r);
    righeByRapportino.set(r.rapportino_id, arr);
  }

  // Costruisci righe per il client
  const righe: RapportiniRiga[] = rapportini.map((r) => {
    const rr = righeByRapportino.get(r.id) ?? [];
    const totale = rr.reduce(
      (acc, x) => ({
        ord: acc.ord + (x.ore_ordinarie ?? 0),
        straord: acc.straord + (x.ore_straordinarie ?? 0),
        viaggio: acc.viaggio + (x.ore_viaggio ?? 0),
      }),
      { ord: 0, straord: 0, viaggio: 0 },
    );
    return {
      id: r.id,
      dipendenteNome: dipendentiMap.get(r.dipendente_id) ?? r.dipendente_id,
      data: r.data,
      stato: r.stato,
      inviatoAt: r.inviato_at,
      totale,
      righe: rr.map((x) => ({
        commessaTitolo: commesseTitoloMap.get(x.commessa_id) ?? x.commessa_id,
        ore_ordinarie: x.ore_ordinarie ?? 0,
        ore_straordinarie: x.ore_straordinarie ?? 0,
        ore_viaggio: x.ore_viaggio ?? 0,
      })),
    };
  });

  // Carica tutti i dipendenti attivi per il filtro
  const { data: tuttiDipendenti } = (await supabase
    .from('dipendenti' as never)
    .select('id, nome, cognome')
    .eq('stato_attivo', true)
    .order('cognome')) as { data: DipendenteRow[] | null };

  const dipendentiFilter: DipendenteItem[] = (tuttiDipendenti ?? []).map((d) => ({
    id: d.id,
    nome: `${d.nome} ${d.cognome}`.trim(),
  }));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Rapportini</h1>
        <p className="text-sm text-muted-foreground">
          Coda approvazioni e registro dei rapportini giornalieri del personale.
        </p>
      </header>
      <RapportiniClient
        righe={righe}
        filtri={{ from, to, stato: statoFilter, dipendente: dipendenteFilter }}
        dipendenti={dipendentiFilter}
      />
    </div>
  );
}
