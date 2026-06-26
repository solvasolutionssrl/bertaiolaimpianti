import { type NextRequest } from 'next/server';

import { r2SpeseContext, isErr, dentroBase } from '../_lib/r2-spese';

export const dynamic = 'force-dynamic';

/**
 * Apre/scarica un singolo file ricevuta su R2 per chiave (solo office/admin).
 * `?download=1` forza il download col nome del file. La chiave deve stare nel
 * namespace spese del tenant (no traversal, no altri tenant).
 */
export async function GET(request: NextRequest) {
  const c = await r2SpeseContext();
  if (isErr(c)) return Response.json({ ok: false, code: c.error }, { status: c.status });

  const key = request.nextUrl.searchParams.get('key') ?? '';
  if (!key || !dentroBase(key, c.base)) {
    return Response.json({ ok: false, code: 'CHIAVE_NON_VALIDA' }, { status: 400 });
  }
  const wantDownload = request.nextUrl.searchParams.get('download') === '1';
  const nome = key.slice(key.lastIndexOf('/') + 1);

  const signed = await c.r2.createPresignedGetUrl(key, {
    ttlSec: 300,
    ...(wantDownload ? { downloadAs: nome } : {}),
  });
  return Response.redirect(signed.url, 302);
}
