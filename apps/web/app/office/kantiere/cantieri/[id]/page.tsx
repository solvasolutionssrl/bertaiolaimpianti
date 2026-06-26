import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { qrUrl } from '@kommessa/api/kantiere-qr';
import { giornateIncomplete, aggregaOre, type TimbraturaGiorno, type RigaAgg } from '@kommessa/api/kantiere-report';
import { statoTurno } from '@kommessa/api/kantiere-ore';
import { romeDay, romeDayBoundsUtc } from '@kommessa/api/rome-time';
import { appOrigin } from '@/app/_lib/app-origin';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';
import { CantiereDetailClient } from './_components/cantiere-detail-client';
import { CantiereSediPanel } from '@/app/office/kantiere/sedi/_components/cantiere-sedi-panel';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
  searchParams: { giorni?: string };
}

/** Converte un timestamp ISO in data YYYY-MM-DD nel fuso Europe/Rome */
function tsToGiornoRome(ts: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(ts));
}

/** Periodi consentiti per lo storico presenze (giorni indietro da oggi). */
const PERIODI_GIORNI = [7, 14, 30, 60, 90] as const;

export default async function CantiereDetailPage({ params, searchParams }: PageProps) {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  // Periodo storico (default 30 giorni). Validato contro la whitelist.
  const giorniReq = Number(searchParams?.giorni);
  const giorni = PERIODI_GIORNI.includes(giorniReq as (typeof PERIODI_GIORNI)[number]) ? giorniReq : 30;

  // 1. Carica cantiere
  const { data: cantiereRaw } = await supabase
    .from('cantieri' as never)
    .select(
      'id, codice, nome, indirizzo, indirizzo_lat, indirizzo_lng, sede_partenza, sede_partenza_lat, sede_partenza_lng, commessa_id, stato, note',
    )
    .eq('id', params.id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (!cantiereRaw) notFound();

  const cantiere = cantiereRaw as {
    id: string;
    codice: string;
    nome: string;
    indirizzo: string | null;
    indirizzo_lat: number | null;
    indirizzo_lng: number | null;
    sede_partenza: string | null;
    sede_partenza_lat: number | null;
    sede_partenza_lng: number | null;
    commessa_id: string | null;
    stato: 'attivo' | 'sospeso' | 'chiuso';
    note: string | null;
  };

  // 2. Carica squadra
  const { data: squadraRaw } = await supabase
    .from('cantiere_squadra' as never)
    .select('dipendente_id, ruolo')
    .eq('cantiere_id', params.id)
    .eq('tenant_id', ctx.tenantId);

  const squadraRows = (squadraRaw ?? []) as { dipendente_id: string; ruolo: string }[];
  const squadraIds = squadraRows.map((r) => r.dipendente_id);

  // 3. Carica nomi dipendenti della squadra
  const squadraConNomi: { dipendente_id: string; nome: string; ruolo: string }[] = [];
  if (squadraIds.length > 0) {
    const { data: dipRaw } = await supabase
      .from('dipendenti' as never)
      .select('id, nome, cognome')
      .in('id', squadraIds);
    const dipMap = new Map<string, string>();
    for (const d of (dipRaw ?? []) as { id: string; nome: string; cognome: string }[]) {
      dipMap.set(d.id, `${d.cognome} ${d.nome}`);
    }
    for (const r of squadraRows) {
      squadraConNomi.push({
        dipendente_id: r.dipendente_id,
        nome: dipMap.get(r.dipendente_id) ?? r.dipendente_id,
        ruolo: r.ruolo,
      });
    }
  }

  // 4. Carica tutti i dipendenti attivi del tenant (per il picker)
  const { data: tuttiDipRaw } = await supabase
    .from('dipendenti' as never)
    .select('id, nome, cognome')
    .eq('tenant_id', ctx.tenantId)
    .eq('stato_attivo', true)
    .order('cognome');

  const dipendentiAttivi = ((tuttiDipRaw ?? []) as { id: string; nome: string; cognome: string }[]).map(
    (d) => ({ id: d.id, nome: `${d.cognome} ${d.nome}` }),
  );

  // 5. QR attivo per questo cantiere
  const { data: qrRaw } = await supabase
    .from('cantiere_qr' as never)
    .select('token, created_at')
    .eq('cantiere_id', params.id)
    .eq('tenant_id', ctx.tenantId)
    .eq('attivo', true)
    .maybeSingle();

  const qrRow = qrRaw as { token: string; created_at: string } | null;

  // 5a. Genera QR data URL (server-side) se esiste un QR attivo
  let qrDataUrl: string | null = null;
  if (qrRow) {
    const url = qrUrl(appOrigin(), qrRow.token);
    qrDataUrl = await QRCode.toDataURL(url, { width: 600, margin: 1 });
  }

  // 6. Conteggio timbrature
  const { count: scansioni } = await supabase
    .from('timbrature' as never)
    .select('*', { count: 'exact', head: true })
    .eq('cantiere_id', params.id)
    .eq('tenant_id', ctx.tenantId);

  // 7. Commesse disponibili per il link
  const { data: commesseRaw } = await supabase
    .from('commesse')
    .select(
      'id, codice_interno, nome_cartella, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali',
    )
    .eq('tenant_id', ctx.tenantId)
    .order('codice_interno');

  const commesse = ((commesseRaw ?? []) as {
    id: string;
    codice_interno: string | null;
    nome_cartella: string | null;
    descrizione_ai_finale: string | null;
    descrizione_ai_proposta: string | null;
    note_iniziali: string | null;
  }[]).map((c) => ({
    id: c.id,
    titolo:
      risolviTitoloCommessa({
        descrizione_ai_finale: c.descrizione_ai_finale,
        descrizione_ai_proposta: c.descrizione_ai_proposta,
        note_iniziali: c.note_iniziali,
        nome_cartella: c.nome_cartella,
        codice_interno: c.codice_interno,
      }) || c.codice_interno || c.id,
  }));

  // 8. Titolo commessa collegata (se presente)
  let commessaCollegata: string | null = null;
  if (cantiere.commessa_id) {
    const found = commesse.find((c) => c.id === cantiere.commessa_id);
    commessaCollegata = found?.titolo ?? null;
  }

  // ── 9. STORICO PRESENZE: rapportino_righe del cantiere nel periodo ──────────
  // rapportino_righe NON ha tenant_id: è scoped via cantiere_id (già del tenant)
  // + RLS. Si filtra per data del rapportino unendo manualmente i rapportini.
  type RigaRapRow = {
    rapportino_id: string;
    ore_ordinarie: number;
    ore_straordinarie: number;
    ore_viaggio: number;
  };
  type RapportinoRow = {
    id: string;
    dipendente_id: string;
    data: string; // YYYY-MM-DD
    stato: string;
  };

  const { data: righeRapRaw } = (await supabase
    .from('rapportino_righe' as never)
    .select('rapportino_id, ore_ordinarie, ore_straordinarie, ore_viaggio')
    .eq('cantiere_id', params.id)
    .limit(5000)) as { data: RigaRapRow[] | null };

  const righeRapAll = righeRapRaw ?? [];
  const rapportinoIds = [...new Set(righeRapAll.map((r) => r.rapportino_id))];

  // Limite inferiore del periodo come data calendario Rome (YYYY-MM-DD).
  const oggiRome = romeDay(new Date());
  const dataDa = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(
    new Date(Date.now() - (giorni - 1) * 24 * 60 * 60 * 1000),
  );

  let rapportiniRows: RapportinoRow[] = [];
  if (rapportinoIds.length > 0) {
    const { data: rapRaw } = (await supabase
      .from('rapportini' as never)
      .select('id, dipendente_id, data, stato')
      .in('id', rapportinoIds)
      .gte('data', dataDa)
      .order('data', { ascending: false })) as { data: RapportinoRow[] | null };
    rapportiniRows = rapRaw ?? [];
  }

  // Mappa rapportino -> meta (dipendente + data), solo quelli nel periodo.
  const rapMetaById = new Map<string, RapportinoRow>();
  for (const r of rapportiniRows) rapMetaById.set(r.id, r);

  // Righe del periodo (filtrate ai rapportini caricati = già dentro il range).
  const righeRapPeriodo = righeRapAll.filter((r) => rapMetaById.has(r.rapportino_id));

  // Risolvi nomi dipendenti per i rapportini del periodo.
  const rapDipIds = [...new Set(rapportiniRows.map((r) => r.dipendente_id))];
  const rapDipMap = new Map<string, string>();
  if (rapDipIds.length > 0) {
    const { data: rapDipRaw } = (await supabase
      .from('dipendenti' as never)
      .select('id, nome, cognome')
      .in('id', rapDipIds)) as { data: { id: string; nome: string; cognome: string }[] | null };
    for (const d of rapDipRaw ?? []) {
      rapDipMap.set(d.id, `${d.cognome} ${d.nome}`);
    }
  }

  // Aggregazione per dipendente via aggregaOre (chiave = dipendente_id).
  const righeAgg: RigaAgg[] = righeRapPeriodo.map((r) => {
    const meta = rapMetaById.get(r.rapportino_id)!;
    return {
      chiaveDipendente: meta.dipendente_id,
      chiaveCommessa: `k:${params.id}`,
      ore_ordinarie: Number(r.ore_ordinarie) || 0,
      ore_straordinarie: Number(r.ore_straordinarie) || 0,
      ore_viaggio: Number(r.ore_viaggio) || 0,
    };
  });

  const perDipendente = aggregaOre(righeAgg, 'dipendente');
  const storicoPerPersona = [...perDipendente.entries()]
    .map(([dipendenteId, agg]) => ({
      dipendenteId,
      nome: rapDipMap.get(dipendenteId) ?? dipendenteId,
      ordinarie: agg.ordinarie,
      straordinarie: agg.straordinarie,
      viaggio: agg.viaggio,
      totale: agg.totale,
    }))
    .sort((a, b) => b.totale - a.totale);

  // Totali periodo (per KPI + donut ripartizione).
  const storicoTotali = storicoPerPersona.reduce(
    (acc, p) => ({
      ordinarie: Math.round((acc.ordinarie + p.ordinarie) * 100) / 100,
      straordinarie: Math.round((acc.straordinarie + p.straordinarie) * 100) / 100,
      viaggio: Math.round((acc.viaggio + p.viaggio) * 100) / 100,
      totale: Math.round((acc.totale + p.totale) * 100) / 100,
    }),
    { ordinarie: 0, straordinarie: 0, viaggio: 0, totale: 0 },
  );

  // Trend giornaliero: somma ore (ord+straord+viaggio) per giorno del periodo.
  const orePerGiorno = new Map<string, number>();
  for (const r of righeRapPeriodo) {
    const meta = rapMetaById.get(r.rapportino_id)!;
    const tot = (Number(r.ore_ordinarie) || 0) + (Number(r.ore_straordinarie) || 0) + (Number(r.ore_viaggio) || 0);
    orePerGiorno.set(meta.data, Math.round(((orePerGiorno.get(meta.data) ?? 0) + tot) * 100) / 100);
  }
  const trendGiornaliero = [...orePerGiorno.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([giorno, valore]) => ({ giorno, valore, oggi: giorno === oggiRome }));

  // ── 10. CHI C'È IN CANTIERE ORA: timbrature di oggi (Rome), paired ──────────
  const { fromIso, toIso } = romeDayBoundsUtc(oggiRome);
  const { data: timbOggiRaw } = (await supabase
    .from('timbrature' as never)
    .select('dipendente_id, tipo, ts, pausa')
    .eq('cantiere_id', params.id)
    .eq('tenant_id', ctx.tenantId)
    .gte('ts', fromIso)
    .lt('ts', toIso)
    .order('ts', { ascending: true })) as {
    data: { dipendente_id: string; tipo: 'ingresso' | 'uscita'; ts: string; pausa: boolean | null }[] | null;
  };

  const timbOggi = timbOggiRaw ?? [];
  const eventiPerDip = new Map<string, { tipo: 'ingresso' | 'uscita'; ts: string; pausa: boolean | null }[]>();
  for (const t of timbOggi) {
    const arr = eventiPerDip.get(t.dipendente_id) ?? [];
    arr.push({ tipo: t.tipo, ts: t.ts, pausa: t.pausa });
    eventiPerDip.set(t.dipendente_id, arr);
  }

  // Nomi dipendenti presenti oggi (riusa la squadra map dove possibile).
  const presentiDipIds = [...eventiPerDip.keys()];
  const presentiDipMap = new Map<string, string>();
  const mancantiPresenti = presentiDipIds.filter((id) => !rapDipMap.has(id));
  if (mancantiPresenti.length > 0) {
    const { data: presDipRaw } = (await supabase
      .from('dipendenti' as never)
      .select('id, nome, cognome')
      .in('id', mancantiPresenti)) as { data: { id: string; nome: string; cognome: string }[] | null };
    for (const d of presDipRaw ?? []) presentiDipMap.set(d.id, `${d.cognome} ${d.nome}`);
  }
  function nomePresente(id: string): string {
    return rapDipMap.get(id) ?? presentiDipMap.get(id) ?? id;
  }

  const chiInCantiere = presentiDipIds
    .map((dipId) => {
      const info = statoTurno(eventiPerDip.get(dipId)!);
      if (info.stato === 'idle') return null;
      return {
        dipendenteId: dipId,
        nome: nomePresente(dipId),
        stato: info.stato as 'lavoro' | 'pausa',
        da: info.ingressoAperto ?? info.inizioPausa,
      };
    })
    .filter((x): x is { dipendenteId: string; nome: string; stato: 'lavoro' | 'pausa'; da: string | null } => x !== null)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));

  // ── 11. ANOMALIE (giornate incomplete sul periodo) ──────────────────────────
  const fromTs = new Date(Date.now() - giorni * 24 * 60 * 60 * 1000).toISOString();
  const { data: timbRaw } = (await supabase
    .from('timbrature' as never)
    .select('dipendente_id, tipo, ts')
    .eq('cantiere_id', params.id)
    .eq('tenant_id', ctx.tenantId)
    .gte('ts', fromTs)
    .limit(5000)) as {
    data: { dipendente_id: string; tipo: string; ts: string }[] | null;
  };

  const timbRows = timbRaw ?? [];
  const timbraturePerFn: TimbraturaGiorno[] = timbRows
    .filter((t) => t.tipo === 'ingresso' || t.tipo === 'uscita')
    .map((t) => ({
      dipendente_id: t.dipendente_id,
      commessa_id: `k:${params.id}`,
      giorno: tsToGiornoRome(t.ts),
      tipo: t.tipo as 'ingresso' | 'uscita',
    }));

  const incompleteRaw = giornateIncomplete(timbraturePerFn);

  // Risolvi nomi dipendenti per le anomalie (riusa rapDipMap/presentiDipMap).
  const anomaliaDipIds = [...new Set(incompleteRaw.map((r) => r.dipendente_id))];
  const anomaliaDipMap = new Map<string, string>();
  const mancantiAnomalie = anomaliaDipIds.filter((id) => !rapDipMap.has(id) && !presentiDipMap.has(id));
  if (mancantiAnomalie.length > 0) {
    const { data: anDipRaw } = (await supabase
      .from('dipendenti' as never)
      .select('id, nome, cognome')
      .in('id', mancantiAnomalie)) as { data: { id: string; nome: string; cognome: string }[] | null };
    for (const d of anDipRaw ?? []) anomaliaDipMap.set(d.id, `${d.cognome} ${d.nome}`);
  }

  const anomalie = incompleteRaw.map((r) => ({
    dipendente_id: r.dipendente_id,
    dipendenteNome: rapDipMap.get(r.dipendente_id) ?? presentiDipMap.get(r.dipendente_id) ?? anomaliaDipMap.get(r.dipendente_id) ?? r.dipendente_id,
    giorno: r.giorno,
  }));

  // Sedi del tenant + sedi già associate a questo cantiere (per il pannello).
  const [sediTenantRes, sediAssocRes] = await Promise.all([
    supabase
      .from('sedi' as never)
      .select('id, nome, tipo')
      .eq('tenant_id', ctx.tenantId)
      .eq('attivo', true)
      .order('nome'),
    supabase
      .from('cantiere_sede' as never)
      .select('sede_id')
      .eq('cantiere_id', params.id)
      .eq('tenant_id', ctx.tenantId),
  ]);
  const sediTenant = ((sediTenantRes.data as {
    id: string;
    nome: string;
    tipo: 'sede_principale' | 'sede_secondaria' | 'hotel' | 'altro';
  }[] | null) ?? []);
  const sediAssociate = ((sediAssocRes.data as { sede_id: string }[] | null) ?? []).map(
    (r) => r.sede_id,
  );

  return (
    <div className="w-full space-y-6">
      <CantiereDetailClient
        cantiere={{
          id: cantiere.id,
          codice: cantiere.codice,
          nome: cantiere.nome,
          indirizzo: cantiere.indirizzo,
          indirizzoLat: cantiere.indirizzo_lat,
          indirizzoLng: cantiere.indirizzo_lng,
          sedePartenza: cantiere.sede_partenza,
          sedePartenzaLat: cantiere.sede_partenza_lat,
          sedePartenzaLng: cantiere.sede_partenza_lng,
          commessaId: cantiere.commessa_id,
          stato: cantiere.stato,
          note: cantiere.note,
        }}
        squadra={squadraConNomi}
        dipendentiAttivi={dipendentiAttivi}
        qr={
          qrRow
            ? {
                token: qrRow.token,
                createdAt: qrRow.created_at,
                scansioni: scansioni ?? 0,
                dataUrl: qrDataUrl,
              }
            : null
        }
        printHref={`/office/kantiere/cantieri/${params.id}/stampa`}
        commesse={commesse}
        commessaCollegata={commessaCollegata}
        anomalie={anomalie}
        chiInCantiere={chiInCantiere}
        storico={{
          giorni,
          perPersona: storicoPerPersona,
          totali: storicoTotali,
          trend: trendGiornaliero,
        }}
      />

      <CantiereSediPanel
        cantiereId={cantiere.id}
        sediTenant={sediTenant}
        sediAssociate={sediAssociate}
      />
    </div>
  );
}
