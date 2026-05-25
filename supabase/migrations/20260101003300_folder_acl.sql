-- =====================================================================
-- 20260101003300_folder_acl.sql
-- Layer permessi cartelle/file per commessa.
--
-- Due tabelle:
--   folder_presets             — template tenant-wide (default per ogni commessa)
--   commessa_folder_overrides  — eccezioni puntuali per singola commessa
--
-- Modello: visible_roles / upload_roles come array di app_role.
-- Risoluzione: prima override (se commessa_id+path match), poi preset
-- tenant, poi deny-by-default {admin, office}.
--
-- super_admin (is_platform_admin=true) bypassa il check lato app, non
-- è incluso negli array.
-- =====================================================================

-- ─── folder_presets (template tenant-wide) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.folder_presets (
  id              uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  path            text NOT NULL,            -- relativo alla root commessa, es. "Foto", "Documenti/POS"
  label           text NOT NULL,
  ordine          smallint NOT NULL DEFAULT 100,
  visible_roles   public.app_role[] NOT NULL DEFAULT ARRAY['admin','office']::public.app_role[],
  upload_roles    public.app_role[] NOT NULL DEFAULT ARRAY['admin','office']::public.app_role[],
  is_system       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, path)
);

CREATE INDEX IF NOT EXISTS folder_presets_tenant_idx
  ON public.folder_presets(tenant_id);

COMMENT ON TABLE public.folder_presets IS
  'Template per tenant: definisce quali ruoli vedono/uploadano in ciascuna sottocartella standard di una commessa. visible_roles vuoto = solo admin (deny by default).';
COMMENT ON COLUMN public.folder_presets.path IS
  'Path relativo alla root commessa: es. "Foto", "Documenti/POS", "Preventivi". Senza slash iniziale/finale.';

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_folder_presets_updated_at ON public.folder_presets;
CREATE TRIGGER trg_folder_presets_updated_at
  BEFORE UPDATE ON public.folder_presets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ─── commessa_folder_overrides ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commessa_folder_overrides (
  id              uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  commessa_id     uuid NOT NULL REFERENCES public.commesse(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  path            text NOT NULL,
  visible_roles   public.app_role[],        -- NULL = eredita dal preset
  upload_roles    public.app_role[],        -- NULL = eredita dal preset
  custom_label    text,                     -- per cartelle custom create dall'admin
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (commessa_id, path)
);

CREATE INDEX IF NOT EXISTS commessa_folder_overrides_commessa_idx
  ON public.commessa_folder_overrides(commessa_id);
CREATE INDEX IF NOT EXISTS commessa_folder_overrides_tenant_idx
  ON public.commessa_folder_overrides(tenant_id);

DROP TRIGGER IF EXISTS trg_commessa_folder_overrides_updated_at ON public.commessa_folder_overrides;
CREATE TRIGGER trg_commessa_folder_overrides_updated_at
  BEFORE UPDATE ON public.commessa_folder_overrides
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.folder_presets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commessa_folder_overrides  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS folder_presets_read  ON public.folder_presets;
DROP POLICY IF EXISTS folder_presets_write ON public.folder_presets;

CREATE POLICY folder_presets_read ON public.folder_presets
  FOR SELECT
  USING (tenant_id = public.current_tenant_id());

CREATE POLICY folder_presets_write ON public.folder_presets
  FOR ALL
  USING (
    tenant_id = public.current_tenant_id()
    AND public.current_role() = 'admin'::public.app_role
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_role() = 'admin'::public.app_role
  );

DROP POLICY IF EXISTS commessa_folder_overrides_read  ON public.commessa_folder_overrides;
DROP POLICY IF EXISTS commessa_folder_overrides_write ON public.commessa_folder_overrides;

CREATE POLICY commessa_folder_overrides_read ON public.commessa_folder_overrides
  FOR SELECT
  USING (tenant_id = public.current_tenant_id());

CREATE POLICY commessa_folder_overrides_write ON public.commessa_folder_overrides
  FOR ALL
  USING (
    tenant_id = public.current_tenant_id()
    AND public.current_role() IN ('admin'::public.app_role, 'office'::public.app_role)
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_role() IN ('admin'::public.app_role, 'office'::public.app_role)
  );

-- ─── Seed presets di default per tutti i tenant esistenti ──────────────
-- Idempotente: ON CONFLICT skip.
INSERT INTO public.folder_presets (tenant_id, path, label, ordine, visible_roles, upload_roles)
SELECT t.id, p.path, p.label, p.ordine, p.visible_roles::public.app_role[], p.upload_roles::public.app_role[]
FROM public.tenants t
CROSS JOIN (VALUES
  ('Preventivi',              'Preventivi e offerte',     10,  ARRAY['admin','office'],            ARRAY['admin','office']),
  ('Schemi',                  'Schemi tecnici',           20,  ARRAY['admin','office','tecnico'],  ARRAY['admin','office']),
  ('Foto/Sopralluogo',        'Foto sopralluogo',         30,  ARRAY['admin','office','tecnico'],  ARRAY['admin','office','tecnico']),
  ('Foto/In corso',           'Foto in corso',            31,  ARRAY['admin','office','tecnico'],  ARRAY['admin','office','tecnico']),
  ('Foto/Finali',             'Foto finali',              32,  ARRAY['admin','office','tecnico','cliente'], ARRAY['admin','office','tecnico']),
  ('Documenti/POS',           'POS — Piano sicurezza',    40,  ARRAY['admin','office'],            ARRAY['admin','office']),
  ('Documenti/Cartellone',    'Cartellone cantiere',      41,  ARRAY['admin','office','tecnico'],  ARRAY['admin','office']),
  ('Documenti/DICO',          'DICO',                     42,  ARRAY['admin','office','tecnico','cliente'], ARRAY['admin','office']),
  ('Documenti/Cassette_DPI',  'Cassette DPI',             43,  ARRAY['admin','office'],            ARRAY['admin','office']),
  ('Documenti/Certificazioni','Certificazioni',           44,  ARRAY['admin','office','tecnico','cliente'], ARRAY['admin','office']),
  ('Materiali',               'Materiali',                50,  ARRAY['admin','office','tecnico'],  ARRAY['admin','office']),
  ('Chiusura',                'Chiusura cantiere',        60,  ARRAY['admin','office','tecnico','cliente'], ARRAY['admin','office'])
) AS p(path, label, ordine, visible_roles, upload_roles)
ON CONFLICT (tenant_id, path) DO NOTHING;
