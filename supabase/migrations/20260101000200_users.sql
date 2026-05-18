-- =====================================================================
-- 20260101000200_users.sql
-- Tabella `users` (profilo applicativo) che estende auth.users di Supabase.
-- Include trigger per popolare i custom claims JWT (tenant_id, tenant_slug, role)
-- letti da RLS via auth.jwt().
-- =====================================================================

-- ----- Enum: ruolo applicativo ------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM (
      'owner',    -- super-admin del tenant
      'admin',    -- admin operativo
      'office',   -- ufficio / segreteria (web)
      'capo',     -- capo cantiere / responsabile (PWA + web)
      'tecnico',  -- tecnico in cantiere (PWA)
      'cliente'   -- cliente finale (portale; ma anagrafica primaria in external_users)
    );
  END IF;
END$$;

-- ----- Tabella users -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  role          public.app_role NOT NULL DEFAULT 'tecnico',
  display_name  text,
  avatar_url    text,
  attivo        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_tenant_id_idx ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS users_tenant_role_idx ON public.users(tenant_id, role) WHERE attivo;

COMMENT ON TABLE public.users IS 'Profilo applicativo dell utente autenticato. FK 1:1 con auth.users.';

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ----- Sync custom claims JWT -------------------------------------------
-- Quando viene creata/aggiornata una riga public.users, ricopiamo
-- tenant_id / tenant_slug / role dentro auth.users.raw_app_meta_data.
-- Supabase espone questi campi nel JWT (claim "app_metadata") e via
-- auth.jwt() -> 'app_metadata'. Per comodità RLS leggiamo direttamente
-- auth.jwt() ->> 'tenant_id' (Supabase hook custom_access_token può
-- promuoverli a top-level claims — configurato nelle Edge Functions).
CREATE OR REPLACE FUNCTION public.sync_user_claims()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_tenant_slug citext;
BEGIN
  SELECT slug INTO v_tenant_slug FROM public.tenants WHERE id = NEW.tenant_id;

  UPDATE auth.users
     SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
                             || jsonb_build_object(
                               'tenant_id',   NEW.tenant_id::text,
                               'tenant_slug', v_tenant_slug::text,
                               'role',        NEW.role::text
                             )
   WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_sync_claims ON public.users;
CREATE TRIGGER trg_users_sync_claims
  AFTER INSERT OR UPDATE OF tenant_id, role ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_claims();

-- ----- Helper RLS: tenant_id corrente dal JWT ----------------------------
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    COALESCE(
      (auth.jwt() ->> 'tenant_id'),
      (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
    ),
    ''
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    COALESCE(
      (auth.jwt() ->> 'role'),
      (auth.jwt() -> 'app_metadata' ->> 'role')
    ),
    ''
  )::public.app_role;
$$;

COMMENT ON FUNCTION public.current_tenant_id() IS 'Estrae tenant_id dal JWT corrente (top-level o app_metadata). NULL se anonimo.';
