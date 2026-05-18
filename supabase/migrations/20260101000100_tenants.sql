-- =====================================================================
-- 20260101000100_tenants.sql
-- Tabella `tenants` — anagrafica dei clienti SaaS multitenant.
-- Bertaiola è il primo tenant (slug = "BER", vedi seed.sql).
-- =====================================================================

-- ----- Enum: provider di storage cloud per il tenant ---------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'storage_provider_name') THEN
    CREATE TYPE public.storage_provider_name AS ENUM (
      'supabase',   -- Supabase Storage (default in dev e per tenant piccoli)
      'nextcloud'   -- Nextcloud su Hetzner Storage Share (proposta v2)
    );
  END IF;
END$$;

-- ----- Tabella tenants ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
  id                uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  slug              citext NOT NULL UNIQUE,           -- es. "BER" → usato in codice_interno commessa
  nome              text   NOT NULL,                  -- ragione sociale visibile
  brand_color       text,                              -- hex es. "#D97706"
  logo_url          text,                              -- URL public/CDN del logo
  plan              text   NOT NULL DEFAULT 'pilot',  -- pilot|base|pro|enterprise
  storage_provider  public.storage_provider_name NOT NULL DEFAULT 'supabase',
  storage_config    jsonb  NOT NULL DEFAULT '{}'::jsonb,  -- es. {"base_url":"...","bucket":"..."}
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.tenants IS 'Tenant SaaS: un record per cliente impiantiXplus. RLS scope universale via JWT custom claim tenant_id.';
COMMENT ON COLUMN public.tenants.slug IS 'Slug tecnico (uppercase preferito). Entra nel codice interno commessa: <SLUG>-<AA>-<NNN>.';
COMMENT ON COLUMN public.tenants.storage_config IS 'Configurazione provider: bucket Supabase, oppure base_url WebDAV + credenziali Nextcloud (referenziate da Vault).';

-- Trigger generico per updated_at -----------------------------------------
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_updated_at ON public.tenants;
CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
