-- =====================================================================
-- HARDENING — funzioni SECURITY DEFINER eseguibili da anon via PostgREST
-- =====================================================================
-- Data: 2026-07-10
--
-- Il linter Supabase (0028/0029) segnalava molte funzioni SECURITY DEFINER
-- con EXECUTE a PUBLIC/anon: chiunque avesse la anon key (pubblica, nel
-- bundle browser) poteva chiamarle via /rest/v1/rpc/... Alcune sono interne/
-- distruttive (purge, trigger, refresh, sync claims). Le mettiamo in sicurezza
-- lasciando l'esecuzione solo dove serve.
--
-- Analisi caller:
--  - cron (purge-bozze/cestino) usa il SERVICE ROLE / pg_cron → resta ok.
--  - genera_codice_commessa è chiamata anche da server action AUTHENTICATED
--    (tickets.ts) → si tiene `authenticated`, si toglie solo anon/PUBLIC.
--  - genera_numero_bozza / next_voce_custom_id → si tiene authenticated
--    (creazione bozze / default), si toglie anon/PUBLIC.
--  - aggiorna_usage_snapshot → chiamata solo dal SERVICE ROLE → via anche authenticated.
--  - dipendente_del_utente / sono_capo_di NON toccate: servono alla RLS
--    (già non esposte ad anon).
-- I trigger e pg_cron NON dipendono da questi grant (girano come definer/owner).
-- =====================================================================

-- Gruppo A — funzioni interne (cron/trigger/manutenzione): solo service_role + owner
revoke execute on function public.purge_bozze_scadute(integer)        from public, anon, authenticated;
revoke execute on function public.trigger_bozze_purge(integer)        from public, anon, authenticated;
revoke execute on function public.trigger_cestino_purge(integer)      from public, anon, authenticated;
revoke execute on function public.trigger_nextcloud_sync(integer)     from public, anon, authenticated;
revoke execute on function public.refresh_search_documents()          from public, anon, authenticated;
revoke execute on function public.rls_auto_enable()                   from public, anon, authenticated;
revoke execute on function public.sync_user_claims()                  from public, anon, authenticated;
revoke execute on function public.sync_external_user_claims()         from public, anon, authenticated;
revoke execute on function public.aggiorna_usage_snapshot(uuid)       from public, anon, authenticated;

-- Gruppo B — usate da server action AUTHENTICATED: si toglie solo anon/PUBLIC
revoke execute on function public.genera_codice_commessa(public.citext, smallint) from public, anon;
revoke execute on function public.genera_numero_bozza(uuid)           from public, anon;
revoke execute on function public.next_voce_custom_id()               from public, anon;

-- Materialized view `search_documents`: esposta via PostgREST ad anon/authenticated
-- e SENZA RLS (le mat view non la supportano) → un utente autenticato poteva
-- leggerne l'indice cross-tenant (codici/label/testi di commesse di altri tenant).
-- Non è usata dal codice applicativo (la ricerca /office/cerca interroga le tabelle
-- dirette) → si revoca l'accesso diretto dai ruoli API. Il refresh interno
-- (refresh_search_documents, SECURITY DEFINER) continua a funzionare.
revoke select on public.search_documents from anon, authenticated;

-- Rollback (riferimento):
--   grant execute on function ... to anon, authenticated;
--   grant select on public.search_documents to anon, authenticated;
