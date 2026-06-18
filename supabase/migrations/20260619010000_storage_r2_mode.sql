-- =====================================================================
-- 20260619010000_storage_r2_mode.sql
--
-- Fase B modulo Kantiere: storage solo-R2 per tenant.
--
-- 1) Aggiunge 'r2' all'enum storage_provider_name (R2 diventa provider di
--    prima classe, via adapter R2FileStorageProvider lato codice).
-- 2) Aggiunge tenants.crea_cartelle (default true): se false, la creazione
--    commessa/voci NON crea lo scaffold cartelle (tenant solo-R2).
--
-- Additivo e non distruttivo: Bertaiola resta 'nextcloud' + crea_cartelle=true.
-- Il nuovo valore enum NON viene usato in questa stessa migration.
-- =====================================================================

alter type public.storage_provider_name add value if not exists 'r2';

alter table public.tenants
  add column if not exists crea_cartelle boolean not null default true;

comment on column public.tenants.crea_cartelle is
  'Se false, creazione commessa/voci NON crea cartelle (tenant solo-R2 senza scaffold). Default true.';
