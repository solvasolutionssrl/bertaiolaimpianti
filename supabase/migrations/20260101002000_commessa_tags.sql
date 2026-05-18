-- =====================================================================
-- 20260101002000_commessa_tags.sql
-- Tag liberi su commesse. Stringhe arbitrarie (es. "urgente", "garanzia",
-- "bonus_110", "cliente_top") per categorizzazione trasversale.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.commessa_tags (
  commessa_id  uuid NOT NULL REFERENCES public.commesse(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tag          text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  PRIMARY KEY (commessa_id, tag),
  CHECK (length(tag) BETWEEN 1 AND 40),
  CHECK (tag = lower(tag))   -- normalizzati lowercase, evita duplicati case
);

CREATE INDEX IF NOT EXISTS commessa_tags_tenant_tag_idx
  ON public.commessa_tags (tenant_id, tag);

CREATE INDEX IF NOT EXISTS commessa_tags_tag_trgm_idx
  ON public.commessa_tags USING gin (tag extensions.gin_trgm_ops);

ALTER TABLE public.commessa_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commessa_tags_tenant_scope ON public.commessa_tags;
CREATE POLICY commessa_tags_tenant_scope ON public.commessa_tags
  FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS commessa_tags_platform_admin_read ON public.commessa_tags;
CREATE POLICY commessa_tags_platform_admin_read ON public.commessa_tags
  FOR SELECT
  USING (public.is_platform_admin());

-- View dei tag univoci per tenant con conteggio (per autocomplete)
CREATE OR REPLACE VIEW public.tenant_tags_summary AS
SELECT
  tenant_id,
  tag,
  count(*)::int AS usage_count,
  max(created_at) AS ultimo_uso
FROM public.commessa_tags
GROUP BY tenant_id, tag;

ALTER VIEW public.tenant_tags_summary SET (security_invoker = true);

COMMENT ON TABLE public.commessa_tags IS
  'Tag liberi per categorizzazione trasversale delle commesse (orthogonale alle voci catalogo).';
