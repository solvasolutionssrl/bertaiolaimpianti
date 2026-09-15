-- Sicurezza: privilegi su utenti, tenant e funzioni (audit del 15/09/2026)
--
-- 1. users: un utente non può cambiarsi ruolo, permessi o tenant, e nessuno
--    dall'app può dare i poteri di piattaforma. Prima bastava una PATCH sulla
--    propria riga ({"role":"admin","is_platform_admin":true}) e il trigger dei
--    claims copiava il flag nel JWT: accesso a /admin e a tutti i tenant.
--    Le modifiche lecite dell'app restano: nome, avatar, orari di silenzio,
--    onboarding sulla propria riga; ruolo, attivo e permessi degli altri per
--    owner/admin (la policy users_admin_manage resta com'è).
-- 2. external_users: chi non è service role non può trasformare in cliente
--    esterno un account interno o di un altro tenant (il trigger dei claims
--    riscriveva tenant e ruolo di qualunque id), né cambiarsi tenant o cliente.
-- 3. Funzioni dei cron chiamabili da anon: tolto EXECUTE.
-- 4. Contatori di codice commessa e numero bozza: solo per il proprio tenant.
-- 5. tenants: dall'app si aggiornano solo le colonne che l'ufficio gestisce
--    (branding e storage); sospensione, piano, app_mode, funzioni, codici
--    restano al super admin (service role).
-- 6. voci_catalogo: tolta la lettura di tutte le voci di tutti i tenant.
-- 7. Irrobustimento: niente TRUNCATE/TRIGGER/REFERENCES per anon e authenticated.

-- ── 1. users ────────────────────────────────────────────────────────────────

create or replace function public.users_proteggi_privilegi()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Service role, migrazioni, cron e Auth: nessun limite.
  if current_user in ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role')
     or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Non consentito: gli utenti si creano dal server'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id
     or new.tenant_id is distinct from old.tenant_id
     or new.is_platform_admin is distinct from old.is_platform_admin then
    raise exception 'Non consentito: identità, tenant e poteri di piattaforma non si cambiano dall''app'
      using errcode = '42501';
  end if;

  if new.id = auth.uid() and (
       new.role is distinct from old.role
       or new.permissions is distinct from old.permissions
       or new.attivo is distinct from old.attivo
       or new.puo_approvare_permessi is distinct from old.puo_approvare_permessi) then
    raise exception 'Non consentito: ruolo e permessi li cambia un amministratore'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_users_proteggi_privilegi on public.users;
create trigger trg_users_proteggi_privilegi
  before insert or update on public.users
  for each row execute function public.users_proteggi_privilegi();

-- Il flag di piattaforma deve arrivare nei claims anche quando cambia da solo.
drop trigger if exists trg_users_sync_claims on public.users;
create trigger trg_users_sync_claims
  after insert or update of tenant_id, role, is_platform_admin on public.users
  for each row execute function public.sync_user_claims();

alter function public.sync_user_claims() set search_path = public;

revoke insert, update, delete on public.users from anon;

-- ── 2. external_users ───────────────────────────────────────────────────────

drop policy if exists external_users_staff_read on public.external_users;
create policy external_users_staff_read on public.external_users
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() = any (array['owner', 'admin', 'office', 'capo']::public.app_role[])
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() = any (array['owner', 'admin', 'office', 'capo']::public.app_role[])
  );

create or replace function public.sync_external_user_claims()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tenant_slug citext;
  -- Senza JWT (migrazioni, cron, Auth) o con la service role: fidato.
  v_fidato boolean := coalesce(auth.role(), 'service_role') = 'service_role';
begin
  if not v_fidato then
    if tg_op = 'UPDATE' then
      raise exception 'Non consentito: tenant e cliente di un utente esterno li cambia il server'
        using errcode = '42501';
    end if;
    if exists (select 1 from public.users u where u.id = new.id)
       or exists (
         select 1 from auth.users au
          where au.id = new.id
            and coalesce(au.raw_app_meta_data ->> 'tenant_id', '') not in ('', new.tenant_id::text)
       ) then
      raise exception 'Non consentito: questo account appartiene già a un utente'
        using errcode = '42501';
    end if;
  end if;

  select slug into v_tenant_slug from public.tenants where id = new.tenant_id;

  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                             || jsonb_build_object(
                               'tenant_id',   new.tenant_id::text,
                               'tenant_slug', v_tenant_slug::text,
                               'role',        'cliente',
                               'external',    true,
                               'cliente_id',  new.cliente_id::text
                             )
   where id = new.id;

  return new;
end;
$$;

-- ── 3. Funzioni dei cron ────────────────────────────────────────────────────

revoke execute on function public.trigger_purge_upload_morti(integer) from public, anon, authenticated;
revoke execute on function public.trigger_integrazioni_salute() from public, anon, authenticated;

-- ── 4. Contatori per tenant ─────────────────────────────────────────────────

create or replace function public.genera_codice_commessa(p_tenant_slug citext, p_anno smallint default null::smallint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_anno_short smallint;
  v_num integer;
begin
  select id into v_tenant_id from public.tenants where slug = p_tenant_slug;

  -- Dall'app solo il proprio tenant (la service role può tutto).
  if coalesce(auth.role(), 'service_role') <> 'service_role'
     and (v_tenant_id is null or v_tenant_id is distinct from public.current_tenant_id()) then
    raise exception 'Non consentito' using errcode = '42501';
  end if;

  if v_tenant_id is null then
    raise exception 'Tenant slug % non trovato', p_tenant_slug;
  end if;

  v_anno_short := coalesce(p_anno, extract(year from current_date)::int % 100);

  insert into public.commessa_counter (tenant_id, anno, ultimo_num)
       values (v_tenant_id, v_anno_short, 1)
  on conflict (tenant_id, anno)
       do update set ultimo_num = public.commessa_counter.ultimo_num + 1
  returning ultimo_num into v_num;

  return upper(p_tenant_slug::text) || '-' || lpad(v_anno_short::text, 2, '0') || '-' || lpad(v_num::text, 3, '0');
end;
$$;

create or replace function public.genera_numero_bozza(p_tenant_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num integer;
begin
  if coalesce(auth.role(), 'service_role') <> 'service_role'
     and p_tenant_id is distinct from public.current_tenant_id() then
    raise exception 'Non consentito' using errcode = '42501';
  end if;

  insert into public.bozza_counter (tenant_id, ultimo_num)
       values (p_tenant_id, 1)
  on conflict (tenant_id)
       do update set ultimo_num = public.bozza_counter.ultimo_num + 1
  returning ultimo_num into v_num;
  return v_num;
end;
$$;

-- ── 5. tenants ──────────────────────────────────────────────────────────────

revoke insert, update, delete on public.tenants from anon, authenticated;
-- Le sole colonne che l'ufficio aggiorna con la propria sessione:
-- branding (branding.ts) e storage (storage.ts). La policy tenants_update_own
-- continua a limitarle a owner/admin del proprio tenant.
grant update (nome, brand_color, logo_url, inbound_email, storage_provider, storage_config)
  on public.tenants to authenticated;

-- ── 6. voci_catalogo ────────────────────────────────────────────────────────

-- voci_catalogo_read copre già le voci globali e quelle del proprio tenant.
drop policy if exists voci_catalogo_read_all on public.voci_catalogo;

-- ── 7. Irrobustimento ───────────────────────────────────────────────────────

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
