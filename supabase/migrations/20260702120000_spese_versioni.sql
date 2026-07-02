-- Versioning spese (Kontabilità): snapshot immutabile ad ogni modifica dell'ufficio.
-- Storico chi/quando/cosa. Stesso schema di commessa_versioni.

create table if not exists public.spese_versioni (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  spesa_id            uuid not null references public.spese(id) on delete cascade,
  versione            integer not null,
  snapshot            jsonb not null,                       -- stato DOPO questa versione
  diff                jsonb not null default '[]'::jsonb,   -- [{campo, da, a}]
  modificato_da       uuid references public.users(id) on delete set null,
  modificato_da_nome  text,                                 -- denormalizzato
  azione              text not null default 'modifica'
                        check (azione in ('creazione','modifica','ripristino')),
  created_at          timestamptz not null default now(),
  unique (spesa_id, versione)
);

create index if not exists spese_versioni_spesa_idx
  on public.spese_versioni (spesa_id, versione desc);
create index if not exists spese_versioni_tenant_idx
  on public.spese_versioni (tenant_id);

alter table public.spese_versioni enable row level security;

-- Lettura: admin/office del tenant.
drop policy if exists spese_versioni_tenant_read on public.spese_versioni;
create policy spese_versioni_tenant_read on public.spese_versioni
  for select
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in (
      'owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role
    )
  );

-- Scrittura: admin/office del tenant (le action di modifica scrivono le versioni).
drop policy if exists spese_versioni_tenant_insert on public.spese_versioni;
create policy spese_versioni_tenant_insert on public.spese_versioni
  for insert
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in (
      'owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role
    )
  );

-- Platform admin legge cross-tenant.
drop policy if exists spese_versioni_platform_admin_read on public.spese_versioni;
create policy spese_versioni_platform_admin_read on public.spese_versioni
  for select
  using (public.is_platform_admin());

-- Nessuna policy UPDATE/DELETE: tabella immutabile.

-- Prossimo numero di versione per una spesa (atomico).
create or replace function public.genera_versione_spesa(p_spesa_id uuid)
returns integer
language sql
as $$
  select coalesce(max(versione), 0) + 1
  from public.spese_versioni
  where spesa_id = p_spesa_id;
$$;
