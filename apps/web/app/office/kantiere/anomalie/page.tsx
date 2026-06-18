import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { giornateIncomplete, type TimbraturaGiorno } from '@kommessa/api/kantiere-report';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';
import { AnomalieClient } from './_components/anomalie-client';

export const dynamic = 'force-dynamic';

// ---- local types -------------------------------------------------------

type TimbraturaRow = {
  dipendente_id: string;
  commessa_id: string;
  tipo: string;
  ts: string;
};

type RapportinoRow = {
  id: string;
  dipendente_id: string;
  data: string;
  stato: string;
  inviato_at: string | null;
  updated_at: string | null;
};

type RigaStraordRow = {
  rapportino_id: string;
  commessa_id: string;
  ore_straordinarie: number;
};

type DipendenteRow = {
  id: string;
  nome: string;
  cognome: string;
  stato_attivo: boolean;
};

type CommessaRow = {
  id: string;
  codice_interno: string | null;
  nome_cartella: string | null;
  descrizione_ai_finale: string | null;
  descrizione_ai_proposta: string | null;
  note_iniziali: string | null;
};

// ---- exported prop types -----------------------------------------------

export type IncompleteRow = {
  dipendente_id: string;
  dipendenteNome: string;
  commessa_id: string;
  commessaTitolo: string;
  giorno: string;
};

export type StraordinarioRow = {
  dipendenteNome: string;
  data: string;
  commessaTitolo: string;
  ore_straordinarie: number;
};

export type SenzaRapportinoRow = {
  nome: string;
};

export type ModificatoDopoInvioRow = {
  dipendenteNome: string;
  data: string;
  stato: string;
};

// ---- helpers -----------------------------------------------------------

function toYYYYMMDD(d: Date): string {
  // Giorno calendario in Europe/Rome (il server gira UTC): en-CA → YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d);
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 13 * 24 * 60 * 60 * 1000); // ultimi 14 giorni
  return { from: toYYYYMMDD(from), to: toYYYYMMDD(to) };
}

/** Converte un timestamp ISO in data YYYY-MM-DD nel fuso Europe/Rome */
function tsToGiornoRome(ts: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(ts));
}

// ---- page --------------------------------------------------------------

interface PageProps {
  searchParams: { from?: string; to?: string };
}

