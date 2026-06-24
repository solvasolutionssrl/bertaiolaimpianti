-- Tracking accessi (login/logout) per il monitoraggio platform admin.
-- Insert via service-role (best-effort dal client su login/logout); lettura
-- riservata ai platform admin. Nessun impatto sui tenant esistenti.

create table if not exists public.auth_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  user_id uuid,
  email text,
  tipo text not null check (tipo in ('login', 'logout')),
  user_agent text,
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists auth_events_created_idx on public.auth_events (created_at desc);
create index if not exists auth_events_tenant_idx on public.auth_events (tenant_id, created_at desc);
create index if not exists auth_events_user_idx on public.auth_events (user_id, created_at desc);

alter table public.auth_events enable row level security;

-- Solo platform admin legge (cross-tenant). Gli insert passano da service-role
-- che bypassa RLS, quindi non serve una policy di insert.
drop policy if exists auth_events_admin_read on public.auth_events;
create policy auth_events_admin_read
  on public.auth_events
  for select
  using (public.is_platform_admin());

comment on table public.auth_events is
  'Eventi di accesso (login/logout) per monitoraggio platform admin. Best-effort, non bloccante.';
