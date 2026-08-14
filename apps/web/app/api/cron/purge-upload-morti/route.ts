import { type NextRequest } from 'next/server';

import { purgeUploadMorti } from '../../../_lib/purge-upload-morti';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Spazzino dei caricamenti mai finiti (righe `file_refs` in `uploading`/`failed`
 * più vecchie della finestra di grazia) + abort delle sessioni multipart R2
 * rimaste aperte.
 *
 * Chiamato dal cron ogni 3 giorni (migration `20260814150000`). Auth come gli
 * altri cron: `Authorization: Bearer $CRON_SECRET`.
 *
 * Parametri (query): `ore` (grazia, default 24), `max` (righe, default 200),
 * `dry` (`1` per vedere cosa toccherebbe senza toccarlo).
 */
function autorizzato(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (request.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

function numero(raw: string | null, def: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(min, Math.trunc(n)), max);
}

async function esegui(request: NextRequest) {
  if (!autorizzato(request)) {
    return Response.json({ error: 'Non autorizzato' }, { status: 401 });
  }
  const esito = await purgeUploadMorti({
    oreMin: numero(request.nextUrl.searchParams.get('ore'), 24, 1, 24 * 30),
    limit: numero(request.nextUrl.searchParams.get('max'), 200, 1, 1000),
    dryRun: request.nextUrl.searchParams.get('dry') === '1',
  });
  return Response.json({ ok: true, ...esito });
}

export async function POST(request: NextRequest) {
  return esegui(request);
}

/** Comodo per il trigger manuale/diagnostica. */
export async function GET(request: NextRequest) {
  return esegui(request);
}
