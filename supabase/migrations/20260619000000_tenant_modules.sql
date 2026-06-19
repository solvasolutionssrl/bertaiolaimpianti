-- =====================================================================
-- 20260619000000_tenant_modules.sql
--
-- Moduli applicativi attivabili per tenant (Fase A modulo "Kantiere").
--
-- 'base' NON ha riga qui (è implicitamente sempre attivo).
-- I moduli opzionali (es. 'kantiere') esistono come riga con attivo bool.
-- Riga mancante o attivo=false => modulo spento per quel tenant.
--
-- Solo il super-admin (service-role) scrive. Qualunque utente autenticato
-- del tenant puo' leggere i moduli del proprio tenant (serve al gating
-- delle route, anche per i ruoli tecnico/cliente sulle superfici mobile).
-- =====================================================================

create table if not exists public.tenant_modules (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  module_code   text not null,
  attivo        boolean not null default false,
  config        jsonb not null default '{}'::jsonb,
  configured_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, module_code)
);

comment on table public.tenant_modules is
  'Moduli applicativi opzionali attivati per tenant. base e'' implicito (sempre on).';

create index if not exists tenant_modules_tenant_idx
  on public.tenant_modules (tenant_id);

-- trigger updated_at (riusa la funzione esistente public.tg_set_updated_at())
drop trigger if exists trg_tenant_modules_updated_at on public.tenant_modules;
create trigger trg_tenant_modules_updated_at
  before update on public.tenant_modules
  for each row execute function public.tg_set_updated_at();

alter table public.tenant_modules enable row level security;

-- Lettura: qualunque utente autenticato dello stesso tenant.
-- Non e' un dato sensibile ("quali moduli sono attivi") e serve al gating
-- delle route per TUTTI i ruoli (incluso tecnico/cliente su mobile/portal).
-- Il client SSR legge sotto RLS: restringere ai soli admin/office
-- spegnerebbe erroneamente i moduli per i tecnici. Il config jsonb non e'
-- esposto dall'helper (seleziona solo module_code, attivo).
drop policy if exists tenant_modules_tenant_read on public.tenant_modules;
create policy tenant_modules_tenant_read on public.tenant_modules
  for select
  using (tenant_id = public.current_tenant_id());

-- Lettura cross-tenant per platform admin
drop policy if exists tenant_modules_platform_admin_read on public.tenant_modules;
create policy tenant_modules_platform_admin_read on public.tenant_modules
  for select
  using (public.is_platform_admin());

-- Nota: le scritture avvengono via service-role (super-admin action),
-- che bypassa RLS. Nessuna policy di write per i ruoli tenant.
