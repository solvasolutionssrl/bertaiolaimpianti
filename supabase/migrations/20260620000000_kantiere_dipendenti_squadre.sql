-- =====================================================================
-- 20260620000000_kantiere_dipendenti_squadre.sql
-- Fase C modulo Kantiere: anagrafica dipendenti + squadre per-commessa.
-- Additivo. Visibile solo ai tenant col modulo kantiere attivo (gating app).
-- =====================================================================

-- ---------- dipendenti (anagrafica, login opzionale) -----------------
create table if not exists public.dipendenti (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  user_id        uuid references public.users(id) on delete set null,
  nome           text not null,
  cognome        text not null,
  mansione       text,
  codice_interno text,
  badge_qr_token text,
  stato_attivo   boolean not null default true,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists dipendenti_tenant_idx on public.dipendenti (tenant_id);
create unique index if not exists dipendenti_user_unique
  on public.dipendenti (tenant_id, user_id) where user_id is not null;

drop trigger if exists trg_dipendenti_updated_at on public.dipendenti;
create trigger trg_dipendenti_updated_at
  before update on public.dipendenti
  for each row execute function public.tg_set_updated_at();

alter table public.dipendenti enable row level security;

drop policy if exists dipendenti_tenant_read on public.dipendenti;
create policy dipendenti_tenant_read on public.dipendenti
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists dipendenti_admin_write on public.dipendenti;
create policy dipendenti_admin_write on public.dipendenti
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists dipendenti_platform_admin_read on public.dipendenti;
create policy dipendenti_platform_admin_read on public.dipendenti
  for select using (public.is_platform_admin());

-- ---------- commessa_squadra (raggruppamento per-commessa) ------------
create table if not exists public.commessa_squadra (
  commessa_id        uuid not null references public.commesse(id) on delete cascade,
  dipendente_id      uuid not null references public.dipendenti(id) on delete cascade,
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  ruolo_commessa     text not null default 'membro' check (ruolo_commessa in ('capo','membro')),
  capo_dipendente_id uuid references public.dipendenti(id) on delete set null,
  assegnato_da       uuid references public.users(id) on delete set null,
  assegnato_at       timestamptz not null default now(),
  primary key (commessa_id, dipendente_id)
);

create index if not exists commessa_squadra_tenant_idx on public.commessa_squadra (tenant_id);
create index if not exists commessa_squadra_dip_idx on public.commessa_squadra (dipendente_id);

alter table public.commessa_squadra enable row level security;

drop policy if exists commessa_squadra_tenant_read on public.commessa_squadra;
create policy commessa_squadra_tenant_read on public.commessa_squadra
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists commessa_squadra_admin_write on public.commessa_squadra;
create policy commessa_squadra_admin_write on public.commessa_squadra
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists commessa_squadra_platform_admin_read on public.commessa_squadra;
create policy commessa_squadra_platform_admin_read on public.commessa_squadra
  for select using (public.is_platform_admin());
