/**
 * POST /api/push/send-internal
 *
 * Relay interno chiamato dalla Edge Function Deno `notify-event`. Riceve
 * un evento già "consegnato" (in-app + email gestite lato Deno) e si
 * occupa SOLO del Web Push, perché Deno non ha facilmente la libreria
 * `web-push` (richiede crypto Node).
 *
 * Header: `x-webhook-secret: $NOTIFY_WEBHOOK_SECRET` (lo stesso usato dal
 * DB Webhook → notify-event, condiviso).
 *
 * Body:
 *   { userId: uuid, title: string, body: string, url?: string,
 *     eventCode?: string, payload?: object }
 *
 * Comportamento:
 *  1. Verifica preferenza `push` per l'utente e l'event_code (se assente
 *     usa default da `notification_event_types`)
 *  2. Verifica quiet_hours_start/end (Europe/Rome) — salta se siamo nella
 *     finestra silenziosa (ma evento critico → invia comunque)
 *  3. Invia a tutte le subscription dell'utente; pruna 404/410
 */

import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@impiantixplus/api/service';
import { inviaPushAUtente } from '../../../../lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isQuietNow(start: number | null, end: number | null): boolean {
  if (start == null || end == null) return false;
  // Ora attuale in Europe/Rome
  const rome = new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' });
  const hour = new Date(rome).getHours();
  // start=22, end=7 → 22, 23, 0..6 sono quiet
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

export async function POST(req: Request) {
  const expected = process.env.NOTIFY_WEBHOOK_SECRET ?? '';
  const got = req.headers.get('x-webhook-secret') ?? '';
  if (!expected || got !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.userId !== 'string') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const {
    userId,
    title,
    body: text,
    url,
    eventCode,
    payload,
  } = body as {
    userId: string;
    title?: string;
    body?: string;
    url?: string;
    eventCode?: string;
    payload?: Record<string, unknown>;
  };

  const svc = createServiceSupabase() as any;

  // 1. Risolve preferenza push + critical per questo eventCode
  let allowPush = true;
  let isCritical = false;
  if (eventCode) {
    const { data: pref } = await svc
      .from('notification_preferences_effective')
      .select('push, critical')
      .eq('user_id', userId)
      .eq('event_code', eventCode)
      .maybeSingle();
    if (pref) {
      allowPush = pref.push === true;
      isCritical = pref.critical === true;
    }
  }
  if (!allowPush) {
    return NextResponse.json({ ok: true, skipped: 'pref_disabled' });
  }

  // 2. Quiet hours (sovrascritte da eventi critici)
  if (!isCritical) {
    const { data: u } = await svc
      .from('users')
      .select('quiet_hours_start, quiet_hours_end')
      .eq('id', userId)
      .maybeSingle();
    if (u && isQuietNow(u.quiet_hours_start, u.quiet_hours_end)) {
      return NextResponse.json({ ok: true, skipped: 'quiet_hours' });
    }
  }

  // 3. Send
  try {
    const res = await inviaPushAUtente(svc, userId, {
      title: title ?? 'impiantiXplus',
      body: text ?? '',
      url,
      data: payload,
    });
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'push failed' },
      { status: 500 },
    );
  }
}
