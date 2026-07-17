-- =====================================================================
-- 20260707100000_dipendenti_pianificazione.sql
-- Modulo Dipendenti — Pianificazione settimanale.
--
-- Un BLOCCO pianificato = una squadra su un cantiere in un giorno/fascia
-- (tipo='cantiere'), oppure un evento di gruppo tipo formazione
-- (tipo='evento'). I membri (dipendenti) e i mezzi assegnati stanno in due
-- tabelle-figlie. Gli orari (ora_inizio/ora_fine) sono SEMPRE risolti dai
-- preset di fascia → i conflitti sono un semplice overlap di intervalli.
--
-- Additivo, gated dal modulo `dipendenti` (Bertaiola spenta → non impattata).
-- Idempotente. RLS: tenant_read / office_write / platform_admin_read.
-- =====================================================================

-- ---------- pianificazione_blocchi -----------------------------------
create table if not exists public.pianificazione_blocchi (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  data           date not null,
  tipo           text not null check (tipo in ('cantiere','evento')),
  cantiere_id    uuid references public.cantieri(id) on delete cascade,   -- richiesto se tipo='cantiere'
  titolo         text,                                                     -- richiesto se tipo='evento'
  luogo          text,
  fascia         text not null check (fascia in ('giornata','mattina','pomeriggio','custom')),
  ora_inizio     time not null,
  ora_fine       time not null,
  note           text,
  stato          text not null default 'bozza' check (stato in ('bozza','pubblicato')),
  pubblicato_at  timestamptz,
  pubblicato_da  uuid references public.users(id) on delete set null,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint pianificazione_blocchi_target_chk check (
    (tipo = 'cantiere' and cantiere_id is not null)
    or (tipo = 'evento' and titolo is not null)
  ),
  constraint pianificazione_blocchi_orari_chk check (ora_fine > ora_inizio)
);
create index if not exists pianificazione_blocchi_tenant_data_idx
  on public.pianificazione_blocchi (tenant_id, data);
create index if not exists pianificazione_blocchi_cantiere_idx
  on public.pianificazione_blocchi (cantiere_id);

drop trigger if exists trg_pianificazione_blocchi_updated_at on public.pianificazione_blocchi;
create trigger trg_pianificazione_blocchi_updated_at
  before update on public.pianificazione_blocchi
  for each row execute function public.tg_set_updated_at();

alter table public.pianificazione_blocchi enable row level security;

drop policy if exists pianificazione_blocchi_tenant_read on public.pianificazione_blocchi;
create policy pianificazione_blocchi_tenant_read on public.pianificazione_blocchi
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists pianificazione_blocchi_office_write on public.pianificazione_blocchi;
create policy pianificazione_blocchi_office_write on public.pianificazione_blocchi
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists pianificazione_blocchi_platform_admin_read on public.pianificazione_blocchi;
create policy pianificazione_blocchi_platform_admin_read on public.pianificazione_blocchi
  for select using (public.is_platform_admin());

-- ---------- pianificazione_membri (dipendenti del blocco) ------------
create table if not exists public.pianificazione_membri (
  blocco_id      uuid not null references public.pianificazione_blocchi(id) on delete cascade,
  dipendente_id  uuid not null references public.dipendenti(id) on delete cascade,
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  primary key (blocco_id, dipendente_id)
);
create index if not exists pianificazione_membri_tenant_idx
  on public.pianificazione_membri (tenant_id);
create index if not exists pianificazione_membri_dip_idx
  on public.pianificazione_membri (dipendente_id);

alter table public.pianificazione_membri enable row level security;

drop policy if exists pianificazione_membri_tenant_read on public.pianificazione_membri;
create policy pianificazione_membri_tenant_read on public.pianificazione_membri
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists pianificazione_membri_office_write on public.pianificazione_membri;
create policy pianificazione_membri_office_write on public.pianificazione_membri
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists pianificazione_membri_platform_admin_read on public.pianificazione_membri;
create policy pianificazione_membri_platform_admin_read on public.pianificazione_membri
  for select using (public.is_platform_admin());

-- ---------- pianificazione_blocco_mezzi (mezzi del blocco) -----------
create table if not exists public.pianificazione_blocco_mezzi (
  blocco_id      uuid not null references public.pianificazione_blocchi(id) on delete cascade,
  mezzo_id       uuid not null references public.mezzi(id) on delete cascade,
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  primary key (blocco_id, mezzo_id)
);
create index if not exists pianificazione_blocco_mezzi_tenant_idx
  on public.pianificazione_blocco_mezzi (tenant_id);
create index if not exists pianificazione_blocco_mezzi_mezzo_idx
  on public.pianificazione_blocco_mezzi (mezzo_id);

alter table public.pianificazione_blocco_mezzi enable row level security;

drop policy if exists pianificazione_blocco_mezzi_tenant_read on public.pianificazione_blocco_mezzi;
create policy pianificazione_blocco_mezzi_tenant_read on public.pianificazione_blocco_mezzi
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists pianificazione_blocco_mezzi_office_write on public.pianificazione_blocco_mezzi;
create policy pianificazione_blocco_mezzi_office_write on public.pianificazione_blocco_mezzi
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists pianificazione_blocco_mezzi_platform_admin_read on public.pianificazione_blocco_mezzi;
create policy pianificazione_blocco_mezzi_platform_admin_read on public.pianificazione_blocco_mezzi
  for select using (public.is_platform_admin());

-- ---------- tipo evento notifica: pianificazione pubblicata ----------
insert into public.notification_event_types
  (code, label, description, default_in_app, default_push, default_email, critical, ordine) values
  ('pianificazione_pubblicata', 'Pianificazione pubblicata',
   'Quando l''ufficio pubblica la pianificazione settimanale che ti riguarda.',
   true, true, false, false, 80)
  on conflict (code) do nothing;
