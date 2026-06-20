-- =====================================================================
-- 20260624000000_kantiere_fase_ii_lotto_a.sql
-- Kantiere Fase II — Lotto A
--   A1 login a 3 campi: tenants.codice_azienda + login_senza_codice
--   A2 parco mezzi
--   A3 sedi + associazione sedi↔cantiere
--   A4 flusso viaggio: timbratura_viaggio + routing_cache
-- Tutto additivo. Gating app via modulo kantiere + app_mode.
-- Bertaiola (kommessa, modulo off) NON impattata.
-- =====================================================================

-- ---------- A1: codice azienda per il login multi-tenant -------------
-- Codice leggibile e indipendente dallo slug (lo slug è immutabile e usato
-- nei path/codici interni). Usato come 1° campo del login per disambiguare
-- username condivisi tra tenant. login_senza_codice = il tenant di default
-- quando l'utente accede senza codice (retrocompatibilità Bertaiola).
alter table public.tenants
  add column if not exists codice_azienda citext;
alter table public.tenants
  add column if not exists login_senza_codice boolean not null default false;

create unique index if not exists tenants_codice_azienda_uq
  on public.tenants (codice_azienda)
  where codice_azienda is not null;

-- Un solo tenant può essere il default per il login senza codice.
create unique index if not exists tenants_login_senza_codice_uq
  on public.tenants ((login_senza_codice))
  where login_senza_codice = true;

-- ---------- A2: parco mezzi ------------------------------------------
create table if not exists public.mezzi (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  targa       text not null,
  modello     text,
  attivo      boolean not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists mezzi_tenant_idx on public.mezzi (tenant_id);

drop trigger if exists trg_mezzi_updated_at on public.mezzi;
create trigger trg_mezzi_updated_at
  before update on public.mezzi
  for each row execute function public.tg_set_updated_at();

alter table public.mezzi enable row level security;

drop policy if exists mezzi_tenant_read on public.mezzi;
create policy mezzi_tenant_read on public.mezzi
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists mezzi_office_write on public.mezzi;
create policy mezzi_office_write on public.mezzi
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists mezzi_platform_admin_read on public.mezzi;
create policy mezzi_platform_admin_read on public.mezzi
  for select using (public.is_platform_admin());

-- ---------- A3: sedi -------------------------------------------------
-- Luoghi del tenant usati come punto di partenza/arrivo del viaggio:
-- sede principale, sedi secondarie, hotel, altro. is_default = sede
-- offerta di default in ogni timbratura.
create table if not exists public.sedi (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  nome        text not null,
  tipo        text not null default 'sede_secondaria'
              check (tipo in ('sede_principale','sede_secondaria','hotel','altro')),
  indirizzo   text,
  lat         numeric(9,6),
  lng         numeric(9,6),
  is_default  boolean not null default false,
  attivo      boolean not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists sedi_tenant_idx on public.sedi (tenant_id);
-- Una sola sede default per tenant.
create unique index if not exists sedi_default_uq
  on public.sedi (tenant_id)
  where is_default = true;

drop trigger if exists trg_sedi_updated_at on public.sedi;
create trigger trg_sedi_updated_at
  before update on public.sedi
  for each row execute function public.tg_set_updated_at();

alter table public.sedi enable row level security;

drop policy if exists sedi_tenant_read on public.sedi;
create policy sedi_tenant_read on public.sedi
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists sedi_office_write on public.sedi;
create policy sedi_office_write on public.sedi
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists sedi_platform_admin_read on public.sedi;
create policy sedi_platform_admin_read on public.sedi
  for select using (public.is_platform_admin());

-- ---------- A3: associazione sedi selezionabili per cantiere ---------
-- Oltre alla sede default, l'ufficio può rendere disponibili N sedi per un
-- dato cantiere (punti di partenza/arrivo extra).
create table if not exists public.cantiere_sede (
  cantiere_id uuid not null references public.cantieri(id) on delete cascade,
  sede_id     uuid not null references public.sedi(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (cantiere_id, sede_id)
);
create index if not exists cantiere_sede_tenant_idx on public.cantiere_sede (tenant_id);
create index if not exists cantiere_sede_sede_idx on public.cantiere_sede (sede_id);

alter table public.cantiere_sede enable row level security;

drop policy if exists cantiere_sede_tenant_read on public.cantiere_sede;
create policy cantiere_sede_tenant_read on public.cantiere_sede
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists cantiere_sede_office_write on public.cantiere_sede;
create policy cantiere_sede_office_write on public.cantiere_sede
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists cantiere_sede_platform_admin_read on public.cantiere_sede;
create policy cantiere_sede_platform_admin_read on public.cantiere_sede
  for select using (public.is_platform_admin());

-- ---------- A4: viaggio collegato alla timbratura --------------------
-- Una tratta di viaggio per timbratura: andata (collegata all'ingresso) o
-- ritorno (uscita). durata_stimata = stima API; durata_confermata = valore
-- finale (se diverso dalla stima serve giustificazione). autista + mezzo.
create table if not exists public.timbratura_viaggio (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  timbratura_id        uuid not null unique references public.timbrature(id) on delete cascade,
  dipendente_id        uuid not null references public.dipendenti(id) on delete cascade,
  direzione            text not null check (direzione in ('andata','ritorno')),
  sede_id              uuid references public.sedi(id) on delete set null,
  durata_stimata_min   integer,
  durata_confermata_min integer not null,
  giustificazione      text,
  autista              boolean not null default false,
  mezzo_id             uuid references public.mezzi(id) on delete set null,
  created_at           timestamptz not null default now()
);
create index if not exists timbratura_viaggio_tenant_idx on public.timbratura_viaggio (tenant_id);
create index if not exists timbratura_viaggio_dip_idx on public.timbratura_viaggio (dipendente_id);

alter table public.timbratura_viaggio enable row level security;

drop policy if exists timbratura_viaggio_tenant_read on public.timbratura_viaggio;
create policy timbratura_viaggio_tenant_read on public.timbratura_viaggio
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists timbratura_viaggio_tenant_write on public.timbratura_viaggio;
create policy timbratura_viaggio_tenant_write on public.timbratura_viaggio
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role, 'tecnico'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role, 'tecnico'::public.app_role)
  );

drop policy if exists timbratura_viaggio_platform_admin_read on public.timbratura_viaggio;
create policy timbratura_viaggio_platform_admin_read on public.timbratura_viaggio
  for select using (public.is_platform_admin());

-- ---------- A4: cache stime di percorrenza ---------------------------
-- Cache geografica (non sensibile, non per-tenant): coppia origine→dest →
-- durata stimata. Accesso solo via service role (endpoint server). RLS
-- abilitata senza policy = deny per i ruoli applicativi.
create table if not exists public.routing_cache (
  id          uuid primary key default gen_random_uuid(),
  origin_lat  numeric(9,6) not null,
  origin_lng  numeric(9,6) not null,
  dest_lat    numeric(9,6) not null,
  dest_lng    numeric(9,6) not null,
  profile     text not null default 'driving-car',
  durata_min  integer not null,
  created_at  timestamptz not null default now(),
  unique (origin_lat, origin_lng, dest_lat, dest_lng, profile)
);
alter table public.routing_cache enable row level security;
