-- =====================================================================
-- 20260101001200_external_users.sql
-- Utenti esterni (clienti finali) per il portale cliente, separati da
-- `users` (staff del tenant). Accesso via magic-link su Supabase Auth.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.external_users (
  id                 uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cliente_id         uuid NOT NULL REFERENCES public.clienti(id) ON DELETE CASCADE,
  email              citext NOT NULL,
  display_name       text,
  attivo             boolean NOT NULL DEFAULT true,
  last_login_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS external_users_tenant_idx    ON public.external_users(tenant_id);
CREATE INDEX IF NOT EXISTS external_users_cliente_idx   ON public.external_users(cliente_id);

DROP TRIGGER IF EXISTS trg_external_users_updated_at ON public.external_users;
CREATE TRIGGER trg_external_users_updated_at
  BEFORE UPDATE ON public.external_users
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMENT ON TABLE public.external_users IS 'Account dei clienti finali per il portale. Magic-link auth. Vita parallela rispetto a public.users.';

-- ----- Sync claims per external_users (analoga a public.users) -----------
CREATE OR REPLACE FUNCTION public.sync_external_user_claims()
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
                               'role',        'cliente',
                               'external',    true,
                               'cliente_id',  NEW.cliente_id::text
                             )
   WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_external_users_sync_claims ON public.external_users;
CREATE TRIGGER trg_external_users_sync_claims
  AFTER INSERT OR UPDATE OF tenant_id, cliente_id ON public.external_users
  FOR EACH ROW EXECUTE FUNCTION public.sync_external_user_claims();
