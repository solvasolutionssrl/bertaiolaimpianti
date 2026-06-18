-- Versioning commesse: snapshot immutabile ad ogni modifica rilevante.
-- Storico (chi / quando / cosa) + ripristino dei SOLI campi contenuto.
-- Le voci/tipologie NON vengono mai versionate per il restore (cartelle fisiche
-- su Nextcloud: si possono solo aggiungere, mai rimuovere).

create table if not exists public.commessa_versioni (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  commessa_id         uuid not null references public.commesse(id) on delete cascade,
  versione            integer not null,
  snapshot            jsonb not null,                       -- stato contenuto DOPO questa versione (per restore)
  diff                jsonb not null default '[]'::jsonb,   -- [{campo, da, a}]
  modificato_da       uuid references public.users(id) on delete set null,
  modificato_da_nome  text,                                 -- denormalizzato (display cross-tenant / utenti rimossi)
  azione              text not null default 'modifica'
                        check (azione in ('creazione','modifica','aggiunta_tipologie','ripristino')),
  created_at          timestamptz not null default now(),
  unique (commessa_id, versione)
);

create index if not exists commessa_versioni_commessa_idx
  on public.commessa_versioni (commessa_id, versione desc);
create index if not exists commessa_versioni_tenant_idx
  on public.commessa_versioni (tenant_id);

alter table public.commessa_versioni enable row level security;

-- Lettura: admin/office del tenant (sola lettura — il ripristino lo fa il superadmin).
create policy commessa_versioni_tenant_read on public.commessa_versioni
  for select
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in (
      'owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role
    )
  );

-- Scrittura: admin/office del tenant (le action di modifica scrivono le versioni).
-- Il ripristino superadmin scrive via service-role (bypassa RLS).
create policy commessa_versioni_tenant_insert on public.commessa_versioni
  for insert
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in (
      'owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role
    )
  );

-- Policy additiva: platform admin legge cross-tenant.
create policy commessa_versioni_platform_admin_read on public.commessa_versioni
  for select
  using (public.is_platform_admin());

-- Nessuna policy UPDATE/DELETE: tabella immutabile (il restore crea una NUOVA versione).

-- Prossimo numero di versione per una commessa (atomico per uso in transazione).
create or replace function public.genera_versione_commessa(p_commessa_id uuid)
returns integer
language sql
as $$
  select coalesce(max(versione), 0) + 1
  from public.commessa_versioni
  where commessa_id = p_commessa_id;
$$;
