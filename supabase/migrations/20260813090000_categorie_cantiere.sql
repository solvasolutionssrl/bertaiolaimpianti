-- =====================================================================
-- 20260813090000_categorie_cantiere.sql
-- Registro delle categorie di cantiere + smistamento dei valori che
-- arrivano dal gestionale + timbro sui cantieri nati dal gestionale.
--
-- PERCHE'. Oggi `cantieri.categoria` e' testo libero e l'elenco e'
-- semplicemente l'insieme dei valori esistenti. Funziona finche' nessuno
-- sbaglia: su FPM c'e' gia' un `QUADRI - CL` isolato accanto a `QUADRI` e
-- nessuno puo' fonderli. E se domani ERGO rinomina `CONSUNTIVO MAN`, 121
-- cantieri si spaccano in due categorie **in silenzio**.
--
-- Il modello e' quello standard del reference data management: valori
-- canonici nostri + tabella di corrispondenza verso i valori della sorgente,
-- con tre regole sui valori sconosciuti che qui sono vincolanti:
--   1. non si BLOCCA mai l'ingestione;
--   2. non si CREA mai in silenzio un valore canonico da quello che arriva
--      (altrimenti la nostra lista diventa lo specchio della sorgente piu'
--      disordinata);
--   3. il grezzo si conserva SEMPRE, e finisce in una coda "da smistare"
--      dove un umano sceglie: collega a una esistente, oppure promuovi.
--
-- Un tenant senza gestionale usa solo la prima tabella e non si accorge che
-- la seconda esiste.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Le nostre categorie
-- ---------------------------------------------------------------------
create table if not exists public.cantiere_categorie (
  id          uuid primary key default extensions.gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  nome        text not null,
  -- Nascosta invece che cancellata: i cantieri storici che la usano restano
  -- leggibili, sparisce solo dai menu di scelta.
  attiva      boolean not null default true,
  ordine      integer not null default 0,
  -- `gestionale` = promossa da un valore arrivato da fuori, non inventata qui.
  origine     text not null default 'manuale',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint cantiere_categorie_nome_non_vuoto check (btrim(nome) <> ''),
  constraint cantiere_categorie_origine_valida check (origine in ('manuale', 'gestionale'))
);

-- Unicita' insensibile a maiuscole e spazi: "Quadri" e "QUADRI " sono la
-- stessa cosa, ed e' esattamente il doppione che questa tabella evita.
create unique index if not exists cantiere_categorie_nome_uniq
  on public.cantiere_categorie (tenant_id, lower(btrim(nome)));

create index if not exists cantiere_categorie_tenant_idx
  on public.cantiere_categorie (tenant_id, ordine, nome);

-- ---------------------------------------------------------------------
-- 2. Corrispondenza «valore del gestionale» → «categoria nostra»
-- ---------------------------------------------------------------------
create table if not exists public.categoria_mappature (
  id             uuid primary key default extensions.gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  sistema        text not null,
  valore_esterno text not null,
  -- NULL = visto ma non ancora smistato. E' la coda di lavoro dell'ufficio.
  categoria_id   uuid references public.cantiere_categorie(id) on delete set null,
  -- Quante volte l'abbiamo incontrato: un valore visto una volta sola e' un
  -- refuso probabile, uno visto cento volte e' una categoria vera.
  visto_n        integer not null default 1,
  visto_al       timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (tenant_id, sistema, valore_esterno)
);

create index if not exists categoria_mappature_da_smistare_idx
  on public.categoria_mappature (tenant_id, sistema)
  where categoria_id is null;

-- ---------------------------------------------------------------------
-- 3. Timbro sui cantieri nati dal gestionale
-- ---------------------------------------------------------------------
-- Serve all'etichetta «nuovo» per qualche giorno. Colonna esplicita invece
-- di dedurlo da `created_at` + mappatura: un cantiere creato a mano ha lo
-- stesso `created_at`, e dedurre significa sbagliare il giorno che la
-- deduzione non regge piu'.
alter table public.cantieri
  add column if not exists origine_gestionale_al timestamptz;

comment on column public.cantieri.origine_gestionale_al is
  'Quando questo cantiere e'' stato creato automaticamente da una lettura del gestionale. NULL = nato in Kommessa.';

-- ---------------------------------------------------------------------
-- 4. RLS — stesso schema di integrazione_mappature
-- ---------------------------------------------------------------------
alter table public.cantiere_categorie enable row level security;
alter table public.categoria_mappature enable row level security;

drop policy if exists cantiere_categorie_tenant_read on public.cantiere_categorie;
create policy cantiere_categorie_tenant_read on public.cantiere_categorie
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists cantiere_categorie_office_write on public.cantiere_categorie;
create policy cantiere_categorie_office_write on public.cantiere_categorie
  for all using (
    tenant_id = public.current_tenant_id()
    and public.current_role()::text = any (array['owner', 'admin', 'office'])
  ) with check (
    tenant_id = public.current_tenant_id()
    and public.current_role()::text = any (array['owner', 'admin', 'office'])
  );

drop policy if exists cantiere_categorie_platform_admin_read on public.cantiere_categorie;
create policy cantiere_categorie_platform_admin_read on public.cantiere_categorie
  for select using (public.is_platform_admin());

drop policy if exists categoria_mappature_tenant_read on public.categoria_mappature;
create policy categoria_mappature_tenant_read on public.categoria_mappature
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists categoria_mappature_office_write on public.categoria_mappature;
create policy categoria_mappature_office_write on public.categoria_mappature
  for all using (
    tenant_id = public.current_tenant_id()
    and public.current_role()::text = any (array['owner', 'admin', 'office'])
  ) with check (
    tenant_id = public.current_tenant_id()
    and public.current_role()::text = any (array['owner', 'admin', 'office'])
  );

drop policy if exists categoria_mappature_platform_admin_read on public.categoria_mappature;
create policy categoria_mappature_platform_admin_read on public.categoria_mappature
  for select using (public.is_platform_admin());

-- ---------------------------------------------------------------------
-- 5. Seed: le categorie gia' in uso diventano righe del registro
-- ---------------------------------------------------------------------
-- Non e' un'ipotesi: sono i valori che i cantieri veri hanno gia' addosso.
-- Senza questo passo il registro nascerebbe vuoto e la pagina direbbe
-- "nessuna categoria" mentre a schermo se ne vedono undici.
insert into public.cantiere_categorie (tenant_id, nome, origine)
select distinct c.tenant_id, btrim(c.categoria), 'manuale'
from public.cantieri c
where c.categoria is not null and btrim(c.categoria) <> ''
on conflict do nothing;
