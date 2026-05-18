-- ============================================================
-- Notification preferences (per-user, per-event-type)
-- ============================================================
-- Modello: 1 riga per (user_id, event_type). Se NON esiste riga →
-- defaults from `notification_event_types`. Tre canali boolean:
-- in_app, push, email. Quiet hours (24h tz Europe/Rome) per
-- silenziare push notturni senza perdere in_app.
-- ============================================================

create table if not exists public.notification_event_types (
  code text primary key,
  label text not null,
  description text,
  default_in_app boolean not null default true,
  default_push boolean not null default true,
  default_email boolean not null default false,
  critical boolean not null default false, -- non disattivabile
  ordine smallint not null default 100
);

insert into public.notification_event_types
  (code, label, description, default_push, default_email, critical, ordine) values
  ('ticket_assigned',       'Ticket assegnato a me',        'Quando ti viene assegnato un ticket dal team office.',                  true,  true,  true,  10),
  ('ticket_created',        'Nuovo ticket nel tenant',      'Quando un cliente o operatore crea un ticket nuovo. Solo office/admin.', true,  false, false, 20),
  ('fase_target_raggiunto', 'Foto fase complete',           'Quando una fase raggiunge il numero minimo di foto richieste.',         true,  false, false, 30),
  ('fase_zero_foto',        'Fase senza foto da 3+ giorni', 'Promemoria automatico per ricordare le foto in cantiere.',              true,  false, false, 40),
  ('dico_mancante',         'DICO mancante a 7gg',          'Allerta su commesse in collaudo da 7+ giorni senza DICO.',              true,  true,  true,  50),
  ('commessa_assegnata',    'Commessa assegnata a me',      'Quando vieni nominato responsabile o tecnico di una commessa.',         true,  false, false, 60),
  ('intervento_oggi',       'Intervento oggi',              'Promemoria mattutino degli interventi della giornata.',                 true,  false, false, 70)
  on conflict (code) do nothing;

create table if not exists public.notification_preferences (
  user_id uuid not null references public.users(id) on delete cascade,
  event_code text not null references public.notification_event_types(code) on delete cascade,
  in_app boolean not null default true,
  push boolean not null default true,
  email boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, event_code)
);

-- Quiet hours globali per-utente (push silenziati in questa fascia)
alter table public.users
  add column if not exists quiet_hours_start smallint,  -- 0..23 oppure NULL
  add column if not exists quiet_hours_end smallint;    -- 0..23 oppure NULL

alter table public.notification_event_types enable row level security;
alter table public.notification_preferences enable row level security;

-- event_types: lettura libera per ogni utente autenticato (è un catalogo)
create policy net_read on public.notification_event_types
  for select using (auth.uid() is not null);

-- preferences: self-only
create policy np_self_select on public.notification_preferences
  for select using (user_id = auth.uid());
create policy np_self_upsert on public.notification_preferences
  for insert with check (user_id = auth.uid());
create policy np_self_update on public.notification_preferences
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy np_self_delete on public.notification_preferences
  for delete using (user_id = auth.uid());

-- ============================================================
-- Helper: vista "preferenze effettive" che fa fallback ai default
-- ============================================================
create or replace view public.notification_preferences_effective as
select
  u.id as user_id,
  et.code as event_code,
  et.label,
  et.description,
  et.critical,
  et.ordine,
  coalesce(np.in_app, et.default_in_app) as in_app,
  coalesce(np.push, et.default_push) as push,
  coalesce(np.email, et.default_email) as email
from public.users u
cross join public.notification_event_types et
left join public.notification_preferences np
  on np.user_id = u.id and np.event_code = et.code;

comment on view public.notification_preferences_effective is
  'Preferenze notifica per ogni (user, event_type) con fallback ai default del catalogo.';
