import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';
import { RapportiniClient, type RapportiniRiga, type DipendenteItem, type CommessaPickerItem, type CantierePickerItem } from './_components/rapportini-client';
import { giornateAperte } from '@/app/office/_actions/kantiere-rapportini';

export const dynamic = 'force-dynamic';

type RapportinoRow = {
  id: string;
  dipendente_id: string;
  data: string;
  stato: string;
  inviato_at: string | null;
  note: string | null;
};

type RigaRow = {
  id: string;
  rapportino_id: string;
  commessa_id: string | null;
  cantiere_id: string | null;
  ore_ordinarie: number;
  ore_straordinarie: number;
  ore_viaggio: number;
  note: string | null;
};

type TimbratureRow = {
  id: string;
  dipendente_id: string;
  commessa_id: string | null;
  cantiere_id: string | null;
  tipo: string;
  ts: string;
  origine: string | null;
  pausa: boolean | null;
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

/** Etichetta display: titolo commessa o nome cantiere */
function targetLabel(
  row: { commessa_id: string | null; cantiere_id: string | null },
  commesseTitoloMap: Map<string, string>,
  cantieriNomeMap: Map<string, string>,
): string {
  if (row.commessa_id) return commesseTitoloMap.get(row.commessa_id) ?? row.commessa_id;
  if (row.cantiere_id) return cantieriNomeMap.get(row.cantiere_id) ?? row.cantiere_id;
  return '';
}

function toYYYYMMDD(d: Date): string {
  // Giorno calendario in Europe/Rome (il server gira UTC): en-CA → YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d);
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 13); // last 14 days inclusive
  return { from: toYYYYMMDD(from), to: toYYYYMMDD(to) };
}

