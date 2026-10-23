-- =====================================================================
-- 20261023150000_sottocantieri.sql
-- Sottocantieri (fasi) di un cantiere, mondo Kantiere.
--
-- Un cantiere puo' essere composto da piu' sottocantieri (per FPM arriveranno
-- da ERGO; l'ufficio li puo' anche scrivere a mano). Le ore si possono
-- attribuire alla fase: colonna `sottocantiere_id` FACOLTATIVA su timbrature,
-- righe ore, spese e blocchi di pianificazione. Senza fase tutto resta come
-- prima: nessuna riga esistente cambia.
--
-- Idempotente (si applica con `supabase db query --linked < file`).
-- =====================================================================

create table if not exists public.sottocantieri (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  cantiere_id           uuid not null references public.cantieri(id) on delete cascade,
  nome                  text not null,
  descrizione           text,
  -- Codice della fase nel gestionale (testo: puo' essere "25098.01"). Unico dentro il cantiere.
  codice                text,
  stato                 text not null default 'attivo' check (stato in ('attivo','chiuso')),
  -- Valorizzato se la fase e' nata dal gestionale: nome e codice non si rinominano a mano.
  origine_gestionale_al timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- Serve alla chiave esterna composta delle tabelle che la citano: la fase
  -- scelta DEVE appartenere al cantiere della riga, e lo garantisce il database.
  unique (id, cantiere_id)
);
create index if not exists sottocantieri_cantiere_idx on public.sottocantieri (tenant_id, cantiere_id);
create unique index if not exists sottocantieri_codice_uq
  on public.sottocantieri (cantiere_id, codice) where codice is not null;

drop trigger if exists trg_sottocantieri_updated_at on public.sottocantieri;
create trigger trg_sottocantieri_updated_at
  before update on public.sottocantieri
  for each row execute function public.tg_set_updated_at();

alter table public.sottocantieri enable row level security;

drop policy if exists sottocantieri_tenant_read on public.sottocantieri;
create policy sottocantieri_tenant_read on public.sottocantieri
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists sottocantieri_office_write on public.sottocantieri;
create policy sottocantieri_office_write on public.sottocantieri
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists sottocantieri_platform_admin_read on public.sottocantieri;
create policy sottocantieri_platform_admin_read on public.sottocantieri
  for select using (public.is_platform_admin());

grant select on public.sottocantieri to authenticated;
grant insert, update, delete on public.sottocantieri to authenticated;

comment on table public.sottocantieri is
  'Fasi (sottocantieri) di un cantiere. Facoltative: le ore si attribuiscono alla fase solo se scelta.';

-- ---------- la fase sulle righe operative ----------------------------
-- Chiave esterna COMPOSTA (sottocantiere_id, cantiere_id): con la fase vuota
-- non si controlla niente; con la fase piena deve essere del cantiere della riga.

alter table public.timbrature add column if not exists sottocantiere_id uuid;
alter table public.timbrature drop constraint if exists timbrature_sottocantiere_fk;
alter table public.timbrature add constraint timbrature_sottocantiere_fk
  foreign key (sottocantiere_id, cantiere_id) references public.sottocantieri (id, cantiere_id) on delete set null (sottocantiere_id);
create index if not exists timbrature_sottocantiere_idx on public.timbrature (sottocantiere_id) where sottocantiere_id is not null;

alter table public.rapportino_righe add column if not exists sottocantiere_id uuid;
alter table public.rapportino_righe drop constraint if exists rapportino_righe_sottocantiere_fk;
alter table public.rapportino_righe add constraint rapportino_righe_sottocantiere_fk
  foreign key (sottocantiere_id, cantiere_id) references public.sottocantieri (id, cantiere_id) on delete set null (sottocantiere_id);
create index if not exists rapportino_righe_sottocantiere_idx on public.rapportino_righe (sottocantiere_id) where sottocantiere_id is not null;

alter table public.spese add column if not exists sottocantiere_id uuid;
alter table public.spese drop constraint if exists spese_sottocantiere_fk;
alter table public.spese add constraint spese_sottocantiere_fk
  foreign key (sottocantiere_id, cantiere_id) references public.sottocantieri (id, cantiere_id) on delete set null (sottocantiere_id);

alter table public.pianificazione_blocchi add column if not exists sottocantiere_id uuid;
alter table public.pianificazione_blocchi drop constraint if exists pianificazione_blocchi_sottocantiere_fk;
alter table public.pianificazione_blocchi add constraint pianificazione_blocchi_sottocantiere_fk
  foreign key (sottocantiere_id, cantiere_id) references public.sottocantieri (id, cantiere_id) on delete set null (sottocantiere_id);
