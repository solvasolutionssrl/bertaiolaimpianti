/**
 * POST /api/push/subscribe
 * Body: { endpoint, keys: { p256dh, auth }, userAgent? }
 *
 * Upsert della subscription per l'utente loggato (RLS gestisce isolamento).
 * Idempotente: la `endpoint` ha unique constraint, riusiamo la riga
 * esistente aggiornando user_id (es. se due utenti condividono il device).
 *
 * DELETE /api/push/subscribe?endpoint=...
 * Cancella la subscription (chiamato dal client su unsubscribe).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@impiantixplus/api/server';
import { requireTenantContext } from '@impiantixplus/api/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const body = await req.json().catch(() => null);
    const parsed = subscribeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'invalid' },
        { status: 400 },
      );
    }
    const { endpoint, keys, userAgent } = parsed.data;

    const supabase = createServerSupabase();
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        tenant_id: ctx.tenantId,
        user_id: ctx.userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: userAgent ?? null,
      } as never,
      { onConflict: 'user_id,endpoint' },
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unauthorized' },
      { status: 401 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    await requireTenantContext();
    const url = new URL(req.url);
    const endpoint = url.searchParams.get('endpoint');
    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint richiesto' }, { status: 400 });
    }
    const supabase = createServerSupabase();
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unauthorized' },
      { status: 401 },
    );
  }
}