export default async function AnomaliePageWrapper({ searchParams }: PageProps) {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  const def = defaultRange();
  const from = searchParams.from ?? def.from;
  const to = searchParams.to ?? def.to;

  // Calcola la soglia ts per le timbrature: from 00:00 Rome / to 23:59:59 Rome
  // Usiamo semplicemente >=from e <=to sui giorni (la colonna ts è timestamptz)
  // Per semplicità confrontiamo la data Rome estratta in JS dopo aver caricato tutto il range UTC.
  // Usiamo: ts >= from (mezzanotte UTC del giorno from) e ts < day_after_to (00:00 UTC di to+1).
  const dayAfterTo = toYYYYMMDD(new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000));

  // ----------------------------------------------------------------
  // A) Timbrature incomplete
  // ----------------------------------------------------------------
  const { data: timbRaw } = (await supabase
    .from('timbrature' as never)
    .select('dipendente_id, commessa_id, tipo, ts')
    .eq('tenant_id', ctx.tenantId)
    .gte('ts', `${from}T00:00:00.000Z`)
    .lt('ts', `${dayAfterTo}T00:00:00.000Z`)
    .limit(5000)) as { data: TimbraturaRow[] | null };

  const timbraturaRows = timbRaw ?? [];

  const timbraturePerFn: TimbraturaGiorno[] = timbraturaRows
    .filter((t) => t.tipo === 'ingresso' || t.tipo === 'uscita')
    .map((t) => ({
      dipendente_id: t.dipendente_id,
      commessa_id: t.commessa_id,
      giorno: tsToGiornoRome(t.ts),
      tipo: t.tipo as 'ingresso' | 'uscita',
    }));

  const incompleteRaw = giornateIncomplete(timbraturePerFn);

  // ----------------------------------------------------------------
  // B) Straordinario
  // ----------------------------------------------------------------
  const { data: rapRaw } = (await supabase
    .from('rapportini' as never)
    .select('id, dipendente_id, data, stato, inviato_at, updated_at')
    .eq('tenant_id', ctx.tenantId)
    .gte('data', from)
    .lte('data', to)
    .limit(2000)) as { data: RapportinoRow[] | null };

  const rapportini = rapRaw ?? [];
  const rapportinoIds = rapportini.map((r) => r.id);
  const dipIdsInPeriod = [...new Set(rapportini.map((r) => r.dipendente_id))];

  let righeConStraord: RigaStraordRow[] = [];
  if (rapportinoIds.length > 0) {
    const { data } = (await supabase
      .from('rapportino_righe' as never)
      .select('rapportino_id, commessa_id, ore_straordinarie')
      .in('rapportino_id', rapportinoIds)
      .gt('ore_straordinarie', 0)) as { data: RigaStraordRow[] | null };
    righeConStraord = data ?? [];
  }

  const straordCommessaIds = [...new Set(righeConStraord.map((r) => r.commessa_id))];

  // ----------------------------------------------------------------
  // C) Dipendenti attivi del tenant
  // ----------------------------------------------------------------
  const { data: dipendentiRaw } = (await supabase
    .from('dipendenti' as never)
    .select('id, nome, cognome, stato_attivo')
    .eq('tenant_id', ctx.tenantId)
    .eq('stato_attivo', true)) as { data: DipendenteRow[] | null };

  const dipendentiAttivi = dipendentiRaw ?? [];

  // Tutti gli ids che compaiono nei rapportini del periodo
  const dipIdsSet = new Set(dipIdsInPeriod);

  // ----------------------------------------------------------------
  // Batch-load: nomi dipendenti (attivi + quelli in rapportini)
  // ----------------------------------------------------------------
  const allDipIds = [
    ...new Set([
      ...dipendentiAttivi.map((d) => d.id),
      ...timbraturaRows.map((t) => t.dipendente_id),
      ...dipIdsInPeriod,
    ]),
  ];

  const dipendentiMap = new Map<string, string>();
  if (allDipIds.length > 0) {
    const { data } = (await supabase
      .from('dipendenti' as never)
      .select('id, nome, cognome')
      .in('id', allDipIds)) as { data: DipendenteRow[] | null };
    for (const d of data ?? []) {
      dipendentiMap.set(d.id, `${d.nome} ${d.cognome}`.trim());
    }
  }

  // ----------------------------------------------------------------
  // Batch-load: titoli commesse
  // ----------------------------------------------------------------
  const timbCommessaIds = [...new Set(timbraturaRows.map((t) => t.commessa_id))];
  const allCommessaIds = [...new Set([...timbCommessaIds, ...straordCommessaIds])];

  const commesseTitoloMap = new Map<string, string>();
  if (allCommessaIds.length > 0) {
    const { data } = (await supabase
      .from('commesse' as never)
      .select(
        'id, codice_interno, nome_cartella, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali',
      )
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

  // ----------------------------------------------------------------
  // Risolvi A) incomplete
  // ----------------------------------------------------------------
  const incomplete: IncompleteRow[] = incompleteRaw.map((r) => ({
    dipendente_id: r.dipendente_id,
    dipendenteNome: dipendentiMap.get(r.dipendente_id) ?? r.dipendente_id,
    commessa_id: r.commessa_id,
    commessaTitolo: commesseTitoloMap.get(r.commessa_id) ?? r.commessa_id,
    giorno: r.giorno,
  }));

  // ----------------------------------------------------------------
  // Risolvi B) straordinario
  // ----------------------------------------------------------------
  const rapportinoMap = new Map<string, RapportinoRow>(rapportini.map((r) => [r.id, r]));

  const straordinario: StraordinarioRow[] = righeConStraord.map((riga) => {
    const rap = rapportinoMap.get(riga.rapportino_id);
    const dipId = rap?.dipendente_id ?? '';
    return {
      dipendenteNome: dipendentiMap.get(dipId) ?? dipId,
      data: rap?.data ?? '',
      commessaTitolo: commesseTitoloMap.get(riga.commessa_id) ?? riga.commessa_id,
      ore_straordinarie: riga.ore_straordinarie,
    };
  });

  // ----------------------------------------------------------------
  // Risolvi C) senza rapportino
  // ----------------------------------------------------------------
  const senzaRapportino: SenzaRapportinoRow[] = dipendentiAttivi
    .filter((d) => !dipIdsSet.has(d.id))
    .map((d) => ({ nome: `${d.nome} ${d.cognome}`.trim() }));

  // ----------------------------------------------------------------
  // Risolvi D) modificato dopo invio
  // ----------------------------------------------------------------
  const modificati: ModificatoDopoInvioRow[] = rapportini
    .filter(
      (r) =>
        r.inviato_at !== null &&
        r.updated_at !== null &&
        new Date(r.updated_at) > new Date(r.inviato_at),
    )
    .map((r) => ({
      dipendenteNome: dipendentiMap.get(r.dipendente_id) ?? r.dipendente_id,
      data: r.data,
      stato: r.stato,
    }));

  return (
    <div className="w-full space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Anomalie</h1>
        <p className="text-sm text-muted-foreground">
          Segnalazioni automatiche nel periodo selezionato.
        </p>
      </header>
      <AnomalieClient
        incomplete={incomplete}
        straordinario={straordinario}
        senzaRapportino={senzaRapportino}
        modificati={modificati}
        filtri={{ from, to }}
      />
    </div>
  );
}
