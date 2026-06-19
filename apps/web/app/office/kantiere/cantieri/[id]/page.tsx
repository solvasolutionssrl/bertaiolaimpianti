import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { qrUrl } from '@kommessa/api/kantiere-qr';
import { giornateIncomplete, type TimbraturaGiorno } from '@kommessa/api/kantiere-report';
import { appOrigin } from '@/app/_lib/app-origin';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';
import { CantiereDetailClient } from './_components/cantiere-detail-client';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

/** Converte un timestamp ISO in data YYYY-MM-DD nel fuso Europe/Rome */
function tsToGiornoRome(ts: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(ts));
}

export default async function CantiereDetailPage({ params }: PageProps) {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  // 1. Carica cantiere
  const { data: cantiereRaw } = await supabase
    .from('cantieri' as never)
    .select('id, codice, nome, indirizzo, sede_partenza, commessa_id, stato, note')
    .eq('id', params.id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (!cantiereRaw) notFound();

  const cantiere = cantiereRaw as {
    id: string;
    codice: string;
    nome: string;
    indirizzo: string | null;
    sede_partenza: string | null;
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

  // 9. Rapportini del cantiere (righe che referenziano questo cantiere)
  type RigaRapRow = {
    rapportino_id: string;
    ore_ordinarie: number;
    ore_straordinarie: number;
    ore_viaggio: number;
  };
  type RapportinoRow = {
    id: string;
    dipendente_id: string;
    data: string;
    stato: string;
  };

  const { data: righeRapRaw } = (await supabase
    .from('rapportino_righe' as never)
    .select('rapportino_id, ore_ordinarie, ore_straordinarie, ore_viaggio')
    .eq('cantiere_id', params.id)
    .eq('tenant_id', ctx.tenantId)
    .limit(30)) as { data: RigaRapRow[] | null };

  const righeRap = righeRapRaw ?? [];
  const rapportinoIds = [...new Set(righeRap.map((r) => r.rapportino_id))];

  let rapportiniRows: RapportinoRow[] = [];
  if (rapportinoIds.length > 0) {
    const { data: rapRaw } = (await supabase
      .from('rapportini' as never)
      .select('id, dipendente_id, data, stato')
      .in('id', rapportinoIds)
      .order('data', { ascending: false })) as { data: RapportinoRow[] | null };
    rapportiniRows = rapRaw ?? [];
  }

  // Risolvi nomi dipendenti per i rapportini
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

  // Mappa rapportino_id -> righe ore
  const righeByRapportino = new Map<string, RigaRapRow>();
  for (const r of righeRap) {
    righeByRapportino.set(r.rapportino_id, r);
  }

  const rapportiniCantiere = rapportiniRows.map((r) => {
    const riga = righeByRapportino.get(r.id);
    return {
      rapportinoId: r.id,
      dipendenteNome: rapDipMap.get(r.dipendente_id) ?? r.dipendente_id,
      data: r.data,
      stato: r.stato,
      ore_ordinarie: riga?.ore_ordinarie ?? 0,
      ore_straordinarie: riga?.ore_straordinarie ?? 0,
      ore_viaggio: riga?.ore_viaggio ?? 0,
    };
  });

  // 10. Anomalie (timbrature incomplete ultime 30gg su questo cantiere)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fromTs = thirtyDaysAgo.toISOString();

  const { data: timbRaw } = (await supabase
    .from('timbrature' as never)
    .select('dipendente_id, tipo, ts')
    .eq('cantiere_id', params.id)
    .eq('tenant_id', ctx.tenantId)
    .gte('ts', fromTs)
    .limit(2000)) as {
    data: { dipendente_id: string; tipo: string; ts: string }[] | null;
  };

  const timbRows = timbRaw ?? [];

  const timbraturePerFn: TimbraturaGiorno[] = timbRows
    .filter((t) => t.tipo === 'ingresso' || t.tipo === 'uscita')
    .map((t) => ({
      dipendente_id: t.dipendente_id,
      commessa_id: `k:${params.id}`, // chiave sintetica uniforme per giornateIncomplete
      giorno: tsToGiornoRome(t.ts),
      tipo: t.tipo as 'ingresso' | 'uscita',
    }));

  const incompleteRaw = giornateIncomplete(timbraturePerFn);

  // Risolvi nomi dipendenti per le anomalie
  const anomaliaDipIds = [...new Set(incompleteRaw.map((r) => r.dipendente_id))];
  const anomaliaDipMap = new Map<string, string>();
  if (anomaliaDipIds.length > 0) {
    const existing = rapDipMap; // riusa se sovrapposto
    const mancanti = anomaliaDipIds.filter((id) => !existing.has(id));
    if (mancanti.length > 0) {
      const { data: anDipRaw } = (await supabase
        .from('dipendenti' as never)
        .select('id, nome, cognome')
        .in('id', mancanti)) as { data: { id: string; nome: string; cognome: string }[] | null };
      for (const d of anDipRaw ?? []) {
        existing.set(d.id, `${d.cognome} ${d.nome}`);
      }
    }
    for (const id of anomaliaDipIds) {
      anomaliaDipMap.set(id, existing.get(id) ?? id);
    }
  }

  const anomalie = incompleteRaw.map((r) => ({
    dipendente_id: r.dipendente_id,
    dipendenteNome: anomaliaDipMap.get(r.dipendente_id) ?? r.dipendente_id,
    giorno: r.giorno,
  }));

  return (
    <div className="w-full space-y-6">
      <CantiereDetailClient
        cantiere={{
          id: cantiere.id,
          codice: cantiere.codice,
          nome: cantiere.nome,
          indirizzo: cantiere.indirizzo,
          sedePartenza: cantiere.sede_partenza,
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
        rapportiniCantiere={rapportiniCantiere}
        anomalie={anomalie}
      />
    </div>
  );
}
