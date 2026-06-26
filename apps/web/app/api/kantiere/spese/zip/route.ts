import { type NextRequest } from 'next/server';
import { Readable } from 'node:stream';

// archiver usa `export =` (CommonJS): require con cast a firma callable per
// evitare il vincolo esModuleInterop del tsconfig condiviso.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiver = require('archiver') as (
  format: string,
  options?: import('archiver').ArchiverOptions,
) => import('archiver').Archiver;

import { r2SpeseContext, isErr, dentroBase } from '../_lib/r2-spese';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Scarica una cartella di ricevute come zip (solo office/admin). Lo zip è
 * costruito lato server (l'app scarica i file da R2): niente CORS lato client.
 * Il prefisso deve stare nel namespace spese del tenant. Le miniature sono
 * escluse. Cap di sicurezza a 2000 file.
 */
export async function GET(request: NextRequest) {
  const c = await r2SpeseContext();
  if (isErr(c)) return Response.json({ ok: false, code: c.error }, { status: c.status });

  const raw = request.nextUrl.searchParams.get('prefix') ?? c.base;
  const prefix = raw.endsWith('/') ? raw : `${raw}/`;
  if (!dentroBase(prefix, c.base)) {
    return Response.json({ ok: false, code: 'PREFISSO_NON_VALIDO' }, { status: 400 });
  }

  const listed = await c.r2.listObjects(prefix, { maxKeys: 2000 });
  const keys = listed.keys
    .map((k) => k.key)
    .filter((k) => !k.includes('/thumbs/') && !/\/thumb\.webp$/.test(k));
  if (keys.length === 0) {
    return Response.json({ ok: false, code: 'CARTELLA_VUOTA' }, { status: 404 });
  }

  const nomeZip = `ricevute_${prefix.slice(c.base.length).replace(/\/+$/, '').replace(/\//g, '-') || 'tutte'}.zip`;

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', () => {
    archive.abort();
  });
  const webStream = Readable.toWeb(archive) as unknown as ReadableStream<Uint8Array>;

  // Riempimento asincrono: scarica da R2 e aggiunge allo zip, poi finalizza.
  void (async () => {
    try {
      for (const key of keys) {
        const signed = await c.r2.createPresignedGetUrl(key, { ttlSec: 300 });
        const r = await fetch(signed.url);
        if (!r.ok) continue;
        const buf = Buffer.from(await r.arrayBuffer());
        archive.append(buf, { name: key.slice(prefix.length) });
      }
      await archive.finalize();
    } catch {
      archive.abort();
    }
  })();

  return new Response(webStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${nomeZip}"`,
      'Cache-Control': 'no-store',
    },
  });
}
