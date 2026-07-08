-- =====================================================================
-- 20260708110000_ferie_permessi.sql
-- Modulo Dipendenti — Ferie e permessi (Fase 2).
--
--   gruppi_approvazione : gruppo con un approvatore (user). Ogni dipendente
--                         appartiene ad al più un gruppo (gruppo_membri).
--   permesso_richieste  : richiesta di assenza (tipo dal catalogo, date/ore,
--                         stato). Routing: va all'approvatore del gruppo del
--                         dipendente (approver_user_id salvato alla richiesta).
--   users.puo_approvare_permessi : capacità "approva permessi" (assegnabile a
--                         office o tecnici); i gruppi scelgono l'approvatore
--                         tra chi ce l'ha.
--
-- Additivo, idempotente, gated dal modulo `dipendenti`. Bertaiola non impattata.
-- RLS: office tenant-wide; il richiedente vede/crea le proprie; l'approvatore
-- vede/decide quelle a lui instradate. Le mutazioni sensibili passano da
-- service-role nelle action (guardie esplicite).
-- =====================================================================

-- ---------- users.puo_approvare_permessi -----------------------------
alter table public.users
  add column if not exists puo_approvare_permessi boolean not null default false;
comment on column public.users.puo_approvare_permessi is
  'Capacità "approva permessi": l''utente può essere approvatore di un gruppo ferie/permessi.';

-- ---------- gruppi_approvazione --------------------------------------
create table if not exists public.gruppi_approvazione (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  nome             text not null,
  approver_user_id uuid references public.users(id) on delete set null,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists gruppi_approvazione_tenant_idx on public.gruppi_approvazione (tenant_id);

drop trigger if exists trg_gruppi_approvazione_updated_at on public.gruppi_approvazione;
create trigger trg_gruppi_approvazione_updated_at
  before update on public.gruppi_approvazione
  for each row execute function public.tg_set_updated_at();

alter table public.gruppi_approvazione enable row level security;

drop policy if exists gruppi_approvazione_tenant_read on public.gruppi_approvazione;
create policy gruppi_approvazione_tenant_read on public.gruppi_approvazione
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists gruppi_approvazione_office_write on public.gruppi_approvazione;
create policy gruppi_approvazione_office_write on public.gruppi_approvazione
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists gruppi_approvazione_platform_admin_read on public.gruppi_approvazione;
create policy gruppi_approvazione_platform_admin_read on public.gruppi_approvazione
  for select using (public.is_platform_admin());

-- ---------- gruppo_membri (1 dipendente in al più 1 gruppo) -----------
create table if not exists public.gruppo_membri (
  gruppo_id     uuid not null references public.gruppi_approvazione(id) on delete cascade,
  dipendente_id uuid not null references public.dipendenti(id) on delete cascade,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  primary key (gruppo_id, dipendente_id),
  unique (tenant_id, dipendente_id)
);
create index if not exists gruppo_membri_tenant_idx on public.gruppo_membri (tenant_id);
create index if not exists gruppo_membri_dip_idx on public.gruppo_membri (dipendente_id);

alter table public.gruppo_membri enable row level security;

drop policy if exists gruppo_membri_tenant_read on public.gruppo_membri;
create policy gruppo_membri_tenant_read on public.gruppo_membri
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists gruppo_membri_office_write on public.gruppo_membri;
create policy gruppo_membri_office_write on public.gruppo_membri
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists gruppo_membri_platform_admin_read on public.gruppo_membri;
create policy gruppo_membri_platform_admin_read on public.gruppo_membri
  for select using (public.is_platform_admin());

-- ---------- permesso_richieste ---------------------------------------
create table if not exists public.permesso_richieste (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  dipendente_id    uuid not null references public.dipendenti(id) on delete cascade,
  tipo             text not null,                 -- slug catalogo PERMESSO_TIPI
  data_inizio      date not null,
  data_fine        date not null,
  tutto_il_giorno  boolean not null default true,
  ora_inizio       time,                          -- valorizzati se non tutto_il_giorno
  ora_fine         time,
  motivo           text,
  stato            text not null default 'in_attesa'
                     check (stato in ('in_attesa','approvato','rifiutato','modifica_richiesta')),
  gruppo_id        uuid references public.gruppi_approvazione(id) on delete set null,
  approver_user_id uuid references public.users(id) on delete set null,
  creato_da        uuid references public.users(id) on delete set null,
  deciso_da        uuid references public.users(id) on delete set null,
  deciso_at        timestamptz,
  decisione_nota   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint permesso_richieste_date_chk check (data_fine >= data_inizio)
);
create index if not exists permesso_richieste_tenant_stato_idx on public.permesso_richieste (tenant_id, stato);
create index if not exists permesso_richieste_dip_idx on public.permesso_richieste (dipendente_id, data_inizio);
create index if not exists permesso_richieste_approver_idx on public.permesso_richieste (approver_user_id);

drop trigger if exists trg_permesso_richieste_updated_at on public.permesso_richieste;
create trigger trg_permesso_richieste_updated_at
  before update on public.permesso_richieste
  for each row execute function public.tg_set_updated_at();

alter table public.permesso_richieste enable row level security;

-- Letture: office tutto il tenant · il richiedente le proprie · l'approvatore
-- quelle instradate a lui · platform admin read. Le SCRITTURE passano da
-- service-role nelle action (guardie esplicite: richiedente / approvatore / office).
drop policy if exists permesso_richieste_office_read on public.permesso_richieste;
create policy permesso_richieste_office_read on public.permesso_richieste
  for select using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists permesso_richieste_self_read on public.permesso_richieste;
create policy permesso_richieste_self_read on public.permesso_richieste
  for select using (
    tenant_id = public.current_tenant_id()
    and dipendente_id = public.dipendente_del_utente()
  );

drop policy if exists permesso_richieste_approver_read on public.permesso_richieste;
create policy permesso_richieste_approver_read on public.permesso_richieste
  for select using (
    tenant_id = public.current_tenant_id()
    and approver_user_id = auth.uid()
  );

drop policy if exists permesso_richieste_platform_admin_read on public.permesso_richieste;
create policy permesso_richieste_platform_admin_read on public.permesso_richieste
  for select using (public.is_platform_admin());

-- ---------- tipi evento notifica -------------------------------------
insert into public.notification_event_types
  (code, label, description, default_in_app, default_push, default_email, critical, ordine) values
  ('permesso_richiesto', 'Nuova richiesta permesso',
   'Quando un dipendente del tuo gruppo invia una richiesta di ferie/permesso da approvare.',
   true, true, false, false, 82),
  ('permesso_esito', 'Esito richiesta permesso',
   'Quando la tua richiesta di ferie/permesso viene approvata, rifiutata o rimandata.',
   true, true, false, false, 84)
  on conflict (code) do nothing;
