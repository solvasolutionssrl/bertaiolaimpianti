import { type NextRequest, NextResponse } from 'next/server';

import { createServerSupabase } from '@impiantixplus/api/server';
import { createServiceSupabase } from '@impiantixplus/api/service';

/**
 * Callback magic-link.
 *
 * Supabase Auth manda l'utente a `${emailRedirectTo}?code=...`. Qui scambiamo
 * `code` con una sessione, e per buona misura aggiorniamo
 * `external_users.last_login_at`.
 *
 * Edge note: usiamo runtime nodejs perché `service_role` viene usato per
 * il bookkeeping `last_login_at` (bypassa RLS in modo controllato; mai
 * usato per leggere dati di prodotto).
 */
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';

  if (!code) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(
      new URL('/login?error=invalid_link', req.url),
    );
  }

  // Validazione di tenancy: l'utente DEVE essere mappato in external_users.
  const claims = (data.user.app_metadata ?? {}) as Record<string, unknown>;
  const isExternal = claims.external === true;
  if (!isExternal) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL('/login?error=not_authorized', req.url),
    );
  }

  // Bookkeeping non bloccante (best-effort): aggiorna last_login_at via
  // service_role, fuori dall'RLS, idempotente.
  try {
    const service = createServiceSupabase();
    await service
      .from('external_users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', data.user.id);
  } catch (e) {
    console.warn('[portal/callback] last_login_at update failed', e);
  }

  return NextResponse.redirect(new URL(next, req.url));
}
