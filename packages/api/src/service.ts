import { createClient } from '@supabase/supabase-js';
import type { Database } from './types/database.generated';

/**
 * Service-role Supabase client. Bypasses RLS — use ONLY in:
 *  - Edge Functions
 *  - Server-side admin actions explicitly intended to bypass tenancy
 *  - One-time migration scripts (Freshdesk import)
 *
 * Never import this from client components.
 */
export function createServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // ⚠️ `cache: 'no-store'` NON e' una precauzione: senza, Next mette le
      // GET di supabase-js nel suo Data Cache e le riserve **per sempre**.
      //
      // Come si e' visto: `/api/v1/cantieri` rispondeva 197 cantieri e 7
      // collegati mentre il database ne aveva 254 e 243, e `/api/v1/info`
      // dichiarava `collaudoEsterni: []` con `["26087"]` scritto in tabella.
      // Il codice era quello nuovo — erano i DATI a essere congelati a giorni
      // prima. Su un'API che un gestionale legge per scrivere ore e spese,
      // servire una fotografia vecchia e' peggio di non rispondere.
      //
      // Va messo qui e non nelle singole rotte: `dynamic = 'force-dynamic'`
      // riguarda il rendering, e affidarsi a quello vuol dire che la prima
      // rotta che se lo dimentica torna a servire il passato in silenzio.
      // Un client service-role chiede sempre lo stato di adesso, per
      // definizione.
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  });
}
