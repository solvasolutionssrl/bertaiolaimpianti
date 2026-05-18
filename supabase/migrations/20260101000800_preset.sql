-- =====================================================================
-- 20260101000800_preset.sql
-- Preset di lavoro per-tenant (es. "Caldaia", "Bagno completo").
-- Tassonomia_Lavori.md §5 e §6: tenant parte senza preset; li accumula.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.preset (
  id              uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome            text NOT NULL,
  descrizione     text,
  voci_default    smallint[] NOT NULL DEFAULT '{}',     -- ids da voci_catalogo
  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nome)
);

CREATE INDEX IF NOT EXISTS preset_tenant_idx ON public.preset(tenant_id);

DROP TRIGGER IF EXISTS trg_preset_updated_at ON public.preset;
CREATE TRIGGER trg_preset_updated_at
  BEFORE UPDATE ON public.preset
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Aggiungi la FK posticipata su commesse.preset_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commesse_preset_id_fkey'
  ) THEN
    ALTER TABLE public.commesse
      ADD CONSTRAINT commesse_preset_id_fkey
      FOREIGN KEY (preset_id) REFERENCES public.preset(id) ON DELETE SET NULL;
  END IF;
END$$;

COMMENT ON TABLE public.preset IS 'Combinazioni di voci salvate dal tenant per accelerare la creazione di commesse simili.';
