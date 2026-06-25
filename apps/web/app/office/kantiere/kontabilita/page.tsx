import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { romeDayBoundsUtc } from '@kommessa/api/rome-time';
import { CATEGORIE_SPESA, type CategoriaSpesa } from '@kommessa/api/spese';

import { Filtri, type FiltriValori } from './_components/filtri';
import { SpeseTable, type SpesaRiga, type CantiereOption } from './_components/spese-table';
import { SubNav } from './_components/sub-nav';

export const dynamic = 'force-dynamic';

type SpesaRow = {
  id: string;
  dipendente_id: string | null;
  cantiere_id: string | null;
  categoria: string | null;
  ragione_sociale: string | null;
  importo_totale: number | null;
  importo_iva: number | null;
  imponibile: number | null;
  valuta: string | null;
  data_scontrino: string | null;
  created_at: string | null;
  note: string | null;
};

type DipendenteRow = { id: string; nome: string; cognome: string };
type CantiereRow = { id: string; nome: string | null; codice: string | null };

function isCategoria(s: string | undefined): s is CategoriaSpesa {
  return !!s && (CATEGORIE_SPESA as readonly string[]).includes(s);
}

interface PageProps {
  searchParams: {
    cantiere?: string;
    dipendente?: string;
    categoria?: string;
    da?: string;
    a?: string;
  };
}

export default async function KontabilitaPage({ searchParams }: PageProps) {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  const cantiereFilter = searchParams.cantiere || undefined;
  const dipendenteFilter = searchParams.dipendente || undefined;
  const categoriaFilter = isCategoria(searchParams.categoria) ? searchParams.categoria : undefined;
  const daFilter = searchParams.da || undefined;
  const aFilter = searchParams.a || undefined;

  // Query spese del tenant con filtri condizionali.
  let query = supabase
    .from('spese' as never)
    .select(
      'id, dipendente_id, cantiere_id, categoria, ragione_sociale, importo_totale, importo_iva, imponibile, valuta, data_scontrino, created_at, note',
    )
    .eq('tenant_id', ctx.tenantId)
    .limit(1000);

  if (cantiereFilter) query = query.eq('cantiere_id', cantiereFilter);
  if (dipendenteFilter) query = query.eq('dipendente_id', dipendenteFilter);
  if (categoriaFilter) query = query.eq('categoria', categoriaFilter);
  // da/a sono giorni calendario (Europe/Rome): li converto in confini UTC esatti
  // sulla colonna timestamptz data_scontrino.
  if (daFilter) {
    const { fromIso } = romeDayBoundsUtc(daFilter);
    query = query.gte('data_scontrino', fromIso);
  }
  if (aFilter) {
    const { toIso } = romeDayBoundsUtc(aFilter);
    query = query.lt('data_scontrino', toIso);
  }

  query = query
    .order('data_scontrino', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  const { data: speseData } = (await query) as { data: SpesaRow[] | null };
  const spese = speseData ?? [];

  // Mappe di display per i dipendenti e i cantieri referenziati.
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

  // Liste opzioni per i filtri e per la riassegnazione: tutti i cantieri +
  // tutti i dipendenti del tenant.
  const { data: tuttiCantieri } = (await supabase
    .from('cantieri' as never)
    .select('id, nome, codice')
    .eq('tenant_id', ctx.tenantId)
    .order('nome')) as { data: CantiereRow[] | null };
  const cantieriOptions: CantiereOption[] = (tuttiCantieri ?? []).map((k) => ({
    id: k.id,
    nome: k.nome || k.codice || k.id,
  }));

  const { data: tuttiDipendenti } = (await supabase
    .from('dipendenti' as never)
    .select('id, nome, cognome')
    .eq('tenant_id', ctx.tenantId)
    .order('cognome')) as { data: DipendenteRow[] | null };
  const dipendentiOptions = (tuttiDipendenti ?? []).map((d) => ({
    id: d.id,
    nome: `${d.nome} ${d.cognome}`.trim(),
  }));

  // Righe serializzabili per il client.
  const righe: SpesaRiga[] = spese.map((s) => ({
    id: s.id,
    dipendenteNome: s.dipendente_id ? dipendentiMap.get(s.dipendente_id) ?? 'Sconosciuto' : 'Sconosciuto',
    cantiereNome: s.cantiere_id ? cantieriMap.get(s.cantiere_id) ?? null : null,
    cantiereId: s.cantiere_id,
    categoria: s.categoria,
    ragioneSociale: s.ragione_sociale,
    importoTotale: s.importo_totale,
    importoIva: s.importo_iva,
    imponibile: s.imponibile,
    valuta: s.valuta || 'EUR',
    dataScontrino: s.data_scontrino,
    note: s.note,
  }));

  const filtri: FiltriValori = {
    cantiere: cantiereFilter ?? '',
    dipendente: dipendenteFilter ?? '',
    categoria: categoriaFilter ?? '',
    da: daFilter ?? '',
    a: aFilter ?? '',
  };

  return (
    <div className="w-full space-y-5">
      <header>
        <h1 className="text-lg font-semibold">Kontabilità</h1>
        <p className="text-sm text-muted-foreground">Spese di cantiere</p>
      </header>

      <SubNav />

      <Filtri
        valori={filtri}
        cantieri={cantieriOptions}
        dipendenti={dipendentiOptions}
        righe={righe}
      />

      <SpeseTable spese={righe} cantieri={cantieriOptions} />
    </div>
  );
}
