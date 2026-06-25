import { redirect } from 'next/navigation';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { romeDayBoundsUtc, romeDay } from '@kommessa/api/rome-time';
import { CATEGORIE_ORDINATE } from '@/app/_components/spese/categoria';
import { tenantHasModule } from '@/app/_lib/modules';
import { SubNav } from '../_components/sub-nav';
import { AnalisiClient } from './_components/analisi-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kantiere · Analisi dei costi' };

type SpesaRow = {
  id: string;
  dipendente_id: string | null;
  cantiere_id: string | null;
  categoria: string | null;
  importo_totale: number | null;
  importo_iva: number | null;
  data_scontrino: string | null;
};
type DipendenteRow = { id: string; nome: string; cognome: string };
type CantiereRow = { id: string; nome: string | null; codice: string | null };

export type VoceAgg = { nome: string; valore: number };
export type VoceCategoria = { categoria: string; valore: number };

interface PageProps {
  searchParams: { da?: string; a?: string; cantiere?: string };
}

export default async function AnalisiPage({ searchParams }: PageProps) {
  if (!(await tenantHasModule('kantiere'))) redirect('/office');

  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  const daFilter = searchParams.da || undefined;
  const aFilter = searchParams.a || undefined;
  const cantiereFilter = searchParams.cantiere || undefined;

  // Solo spese confermate (le analitiche escludono le bozze).
  let query = supabase
    .from('spese' as never)
    .select('id, dipendente_id, cantiere_id, categoria, importo_totale, importo_iva, data_scontrino')
    .eq('tenant_id', ctx.tenantId)
    .eq('stato', 'confermata')
    .limit(5000);

  if (cantiereFilter) query = query.eq('cantiere_id', cantiereFilter);
  if (daFilter) {
    const { fromIso } = romeDayBoundsUtc(daFilter);
    query = query.gte('data_scontrino', fromIso);
  }
  if (aFilter) {
    const { toIso } = romeDayBoundsUtc(aFilter);
    query = query.lt('data_scontrino', toIso);
  }

  const { data: speseData } = (await query) as { data: SpesaRow[] | null };
  const spese = speseData ?? [];

  // Mappe di display.
  const dipIds = [...new Set(spese.map((s) => s.dipendente_id).filter((x): x is string => !!x))];
  const cantIds = [...new Set(spese.map((s) => s.cantiere_id).filter((x): x is string => !!x))];

  const dipendentiMap = new Map<string, string>();
  if (dipIds.length > 0) {
    const { data } = (await supabase
      .from('dipendenti' as never)
      .select('id, nome, cognome')
      .in('id', dipIds)) as { data: DipendenteRow[] | null };
    for (const d of data ?? []) dipendentiMap.set(d.id, `${d.nome} ${d.cognome}`.trim());
  }
  const cantieriMap = new Map<string, string>();
  if (cantIds.length > 0) {
    const { data } = (await supabase
      .from('cantieri' as never)
      .select('id, nome, codice')
      .in('id', cantIds)) as { data: CantiereRow[] | null };
    for (const k of data ?? []) cantieriMap.set(k.id, k.nome || k.codice || k.id);
  }

  // Opzioni del filtro cantiere (tutti i cantieri del tenant).
  const { data: tuttiCantieri } = (await supabase
    .from('cantieri' as never)
    .select('id, nome, codice')
    .eq('tenant_id', ctx.tenantId)
    .order('nome')) as { data: CantiereRow[] | null };
  const cantieriOptions = (tuttiCantieri ?? []).map((k) => ({
    id: k.id,
    nome: k.nome || k.codice || k.id,
  }));

  // ── Aggregazioni ──────────────────────────────────────────────────────────
  let spesaTotale = 0;
  let ivaTotale = 0;
  const nRicevute = spese.length;

  const perCategoria = new Map<string, number>();
  const perCantiere = new Map<string, number>(); // chiave: id ('' = Da assegnare)
  const perDipendente = new Map<string, number>();
  const perMese = new Map<string, number>(); // 'YYYY-MM'

  for (const s of spese) {
    const tot = Number(s.importo_totale ?? 0);
    spesaTotale += tot;
    ivaTotale += Number(s.importo_iva ?? 0);

    const cat = s.categoria || 'varie';
    perCategoria.set(cat, (perCategoria.get(cat) ?? 0) + tot);

    const cantKey = s.cantiere_id ?? '';
    perCantiere.set(cantKey, (perCantiere.get(cantKey) ?? 0) + tot);

    const dipKey = s.dipendente_id ?? '';
    perDipendente.set(dipKey, (perDipendente.get(dipKey) ?? 0) + tot);

    if (s.data_scontrino) {
      const mese = romeDay(new Date(s.data_scontrino)).slice(0, 7);
      perMese.set(mese, (perMese.get(mese) ?? 0) + tot);
    }
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;

  const categorie: VoceCategoria[] = CATEGORIE_ORDINATE.map((c) => ({
    categoria: c,
    valore: r2(perCategoria.get(c) ?? 0),
  })).filter((c) => c.valore > 0);

  const cantieriAgg: VoceAgg[] = [...perCantiere.entries()]
    .map(([id, valore]) => ({
      nome: id ? cantieriMap.get(id) ?? 'Sconosciuto' : 'Da assegnare',
      valore: r2(valore),
    }))
    .sort((a, b) => b.valore - a.valore);

  const dipendentiAgg: VoceAgg[] = [...perDipendente.entries()]
    .map(([id, valore]) => ({
      nome: id ? dipendentiMap.get(id) ?? 'Sconosciuto' : 'Senza nome',
      valore: r2(valore),
    }))
    .sort((a, b) => b.valore - a.valore);

  const trend = [...perMese.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mese, valore]) => ({ etichetta: mese, valore: r2(valore) }));

  return (
    <div className="w-full space-y-5">
      <header>
        <h1 className="text-lg font-semibold">Kontabilità</h1>
        <p className="text-sm text-muted-foreground">Analisi delle spese di cantiere</p>
      </header>

      <SubNav />

      <AnalisiClient
        kpi={{
          spesaTotale: r2(spesaTotale),
          ivaTotale: r2(ivaTotale),
          nRicevute,
          scontrinoMedio: nRicevute > 0 ? r2(spesaTotale / nRicevute) : 0,
        }}
        categorie={categorie}
        cantieri={cantieriAgg}
        dipendenti={dipendentiAgg}
        trend={trend}
        cantieriOptions={cantieriOptions}
        filtri={{ da: daFilter ?? '', a: aFilter ?? '', cantiere: cantiereFilter ?? '' }}
      />
    </div>
  );
}
