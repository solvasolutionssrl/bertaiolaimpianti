-- 20260629120000_tenant_features.sql
-- Override per-tenant della visibilità di FUNZIONI office, gestito dal super
-- admin (/admin/tenants/[id] → tab "Funzioni"). jsonb chiave→bool, es.
-- {"voci_catalogo": false}. Assenza chiave = default (derivato dall'app_mode).
-- NON è un segreto.

alter table public.tenants
  add column if not exists features jsonb not null default '{}'::jsonb;

-- Dopo l'hardening segreti (20260627010000) la SELECT di tabella è revocata e
-- ri-concessa per-colonna: `features` è NON sensibile → concedila esplicitamente
-- (le colonne segrete storage_config/r2_config restano revocate).
grant select (features) on public.tenants to anon, authenticated;

notify pgrst, 'reload schema';
