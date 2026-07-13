-- =====================================================================
-- HOTFIX SICUREZZA — cross-tenant leak via VIEW senza security_invoker
-- =====================================================================
-- Data: 2026-07-10  ·  Gravità: ALTA (fuga di dati tra tenant)
--
-- PROBLEMA
-- Alcune view (owner = postgres) erano SECURITY DEFINER (default), cioè
-- valutavano la RLS delle tabelle sottostanti coi permessi del PROPRIETARIO
-- (postgres, che bypassa la RLS), NON del ruolo chiamante. Risultato:
-- qualsiasi utente autenticato che interrogava la view vedeva i dati di
-- TUTTI i tenant.
--
-- IMPATTO OSSERVATO
-- Il command-palette (ricerca ⌘K nell'office shell, condiviso anche dai
-- tenant Kantiere) interroga `commesse_con_cliente` dal browser → un utente
-- FPM (Kantiere) vedeva le commesse di Bertaiola. Simulazione RLS di un
-- admin FPM: 83 commesse viste via view (tutte di altri tenant), 0 via
-- tabella base `commesse` (la RLS della tabella funziona: il buco era solo
-- la view). Confermato anche dal linter Supabase (0010_security_definer_view).
--
-- FIX
-- `security_invoker = true` → la view valuta la RLS delle tabelle
-- sottostanti come l'utente CHIAMANTE. Gli utenti autenticati vengono così
-- filtrati per tenant (tenant_id = current_tenant_id()); il service_role
-- continua a bypassare la RLS (le funzioni interne restano invariate).
-- Migliora anche il portale: il JOIN su `commesse` applica
-- `commesse_cliente_scope`, così il cliente vede solo i file delle proprie
-- commesse.
--
-- `search_documents_scoped` filtrava già internamente con
-- `WHERE tenant_id = current_tenant_id()` (non perdeva), ma la includo per
-- azzerare l'advisor e per difesa in profondità.
-- =====================================================================

alter view public.commesse_con_cliente               set (security_invoker = true);
alter view public.portal_files_view                  set (security_invoker = true);
alter view public.users_with_permissions             set (security_invoker = true);
alter view public.notification_preferences_effective set (security_invoker = true);
alter view public.search_documents_scoped            set (security_invoker = true);

-- Rollback (NON eseguire, solo riferimento):
--   alter view public.commesse_con_cliente               set (security_invoker = false);
--   alter view public.portal_files_view                  set (security_invoker = false);
--   alter view public.users_with_permissions             set (security_invoker = false);
--   alter view public.notification_preferences_effective set (security_invoker = false);
--   alter view public.search_documents_scoped            set (security_invoker = false);
