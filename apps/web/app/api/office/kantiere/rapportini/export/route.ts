import { NextResponse, type NextRequest } from 'next/server';
import { COLONNE_QUOTE, quoteDaRiga, quoteOre } from '@kommessa/api/kantiere-quote';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import { createServerSupabase } from '@kommessa/api/server';
import { leggiTutto, type EsitoPagina } from '@kommessa/api/pagine';
import { leggiRighePerId } from '@/app/_lib/letture-complete';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';

/**
 * GET /api/office/kantiere/rapportini/export?from=YYYY-MM-DD&to=YYYY-MM-DD&stato=&dipendente=
 *
 * Restituisce un CSV dettagliato (una riga per rapportino_riga).
 * Delimitatore `;` + BOM per compatibilita` Excel italiano.
 */

type Pagina<T> = PromiseLike<EsitoPagina<T>>;

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
  minuti_lavoro: number | null;
  minuti_viaggio: number | null;
  ore_viaggio_ordinarie: number | null;
  ore_viaggio_eccedenti: number | null;
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
  // Stesso filtro della pagina. Senza, "Esporta CSV" con un cantiere scelto
  // scaricherebbe piu' righe di quelle viste a schermo.
  const cantiereFilter = url.searchParams.get('cantiere') ?? '';

  // Periodo default: ultimi 30 giorni
  const toDefault = new Date();
  const fromDefault = new Date(toDefault);
  fromDefault.setDate(fromDefault.getDate() - 30);

  const from = url.searchParams.get('from') ?? toYYYYMMDD(fromDefault);
  const to = url.searchParams.get('to') ?? toYYYYMMDD(toDefault);

  const supabase = createServerSupabase();

  // Tutto il periodo, oltre il tetto di 1000 righe del database, con le liste
  // di id a gruppi. Un export paghe con righe mancanti sarebbe peggio di un
  // errore: se una lettura fallisce si risponde 500.
  let rapportini: RapportinoRow[];
  let righeData: RigaRow[];
  const dipendentiMap = new Map<string, string>();
  const commesseTitoloMap = new Map<string, string>();
  const cantieriNomeMap = new Map<string, string>();
  try {
    rapportini = await leggiTutto<RapportinoRow>(
      (da, a) => {
        let q = supabase
          .from('rapportini' as never)
          .select('id, dipendente_id, data, stato')
          .eq('tenant_id', ctx.tenantId)
          .gte('data', from)
          .lte('data', to);
        q = stato ? q.eq('stato', stato) : q.in('stato', ['inviato', 'approvato']);
        if (dipendenteFilter) q = q.eq('dipendente_id', dipendenteFilter);
        return q.order('data').order('id').range(da, a) as unknown as Pagina<RapportinoRow>;
      },
      { contesto: 'export presenze: giornate' },
    );

    const rapportinoIds = rapportini.map((r) => r.id);
    const dipIds = [...new Set(rapportini.map((r) => r.dipendente_id))];

    // Righe nell'ordine delle giornate (data, poi id).
    const ordineGiornata = new Map(rapportini.map((r, i) => [r.id, i]));
    righeData = (
      await leggiRighePerId<RigaRow>(
        supabase,
        'rapportino_righe',
        `rapportino_id, commessa_id, cantiere_id, ${COLONNE_QUOTE}`,
        'rapportino_id',
        rapportinoIds,
        'export presenze: righe',
      )
    ).sort(
      (x, y) => (ordineGiornata.get(x.rapportino_id) ?? 0) - (ordineGiornata.get(y.rapportino_id) ?? 0),
    );

    // Filtro per cantiere, con lo stesso criterio della pagina: si tengono le
    // GIORNATE che hanno almeno una riga su quel cantiere, e di quelle si
    // esporta tutto. Tenere solo le righe del cantiere darebbe un file con
    // totali diversi da quelli a schermo.
    if (cantiereFilter) {
      const giornateDelCantiere = new Set(
        righeData.filter((r) => r.cantiere_id === cantiereFilter).map((r) => r.rapportino_id),
      );
      righeData = righeData.filter((r) => giornateDelCantiere.has(r.rapportino_id));
    }

    const commessaIds = [...new Set(righeData.map((r) => r.commessa_id).filter((id): id is string => id != null))];
    const cantiereIds = [...new Set(righeData.map((r) => r.cantiere_id).filter((id): id is string => id != null))];

    const [dipendenti, commesse, cantieri] = await Promise.all([
      leggiRighePerId<DipendenteRow>(supabase, 'dipendenti', 'id, nome, cognome', 'id', dipIds, 'export presenze: dipendenti'),
      leggiRighePerId<CommessaRow>(
        supabase,
        'commesse',
        'id, codice_interno, nome_cartella, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali',
        'id',
        commessaIds,
        'export presenze: commesse',
      ),
      leggiRighePerId<CantiereRow>(supabase, 'cantieri', 'id, nome, codice', 'id', cantiereIds, 'export presenze: cantieri'),
    ]);

    for (const d of dipendenti) {
      dipendentiMap.set(d.id, `${d.nome} ${d.cognome}`.trim());
    }
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
    for (const k of cantieri) {
      cantieriNomeMap.set(k.id, k.nome || k.codice || k.id);
    }
  } catch (e) {
    console.error('[rapportini/export] lettura interrotta:', e instanceof Error ? e.message : e);
    return new NextResponse('Export non riuscito: la lettura dei dati si è interrotta. Riprova.', {
      status: 500,
    });
  }

  // Mappa rapportino_id -> (dipendente_id, data, stato)
  const rapportinoMeta = new Map<string, { dipendente_id: string; data: string; stato: string }>(
    rapportini.map((r) => [r.id, { dipendente_id: r.dipendente_id, data: r.data, stato: r.stato }]),
  );

  // Genera CSV
  // Lavoro e viaggio sono i dati puri. Ordinarie (lavoro e viaggio entro l'orario
  // ordinario), straordinarie e viaggio eccedente sono le quote derivate: non si
  // sovrappongono e sommano a lavoro + viaggio.
  const header = [
    'Data',
    'Dipendente',
    'Commessa/Cantiere',
    'Ore lavoro',
    'Ore viaggio',
    'Ore ordinarie',
    'Ore straordinarie',
    'Ore viaggio eccedenti',
    'Stato',
  ];

  const csvRows = righeData.map((r) => {
    const meta = rapportinoMeta.get(r.rapportino_id);
    const data = meta?.data ? fmtDate(meta.data) : '';
    const dipendente = dipendentiMap.get(meta?.dipendente_id ?? '') ?? '';
    const commessa = targetLabel(r, commesseTitoloMap, cantieriNomeMap);
    return [
      data,
      dipendente,
      commessa,
      ...(() => {
        const q = quoteOre(quoteDaRiga(r));
        return [
          fmtNum(q.lavoro),
          fmtNum(q.viaggio),
          fmtNum(q.ordinarie),
          fmtNum(q.straordinarie),
          fmtNum(q.viaggioEccedente),
        ];
      })(),
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
