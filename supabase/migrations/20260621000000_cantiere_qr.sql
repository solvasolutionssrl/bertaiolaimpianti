-- =====================================================================
-- 20260621000000_cantiere_qr.sql
-- Fase D modulo Kantiere: QR univoco e permanente per commessa.
-- Additivo. Gating app via modulo kantiere.
-- =====================================================================

create table if not exists public.cantiere_qr (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  commessa_id uuid not null references public.commesse(id) on delete cascade,
  token       text not null,
  attivo      boolean not null default true,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

create unique index if not exists cantiere_qr_token_unique on public.cantiere_qr (token);
create unique index if not exists cantiere_qr_one_active
  on public.cantiere_qr (commessa_id) where attivo;
create index if not exists cantiere_qr_tenant_idx on public.cantiere_qr (tenant_id);

alter table public.cantiere_qr enable row level security;

drop policy if exists cantiere_qr_tenant_read on public.cantiere_qr;
create policy cantiere_qr_tenant_read on public.cantiere_qr
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists cantiere_qr_office_write on public.cantiere_qr;
create policy cantiere_qr_office_write on public.cantiere_qr
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists cantiere_qr_platform_admin_read on public.cantiere_qr;
create policy cantiere_qr_platform_admin_read on public.cantiere_qr
  for select using (public.is_platform_admin());
