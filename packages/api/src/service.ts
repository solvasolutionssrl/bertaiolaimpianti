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
  });
}
