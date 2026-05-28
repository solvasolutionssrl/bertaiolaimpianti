/**
 * Backfill thumbnail per immagini esistenti senza r2_thumb_key.
 *
 * Auth: header `X-Internal-Backfill-Secret` = $CRON_SECRET (uguale agli
 * altri internal endpoint come /api/sync/r2-to-nextcloud).
 *
 * Body opzionale: { limit?: number, dryRun?: boolean }
 *   limit:  numero max di file da processare in questo batch (default 10).
 *   dryRun: se true, conta candidati ma non genera. Default false.
 *
 * Risposta:
 *   { ok: true, processed, succeeded, failed, remaining, errors? }
 *
 * Uso (dal terminale, per loop di backfill ~10/min):
 *   while true; do
 *     curl -X POST -H "X-Internal-Backfill-Secret: $CRON_SECRET" \
 *       https://bertaiolaimpianti.vercel.app/api/admin/thumbs/backfill
 *     sleep 60
 *   done
 */

import { type NextRequest } from 'next/server';
import { z } from 'zod';

import { createServiceSupabase } from '@kommessa/api/service';

import { generateAndUploadThumb } from '../../../../_lib/thumbnails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  limit: z.number().int().min(1).max(50).optional(),
  dryRun: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const provided = req.headers.get('x-internal-backfill-secret');
  if (!expected || provided !== expected) {
    return Response.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: 'Body non valido', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const limit = parsed.data.limit ?? 10;
  const dryRun = parsed.data.dryRun ?? false;

  const service = createServiceSupabase();

  // Candidati: immagini con stato "vivo" senza thumb. Ordine FIFO (uploaded_at
  // crescente) così procediamo cronologicamente dai più vecchi.
  // Cast: r2_thumb_key è introdotta dalla migration 20260528010000, i types
  // Supabase non la conoscono ancora.
  const { data: candidatesRaw, error: cErr } = await service
    .from('file_refs')
    .select('id, tenant_id')
    .like('mime', 'image/%')
    .in('status', ['uploaded', 'syncing', 'synced'])
    .is('r2_thumb_key' as never, null)
    .order('uploaded_at', { ascending: true })
    .limit(limit);

  if (cErr) {
    return Response.json(
      { error: `Query candidati fallita: ${cErr.message}` },
      { status: 500 },
    );
  }

  const candidates = (candidatesRaw ?? []) as Array<{
    id: string;
    tenant_id: string;
  }>;

  // Conta remaining (per UI / loop control)
  const { count: remaining } = await service
    .from('file_refs')
    .select('id', { count: 'exact', head: true })
    .like('mime', 'image/%')
    .in('status', ['uploaded', 'syncing', 'synced'])
    .is('r2_thumb_key' as never, null);

  if (dryRun) {
    return Response.json({
      ok: true,
      dryRun: true,
      candidates: candidates.length,
      remaining: remaining ?? null,
    });
  }

  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ id: string; reason: string }> = [];

  for (const c of candidates) {
    try {
      const res = await generateAndUploadThumb(c.tenant_id, c.id);
      if (res.ok) {
        succeeded++;
      } else {
        failed++;
        errors.push({ id: c.id, reason: res.reason });
      }
    } catch (e) {
      failed++;
      errors.push({
        id: c.id,
        reason: e instanceof Error ? e.message : 'unknown',
      });
    }
  }

  return Response.json({
    ok: true,
    processed: candidates.length,
    succeeded,
    failed,
    remaining: remaining !== null && remaining !== undefined
      ? Math.max(0, remaining - succeeded)
      : null,
    ...(errors.length > 0 ? { errors } : {}),
  });
}
