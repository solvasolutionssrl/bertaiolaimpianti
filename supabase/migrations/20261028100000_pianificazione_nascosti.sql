-- Pianificazione: dipendenti nascosti dalla vista, scelta di chi guarda (28/10/2026).
--
-- Ognuno decide chi non vuole vedere nella griglia e negli export PDF; la
-- scelta e' sua e lo segue su ogni dispositivo. Non tocca cosa vedono gli
-- altri e non cambia nessun dato della pianificazione.
--
-- Idempotente: si puo' rilanciare.

create table if not exists public.pianificazione_nascosti (
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  dipendente_id uuid not null references public.dipendenti(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, dipendente_id)
);

alter table public.pianificazione_nascosti enable row level security;

drop policy if exists pianificazione_nascosti_self on public.pianificazione_nascosti;
create policy pianificazione_nascosti_self on public.pianificazione_nascosti
  for all
  using (user_id = auth.uid() and tenant_id = public.current_tenant_id())
  with check (user_id = auth.uid() and tenant_id = public.current_tenant_id());

grant select, insert, delete on public.pianificazione_nascosti to authenticated;
revoke all on public.pianificazione_nascosti from anon;

comment on table public.pianificazione_nascosti is
  'Dipendenti che un utente ha nascosto dalla propria vista della pianificazione (griglia ed export PDF). Scelta personale.';
