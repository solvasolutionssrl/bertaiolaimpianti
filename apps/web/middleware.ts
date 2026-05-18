import { updateSession } from '@impiantixplus/api/server';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refresh sessione Supabase (cookie rotation) su ogni richiesta che
 * potenzialmente richiede auth. Una sola superficie applicativa: la scelta
 * tra UX mobile vs desktop avviene post-login (`/login` → redirect by user-agent).
 *
 * Performance: il refresh costa una chiamata a Supabase (`auth.getUser`),
 * tipicamente 100-200ms in prod e di più in dev. Saltiamo le pagine pubbliche
 * (`/` landing, `/login`, `/portal/richiedi` magic link) dove il cookie
 * di sessione non è necessario al server: il client-side Supabase scrive
 * comunque i cookie al sign-in, e le route protette (`/office/*`, `/mobile/*`,
 * `/portal/*` autenticato) passano sempre dal middleware.
 */
const PUBLIC_PATHS = new Set<string>(['/', '/login']);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // Rotte di callback magic link (devono settare cookie, ma sono route handler:
  // non richiedono updateSession prima — il route handler stesso scrive i cookie).
  if (pathname.startsWith('/portal/auth/callback')) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  if (isPublic(req.nextUrl.pathname)) {
    return NextResponse.next();
  }
  return updateSession(req);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\..*).*)'],
};
