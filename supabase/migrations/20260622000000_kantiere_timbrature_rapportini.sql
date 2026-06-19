-- =====================================================================
-- 20260622000000_kantiere_timbrature_rapportini.sql
-- Fase E modulo Kantiere: timbrature + rapportino giornaliero a righe.
-- Additivo. Gating app via modulo kantiere.
-- =====================================================================

-- ---------- timbrature ------------------------------------------------
create table if not exists public.timbrature (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  dipendente_id uuid not null references public.dipendenti(id) on delete cascade,
  commessa_id   uuid not null references public.commesse(id) on delete cascade,
  tipo          text not null check (tipo in ('ingresso','uscita')),
  origine       text not null check (origine in ('qr','cronometro','manuale','capo')),
  ts            timestamptz not null default now(),
  geo_lat       numeric(9,6),
  geo_lng       numeric(9,6),
  creato_da     uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists timbrature_dip_ts_idx on public.timbrature (tenant_id, dipendente_id, ts);
create index if not exists timbrature_commessa_ts_idx on public.timbrature (tenant_id, commessa_id, ts);

alter table public.timbrature enable row level security;

drop policy if exists timbrature_tenant_read on public.timbrature;
create policy timbrature_tenant_read on public.timbrature
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists timbrature_tenant_write on public.timbrature;
create policy timbrature_tenant_write on public.timbrature
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role, 'tecnico'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role, 'tecnico'::public.app_role)
  );

drop policy if exists timbrature_platform_admin_read on public.timbrature;
create policy timbrature_platform_admin_read on public.timbrature
  for select using (public.is_platform_admin());

-- ---------- rapportini (testata) -------------------------------------
create table if not exists public.rapportini (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  dipendente_id uuid not null references public.dipendenti(id) on delete cascade,
  data          date not null,
  stato         text not null default 'bozza'
                check (stato in ('bozza','inviato','verificato','approvato','respinto','esportato')),
  inviato_da    uuid references public.users(id) on delete set null,
  inviato_at    timestamptz,
  approvato_da  uuid references public.users(id) on delete set null,
  approvato_at  timestamptz,
  respinto_motivo text,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (dipendente_id, data)
);
create index if not exists rapportini_tenant_data_idx on public.rapportini (tenant_id, data);

drop trigger if exists trg_rapportini_updated_at on public.rapportini;
create trigger trg_rapportini_updated_at
  before update on public.rapportini
  for each row execute function public.tg_set_updated_at();

alter table public.rapportini enable row level security;

drop policy if exists rapportini_tenant_read on public.rapportini;
create policy rapportini_tenant_read on public.rapportini
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists rapportini_tenant_write on public.rapportini;
create policy rapportini_tenant_write on public.rapportini
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role, 'tecnico'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role, 'tecnico'::public.app_role)
  );

drop policy if exists rapportini_platform_admin_read on public.rapportini;
create policy rapportini_platform_admin_read on public.rapportini
  for select using (public.is_platform_admin());

-- ---------- rapportino_righe -----------------------------------------
create table if not exists public.rapportino_righe (
  id               uuid primary key default gen_random_uuid(),
  rapportino_id    uuid not null references public.rapportini(id) on delete cascade,
  commessa_id      uuid not null references public.commesse(id) on delete cascade,
  ore_ordinarie    numeric(4,2) not null default 0,
  ore_straordinarie numeric(4,2) not null default 0,
  ore_viaggio      numeric(4,2) not null default 0,
  note             text
);
create index if not exists rapportino_righe_rapportino_idx on public.rapportino_righe (rapportino_id);

alter table public.rapportino_righe enable row level security;

drop policy if exists rapportino_righe_tenant_read on public.rapportino_righe;
create policy rapportino_righe_tenant_read on public.rapportino_righe
  for select using (
    exists (select 1 from public.rapportini r
            where r.id = rapportino_id and r.tenant_id = public.current_tenant_id())
  );

drop policy if exists rapportino_righe_tenant_write on public.rapportino_righe;
create policy rapportino_righe_tenant_write on public.rapportino_righe
  for all
  using (
    exists (select 1 from public.rapportini r
            where r.id = rapportino_id and r.tenant_id = public.current_tenant_id()
              and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role, 'tecnico'::public.app_role))
  )
  with check (
    exists (select 1 from public.rapportini r
            where r.id = rapportino_id and r.tenant_id = public.current_tenant_id()
              and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role, 'tecnico'::public.app_role))
  );

drop policy if exists rapportino_righe_platform_admin_read on public.rapportino_righe;
create policy rapportino_righe_platform_admin_read on public.rapportino_righe
  for select using (public.is_platform_admin());
