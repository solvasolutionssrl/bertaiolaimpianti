/**
 * POST /api/upload/notify-batch-done
 *
 * Chiamato dal client (`UploadQueueProvider`) quando la coda si svuota:
 * invia una notifica push aggregata all'utente perché possa sapere che il
 * caricamento è finito anche se ha minimizzato l'app.
 *
 * Body: { count: number, label?: string }
 *   count: numero di file caricati con successo nella sessione
 *   label: testo opzionale ("foto", "video", "media")
 *
 * Non blocca mai il client: errori vengono swallowed e ritornati come ok=false.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';

import { inviaPushAUtente } from '../../../../lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  count: z.number().int().min(1).max(500),
  label: z.string().max(40).optional(),
});

export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 });
  }
  const { count, label } = parsed.data;

  const labelFinal = label ?? (count === 1 ? 'file' : 'file');
  const title = 'Caricamento completato';
  const body =
    count === 1
      ? `1 ${labelFinal} caricato su Kommessa`
      : `${count} ${labelFinal} caricati su Kommessa`;

  try {
    const svc = createServiceSupabase() as any;
    const res = await inviaPushAUtente(svc, ctx.userId, {
      title,
      body,
      // url = home PWA mobile dell'utente
      url: '/mobile',
    });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    // Push fallita: non blocca nulla, l'utente vedrà comunque la UI quando rientra.
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : 'push failed',
    });
  }
}
