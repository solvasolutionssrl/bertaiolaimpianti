-- =====================================================================
-- 20260101003800_folder_preset_riunioni.sql
--
-- Aggiunge il preset cartella "Riunioni" allo scaffold delle commesse
-- per tutti i tenant esistenti. Le riunioni sono cose di gestione
-- (organizzate da admin/office) ma i tecnici devono potersi accedere
-- per leggere i verbali, foto e PDF discussi. Quindi:
--   - visible: admin, office, tecnico
--   - upload:  admin, office  (i tecnici leggono ma non caricano nelle
--     riunioni — l'upload riunione è gestito da admin/office via il
--     dialog "Nuova riunione" dell'app)
--
-- Idempotente via ON CONFLICT DO NOTHING.
-- =====================================================================

INSERT INTO public.folder_presets (tenant_id, path, label, ordine, visible_roles, upload_roles)
SELECT
  t.id,
  'Riunioni',
  'Riunioni e verbali',
  55,
  ARRAY['admin','office','tecnico']::public.app_role[],
  ARRAY['admin','office']::public.app_role[]
FROM public.tenants t
ON CONFLICT (tenant_id, path) DO NOTHING;
