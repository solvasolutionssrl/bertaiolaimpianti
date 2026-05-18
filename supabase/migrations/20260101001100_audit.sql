-- =====================================================================
-- 20260101001100_audit.sql
-- Audit events: chi, cosa, quando, before/after.
-- Insert-only via RLS (vedi 20260101001300_rls.sql).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.audit_events (
  id           uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role   public.app_role,
  entity_type  text NOT NULL,                              -- es. "commessa", "ticket", "file_ref"
  entity_id    text NOT NULL,                              -- testo per consentire id non-uuid (es. codice_interno)
  action       text NOT NULL,                              -- es. "create", "update", "delete", "status_change"
  before_data  jsonb,
  after_data   jsonb,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_tenant_created_idx
  ON public.audit_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_entity_idx
  ON public.audit_events(tenant_id, entity_type, entity_id);

COMMENT ON TABLE public.audit_events IS 'Audit log immutabile (insert-only via RLS). Conservato per GDPR / contenziosi.';
