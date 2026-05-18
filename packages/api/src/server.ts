import { createServerClient } from '@supabase/ssr';
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
      cookies: {
        getAll() {
          return store.getAll();
        },
        setAll(toSet) {
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
  let response = NextResponse.next({ request: req });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(toSet) {
          for (const { name, value } of toSet) {
            req.cookies.set(name, value);
          }
          response = NextResponse.next({ request: req });
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
