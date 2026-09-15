import { createServerSupabase } from '@kommessa/api/server';
import { leggiTutto, type EsitoPagina } from '@kommessa/api/pagine';
import { leggiRighePerId } from '@/app/_lib/letture-complete';
import { COLONNE_QUOTE, quoteDaRiga, quoteOre, type RigaRapportinoLetta } from '@kommessa/api/kantiere-quote';
import { requireTenantContext } from '@kommessa/api/tenant';
import { aggregaOre, type RigaAgg } from '@kommessa/api/kantiere-report';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';
import { ReportClient } from './_components/report-client';

export type ViaggioRigaDip = {
  dipendente: string;
  kmTotali: number;
  nViaggi: number;
  oreGuida: number;
};

export type ViaggioRigaMezzo = {
  targa: string;
  modello: string | null;
  kmTotali: number;
  nViaggi: number;
};

export const dynamic = 'force-dynamic';

type Pagina<T> = PromiseLike<EsitoPagina<T>>;

type RapportinoRow = {
  id: string;
  dipendente_id: string;
  data: string;
  stato: string;
};

type RigaRow = RigaRapportinoLetta & {
  rapportino_id: string;
  commessa_id: string | null;
  cantiere_id: string | null;
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

type CantiereRow = {
  id: string;
  nome: string;
  codice: string | null;
};

/** Chiave stabile per raggruppamento: "c:uuid" per commessa, "k:uuid" per cantiere */
function targetKey(row: { commessa_id: string | null; cantiere_id: string | null }): string {
  if (row.commessa_id) return `c:${row.commessa_id}`;
  if (row.cantiere_id) return `k:${row.cantiere_id}`;
  return 'sconosciuto';
}

/** Etichetta display: titolo commessa o nome cantiere */
function targetLabel(
  row: { commessa_id: string | null; cantiere_id: string | null },
  commesseTitoloMap: Map<string, string>,
  cantieriNomeMap: Map<string, string>,
): string {
  if (row.commessa_id) return commesseTitoloMap.get(row.commessa_id) ?? row.commessa_id;
  if (row.cantiere_id) return cantieriNomeMap.get(row.cantiere_id) ?? row.cantiere_id;
  return 'Sconosciuto';
}

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
  /** Lavoro e viaggio entro l'orario ordinario. */
  ordinarie: number;
  straordinarie: number;
  viaggioEccedente: number;
  lavoro: number;
  viaggio: number;
  /** Lavoro + viaggio. */
  totale: number;
};

export type KpiTotali = {
  ordinarie: number;
  straordinarie: number;
  viaggioEccedente: number;
  lavoro: number;
  viaggio: number;
  totale: number;
};

type ViaggioRow = {
  dipendente_id: string;
  mezzo_id: string | null;
  distanza_km: number | null;
  durata_confermata_min: number | null;
  autista: boolean | null;
  da_cantiere_id: string | null;
};

