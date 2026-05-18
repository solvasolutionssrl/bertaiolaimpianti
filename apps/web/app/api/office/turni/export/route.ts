import { NextResponse, type NextRequest } from 'next/server';

import { requireTenantContext } from '@impiantixplus/api/tenant';

import {
  fetchInterventi,
  formatDurataMin,
  settimanaRange,
} from '../../../../office/turni/_lib/queries';

/**
 * GET /api/office/turni/export?week=YYYY-MM-DD&user=<id>&commessa=<id>
 *
 * Restituisce un CSV (delimitatore `;` per compatibilità Excel italiano)
 * con tutti gli interventi della settimana / filtri richiesti.
 */
export async function GET(req: NextRequest) {
  try {
    await requireTenantContext();
  } catch {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const url = new URL(req.url);
  const weekStr = url.searchParams.get('week');
  const userId = url.searchParams.get('user');
  const commessaId = url.searchParams.get('commessa');

  const ref = weekStr ? new Date(`${weekStr}T00:00:00`) : new Date();
  if (isNaN(ref.getTime())) {
    return NextResponse.json({ error: 'BAD_WEEK' }, { status: 400 });
  }
  const { from, to } = settimanaRange(ref);

  const rows = await fetchInterventi({ from, to, userId, commessaId });

  const header = [
    'utente',
    'commessa',
    'data',
    'inizio',
    'fine',
    'durata',
    'durata_minuti',
    'note',
  ];

  const escape = (v: unknown): string => {
    if (v == null) return '';
    const s = String(v);
    if (s.includes(';') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  const fmtHM = (iso: string) =>
    new Date(iso).toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    });

  const csvRows = rows.map((r) =>
    [
      r.user_name ?? r.user_id,
      r.commessa_codice,
      fmtDate(r.start_at),
      fmtHM(r.start_at),
      r.end_at ? fmtHM(r.end_at) : '',
      r.duration_minutes != null ? formatDurataMin(r.duration_minutes) : '',
      r.duration_minutes ?? '',
      '',
    ]
      .map(escape)
      .join(';'),
  );

  const csv =
    '﻿' + header.join(';') + '\n' + csvRows.join('\n') + '\n';
  const fromIso = from.toISOString().slice(0, 10);
  const filename = `turni_${fromIso}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
