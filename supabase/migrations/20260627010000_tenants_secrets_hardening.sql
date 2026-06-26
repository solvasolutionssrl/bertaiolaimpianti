-- Hardening dei SEGRETI su public.tenants.
--
-- Problema: `storage_config` (credenziali Nextcloud: baseUrl/user/appPassword) e
-- `r2_config` (access_key_id/secret_access_key R2) sono segreti, ma la policy RLS
-- `tenants_select_own` rende l'INTERA riga del proprio tenant leggibile ai
-- membri. Un utente `authenticated`, con il solo anon key (pubblico nel bundle)
-- e il proprio JWT, poteva quindi esfiltrare quelle credenziali con un banale
-- `GET /rest/v1/tenants?select=storage_config`.
--
-- Fix a livello di PRIVILEGI DI COLONNA. In Postgres un GRANT SELECT a livello
-- TABELLA copre tutte le colonne e ha la meglio su una REVOKE di colonna: quindi
-- si revoca il SELECT di tabella per anon/authenticated e lo si ri-concede SOLO
-- sulle colonne NON sensibili. Le due colonne segrete restano leggibili solo dal
-- service role. L'app, infatti, le legge ESCLUSIVAMENTE via service role (tutte
-- le letture authenticated di storage_config/r2_config sono state convertite).
--
-- NON si tocca l'UPDATE: l'owner/admin continua a configurare il proprio storage
-- dalle Impostazioni (scrittura authenticated, senza RETURNING dei segreti).
--
-- ⚠️ MANUTENZIONE: aggiungendo in futuro una colonna NON segreta a `tenants`,
-- concederla in lettura ai ruoli applicativi, altrimenti i `select` la
-- rifiuteranno: `grant select (nuova_colonna) on public.tenants to anon, authenticated;`
-- (le colonne segrete, invece, NON vanno concesse).

revoke select on public.tenants from anon, authenticated;

-- Ri-concede SELECT su tutte le colonne correnti tranne i due segreti.
do $$
declare
  col text;
begin
  for col in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tenants'
      and column_name not in ('storage_config', 'r2_config')
  loop
    execute format('grant select (%I) on public.tenants to anon, authenticated', col);
  end loop;
end $$;

-- Il service role legge tutto (di norma ha già i privilegi: esplicito per sicurezza).
grant select on public.tenants to service_role;

-- Ricarica lo schema cache di PostgREST.
notify pgrst, 'reload schema';
