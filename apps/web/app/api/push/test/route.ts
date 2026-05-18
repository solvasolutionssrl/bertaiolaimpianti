/**
 * POST /api/push/test
 * Invia una notifica di prova all'utente loggato (tutti i suoi device).
 * Solo per debug/onboarding ("Verifica che le notifiche funzionano").
 */

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@impiantixplus/api/server';
import { requireTenantContext } from '@impiantixplus/api/tenant';
import { inviaPushAUtente } from '../../../../lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const ctx = await requireTenantContext();
    const supabase = createServerSupabase();
    const res = await inviaPushAUtente(supabase as any, ctx.userId, {
      title: 'impiantiXplus · Test',
      body: 'Notifiche attive su questo dispositivo. ✔',
      url: '/mobile',
    });
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unauthorized' },
      { status: 401 },
    );
  }
}
