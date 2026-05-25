-- =====================================================================
-- 20260101003700_tenant_alert_settings.sql
--
-- Configurazione per-tenant degli "avvisi" (alert computati on-the-fly
-- dai dati). Il sistema calcola alert tipici di gestione cantiere
-- (commessa ferma, foto sopralluogo mancanti, TODO scaduti, ecc.) e
-- li mostra nella tab Avvisi + dashboard. Ogni tenant può
-- attivare/disattivare singole categorie e regolare la soglia (in
-- giorni).
--
-- Pattern "missing row = default enabled with default threshold":
-- non serve inserire una riga seed per ogni tenant — il calcolo lato
-- applicativo legge la riga e cade sui default se assente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.tenant_alert_settings (
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  alert_type     text NOT NULL,
  enabled        boolean NOT NULL DEFAULT true,
  threshold_days integer,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  PRIMARY KEY (tenant_id, alert_type),
  CHECK (threshold_days IS NULL OR threshold_days BETWEEN 0 AND 365),
  CHECK (alert_type IN (
    'commessa_ferma',
    'sopralluogo_no_foto',
    'todo_scaduti',
    'todo_urgenti_non_assegnati',
    'dico_scadenza',
    'fasi_in_attesa'
  ))
);

CREATE INDEX IF NOT EXISTS tenant_alert_settings_tenant_idx
  ON public.tenant_alert_settings(tenant_id);

COMMENT ON TABLE public.tenant_alert_settings IS
  'Toggle + soglia per gli avvisi computati. Riga mancante = enabled con default applicativo.';

ALTER TABLE public.tenant_alert_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_alert_settings_read ON public.tenant_alert_settings;
DROP POLICY IF EXISTS tenant_alert_settings_write ON public.tenant_alert_settings;

CREATE POLICY tenant_alert_settings_read ON public.tenant_alert_settings
  FOR SELECT
  USING (tenant_id = public.current_tenant_id());

-- Solo admin/office possono modificare la configurazione alert
CREATE POLICY tenant_alert_settings_write ON public.tenant_alert_settings
  FOR ALL
  USING (
    tenant_id = public.current_tenant_id()
    AND public.current_role() IN ('admin'::public.app_role, 'office'::public.app_role)
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_role() IN ('admin'::public.app_role, 'office'::public.app_role)
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tenant_alert_settings_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tenant_alert_settings_touch_trg ON public.tenant_alert_settings;
CREATE TRIGGER tenant_alert_settings_touch_trg
  BEFORE UPDATE ON public.tenant_alert_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.tenant_alert_settings_touch();
