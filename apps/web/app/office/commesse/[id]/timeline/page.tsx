import Link from 'next/link';
import { CalendarRange } from 'lucide-react';
import { createServerSupabase } from '@impiantixplus/api/server';
import { EmptyState } from '../../../../_components/empty-state';
import { loadCommessa } from '../_lib/get-commessa';
import { fmtData } from '../../../_lib/format';
import { TimelineChart, type TimelineRow } from './_components/timeline-chart';

export const dynamic = 'force-dynamic';

/**
 * Timeline commessa (Gantt-light).
 *
 * Lo "start" di una swimlane è il MIN tra:
 *   - taken_at delle foto associate alla voce
 *   - created_at della riga commessa_voci
 *
 * Lo "end" è il MAX tra:
 *   - taken_at delle foto
 *   - updated_at della riga (per stati completata/bloccata)
 *   - oggi (per stato in_corso, così la barra "vive" fino a oggi)
 *
 * Una voce è inclusa se ha almeno created_at (sempre vero) — anche senza
 * foto la mostriamo come barra "puntuale" di 1 giorno sul created_at.
 */
export default async function TimelineTab({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerSupabase();

  const [cRaw, vociRes, fotoRes] = await Promise.all([
    loadCommessa(params.id),
    supabase
      .from('commessa_voci')
      .select(
        `
          voce_id,
          stato,
          min_foto_richieste,
          foto_caricate_count,
          created_at,
          updated_at,
          voce:voce_id ( id, nome, categoria, ordine_visualizzazione )
        `,
      )
      .eq('commessa_id', params.id),
    supabase
      .from('file_refs')
      .select('voce_id, taken_at, uploaded_at, mime')
      .eq('commessa_id', params.id)
      .not('voce_id', 'is', null),
  ]);

  const c = cRaw as any;
  const voci = (vociRes.data ?? []) as any[];
  const foto = (fotoRes.data ?? []) as any[];

  // Aggrego le date foto per voce_id
  const fotoByVoce = new Map<number, number[]>(); // ms timestamps
  for (const f of foto as any[]) {
    if (f.voce_id == null) continue;
    const tRaw = f.taken_at ?? f.uploaded_at;
    if (!tRaw) continue;
    const t = new Date(tRaw).getTime();
    if (Number.isNaN(t)) continue;
    const list = fotoByVoce.get(f.voce_id) ?? [];
    list.push(t);
    fotoByVoce.set(f.voce_id, list);
  }

  const today = Date.now();

  const rows: TimelineRow[] = voci
    .map((r: any): TimelineRow | null => {
      const v = Array.isArray(r.voce) ? r.voce[0] : r.voce;
      const created = new Date(r.created_at).getTime();
      const updated = new Date(r.updated_at).getTime();
      const fotoTs = fotoByVoce.get(r.voce_id) ?? [];

      const candidatiInizio = [created, ...fotoTs].filter(Number.isFinite);
      const startMs = Math.min(...candidatiInizio);

      let endMs: number;
      if (r.stato === 'in_corso') {
        endMs = Math.max(updated, today, ...fotoTs);
      } else if (r.stato === 'da_iniziare') {
        // niente attività: barretta sul created (rappresenta "in attesa")
        endMs = Math.max(created, ...fotoTs);
      } else {
        endMs = Math.max(updated, ...fotoTs);
      }
      // Assicuriamo end >= start (almeno stesso giorno)
      if (endMs < startMs) endMs = startMs;

      return {
        voceId: r.voce_id,
        voceNome: v?.nome ?? `Voce ${r.voce_id}`,
        categoria: v?.categoria ?? null,
        stato: r.stato,
        fotoCount: r.foto_caricate_count ?? 0,
        minFoto: r.min_foto_richieste ?? 0,
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
      };
    })
    .filter((r): r is TimelineRow => r !== null)
    .sort((a, b) => {
      const va = voci.find((x: any) => x.voce_id === a.voceId);
      const vb = voci.find((x: any) => x.voce_id === b.voceId);
      const oa = Array.isArray(va?.voce) ? va?.voce[0]?.ordine_visualizzazione : (va as any)?.voce?.ordine_visualizzazione;
      const ob = Array.isArray(vb?.voce) ? vb?.voce[0]?.ordine_visualizzazione : (vb as any)?.voce?.ordine_visualizzazione;
      return (oa ?? 0) - (ob ?? 0);
    });

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CalendarRange}
        title="Nessuna fase con date utili"
        description="Aggiungi fasi alla commessa o carica foto sopralluogo: la timeline ricostruisce automaticamente l'andamento."
        action={
          <Link
            href={`/office/commesse/${params.id}/fasi`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Vai a Fasi →
          </Link>
        }
      />
    );
  }

  // Range globale per l'asse: min/max tra tutte le righe, allargato con data_apertura.
  const allStarts = rows.map((r) => new Date(r.start).getTime());
  const allEnds = rows.map((r) => new Date(r.end).getTime());
  const apertura = c.data_apertura ? new Date(c.data_apertura).getTime() : null;
  const rangeStartMs = Math.min(...allStarts, apertura ?? Number.POSITIVE_INFINITY);
  const rangeEndMs = Math.max(...allEnds, today);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Andamento fasi
          </h2>
          <p className="text-xs text-muted-foreground">
            {rows.length} {rows.length === 1 ? 'fase' : 'fasi'} attive · Apertura {fmtData(c.data_apertura)}
          </p>
        </div>
      </header>

      <TimelineChart
        commessaId={params.id}
        rows={rows}
        rangeStart={new Date(rangeStartMs).toISOString()}
        rangeEnd={new Date(rangeEndMs).toISOString()}
      />
    </div>
  );
}