type MezzoLightRow = {
  id: string;
  targa: string;
  modello: string | null;
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

  // Tutto il periodo, oltre il tetto di 1000 righe del database; le liste di id
  // vanno a gruppi. Un errore di lettura mostra la pagina d'errore invece di
  // totali calcolati su dati a metà.
  const [rapportini, viaggi] = await Promise.all([
    // Inviato + approvato di default
    leggiTutto<RapportinoRow>(
      (da, a) => {
        const q = supabase
          .from('rapportini' as never)
          .select('id, dipendente_id, data, stato')
          .eq('tenant_id', ctx.tenantId)
          .gte('data', from)
          .lte('data', to);
        return (statoParam ? q.eq('stato', statoParam) : q.in('stato', ['inviato', 'approvato']))
          .order('data')
          .order('id')
          .range(da, a) as unknown as Pagina<RapportinoRow>;
      },
      { contesto: 'report ore: giornate' },
    ),
    // Tutte le tratte, trasferimenti fra cantieri compresi: sono viaggio.
    leggiTutto<ViaggioRow>(
      (da, a) =>
        supabase
          .from('timbratura_viaggio' as never)
          .select('dipendente_id, mezzo_id, distanza_km, durata_confermata_min, autista, da_cantiere_id')
          .eq('tenant_id', ctx.tenantId)
          .gte('data', from)
          .lte('data', to)
          .order('data')
          .order('id')
          .range(da, a) as unknown as Pagina<ViaggioRow>,
      { contesto: 'report ore: viaggi' },
    ),
  ]);

  const rapportinoIds = rapportini.map((r) => r.id);
  const dipIds = [...new Set(rapportini.map((r) => r.dipendente_id))];

  const righeData = await leggiRighePerId<RigaRow>(
    supabase,
    'rapportino_righe',
    `rapportino_id, commessa_id, cantiere_id, ${COLONNE_QUOTE}`,
    'rapportino_id',
    rapportinoIds,
    'report ore: righe',
  );

  const commessaIds = [...new Set(righeData.map((r) => r.commessa_id).filter((id): id is string => id != null))];
  const cantiereIds = [...new Set(righeData.map((r) => r.cantiere_id).filter((id): id is string => id != null))];

  // Dipendenti dei rapportini e dei viaggi.
  const viaggiDipIds = [...new Set(viaggi.map((v) => v.dipendente_id))];
  const tuttiDipIds = [...new Set([...dipIds, ...viaggiDipIds])];
  const mezziIds = [...new Set(viaggi.map((v) => v.mezzo_id).filter((id): id is string => id != null))];

  const [dipendenti, commesse, cantieri, mezzi] = await Promise.all([
    leggiRighePerId<DipendenteRow>(supabase, 'dipendenti', 'id, nome, cognome', 'id', tuttiDipIds, 'report ore: dipendenti'),
    leggiRighePerId<CommessaRow>(
      supabase,
      'commesse',
      'id, codice_interno, nome_cartella, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali',
      'id',
      commessaIds,
      'report ore: commesse',
    ),
    leggiRighePerId<CantiereRow>(supabase, 'cantieri', 'id, nome, codice', 'id', cantiereIds, 'report ore: cantieri'),
    leggiRighePerId<MezzoLightRow>(supabase, 'mezzi', 'id, targa, modello', 'id', mezziIds, 'report ore: mezzi'),
  ]);

  const dipendentiMap = new Map<string, string>();
  for (const d of dipendenti) {
    dipendentiMap.set(d.id, `${d.nome} ${d.cognome}`.trim());
  }
  const commesseTitoloMap = new Map<string, string>();
  for (const c of commesse) {
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
  const cantieriNomeMap = new Map<string, string>();
  for (const k of cantieri) {
    cantieriNomeMap.set(k.id, k.nome || k.codice || k.id);
  }
  const mezziMap = new Map<string, { targa: string; modello: string | null }>();
  for (const m of mezzi) {
    mezziMap.set(m.id, { targa: m.targa, modello: m.modello });
  }

  // Mappa rapportino_id -> dipendente_id
  const rapportinoDipMap = new Map<string, string>(rapportini.map((r) => [r.id, r.dipendente_id]));

  // Costruisci RigaAgg[]
  const righeAgg: RigaAgg[] = righeData.map((r) => {
    const dipId = rapportinoDipMap.get(r.rapportino_id) ?? '';
    return {
      chiaveDipendente: dipendentiMap.get(dipId) ?? dipId,
      chiaveCommessa: targetLabel(r, commesseTitoloMap, cantieriNomeMap),
      ...(() => {
        const q = quoteOre(quoteDaRiga(r));
        return {
          ore_ordinarie: q.ordinarie,
          ore_straordinarie: q.straordinarie,
          ore_viaggio_eccedenti: q.viaggioEccedente,
          ore_lavoro: q.lavoro,
          ore_viaggio: q.viaggio,
        };
      })(),
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
      viaggioEccedente: acc.viaggioEccedente + r.ore_viaggio_eccedenti,
      lavoro: acc.lavoro + r.ore_lavoro,
      viaggio: acc.viaggio + r.ore_viaggio,
      totale: acc.totale + r.ore_lavoro + r.ore_viaggio,
    }),
    { ordinarie: 0, straordinarie: 0, viaggioEccedente: 0, lavoro: 0, viaggio: 0, totale: 0 },
  );

  // ── Aggregati viaggi per dipendente ───────────────────────────────────────
  const dipViaggioMap = new Map<string, { km: number; n: number; min: number }>();
  for (const v of viaggi) {
    const nome = dipendentiMap.get(v.dipendente_id) ?? v.dipendente_id;
    const cur = dipViaggioMap.get(nome) ?? { km: 0, n: 0, min: 0 };
    // Km attribuiti solo all'autista; le ore di viaggio spettano anche ai passeggeri.
    if (v.autista) cur.km += v.distanza_km ?? 0;
    cur.n += 1;
    cur.min += v.durata_confermata_min ?? 0;
    dipViaggioMap.set(nome, cur);
  }
  const viaggiPerDipendente: ViaggioRigaDip[] = [...dipViaggioMap.entries()]
    .map(([dipendente, s]) => ({
      dipendente,
      kmTotali: s.km,
      nViaggi: s.n,
      oreGuida: s.min / 60,
    }))
    .sort((a, b) => b.kmTotali - a.kmTotali);

  // ── Aggregati viaggi per mezzo ─────────────────────────────────────────────
  const mezzoViaggioMap = new Map<string, { targa: string; modello: string | null; km: number; n: number }>();
  for (const v of viaggi) {
    if (!v.mezzo_id) continue;
    const info = mezziMap.get(v.mezzo_id);
    const key = v.mezzo_id;
    const cur = mezzoViaggioMap.get(key) ?? { targa: info?.targa ?? v.mezzo_id, modello: info?.modello ?? null, km: 0, n: 0 };
    cur.km += v.distanza_km ?? 0;
    cur.n += 1;
    mezzoViaggioMap.set(key, cur);
  }
  const viaggiPerMezzo: ViaggioRigaMezzo[] = [...mezzoViaggioMap.values()]
    .map((s) => ({ targa: s.targa, modello: s.modello, kmTotali: s.km, nViaggi: s.n }))
    .sort((a, b) => b.kmTotali - a.kmTotali);

  return (
    <div className="w-full space-y-5">
      <header>
        <h1 className="text-lg font-semibold">Report ore</h1>
        <p className="text-sm text-muted-foreground">
          Ore aggregate per dipendente o commessa nel periodo selezionato.
        </p>
      </header>
      <ReportClient
        aggregati={aggregati}
        kpi={kpi}
        filtri={{ from, to, per, stato: statoParam }}
        viaggiPerDipendente={viaggiPerDipendente}
        viaggiPerMezzo={viaggiPerMezzo}
      />
    </div>
  );
}
