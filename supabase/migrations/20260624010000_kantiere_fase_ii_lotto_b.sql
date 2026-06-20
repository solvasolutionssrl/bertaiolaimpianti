-- =====================================================================
-- 20260624010000_kantiere_fase_ii_lotto_b.sql
-- Kantiere Fase II — Lotto B + rifiniture
--   - mezzi.tipo (autocarro/autovettura/altro) per il registro
--   - rapportino_versioni: storico modifiche rapportino (chi/quando/cosa)
-- Additivo. Bertaiola non impattata.
-- =====================================================================

-- ---------- mezzi.tipo -----------------------------------------------
alter table public.mezzi
  add column if not exists tipo text not null default 'autocarro'
  check (tipo in ('autocarro', 'autovettura', 'altro'));

-- ---------- rapportino_versioni --------------------------------------
-- Storico delle versioni di un rapportino: snapshot delle righe + meta.
-- azione: invio | modifica_tecnico | modifica_ufficio | approvazione |
--         respinta | riapertura.
create table if not exists public.rapportino_versioni (
  id                 uuid primary key default gen_random_uuid(),
  rapportino_id      uuid not null references public.rapportini(id) on delete cascade,
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  versione           integer not null,
  snapshot           jsonb not null,
  azione             text not null check (azione in (
                       'invio','modifica_tecnico','modifica_ufficio',
                       'approvazione','respinta','riapertura'
                     )),
  modificato_da      uuid,
  modificato_da_nome text,
  created_at         timestamptz not null default now(),
  unique (rapportino_id, versione)
);
create index if not exists rapportino_versioni_rapp_idx
  on public.rapportino_versioni (rapportino_id);
create index if not exists rapportino_versioni_tenant_idx
  on public.rapportino_versioni (tenant_id);

alter table public.rapportino_versioni enable row level security;

drop policy if exists rapportino_versioni_tenant_read on public.rapportino_versioni;
create policy rapportino_versioni_tenant_read on public.rapportino_versioni
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists rapportino_versioni_tenant_write on public.rapportino_versioni;
create policy rapportino_versioni_tenant_write on public.rapportino_versioni
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role, 'tecnico'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role, 'tecnico'::public.app_role)
  );

drop policy if exists rapportino_versioni_platform_admin_read on public.rapportino_versioni;
create policy rapportino_versioni_platform_admin_read on public.rapportino_versioni
  for select using (public.is_platform_admin());
