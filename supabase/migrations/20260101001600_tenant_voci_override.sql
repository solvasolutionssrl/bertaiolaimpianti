-- =====================================================================
-- 20260101001600_tenant_voci_override.sql
-- Override per-tenant sulle 38 voci globali di `voci_catalogo`.
--
-- `voci_catalogo` resta globale read-only (seed condiviso). Ogni tenant
-- può però personalizzare il nome visualizzato, il minimo foto richieste
-- e abilitare/disabilitare la voce per le proprie commesse.
--
-- L'app legge la voce risolvendo: COALESCE(override.nome_override, voce.nome).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.tenant_voci_override (
  tenant_id                  uuid     NOT NULL REFERENCES public.tenants(id)        ON DELETE CASCADE,
  voce_id                    smallint NOT NULL REFERENCES public.voci_catalogo(id)  ON DELETE CASCADE,
  nome_override              text,
  min_foto_richieste_override integer CHECK (min_foto_richieste_override IS NULL OR min_foto_richieste_override >= 0),
  attiva                     boolean  NOT NULL DEFAULT true,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, voce_id)
);

CREATE INDEX IF NOT EXISTS tenant_voci_override_tenant_idx
  ON public.tenant_voci_override(tenant_id);

COMMENT ON TABLE public.tenant_voci_override IS
  'Override per-tenant sulle 38 voci globali di voci_catalogo (testo, min foto, attiva).';

-- Trigger updated_at riusa tg_set_updated_at() definita in tenants migration
DROP TRIGGER IF EXISTS trg_tenant_voci_override_updated_at ON public.tenant_voci_override;
CREATE TRIGGER trg_tenant_voci_override_updated_at
  BEFORE UPDATE ON public.tenant_voci_override
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ----- RLS scope tenant --------------------------------------------------
ALTER TABLE public.tenant_voci_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_voci_override FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_voci_override_read   ON public.tenant_voci_override;
DROP POLICY IF EXISTS tenant_voci_override_write  ON public.tenant_voci_override;

-- READ: chiunque autenticato del tenant può leggere gli override
CREATE POLICY tenant_voci_override_read ON public.tenant_voci_override
  FOR SELECT
  USING (tenant_id = public.current_tenant_id());

-- WRITE: solo owner/admin del tenant possono modificare il catalogo
CREATE POLICY tenant_voci_override_write ON public.tenant_voci_override
  FOR ALL
  USING (tenant_id = public.current_tenant_id()
         AND public.current_role() IN ('owner','admin'))
  WITH CHECK (tenant_id = public.current_tenant_id()
              AND public.current_role() IN ('owner','admin'));
