import { notFound, redirect } from 'next/navigation';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import { DipendenteDetailClient } from './_components/dipendente-detail-client';
import { giornateAperte } from '@/app/office/_actions/kantiere-rapportini';
import { GiornateApertePanel } from '@/app/office/kantiere/rapportini/_components/giornate-aperte-panel';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

/** Converte un timestamp ISO in data YYYY-MM-DD nel fuso Europe/Rome */
function tsToGiornoRome(ts: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(ts));
}

/** Converte un timestamp ISO in mese YYYY-MM nel fuso Europe/Rome */
function tsToMeseRome(ts: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(ts));
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '00';
  return `${y}-${m}`;
}

/** Converte una data (string date o ISO) in mese YYYY-MM nel fuso Europe/Rome */
function dataToMeseRome(d: string): string {
  return tsToMeseRome(d.length <= 10 ? `${d}T12:00:00Z` : d);
}

export default async function DipendenteDetailPage({ params }: PageProps) {
  const ctx = await requireTenantContext();
  if (!(await tenantHasModule('kantiere'))) redirect('/office');
  const supabase = createServerSupabase();

  // ── 1. Dipendente ─────────────────────────────────────────────────────────
  const { data: dipRaw } = await supabase
    .from('dipendenti' as never)
    .select(
      'id, user_id, nome, cognome, mansione, codice_interno, stato_attivo, note, costo_orario, a_turni',
    )
    .eq('id', params.id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (!dipRaw) notFound();

  const dip = dipRaw as {
    id: string;
    user_id: string | null;
    nome: string;
    cognome: string;
    mansione: string | null;
    codice_interno: string | null;
    stato_attivo: boolean;
    note: string | null;
    costo_orario: number | null;
    a_turni: boolean;
  };

  // ── 2. Account collegato ──────────────────────────────────────────────────
  let accountNome: string | null = null;
  if (dip.user_id) {
    const { data: userRaw } = await supabase
      .from('users')
      .select('id, display_name')
      .eq('id', dip.user_id)
      .maybeSingle();
    const u = userRaw as { id: string; display_name: string | null } | null;
    accountNome = u?.display_name ?? null;
  }

  // ── Finestre temporali ────────────────────────────────────────────────────
  const now = new Date();
  const from45 = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const from90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // ── 3. Timbrature ultimi ~45 giorni ───────────────────────────────────────
  const { data: timbRaw } = (await supabase
    .from('timbrature' as never)
    .select('tipo, ts, cantiere_id, commessa_id')
    .eq('dipendente_id', params.id)
    .eq('tenant_id', ctx.tenantId)
    .gte('ts', from45)
    .order('ts', { ascending: true })
    .limit(3000)) as {
    data:
      | { tipo: string; ts: string; cantiere_id: string | null; commessa_id: string | null }[]
      | null;
  };
  const timbRows = (timbRaw ?? []).filter(
    (t) => t.tipo === 'ingresso' || t.tipo === 'uscita',
  );

  // Bucket per giorno (Europe/Rome)
  const giorniMap = new Map<
    string,
    { tipo: string; ts: string }[]
  >();
  const cantiereIdsSet = new Set<string>();
  const commessaIdsSet = new Set<string>();
  for (const t of timbRows) {
    const g = tsToGiornoRome(t.ts);
    const arr = giorniMap.get(g) ?? [];
    arr.push({ tipo: t.tipo, ts: t.ts });
    giorniMap.set(g, arr);
    if (t.cantiere_id) cantiereIdsSet.add(t.cantiere_id);
    if (t.commessa_id) commessaIdsSet.add(t.commessa_id);
  }

  // ── 4. Rapportini ultimi ~45 giorni + righe ───────────────────────────────
  const from45Date = tsToGiornoRome(from45);
  const { data: rapRaw } = (await supabase
    .from('rapportini' as never)
    .select('id, data, stato')
    .eq('dipendente_id', params.id)
    .eq('tenant_id', ctx.tenantId)
    .gte('data', from45Date)
    .order('data', { ascending: false })
    .limit(200)) as { data: { id: string; data: string; stato: string }[] | null };
  const rapportini = rapRaw ?? [];
  const rapportinoIds = rapportini.map((r) => r.id);

  // rapportino_righe NON ha tenant_id: scoped via rapportino_id (già del tenant) + RLS.
  type RigaRap = {
    rapportino_id: string;
    ore_ordinarie: number | null;
    ore_straordinarie: number | null;
    ore_viaggio: number | null;
  };
  let righeRap: RigaRap[] = [];
  if (rapportinoIds.length > 0) {
    const { data: righeRaw } = (await supabase
      .from('rapportino_righe' as never)
      .select('rapportino_id, ore_ordinarie, ore_straordinarie, ore_viaggio')
      .in('rapportino_id', rapportinoIds)
      .limit(2000)) as { data: RigaRap[] | null };
    righeRap = righeRaw ?? [];
  }

  // Somma ore per rapportino, poi mappa per giornata.
  const oreByRapportino = new Map<
    string,
    { ord: number; straord: number; viaggio: number }
  >();
  for (const r of righeRap) {
    const cur = oreByRapportino.get(r.rapportino_id) ?? { ord: 0, straord: 0, viaggio: 0 };
    cur.ord += Number(r.ore_ordinarie ?? 0);
    cur.straord += Number(r.ore_straordinarie ?? 0);
    cur.viaggio += Number(r.ore_viaggio ?? 0);
    oreByRapportino.set(r.rapportino_id, cur);
  }

  const rapByGiorno = new Map<
    string,
    { stato: string; ord: number; straord: number; viaggio: number }
  >();
  for (const r of rapportini) {
    const ore = oreByRapportino.get(r.id) ?? { ord: 0, straord: 0, viaggio: 0 };
    // r.data è già YYYY-MM-DD; chiave coerente col bucket timbrature
    rapByGiorno.set(r.data, { stato: r.stato, ...ore });
  }

  // ── 5. Viaggi (timbratura_viaggio) ultimi ~90 giorni ──────────────────────
  const { data: viaggiRaw } = (await supabase
    .from('timbratura_viaggio' as never)
    .select('data, direzione, distanza_km, durata_confermata_min, autista, mezzo_id')
    .eq('dipendente_id', params.id)
    .eq('tenant_id', ctx.tenantId)
    .gte('data', tsToGiornoRome(from90))
    .limit(3000)) as {
    data:
      | {
          data: string | null;
          direzione: string | null;
          distanza_km: number | null;
          durata_confermata_min: number | null;
          autista: boolean | null;
          mezzo_id: string | null;
        }[]
      | null;
  };
  const viaggi = viaggiRaw ?? [];

  // (a) Mezzi guidati (autista = true, mezzo_id valorizzato)
  const mezzoAggMap = new Map<string, { viaggi: number; km: number }>();
  let minutiGuida = 0;
  // (b) Km per mese (tutti i viaggi del dipendente, indipendentemente da autista)
  const kmPerMeseMap = new Map<string, number>();

  for (const v of viaggi) {
    const km = Number(v.distanza_km ?? 0);
    if (v.data) {
      const mese = dataToMeseRome(v.data);
      kmPerMeseMap.set(mese, (kmPerMeseMap.get(mese) ?? 0) + km);
    }
    if (v.autista === true) {
      minutiGuida += Number(v.durata_confermata_min ?? 0);
      if (v.mezzo_id) {
        const cur = mezzoAggMap.get(v.mezzo_id) ?? { viaggi: 0, km: 0 };
        cur.viaggi += 1;
        cur.km += km;
        mezzoAggMap.set(v.mezzo_id, cur);
      }
    }
  }

  // Risolvi targa/modello dei mezzi guidati
  const mezzoIds = [...mezzoAggMap.keys()];
  const mezzoInfoMap = new Map<string, { targa: string; modello: string | null }>();
  if (mezzoIds.length > 0) {
    const { data: mezziRaw } = (await supabase
      .from('mezzi' as never)
      .select('id, targa, modello')
      .eq('tenant_id', ctx.tenantId)
      .in('id', mezzoIds)) as {
      data: { id: string; targa: string; modello: string | null }[] | null;
    };
    for (const m of mezziRaw ?? []) {
      mezzoInfoMap.set(m.id, { targa: m.targa, modello: m.modello });
    }
  }

  const mezziGuidati = mezzoIds
    .map((id) => {
      const info = mezzoInfoMap.get(id);
      const agg = mezzoAggMap.get(id)!;
      return {
        mezzoId: id,
        targa: info?.targa ?? 'n.d.',
        modello: info?.modello ?? null,
        viaggi: agg.viaggi,
        km: agg.km,
      };
    })
    .sort((a, b) => b.km - a.km);

  const kmPerMese = [...kmPerMeseMap.entries()]
    .map(([mese, km]) => ({ mese, km }))
    .sort((a, b) => (a.mese < b.mese ? 1 : -1))
    .slice(0, 6);

  // ── 6. Giornate (merge timbrature + rapportino) ───────────────────────────
  const giorniSet = new Set<string>([...giorniMap.keys(), ...rapByGiorno.keys()]);
  const giorni = [...giorniSet]
    .sort((a, b) => (a < b ? 1 : -1)) // più recente prima
    .map((giorno) => {
      const rap = rapByGiorno.get(giorno) ?? null;
      return {
        giorno,
        timbrature: (giorniMap.get(giorno) ?? []).map((t) => ({ tipo: t.tipo, ts: t.ts })),
        rapportino: rap
          ? {
              stato: rap.stato,
              ord: rap.ord,
              straord: rap.straord,
              viaggio: rap.viaggio,
            }
          : null,
      };
    });

  // Giornate passate rimaste aperte di QUESTO dipendente (uscita mancante).
  const giorniApertiRes = await giornateAperte({});
  const giorniApertiDip = giorniApertiRes.ok
    ? giorniApertiRes.giorni.filter((g) => g.dipendenteId === dip.id)
    : [];

  return (
    <div className="w-full space-y-4">
      <GiornateApertePanel giorni={giorniApertiDip} />
      <DipendenteDetailClient
        dipendente={{
          id: dip.id,
          userId: dip.user_id,
          nome: dip.nome,
          cognome: dip.cognome,
          mansione: dip.mansione,
          codiceInterno: dip.codice_interno,
          statoAttivo: dip.stato_attivo,
          note: dip.note,
          costoOrario: dip.costo_orario,
          aTurni: dip.a_turni,
        }}
        accountNome={accountNome}
        giorni={giorni}
        mezziGuidati={mezziGuidati}
        kmPerMese={kmPerMese}
        minutiGuida={minutiGuida}
      />
    </div>
  );
}
