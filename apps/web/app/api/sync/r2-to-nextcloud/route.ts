import { type NextRequest } from 'next/server';
import { z } from 'zod';

import { syncBatch, syncOneFile } from '../../../_lib/sync-r2-to-nextcloud';
import { checkPlatformAdmin } from '../../../admin/_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Sync worker R2 → Nextcloud.
 *
 * Modalità d'accesso:
 *  - GET (Vercel Cron):  Authorization: Bearer $CRON_SECRET → batch fino a N file
 *  - POST (admin SOLVA): cookie-auth platform admin → batch o singolo file
 *  - POST internal call: header X-Internal-Sync-Secret = $CRON_SECRET (per
 *    auto-trigger dal complete endpoint, fire-and-forget)
 */

const PostBody = z.object({
  fileRefId: z.string().uuid().optional(),
  maxFiles: z.number().int().positive().max(50).optional(),
});

// ------------------------- GET (Vercel Cron) -------------------------------

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return Response.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  const maxFiles = clampMax(request.nextUrl.searchParams.get('max'));
  const result = await syncBatch(maxFiles);
  return Response.json({ ok: true, source: 'cron', ...result });
}

// ------------------------- POST (admin + internal) -------------------------

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => ({}));
  const parsed = PostBody.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: 'Body non valido', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // Auth: admin platform OPPURE chiamata interna firmata
  const internalCall = isAuthorizedInternal(request);
  if (!internalCall) {
    const check = await checkPlatformAdmin();
    if (check.kind !== 'admin') {
      return Response.json({ error: 'Non autorizzato' }, { status: 403 });
    }
  }

  // Singolo file richiesto
  if (body.fileRefId) {
    const r = await syncOneFile(body.fileRefId);
    return Response.json({ ok: r.ok, source: internalCall ? 'internal' : 'admin', result: r });
  }

  // Batch
  const result = await syncBatch(body.maxFiles ?? 10);
  return Response.json({ ok: true, source: internalCall ? 'internal' : 'admin', ...result });
}

// --------------------------------------------------------------------------

function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

function isAuthorizedInternal(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('x-internal-sync-secret') === secret;
}

function clampMax(raw: string | null): number {
  if (!raw) return 10;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 10;
  return Math.min(Math.floor(n), 50);
}
