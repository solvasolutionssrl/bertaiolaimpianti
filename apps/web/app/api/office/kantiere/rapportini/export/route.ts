import { NextResponse, type NextRequest } from 'next/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import { createServerSupabase } from '@kommessa/api/server';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';

/**
 * GET /api/office/kantiere/rapportini/export?from=YYYY-MM-DD&to=YYYY-MM-DD&stato=&dipendente=
 *
 * Restituisce un CSV dettagliato (una riga per rapportino_riga).
 * Delimitatore `;` + BOM per compatibilita` Excel italiano.
 */

type RapportinoRow = {
  id: string;
  dipendente_id: string;
  data: string;
  stato: string;
};

type RigaRow = {
  rapportino_id: string;
  commessa_id: string | null;
  cantiere_id: string | null;
  ore_ordinarie: number;
  ore_straordinarie: number;
  ore_viaggio: number;
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
  // Giorno calendario in Europe/Rome (il server gira UTC): en-CA → YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d);
}

const escape = (v: unknown): string => {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(';') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const fmtNum = (n: number): string => String(n).replace('.', ',');

export async function GET(req: NextRequest) {
  // Guard: autenticazione + ruolo + modulo
  let ctx: Awaited<ReturnType<typeof requireTenantContext>>;
  try {
    ctx = await requireTenantContext();
  } catch {
    return new NextResponse('Non autenticato', { status: 401 });
  }

  if (!['admin', 'office'].includes(ctx.role ?? '')) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  if (!(await tenantHasModule('kantiere'))) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const url = new URL(req.url);
  const stato = url.searchParams.get('stato') ?? '';
  const dipendenteFilter = url.searchParams.get('dipendente') ?? '';

  // Periodo default: ultimi 30 giorni
  const toDefault = new Date();
  const fromDefault = new Date(toDefault);
  fromDefault.setDate(fromDefault.getDate() - 30);

  const from = url.searchParams.get('from') ?? toYYYYMMDD(fromDefault);
  const to = url.searchParams.get('to') ?? toYYYYMMDD(toDefault);

  const supabase = createServerSupabase();

  // Carica rapportini
  let rapQuery = supabase
    .from('rapportini' as never)
    .select('id, dipendente_id, data, stato')
    .eq('tenant_id', ctx.tenantId)
    .gte('data', from)
    .lte('data', to)
    .limit(2000);

  if (stato) {
    rapQuery = rapQuery.eq('stato', stato);
  } else {
    rapQuery = rapQuery.in('stato', ['inviato', 'approvato']);
  }
  if (dipendenteFilter) {
    rapQuery = rapQuery.eq('dipendente_id', dipendenteFilter);
  }

  const { data: rapportiniData } = (await rapQuery) as { data: RapportinoRow[] | null };
  const rapportini = rapportiniData ?? [];

  const rapportinoIds = rapportini.map((r) => r.id);
  const dipIds = [...new Set(rapportini.map((r) => r.dipendente_id))];

  // Batch-load righe
  let righeData: RigaRow[] = [];
  if (rapportinoIds.length > 0) {
    const { data } = (await supabase
      .from('rapportino_righe' as never)
      .select('rapportino_id, commessa_id, cantiere_id, ore_ordinarie, ore_straordinarie, ore_viaggio')
      .in('rapportino_id', rapportinoIds)) as { data: RigaRow[] | null };
    righeData = data ?? [];
  }

  const commessaIds = [...new Set(righeData.map((r) => r.commessa_id).filter((id): id is string => id != null))];
  const cantiereIds = [...new Set(righeData.map((r) => r.cantiere_id).filter((id): id is string => id != null))];

  // Batch-load dipendenti
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

  // Batch-load commesse
  const commesseTitoloMap = new Map<string, string>();
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

  // Batch-load cantieri
  const cantieriNomeMap = new Map<string, string>();
  if (cantiereIds.length > 0) {
    const { data } = (await supabase
      .from('cantieri' as never)
      .select('id, nome, codice')
      .in('id', cantiereIds)) as { data: CantiereRow[] | null };
    for (const k of data ?? []) {
      cantieriNomeMap.set(k.id, k.nome || k.codice || k.id);
    }
  }

  // Mappa rapportino_id -> (dipendente_id, data, stato)
  const rapportinoMeta = new Map<string, { dipendente_id: string; data: string; stato: string }>(
    rapportini.map((r) => [r.id, { dipendente_id: r.dipendente_id, data: r.data, stato: r.stato }]),
  );

  // Genera CSV
  const header = ['Data', 'Dipendente', 'Commessa/Cantiere', 'Ore ordinarie', 'Ore straordinario', 'Ore viaggio', 'Stato'];

  const csvRows = righeData.map((r) => {
    const meta = rapportinoMeta.get(r.rapportino_id);
    const data = meta?.data ? fmtDate(meta.data) : '';
    const dipendente = dipendentiMap.get(meta?.dipendente_id ?? '') ?? '';
    const commessa = targetLabel(r, commesseTitoloMap, cantieriNomeMap);
    return [
      data,
      dipendente,
      commessa,
      fmtNum(r.ore_ordinarie ?? 0),
      fmtNum(r.ore_straordinarie ?? 0),
      fmtNum(r.ore_viaggio ?? 0),
      meta?.stato ?? '',
    ]
      .map(escape)
      .join(';');
  });

  const csv = '﻿' + header.join(';') + '\n' + csvRows.join('\n') + '\n';
  const filename = `rapportini_${from}_${to}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
