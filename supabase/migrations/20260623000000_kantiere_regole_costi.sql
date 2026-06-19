-- =====================================================================
-- 20260623000000_kantiere_regole_costi.sql
-- Fase I/A modulo Kantiere: regole di maggiorazione ore + costo orario
-- dipendente + ambito (scope) polimorfico delle regole.
-- Additivo. Gating app via modulo kantiere. Bertaiola non impattata.
-- =====================================================================

-- ---------- costo orario sul dipendente ------------------------------
alter table public.dipendenti
  add column if not exists costo_orario numeric(8,2);

-- ---------- kantiere_regole_ore (regole di maggiorazione) ------------
-- tipo: classe di regola che determina come/quando la maggiorazione si applica.
--   soglia_giornaliera        → oltre N ore/giorno = straordinario
--   maggiorazione_straordinario→ % sulle ore straordinarie
--   maggiorazione_viaggio     → % sulle ore di viaggio
--   notturno                  → fascia oraria notturna (params.inizio/fine);
--                               la classificazione automatica è FUORI SCOPE
--   festivo                   → giorni festivi nazionali
--   weekend                   → sabato/domenica
--   personalizzata            → regola libera (params liberi)
create table if not exists public.kantiere_regole_ore (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  nome              text not null,
  tipo              text not null check (tipo in (
                      'soglia_giornaliera',
                      'maggiorazione_straordinario',
                      'maggiorazione_viaggio',
                      'notturno',
                      'festivo',
                      'weekend',
                      'personalizzata'
                    )),
  attiva            boolean not null default true,
  params            jsonb not null default '{}'::jsonb,
  maggiorazione_pct numeric(5,2) not null default 0,
  priorita          integer not null default 100,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists kantiere_regole_ore_tenant_idx on public.kantiere_regole_ore (tenant_id);

drop trigger if exists trg_kantiere_regole_ore_updated_at on public.kantiere_regole_ore;
create trigger trg_kantiere_regole_ore_updated_at
  before update on public.kantiere_regole_ore
  for each row execute function public.tg_set_updated_at();

alter table public.kantiere_regole_ore enable row level security;

drop policy if exists kantiere_regole_ore_tenant_read on public.kantiere_regole_ore;
create policy kantiere_regole_ore_tenant_read on public.kantiere_regole_ore
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists kantiere_regole_ore_office_write on public.kantiere_regole_ore;
create policy kantiere_regole_ore_office_write on public.kantiere_regole_ore
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists kantiere_regole_ore_platform_admin_read on public.kantiere_regole_ore;
create policy kantiere_regole_ore_platform_admin_read on public.kantiere_regole_ore
  for select using (public.is_platform_admin());

-- ---------- kantiere_regola_ambito (scope polimorfico) ----------------
-- tipo_target: 'tenant' (target_id null → vale per tutti), 'dipendente',
-- 'cantiere'. target_id è polimorfico: NESSUNA FK reale (regge dipendente
-- o cantiere a seconda di tipo_target).
create table if not exists public.kantiere_regola_ambito (
  id           uuid primary key default gen_random_uuid(),
  regola_id    uuid not null references public.kantiere_regole_ore(id) on delete cascade,
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  tipo_target  text not null check (tipo_target in ('tenant','dipendente','cantiere')),
  target_id    uuid,
  unique (regola_id, tipo_target, target_id)
);
create index if not exists kantiere_regola_ambito_regola_idx on public.kantiere_regola_ambito (regola_id);
create index if not exists kantiere_regola_ambito_tenant_idx on public.kantiere_regola_ambito (tenant_id);

alter table public.kantiere_regola_ambito enable row level security;

drop policy if exists kantiere_regola_ambito_tenant_read on public.kantiere_regola_ambito;
create policy kantiere_regola_ambito_tenant_read on public.kantiere_regola_ambito
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists kantiere_regola_ambito_office_write on public.kantiere_regola_ambito;
create policy kantiere_regola_ambito_office_write on public.kantiere_regola_ambito
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists kantiere_regola_ambito_platform_admin_read on public.kantiere_regola_ambito;
create policy kantiere_regola_ambito_platform_admin_read on public.kantiere_regola_ambito
  for select using (public.is_platform_admin());
