-- =====================================================================
-- 20260101003200_commessa_tecnici.sql
-- Tabella di assegnazione: quali tecnici lavorano su quale commessa.
-- N:M tra commesse e users.
--
-- RLS:
--   - read: tutti i membri del tenant
--   - write: solo admin/office del tenant
--
-- Effetto sulla RLS di `commesse`: la policy resta tenant_scoped (tutti
-- gli utenti del tenant POTREBBERO leggere tutte le commesse via RLS
-- diretta) ma il filtro applicativo per tecnico vive lato backend nelle
-- query (es. mobile/page.tsx, mobile/commesse/page.tsx) — più flessibile
-- delle policy SQL e gestisce anche "ufficio" che deve vedere tutto.
--
-- I `super_admin` (is_platform_admin=true) bypassano sia RLS sia il
-- filtro applicativo: vedono ogni commessa di ogni tenant.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.commessa_tecnici (
  commessa_id   uuid NOT NULL REFERENCES public.commesse(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.users(id)    ON DELETE CASCADE,
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  assegnato_da  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  assegnato_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (commessa_id, user_id)
);

CREATE INDEX IF NOT EXISTS commessa_tecnici_user_idx
  ON public.commessa_tecnici(user_id);
CREATE INDEX IF NOT EXISTS commessa_tecnici_tenant_idx
  ON public.commessa_tecnici(tenant_id);

COMMENT ON TABLE public.commessa_tecnici IS
  'Assegnazione tecnici N:M alle commesse. Usata dal filtro applicativo per limitare la vista del tecnico alle sole commesse assegnate.';

-- RLS ------------------------------------------------------------------
ALTER TABLE public.commessa_tecnici ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commessa_tecnici_read  ON public.commessa_tecnici;
DROP POLICY IF EXISTS commessa_tecnici_write ON public.commessa_tecnici;

CREATE POLICY commessa_tecnici_read ON public.commessa_tecnici
  FOR SELECT
  USING (tenant_id = public.current_tenant_id());

CREATE POLICY commessa_tecnici_write ON public.commessa_tecnici
  FOR ALL
  USING (
    tenant_id = public.current_tenant_id()
    AND public.current_role() IN ('admin'::public.app_role, 'office'::public.app_role)
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_role() IN ('admin'::public.app_role, 'office'::public.app_role)
  );

-- Helper: lista commessa_id assegnate al user corrente (usato dal filtro)
CREATE OR REPLACE FUNCTION public.commesse_assegnate_a_me()
RETURNS TABLE (commessa_id uuid)
LANGUAGE sql
STABLE
AS $$
  SELECT ct.commessa_id
  FROM public.commessa_tecnici ct
  WHERE ct.user_id = auth.uid()
    AND ct.tenant_id = public.current_tenant_id();
$$;

COMMENT ON FUNCTION public.commesse_assegnate_a_me() IS
  'Utility helper: ritorna le commesse del tenant assegnate all utente loggato. Usata dai filter applicativi lato Next.';
