-- =====================================================================
-- 20260619100000_kantiere_cantieri.sql
-- Fase G modulo Kantiere: entità Cantieri (sito fisico, opzionalmente
-- legato a una commessa) + squadra per-cantiere + target polimorfico
-- (commessa XOR cantiere) su cantiere_qr / timbrature / rapportino_righe.
-- Additivo. Gating app via modulo kantiere. Bertaiola non impattata.
-- =====================================================================

-- ---------- cantieri --------------------------------------------------
create table if not exists public.cantieri (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  codice             text not null,                 -- CAN-001 (app-side, per-tenant)
  nome               text not null,
  indirizzo          text,
  indirizzo_lat      numeric(9,6),
  indirizzo_lng      numeric(9,6),
  sede_partenza      text,                           -- base default (km futuri)
  sede_partenza_lat  numeric(9,6),
  sede_partenza_lng  numeric(9,6),
  commessa_id        uuid references public.commesse(id) on delete set null,  -- legame OPZIONALE
  stato              text not null default 'attivo' check (stato in ('attivo','sospeso','chiuso')),
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (tenant_id, codice)
);
create index if not exists cantieri_tenant_idx on public.cantieri (tenant_id);
create index if not exists cantieri_commessa_idx on public.cantieri (commessa_id);

drop trigger if exists trg_cantieri_updated_at on public.cantieri;
create trigger trg_cantieri_updated_at
  before update on public.cantieri
  for each row execute function public.tg_set_updated_at();

alter table public.cantieri enable row level security;

drop policy if exists cantieri_tenant_read on public.cantieri;
create policy cantieri_tenant_read on public.cantieri
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists cantieri_office_write on public.cantieri;
create policy cantieri_office_write on public.cantieri
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists cantieri_platform_admin_read on public.cantieri;
create policy cantieri_platform_admin_read on public.cantieri
  for select using (public.is_platform_admin());

-- ---------- cantiere_squadra (mirror di commessa_squadra) -------------
create table if not exists public.cantiere_squadra (
  cantiere_id        uuid not null references public.cantieri(id) on delete cascade,
  dipendente_id      uuid not null references public.dipendenti(id) on delete cascade,
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  ruolo              text not null default 'membro' check (ruolo in ('capo','membro')),
  capo_dipendente_id uuid references public.dipendenti(id) on delete set null,
  assegnato_da       uuid references public.users(id) on delete set null,
  assegnato_at       timestamptz not null default now(),
  primary key (cantiere_id, dipendente_id)
);
create index if not exists cantiere_squadra_tenant_idx on public.cantiere_squadra (tenant_id);
create index if not exists cantiere_squadra_dip_idx on public.cantiere_squadra (dipendente_id);

alter table public.cantiere_squadra enable row level security;

drop policy if exists cantiere_squadra_tenant_read on public.cantiere_squadra;
create policy cantiere_squadra_tenant_read on public.cantiere_squadra
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists cantiere_squadra_office_write on public.cantiere_squadra;
create policy cantiere_squadra_office_write on public.cantiere_squadra
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists cantiere_squadra_platform_admin_read on public.cantiere_squadra;
create policy cantiere_squadra_platform_admin_read on public.cantiere_squadra
  for select using (public.is_platform_admin());

-- ---------- target polimorfico: commessa XOR cantiere -----------------
-- cantiere_qr
alter table public.cantiere_qr
  add column if not exists cantiere_id uuid references public.cantieri(id) on delete cascade;
alter table public.cantiere_qr alter column commessa_id drop not null;
alter table public.cantiere_qr drop constraint if exists cantiere_qr_target_chk;
alter table public.cantiere_qr
  add constraint cantiere_qr_target_chk check (num_nonnulls(commessa_id, cantiere_id) = 1);
-- un solo QR attivo per target (commessa o cantiere)
drop index if exists public.cantiere_qr_one_active;
create unique index if not exists cantiere_qr_one_active_commessa
  on public.cantiere_qr (commessa_id) where attivo and commessa_id is not null;
create unique index if not exists cantiere_qr_one_active_cantiere
  on public.cantiere_qr (cantiere_id) where attivo and cantiere_id is not null;

-- timbrature
alter table public.timbrature
  add column if not exists cantiere_id uuid references public.cantieri(id) on delete cascade;
alter table public.timbrature alter column commessa_id drop not null;
alter table public.timbrature drop constraint if exists timbrature_target_chk;
alter table public.timbrature
  add constraint timbrature_target_chk check (num_nonnulls(commessa_id, cantiere_id) = 1);
create index if not exists timbrature_cantiere_ts_idx on public.timbrature (tenant_id, cantiere_id, ts);

-- rapportino_righe
alter table public.rapportino_righe
  add column if not exists cantiere_id uuid references public.cantieri(id) on delete cascade;
alter table public.rapportino_righe alter column commessa_id drop not null;
alter table public.rapportino_righe drop constraint if exists rapportino_righe_target_chk;
alter table public.rapportino_righe
  add constraint rapportino_righe_target_chk check (num_nonnulls(commessa_id, cantiere_id) = 1);
create index if not exists rapportino_righe_cantiere_idx on public.rapportino_righe (cantiere_id);
