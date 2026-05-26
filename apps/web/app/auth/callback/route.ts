import { type NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@kommessa/api/server';

export const runtime = 'nodejs';

/**
 * GET /auth/callback?code=...&next=...
 *
 * Scambia il codice PKCE con una sessione Supabase e redirige l'utente
 * alla pagina indicata da `next` (default /office).
 *
 * Usato principalmente dal flusso di invito: l'email inviata da Supabase
 * contiene un link che punta qui con redirectTo=/accetta-invito.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/office';

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=invalid_link', req.url));
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL('/login?error=invalid_link', req.url));
  }

  return NextResponse.redirect(new URL(next, req.url));
}
