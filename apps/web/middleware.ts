import { updateSession, resolveMobileLanding } from '@kommessa/api/server';
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
  // Integrazioni esterne (comando iOS "Carica su Kommessa"): si autenticano da
  // sole con un token Bearer, NON con i cookie di sessione. Senza questa
  // esclusione `updateSession` non trova la sessione e rimanda al login con un
  // 307 — il token non verrebbe mai nemmeno letto.
  if (pathname.startsWith('/api/link/')) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  if (isPublic(req.nextUrl.pathname)) {
    return NextResponse.next();
  }
  const response = await updateSession(req);

  // Landing role-based dei tenant Kantiere: redirect HTTP QUI, fuori dal render
  // React, per evitare il bug Next.js #63121 (redirect() sotto <Suspense> →
  // React #310 transitorio all'avvio a freddo, visibile solo su FPM perché solo
  // i tenant kantiere rediregono). Scoped al SOLO /mobile; fail-soft: se qualcosa
  // va storto resta il redirect di fallback in mobile/page.tsx (al più il vecchio
  // flash, mai un blocco). Bertaiola (app_mode kommessa) → landing null → invariata.
  if (req.nextUrl.pathname === '/mobile') {
    try {
      const landing = await resolveMobileLanding(req);
      if (landing && landing !== '/mobile') {
        const url = req.nextUrl.clone();
        url.pathname = landing;
        const redirect = NextResponse.redirect(url);
        // Preserva i cookie di sessione appena rifreshati da updateSession.
        for (const cookie of response.cookies.getAll()) {
          redirect.cookies.set(cookie);
        }
        return redirect;
      }
    } catch {
      // fail-soft: prosegue con la response normale.
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\..*).*)'],
};