/** Returns the Europe/Rome calendar date for a UTC ISO timestamp. */
function timbraturaGiorno(ts: string): string {
  try {
    return new Date(ts).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }); // sv-SE gives YYYY-MM-DD
  } catch {
    return ts.slice(0, 10);
  }
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
    .select('id, dipendente_id, data, stato, inviato_at, note')
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
      .select('id, rapportino_id, commessa_id, cantiere_id, ore_ordinarie, ore_straordinarie, ore_viaggio, note')
      .in('rapportino_id', rapportinoIds)) as { data: RigaRow[] | null };
    righeData = data ?? [];
  }

  const commessaIdsFromRighe = [...new Set(righeData.map((r) => r.commessa_id).filter((id): id is string => id != null))];
  const cantiereIdsFromRighe = [...new Set(righeData.map((r) => r.cantiere_id).filter((id): id is string => id != null))];

  // Batch-load dipendenti (per display)
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

  // Batch-load timbrature per il range e dipendenti mostrati
  // Bucket per chiave `dipendente_id:YYYY-MM-DD(Europe/Rome)`
  let timbratureData: TimbratureRow[] = [];
  const timbratureCommessaIds = new Set<string>();
  if (dipIds.length > 0 && rapportini.length > 0) {
    // Expand TS range: from giorno start, to giorno end (server gira UTC, ±2h sufficiente a coprire Rome)
    const tsFrom = from + 'T00:00:00.000Z';
    const tsTo = to + 'T23:59:59.999Z';
    const { data } = (await supabase
      .from('timbrature' as never)
      .select('id, dipendente_id, commessa_id, cantiere_id, tipo, ts, origine, pausa')
      .eq('tenant_id', ctx.tenantId)
      .in('dipendente_id', dipIds)
      .gte('ts', tsFrom)
      .lte('ts', tsTo)
      .order('ts', { ascending: true })) as { data: TimbratureRow[] | null };
    timbratureData = data ?? [];
    for (const t of timbratureData) {
      if (t.commessa_id) timbratureCommessaIds.add(t.commessa_id);
    }
  }

  // All commessa IDs (righe + timbrature), nulls already filtered from righe; filter timbrature set too
  const allCommessaIds = [...new Set([...commessaIdsFromRighe, ...timbratureCommessaIds])].filter((id): id is string => id != null);

  // All cantiere IDs (righe + timbrature)
  const cantiereIdsFromTimbrature = [...new Set([...timbratureData].map((t) => t.cantiere_id).filter((id): id is string => id != null))];
  const allCantiereIds = [...new Set([...cantiereIdsFromRighe, ...cantiereIdsFromTimbrature])];

  // Batch-load commesse (per titolo)
  const commesseTitoloMap = new Map<string, string>();
  if (allCommessaIds.length > 0) {
    const { data } = (await supabase
      .from('commesse' as never)
      .select('id, codice_interno, nome_cartella, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali')
      .in('id', allCommessaIds)) as { data: CommessaRow[] | null };
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

  // Batch-load cantieri (per nome)
  const cantieriNomeMap = new Map<string, string>();
  if (allCantiereIds.length > 0) {
    const { data } = (await supabase
      .from('cantieri' as never)
      .select('id, nome, codice')
      .in('id', allCantiereIds)) as { data: CantiereRow[] | null };
    for (const k of data ?? []) {
      cantieriNomeMap.set(k.id, k.nome || k.codice || k.id);
    }
  }

  // Bucket timbrature per `dipendente_id:YYYY-MM-DD`
  type TimbraturaItem = {
    tipo: string;
    ts: string;
    origine: string | null;
    commessaTitolo: string | null;
    pausa: boolean | null;
  };
  const timbratureByKey = new Map<string, TimbraturaItem[]>();
  for (const t of timbratureData) {
    const giorno = timbraturaGiorno(t.ts);
    const key = `${t.dipendente_id}:${giorno}`;
    const arr = timbratureByKey.get(key) ?? [];
    const label = targetLabel(t, commesseTitoloMap, cantieriNomeMap);
    arr.push({
      tipo: t.tipo,
      ts: t.ts,
      origine: t.origine ?? null,
      commessaTitolo: label || null,
      pausa: t.pausa ?? false,
    });
    timbratureByKey.set(key, arr);
  }

  // Mappa rapportino_id -> righe
  const righeByRapportino = new Map<string, RigaRow[]>();
  for (const r of righeData) {
    const arr = righeByRapportino.get(r.rapportino_id) ?? [];
    arr.push(r);
    righeByRapportino.set(r.rapportino_id, arr);
  }

  // Rapportini modificati dal tecnico dopo l'invio → badge "Modificato"
  const rappIds = rapportini.map((r) => r.id);
  const modificatiSet = new Set<string>();
  if (rappIds.length > 0) {
    const { data: vModRaw } = await supabase
      .from('rapportino_versioni' as never)
      .select('rapportino_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('azione', 'modifica_tecnico')
      .in('rapportino_id', rappIds);
    for (const v of (vModRaw as { rapportino_id: string }[] | null) ?? []) {
      modificatiSet.add(v.rapportino_id);
    }
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
    const timbratureKey = `${r.dipendente_id}:${r.data}`;
    const timbrature = timbratureByKey.get(timbratureKey) ?? [];
    return {
      id: r.id,
      dipendenteNome: dipendentiMap.get(r.dipendente_id) ?? r.dipendente_id,
      data: r.data,
      stato: r.stato,
      modificato: modificatiSet.has(r.id),
      inviatoAt: r.inviato_at,
      note: r.note ?? null,
      totale,
      nRighe: rr.length,
      righe: rr.map((x) => ({
        commessaTitolo: targetLabel(x, commesseTitoloMap, cantieriNomeMap),
        ore_ordinarie: x.ore_ordinarie ?? 0,
        ore_straordinarie: x.ore_straordinarie ?? 0,
        ore_viaggio: x.ore_viaggio ?? 0,
        note: x.note ?? null,
      })),
      timbrature,
    };
  });

  // Carica tutti i dipendenti attivi per il filtro e per il dialog "Registra ore"
  const { data: tuttiDipendenti } = (await supabase
    .from('dipendenti' as never)
    .select('id, nome, cognome')
    .eq('tenant_id', ctx.tenantId)
    .eq('stato_attivo', true)
    .order('cognome')) as { data: DipendenteRow[] | null };

  const dipendentiFilter: DipendenteItem[] = (tuttiDipendenti ?? []).map((d) => ({
    id: d.id,
    nome: `${d.nome} ${d.cognome}`.trim(),
  }));

  // Carica commesse attive (non archiviate) per il dialog "Registra ore"
  const { data: commesseRaw } = (await supabase
    .from('commesse' as never)
    .select('id, codice_interno, nome_cartella, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali')
    .eq('tenant_id', ctx.tenantId)
    .not('stato', 'eq', 'archiviata')
    .order('codice_interno', { ascending: false })
    .limit(300)) as { data: CommessaRow[] | null };

  const commessePicker: CommessaPickerItem[] = (commesseRaw ?? []).map((c) => ({
    id: c.id,
    titolo:
      risolviTitoloCommessa({
        descrizione_ai_finale: c.descrizione_ai_finale,
        descrizione_ai_proposta: c.descrizione_ai_proposta,
        note_iniziali: c.note_iniziali,
        nome_cartella: c.nome_cartella,
        codice_interno: c.codice_interno,
      }) ||
      c.codice_interno ||
      c.id,
  }));

  // Carica cantieri attivi per il dialog "Registra ore"
  const { data: cantieriRaw } = (await supabase
    .from('cantieri' as never)
    .select('id, nome, codice')
    .eq('tenant_id', ctx.tenantId)
    .order('nome')) as { data: CantiereRow[] | null };

  const cantieriPicker: CantierePickerItem[] = (cantieriRaw ?? []).map((k) => ({
    id: k.id,
    nome: k.nome || k.codice || k.id,
  }));

  // Giornate passate rimaste aperte (uscita mancante) → promemoria ufficio.
  const giorniApertiRes = await giornateAperte({});
  const giorniAperti = giorniApertiRes.ok ? giorniApertiRes.giorni : [];

  return (
    <div className="w-full space-y-5">
      <header>
        <h1 className="text-lg font-semibold">Presenze e timbrature</h1>
        <p className="text-sm text-muted-foreground">
          Timbrature di ingresso/uscita, ore calcolate e rapportino giornaliero (auto-compilato
          dalle timbrature) di ogni dipendente. Coda approvazioni inclusa.
        </p>
      </header>
      <RapportiniClient
        righe={righe}
        filtri={{ from, to, stato: statoFilter, dipendente: dipendenteFilter }}
        dipendenti={dipendentiFilter}
        commesse={commessePicker}
        cantieri={cantieriPicker}
        giorniAperti={giorniAperti}
      />
    </div>
  );
}
