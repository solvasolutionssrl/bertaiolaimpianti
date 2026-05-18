-- =====================================================================
-- 20260101002400_fix_current_role.sql
-- BUG FIX: la function `public.current_role()` originale faceva COALESCE
-- partendo dal claim JWT top-level `role`, che Supabase popola sempre
-- con il valore 'authenticated' per gli utenti loggati. Il cast a
-- `app_role` enum fallisce (valori validi: owner|admin|office|capo|
-- tecnico|cliente). Conseguenza: qualunque RLS policy che usa
-- `current_role()` rompe la query con
-- "invalid input value for enum app_role: \"authenticated\"".
--
-- Fix: leggi SOLO da `app_metadata.role` (dove il trigger
-- `sync_user_claims` scrive il vero ruolo applicativo). Niente
-- fallback al top-level role.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    (auth.jwt() -> 'app_metadata' ->> 'role'),
    ''
  )::public.app_role;
$$;

COMMENT ON FUNCTION public.current_role() IS
  'Ritorna il ruolo applicativo (app_role) dell''utente corrente leggendo SOLO da auth.jwt()->app_metadata->>role. NON usa il claim top-level "role" che è sempre "authenticated" e farebbe fallire il cast all''enum.';
