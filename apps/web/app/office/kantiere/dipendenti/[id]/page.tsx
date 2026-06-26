import { notFound, redirect } from 'next/navigation';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { romeDay } from '@kommessa/api/rome-time';
import { tenantHasModule } from '@/app/_lib/modules';
import { DipendenteDetailClient } from './_components/dipendente-detail-client';
import { giornateAperte } from '@/app/office/_actions/kantiere-rapportini';
import { GiornateApertePanel } from '@/app/office/kantiere/rapportini/_components/giornate-aperte-panel';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
  searchParams: { mese?: string };
}

/** Primo/ultimo giorno (YYYY-MM-DD) di un mese 'YYYY-MM'. */
function boundsMese(mese: string): { primo: string; ultimo: string; giorniMese: number } {
  const p = mese.split('-').map(Number);
  const y = p[0] ?? 2026;
  const m = p[1] ?? 1;
  const giorniMese = new Date(Date.UTC(y, m, 0)).getUTCDate(); // m è 1-based → giorno 0 del mese successivo
  const primo = `${mese}-01`;
  const ultimo = `${mese}-${String(giorniMese).padStart(2, '0')}`;
  return { primo, ultimo, giorniMese };
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

export default async function DipendenteDetailPage({ params, searchParams }: PageProps) {
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
    .select('tipo, ts, cantiere_id, commessa_id, pausa')
    .eq('dipendente_id', params.id)
    .eq('tenant_id', ctx.tenantId)
    .gte('ts', from45)
    .order('ts', { ascending: true })
    .limit(3000)) as {
    data:
      | {
          tipo: string;
          ts: string;
          cantiere_id: string | null;
          commessa_id: string | null;
          pausa: boolean | null;
        }[]
      | null;
  };
  const timbRows = (timbRaw ?? []).filter(
    (t) => t.tipo === 'ingresso' || t.tipo === 'uscita',
  );

  // Bucket per giorno (Europe/Rome)
  const giorniMap = new Map<
    string,
    { tipo: string; ts: string; pausa: boolean | null }[]
  >();
  const cantiereIdsSet = new Set<string>();
  const commessaIdsSet = new Set<string>();
  for (const t of timbRows) {
    const g = tsToGiornoRome(t.ts);
    const arr = giorniMap.get(g) ?? [];
    arr.push({ tipo: t.tipo, ts: t.ts, pausa: t.pausa ?? false });
    giorniMap.set(g, arr);
    if (t.cantiere_id) cantiereIdsSet.add(t.cantiere_id);
    if (t.commessa_id) commessaIdsSet.add(t.commessa_id);
  }

  // ── 4. Rapportini + righe ─────────────────────────────────────────────────
  // Mese visibile nel calendario (default mese corrente, override ?mese=YYYY-MM).
  const meseCorrente = romeDay(now).slice(0, 7);
  const meseSel = /^\d{4}-\d{2}$/.test(searchParams?.mese ?? '')
    ? (searchParams!.mese as string)
    : meseCorrente;
  const { primo: meseDa, ultimo: meseA } = boundsMese(meseSel);

  // La lista "Presenze e ore" usa ~45 giorni; il calendario può puntare a un mese
  // più vecchio → allargo la finestra a min(45gg, primo del mese) … max(oggi, fine mese).
  const from45Date = tsToGiornoRome(from45);
  const oggiDate = tsToGiornoRome(now.toISOString());
  const rangeDa = meseDa < from45Date ? meseDa : from45Date;
  const rangeA = meseA > oggiDate ? meseA : oggiDate;

  const { data: rapRaw } = (await supabase
    .from('rapportini' as never)
    .select('id, data, stato')
    .eq('dipendente_id', params.id)
    .eq('tenant_id', ctx.tenantId)
    .gte('data', rangeDa)
    .lte('data', rangeA)
    .order('data', { ascending: false })
    .limit(400)) as { data: { id: string; data: string; stato: string }[] | null };
  const rapportiniTutti = rapRaw ?? [];
  // La lista esistente resta limitata agli ultimi ~45 giorni (comportamento invariato).
  const rapportini = rapportiniTutti.filter((r) => r.data >= from45Date);
  const rapportinoIds = rapportiniTutti.map((r) => r.id);

  // rapportino_righe NON ha tenant_id: scoped via rapportino_id (già del tenant) + RLS.
  type RigaRap = {
    rapportino_id: string;
    ore_ordinarie: number | null;
    ore_straordinarie: number | null;
    ore_viaggio: number | null;
    commessa_id: string | null;
    cantiere_id: string | null;
  };
  let righeRap: RigaRap[] = [];
  if (rapportinoIds.length > 0) {
    const { data: righeRaw } = (await supabase
      .from('rapportino_righe' as never)
      .select('rapportino_id, ore_ordinarie, ore_straordinarie, ore_viaggio, commessa_id, cantiere_id')
      .in('rapportino_id', rapportinoIds)
      .limit(4000)) as { data: RigaRap[] | null };
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
  // (b) Km per mese (tutti i viaggi = percorsi, autista o passeggero)
  const kmPerMeseMap = new Map<string, number>();
  // (c) Km GUIDATI (autista=true) vs da PASSEGGERO (autista=false): distinguere
  //     se ha davvero guidato o solo viaggiato.
  let kmGuidati = 0;
  let kmPasseggero = 0;

  for (const v of viaggi) {
    const km = Number(v.distanza_km ?? 0);
    if (v.data) {
      const mese = dataToMeseRome(v.data);
      kmPerMeseMap.set(mese, (kmPerMeseMap.get(mese) ?? 0) + km);
    }
    if (v.autista === true) {
      kmGuidati += km;
      minutiGuida += Number(v.durata_confermata_min ?? 0);
      if (v.mezzo_id) {
        const cur = mezzoAggMap.get(v.mezzo_id) ?? { viaggi: 0, km: 0 };
        cur.viaggi += 1;
        cur.km += km;
        mezzoAggMap.set(v.mezzo_id, cur);
      }
    } else {
      kmPasseggero += km;
    }
  }
  kmGuidati = Math.round(kmGuidati * 10) / 10;
  kmPasseggero = Math.round(kmPasseggero * 10) / 10;

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
        timbrature: (giorniMap.get(giorno) ?? []).map((t) => ({
          tipo: t.tipo,
          ts: t.ts,
          pausa: t.pausa ?? false,
        })),
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

  // ── 7. Calendario ore del mese selezionato ────────────────────────────────
  // Righe del mese, raggruppate per giorno e per target (cantiere/commessa).
  // Mappa rapportino_id → {data, stato} solo per i rapportini del mese.
  const rapMeseById = new Map<string, { data: string; stato: string }>();
  for (const r of rapportiniTutti) {
    if (r.data >= meseDa && r.data <= meseA) {
      rapMeseById.set(r.id, { data: r.data, stato: r.stato });
    }
  }

  // Risolvi i nomi dei target presenti nelle righe del mese (per il dettaglio giorno).
  const cantiereIdsMese = new Set<string>();
  const commessaIdsMese = new Set<string>();
  for (const riga of righeRap) {
    if (!rapMeseById.has(riga.rapportino_id)) continue;
    if (riga.cantiere_id) cantiereIdsMese.add(riga.cantiere_id);
    if (riga.commessa_id) commessaIdsMese.add(riga.commessa_id);
  }
  const nomeCantiereMap = new Map<string, string>();
  if (cantiereIdsMese.size > 0) {
    const { data: cantRaw } = (await supabase
      .from('cantieri' as never)
      .select('id, nome')
      .eq('tenant_id', ctx.tenantId)
      .in('id', [...cantiereIdsMese])) as { data: { id: string; nome: string }[] | null };
    for (const c of cantRaw ?? []) nomeCantiereMap.set(c.id, c.nome);
  }
  const nomeCommessaMap = new Map<string, string>();
  if (commessaIdsMese.size > 0) {
    const { data: commRaw } = (await supabase
      .from('commesse' as never)
      .select('id, nome_cartella, descrizione_ai_finale')
      .eq('tenant_id', ctx.tenantId)
      .in('id', [...commessaIdsMese])) as {
      data: { id: string; nome_cartella: string | null; descrizione_ai_finale: string | null }[] | null;
    };
    for (const c of commRaw ?? []) {
      nomeCommessaMap.set(c.id, c.descrizione_ai_finale?.trim() || c.nome_cartella || 'Commessa');
    }
  }

  // Aggrega per giorno: ore lavoro (ord+straord), ore viaggio, voci per target.
  type VoceGiorno = { nome: string; oreLavoro: number; oreViaggio: number };
  const calMap = new Map<
    string,
    { oreLavoro: number; oreViaggio: number; stato: string; voci: Map<string, VoceGiorno> }
  >();
  // Inizializza i giorni che hanno un rapportino nel mese (anche a 0 ore).
  for (const { data, stato } of rapMeseById.values()) {
    if (!calMap.has(data)) {
      calMap.set(data, { oreLavoro: 0, oreViaggio: 0, stato, voci: new Map() });
    }
  }
  for (const riga of righeRap) {
    const rap = rapMeseById.get(riga.rapportino_id);
    if (!rap) continue;
    const giorno = rap.data;
    const entry = calMap.get(giorno)!;
    const lavoro = Number(riga.ore_ordinarie ?? 0) + Number(riga.ore_straordinarie ?? 0);
    const viaggio = Number(riga.ore_viaggio ?? 0);
    entry.oreLavoro += lavoro;
    entry.oreViaggio += viaggio;
    const nomeVoce = riga.cantiere_id
      ? nomeCantiereMap.get(riga.cantiere_id) ?? 'Cantiere'
      : riga.commessa_id
        ? nomeCommessaMap.get(riga.commessa_id) ?? 'Commessa'
        : 'Senza riferimento';
    const voce = entry.voci.get(nomeVoce) ?? { nome: nomeVoce, oreLavoro: 0, oreViaggio: 0 };
    voce.oreLavoro += lavoro;
    voce.oreViaggio += viaggio;
    entry.voci.set(nomeVoce, voce);
  }

  const giorniCalendario = [...calMap.entries()].map(([data, e]) => ({
    data,
    oreLavoro: e.oreLavoro,
    oreViaggio: e.oreViaggio,
    // Il modello: solo 'approvato' è "pulito"; tutto il resto è "da verificare".
    stato: (e.stato === 'approvato' ? 'approvato' : 'bozza') as 'approvato' | 'bozza',
    voci: [...e.voci.values()].sort((a, b) => b.oreLavoro - a.oreLavoro),
  }));

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
        kmGuidati={kmGuidati}
        kmPasseggero={kmPasseggero}
        minutiGuida={minutiGuida}
        calendario={{ mese: meseSel, giorni: giorniCalendario }}
      />
    </div>
  );
}
