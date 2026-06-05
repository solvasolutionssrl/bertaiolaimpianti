import { type NextRequest } from 'next/server';

import { purgeExpiredMedia } from '../../../_lib/media-cestino';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Purge definitivo del cestino media (retention 30gg).
 *
 * Chiamato dal cron pg_cron/pg_net (vedi migration
 * 20260604000100_cron_purge_cestino.sql) una volta al giorno. Cancella gli
 * oggetti R2 (+ thumb) o i file nelle dotfolder .cestino_solva dei file con
 * `purge_after` scaduto.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (stesso secret del sync).
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (request.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

function clampMax(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 50;
  return Math.min(Math.max(1, Math.trunc(n)), 200);
}

async function run(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Non autorizzato' }, { status: 401 });
  }
  const limit = clampMax(request.nextUrl.searchParams.get('max'));
  const result = await purgeExpiredMedia({ limit });
  return Response.json({ ok: true, ...result });
}

export async function POST(request: NextRequest) {
  return run(request);
}

// Comodo per un trigger manuale/diagnostica dal browser admin.
export async function GET(request: NextRequest) {
  return run(request);
}
