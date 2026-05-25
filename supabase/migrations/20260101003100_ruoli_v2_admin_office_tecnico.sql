-- =====================================================================
-- 20260101003100_ruoli_v2_admin_office_tecnico.sql
-- Semplificazione ruoli applicativi:
--   owner  → admin   (boss azienda = admin del tenant)
--   capo   → tecnico (eliminato come ruolo a sé)
--
-- Strategia pragmatica: NON rimuoviamo i valori 'owner' e 'capo'
-- dall'enum app_role (Postgres non lo permette senza riscrivere
-- decine di funzioni, policy RLS e viste che dipendono dal type).
-- Lasciamo i valori "dormienti" nell'enum: nessuna nuova riga li userà
-- più, il codice applicativo non li produce. Sono semanticamente
-- deprecati ma fisicamente compatibili.
--
-- Cosa fa effettivamente questa migration:
--   1) UPDATE users.role:        owner → admin, capo → tecnico
--   2) UPDATE audit_events:      idem per coerenza storica del log
--   3) Aggiorna role_default_permissions per non distinguere
--      owner/capo (rimangono come alias di admin/tecnico ai fini
--      dei permessi di default, retro-compatibili).
-- =====================================================================

-- 1) Migrazione valori esistenti --------------------------------------
UPDATE public.users
   SET role = 'admin'::public.app_role
 WHERE role = 'owner'::public.app_role;

UPDATE public.users
   SET role = 'tecnico'::public.app_role
 WHERE role = 'capo'::public.app_role;

UPDATE public.audit_events
   SET actor_role = 'admin'::public.app_role
 WHERE actor_role = 'owner'::public.app_role;

UPDATE public.audit_events
   SET actor_role = 'tecnico'::public.app_role
 WHERE actor_role = 'capo'::public.app_role;

-- 2) Aggiorna role_default_permissions (idempotente) -----------------
-- Mantiene la firma e accetta tutti i valori enum (compresi i
-- deprecati owner/capo che fungono da alias per retro-compatibilità).
CREATE OR REPLACE FUNCTION public.role_default_permissions(p_role public.app_role)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_role
    -- 'owner' deprecato → comportamento identico a 'admin'
    WHEN 'owner' THEN jsonb_build_object(
      'commesse',    'full',
      'clienti',     'full',
      'ticket',      'full',
      'turni',       'approve',
      'documenti',   'full',
      'utenti',      'full',
      'statistiche', 'export'
    )
    WHEN 'admin' THEN jsonb_build_object(
      'commesse',    'full',
      'clienti',     'full',
      'ticket',      'full',
      'turni',       'approve',
      'documenti',   'full',
      'utenti',      'full',
      'statistiche', 'export'
    )
    WHEN 'office' THEN jsonb_build_object(
      'commesse',    'edit',
      'clienti',     'edit',
      'ticket',      'create',
      'turni',       'own',
      'documenti',   'upload',
      'utenti',      'none',
      'statistiche', 'aggregati'
    )
    -- 'capo' deprecato → comportamento identico a 'tecnico'
    WHEN 'capo' THEN jsonb_build_object(
      'commesse',    'view',
      'clienti',     'none',
      'ticket',      'none',
      'turni',       'own',
      'documenti',   'view',
      'utenti',      'none',
      'statistiche', 'none'
    )
    WHEN 'tecnico' THEN jsonb_build_object(
      'commesse',    'view',
      'clienti',     'none',
      'ticket',      'none',
      'turni',       'own',
      'documenti',   'view',
      'utenti',      'none',
      'statistiche', 'none'
    )
    WHEN 'cliente' THEN jsonb_build_object(
      'commesse',    'none',
      'clienti',     'none',
      'ticket',      'none',
      'turni',       'none',
      'documenti',   'none',
      'utenti',      'none',
      'statistiche', 'none'
    )
    ELSE jsonb_build_object(
      'commesse',    'none',
      'clienti',     'none',
      'ticket',      'none',
      'turni',       'none',
      'documenti',   'none',
      'utenti',      'none',
      'statistiche', 'none'
    )
  END;
$$;

COMMENT ON FUNCTION public.role_default_permissions(public.app_role) IS
  'Permessi default per ruolo. owner/capo sono valori enum deprecati: trattati come alias di admin/tecnico per retro-compatibilità.';

COMMENT ON TYPE public.app_role IS
  'Ruoli applicativi. Valori attivi: admin, office, tecnico, cliente. Valori deprecati: owner (=admin), capo (=tecnico). Il super_admin SOLVA è separato (users.is_platform_admin).';
