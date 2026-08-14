import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from './types/database.generated';

/**
 * Supabase client for Server Components / Route Handlers / Server Actions.
 * Reads cookies from `next/headers`. Cookie writes are best-effort
 * (Server Components can read but not write cookies; Route Handlers
 * and Server Actions can do both).
 */
export function createServerSupabase() {
  const store = cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        // Vedi la nota estesa in `service.ts`: senza `no-store`, Next mette le
        // GET di supabase-js nel Data Cache e continua a servirle anche
        // quando la tabella e' cambiata. Su dati di un tenant e' peggio che
        // altrove — si mostrerebbe a un cliente una fotografia vecchia dei
        // suoi stessi dati, senza che niente lo segnali.
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      },
      cookies: {
        getAll() {
          return store.getAll();
        },
        setAll(toSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            for (const { name, value, options } of toSet) {
              store.set(name, value, options);
            }
          } catch {
            // Server Components can't set cookies — middleware handles refresh.
          }
        },
      },
    },
  );
}

/**
 * Middleware helper: rotates Supabase auth cookies on every request
 * so the JWT (with custom claim `tenant_id`) stays fresh and Postgres
 * RLS policies always see a valid identity.
 */
export async function updateSession(req: NextRequest) {
  // `x-percorso`: i componenti server non sanno su che indirizzo stanno
  // girando. Glielo passiamo qui, cosi' quando la sessione non si riesce a
  // verificare li si puo' riportare esattamente dov'erano invece che sulla
  // home. Va messo sulla RICHIESTA (non sulla risposta): e' quella che il
  // render legge.
  const intestazioni = new Headers(req.headers);
  intestazioni.set('x-percorso', req.nextUrl.pathname + req.nextUrl.search);

  let response = NextResponse.next({ request: { headers: intestazioni } });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(toSet: { name: string; value: string; options: CookieOptions }[]) {
          for (const { name, value } of toSet) {
            req.cookies.set(name, value);
          }
          // Ricostruendo la risposta si riparte dalle intestazioni nostre,
          // altrimenti `x-percorso` andrebbe perso proprio quando i cookie
          // vengono rinnovati.
          response = NextResponse.next({ request: { headers: intestazioni } });
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  try {
    await supabase.auth.getUser();
  } catch (err) {
    // Supabase unreachable (dev senza stack acceso): non rompiamo la request,
    // le pagine che richiedono auth gestiranno l'anonimo via requireTenantContext.
    console.warn('[updateSession] Supabase unreachable, skipping session refresh');
  }

  return response;
}

/**
 * Landing role-based della PWA per i tenant Kantiere, risolta a livello di
 * MIDDLEWARE (redirect HTTP, PRIMA del render React).
 *
 * Perché qui e non con `redirect()` in `mobile/page.tsx`: un `redirect()` in un
 * Server Component sotto <Suspense> (loading.tsx / streaming) innesca il bug
 * Next.js #63121 → un React #310 transitorio (flash "errore critico" all'avvio
 * a freddo, visibile solo sui tenant kantiere perché solo loro rediregono).
 * Facendo il redirect nel middleware, fuori dal render, il problema non nasce.
 *
 * Ritorna il path di destinazione, oppure `null` (nessun redirect) se: utente
 * non autenticato, tenant NON kantiere (es. Bertaiola → la home /mobile resta),
 * o dati mancanti. È volutamente fail-soft: il chiamante la usa in try/catch e,
 * in caso di problema, resta il redirect di fallback in `mobile/page.tsx`.
 */
export async function resolveMobileLanding(req: NextRequest): Promise<string | null> {
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        // Nessuna rotazione cookie qui: l'ha già fatta updateSession.
        setAll() {},
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: urow } = await supabase
    .from('users')
    .select('role, tenant_id')
    .eq('id', user.id)
    .maybeSingle();
  const u = urow as { role: string; tenant_id: string | null } | null;
  if (!u?.tenant_id) return null;

  const { data: trow } = await supabase
    .from('tenants')
    .select('app_mode')
    .eq('id', u.tenant_id)
    .maybeSingle();
  const appMode = (trow as { app_mode?: string | null } | null)?.app_mode ?? null;
  if (appMode !== 'kantiere') return null;

  const isManager = u.role === 'admin' || u.role === 'office';
  return isManager ? '/mobile/kantiere/cruscotto' : '/mobile/kantiere/cantieri';
}
