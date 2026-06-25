-- Kontabilità: spese di cantiere (scontrini / ricevute).
-- Modulo dentro Kantiere → i tenant 'kommessa' (Bertaiola) non la usano.
--
-- La foto dello scontrino vive su R2, referenziata DIRETTAMENTE da questa
-- riga (r2_key/r2_thumb_key): non passa da file_refs, per non toccare la
-- pipeline media di produzione (file_refs.commessa_id e' NOT NULL).

create table if not exists public.spese (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  dipendente_id uuid not null references public.dipendenti(id) on delete restrict,
  cantiere_id uuid references public.cantieri(id) on delete set null,
  commessa_id uuid references public.commesse(id) on delete set null,
  categoria text not null default 'varie'
    check (categoria in ('hotel','ristorante','bar','trasporti','carburante','varie')),
  ragione_sociale text,
  importo_totale numeric(12,2) not null,
  importo_iva numeric(12,2),
  imponibile numeric(12,2),
  valuta text not null default 'EUR',
  partita_iva text,
  metodo_pagamento text check (metodo_pagamento in ('contanti','carta','altro')),
  numero_documento text,
  indirizzo_esercente text,
  data_scontrino timestamptz,
  -- Foto su R2 (referenziata direttamente, non via file_refs)
  r2_key text,
  r2_thumb_key text,
  foto_mime text,
  foto_size_bytes bigint,
  stato text not null default 'bozza' check (stato in ('bozza','confermata')),
  rimborsabile boolean not null default true,
  ai_raw jsonb,
  ai_confidence jsonb,
  note text,
  geo_lat numeric(9,6),
  geo_lng numeric(9,6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists spese_tenant_cantiere_idx
  on public.spese (tenant_id, cantiere_id, data_scontrino);
create index if not exists spese_tenant_dip_idx
  on public.spese (tenant_id, dipendente_id, data_scontrino);
create index if not exists spese_tenant_cat_idx
  on public.spese (tenant_id, categoria);

-- updated_at (riusa il trigger function condiviso del progetto)
drop trigger if exists trg_spese_updated_at on public.spese;
create trigger trg_spese_updated_at
  before update on public.spese
  for each row execute function public.tg_set_updated_at();

alter table public.spese enable row level security;

-- Office/admin/owner del tenant: full access alle spese del proprio tenant.
-- Tecnico/capo: solo le PROPRIE spese (dipendente collegato allo user).
drop policy if exists spese_select on public.spese;
create policy spese_select on public.spese for select
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in (
        'owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role
      )
      or dipendente_id in (
        select d.id from public.dipendenti d
        where d.tenant_id = public.current_tenant_id() and d.user_id = auth.uid()
      )
    )
  );

drop policy if exists spese_insert on public.spese;
create policy spese_insert on public.spese for insert
  with check (
    tenant_id = public.current_tenant_id()
    and dipendente_id in (
      select d.id from public.dipendenti d
      where d.tenant_id = public.current_tenant_id() and d.user_id = auth.uid()
    )
  );

drop policy if exists spese_update on public.spese;
create policy spese_update on public.spese for update
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in (
        'owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role
      )
      or dipendente_id in (
        select d.id from public.dipendenti d
        where d.tenant_id = public.current_tenant_id() and d.user_id = auth.uid()
      )
    )
  );

drop policy if exists spese_delete on public.spese;
create policy spese_delete on public.spese for delete
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in (
      'owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role
    )
  );

-- Super admin di piattaforma: lettura cross-tenant (osservabilita').
drop policy if exists spese_platform_admin_read on public.spese;
create policy spese_platform_admin_read on public.spese for select
  using (public.is_platform_admin());
