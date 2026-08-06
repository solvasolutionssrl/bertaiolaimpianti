-- =====================================================================
-- 20260806090000_integrazione_ruolo_agente.sql
-- Corregge un difetto della 20260805090000: l'agente di sync non poteva
-- scrivere NIENTE.
--
-- COS'ERA ROTTO. La migration precedente creava solo policy di SELECT e
-- INSERT, con un commento che diceva "l'avanzamento di stato lo fa l'agente
-- via service role" — mentre la nota operativa in fondo allo stesso file
-- prescriveva un ruolo dedicato. Le due cose si contraddicono:
--   * la service role bypassa RLS, quindi con quella funzionerebbe;
--   * un ruolo Postgres normale e' invece SOGGETTO a RLS, e i GRANT da soli
--     non bastano: senza una policy che lo autorizzi, ogni UPDATE/INSERT
--     viene rifiutato.
-- In piu' le policy esistenti passano da `current_tenant_id()`, che legge
-- `auth.jwt()`: su una connessione Postgres diretta il JWT non esiste, la
-- funzione torna NULL e la condizione e' sempre falsa. L'agente non sarebbe
-- riuscito nemmeno a LEGGERE la coda.
--
-- PERCHE' NON SI RISOLVE CON BYPASSRLS. Sarebbe una riga, ma butterebbe via
-- l'unica ragione per cui si e' scelto un ruolo dedicato invece della service
-- role: se l'agente viene compromesso, il danno deve fermarsi alle tabelle di
-- integrazione.
--
-- PERCHE' NON SI CABLA IL SISTEMA NELLA POLICY. Scrivere `sistema = 'ergo'`
-- dentro le policy funzionerebbe oggi e romperebbe la neutralita' domani: il
-- secondo cliente con un altro ERP richiederebbe altre policy. Qui invece
-- l'abbinamento ruolo → (tenant, sistema) e' un DATO, in `integrazione_agenti`.
-- Aggiungere un cliente = creare il ruolo + inserire una riga. Zero DDL.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Registro degli agenti: quale ruolo DB lavora per quale tenant/sistema
-- ---------------------------------------------------------------------
create table if not exists public.integrazione_agenti (
  -- Nome del ruolo Postgres con cui l'agente si connette (= `current_user`).
  ruolo_db   text primary key,
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  sistema    text not null,
  attivo     boolean not null default true,
  note       text,
  created_at timestamptz not null default now(),
  -- Un solo agente per coppia tenant+sistema: due processi che lavorano la
  -- stessa coda si ruberebbero le righe a vicenda.
  unique (tenant_id, sistema),
  -- Rete di sicurezza: se qui finisse un ruolo applicativo, le policy sotto
  -- aprirebbero le tabelle di integrazione a TUTTI gli utenti dell'app.
  constraint integrazione_agenti_mai_ruoli_app
    check (ruolo_db not in ('anon', 'authenticated', 'service_role', 'postgres', 'public'))
);

comment on table public.integrazione_agenti is
  'Ruoli Postgres degli agenti di sync esterni, con il tenant e il sistema su cui possono operare. Guida le policy RLS: aggiungere un cliente non richiede nuove policy.';

alter table public.integrazione_agenti enable row level security;

-- L'agente deve poter leggere la PROPRIA riga: le policy sotto la
-- interrogano. Non vede quelle degli altri agenti.
drop policy if exists integrazione_agenti_self_read on public.integrazione_agenti;
create policy integrazione_agenti_self_read on public.integrazione_agenti
  for select using (ruolo_db = current_user);

drop policy if exists integrazione_agenti_platform_admin_read on public.integrazione_agenti;
create policy integrazione_agenti_platform_admin_read on public.integrazione_agenti
  for select using (public.is_platform_admin());

-- ---------------------------------------------------------------------
-- 1-bis. Le policy dell'app non devono nemmeno essere VALUTATE dall'agente
-- ---------------------------------------------------------------------
-- Postgres valuta TUTTE le policy permissive di una tabella e ne fa l'OR.
-- Quelle scritte per l'app passano da `current_tenant_id()`/`is_platform_admin()`,
-- che chiamano `auth.jwt()`. L'agente non ha USAGE sullo schema `auth`, quindi
-- per lui quella chiamata non "torna NULL": solleva
--     ERROR 42501: permission denied for schema auth
-- e fa fallire l'intera query, anche quando una sua policy lo autorizzerebbe.
-- Verificato in sessione impersonando il ruolo.
--
-- Si potrebbe concedere `usage on schema auth` all'agente, ma allargare la sua
-- superficie fino allo schema di autenticazione per far funzionare una lettura
-- e' il contrario di quello che si vuole da un ruolo confinato. Meglio
-- restringere quelle policy ai ruoli dell'app: cosi' per l'agente non vengono
-- proprio prese in considerazione.
alter policy integrazione_mappature_tenant_read         on public.integrazione_mappature  to authenticated;
alter policy integrazione_mappature_office_write        on public.integrazione_mappature  to authenticated;
alter policy integrazione_mappature_platform_admin_read on public.integrazione_mappature  to authenticated;
alter policy integrazione_outbox_tenant_read            on public.integrazione_outbox     to authenticated;
alter policy integrazione_outbox_office_insert          on public.integrazione_outbox     to authenticated;
alter policy integrazione_outbox_platform_admin_read    on public.integrazione_outbox     to authenticated;
alter policy integrazione_staging_tenant_read           on public.integrazione_staging    to authenticated;
alter policy integrazione_staging_platform_admin_read   on public.integrazione_staging    to authenticated;
alter policy integrazione_esecuzioni_tenant_read        on public.integrazione_esecuzioni to authenticated;
alter policy integrazione_esecuzioni_platform_admin_read on public.integrazione_esecuzioni to authenticated;
alter policy integrazione_agenti_platform_admin_read    on public.integrazione_agenti     to authenticated;

-- Speculare: le policy dell'agente (sotto) interrogano `integrazione_agenti`, e
-- la sotto-query gira con i privilegi di chi sta eseguendo. Senza questo grant
-- un utente dell'app inciamperebbe nello stesso errore, al contrario. La RLS
-- su quella tabella lo limita comunque alla propria riga — che per un utente
-- dell'app non esiste, quindi non vede nulla.
grant select on public.integrazione_agenti to authenticated;

-- ---------------------------------------------------------------------
-- 2. Predicato condiviso
-- ---------------------------------------------------------------------
-- Volutamente NON e' una funzione SECURITY DEFINER (il repo ne ha gia' fatto
-- il lockdown il 10/07): e' una EXISTS in chiaro dentro ogni policy, e
-- all'agente si concede SELECT sul registro. Meno magia, stessa garanzia.

-- ---------------------------------------------------------------------
-- 3. Policy per gli agenti
-- ---------------------------------------------------------------------
-- Applicate a PUBLIC e non a un ruolo nominato: per un utente dell'app
-- `current_user` vale `authenticated`, che il CHECK sopra vieta nel registro
-- → la EXISTS e' sempre falsa e la policy non concede nulla. Cosi' un nuovo
-- cliente non richiede DDL.

-- --- OUTBOX: legge la coda e ne fa avanzare lo stato ---
drop policy if exists integrazione_outbox_agente_read on public.integrazione_outbox;
create policy integrazione_outbox_agente_read on public.integrazione_outbox
  for select using (
    exists (select 1 from public.integrazione_agenti a
            where a.ruolo_db = current_user and a.attivo
              and a.tenant_id = integrazione_outbox.tenant_id
              and a.sistema  = integrazione_outbox.sistema)
  );

drop policy if exists integrazione_outbox_agente_update on public.integrazione_outbox;
create policy integrazione_outbox_agente_update on public.integrazione_outbox
  for update using (
    exists (select 1 from public.integrazione_agenti a
            where a.ruolo_db = current_user and a.attivo
              and a.tenant_id = integrazione_outbox.tenant_id
              and a.sistema  = integrazione_outbox.sistema)
  ) with check (
    exists (select 1 from public.integrazione_agenti a
            where a.ruolo_db = current_user and a.attivo
              and a.tenant_id = integrazione_outbox.tenant_id
              and a.sistema  = integrazione_outbox.sistema)
  );

-- Nessuna policy di INSERT o DELETE sull'outbox per l'agente: la coda la
-- riempie Kommessa. Un agente che sapesse accodare potrebbe farsi scrivere
-- sul gestionale qualsiasi cosa.

-- --- STAGING: e' roba sua, la riscrive a ogni giro ---
drop policy if exists integrazione_staging_agente_write on public.integrazione_staging;
create policy integrazione_staging_agente_write on public.integrazione_staging
  for all using (
    exists (select 1 from public.integrazione_agenti a
            where a.ruolo_db = current_user and a.attivo
              and a.tenant_id = integrazione_staging.tenant_id
              and a.sistema  = integrazione_staging.sistema)
  ) with check (
    exists (select 1 from public.integrazione_agenti a
            where a.ruolo_db = current_user and a.attivo
              and a.tenant_id = integrazione_staging.tenant_id
              and a.sistema  = integrazione_staging.sistema)
  );

-- --- ESECUZIONI: apre e chiude le proprie righe di diario ---
drop policy if exists integrazione_esecuzioni_agente_read on public.integrazione_esecuzioni;
create policy integrazione_esecuzioni_agente_read on public.integrazione_esecuzioni
  for select using (
    exists (select 1 from public.integrazione_agenti a
            where a.ruolo_db = current_user and a.attivo
              and a.tenant_id = integrazione_esecuzioni.tenant_id
              and a.sistema  = integrazione_esecuzioni.sistema)
  );

drop policy if exists integrazione_esecuzioni_agente_insert on public.integrazione_esecuzioni;
create policy integrazione_esecuzioni_agente_insert on public.integrazione_esecuzioni
  for insert with check (
    exists (select 1 from public.integrazione_agenti a
            where a.ruolo_db = current_user and a.attivo
              and a.tenant_id = integrazione_esecuzioni.tenant_id
              and a.sistema  = integrazione_esecuzioni.sistema)
  );

drop policy if exists integrazione_esecuzioni_agente_update on public.integrazione_esecuzioni;
create policy integrazione_esecuzioni_agente_update on public.integrazione_esecuzioni
  for update using (
    exists (select 1 from public.integrazione_agenti a
            where a.ruolo_db = current_user and a.attivo
              and a.tenant_id = integrazione_esecuzioni.tenant_id
              and a.sistema  = integrazione_esecuzioni.sistema)
  ) with check (
    exists (select 1 from public.integrazione_agenti a
            where a.ruolo_db = current_user and a.attivo
              and a.tenant_id = integrazione_esecuzioni.tenant_id
              and a.sistema  = integrazione_esecuzioni.sistema)
  );

-- Nessun DELETE: il diario non si cancella, e' il registro di cosa e'
-- successo (e su un gestionale append-only e' l'unica traccia che abbiamo).

-- --- MAPPATURE: propone match automatici, non tocca quelli confermati ---
drop policy if exists integrazione_mappature_agente_read on public.integrazione_mappature;
create policy integrazione_mappature_agente_read on public.integrazione_mappature
  for select using (
    exists (select 1 from public.integrazione_agenti a
            where a.ruolo_db = current_user and a.attivo
              and a.tenant_id = integrazione_mappature.tenant_id
              and a.sistema  = integrazione_mappature.sistema)
  );

drop policy if exists integrazione_mappature_agente_insert on public.integrazione_mappature;
create policy integrazione_mappature_agente_insert on public.integrazione_mappature
  for insert with check (
    origine = 'auto'
    and exists (select 1 from public.integrazione_agenti a
                where a.ruolo_db = current_user and a.attivo
                  and a.tenant_id = integrazione_mappature.tenant_id
                  and a.sistema  = integrazione_mappature.sistema)
  );

-- L'agente puo' aggiornare SOLO le mappature che ha proposto lui
-- (`origine='auto'`), e non puo' promuoverle a 'manuale'. Se l'ufficio ha
-- corretto un abbinamento sbagliato, un ri-match automatico non deve poterlo
-- sovrascrivere: e' esattamente il caso in cui le ore finirebbero, in
-- silenzio, sulla commessa sbagliata.
drop policy if exists integrazione_mappature_agente_update on public.integrazione_mappature;
create policy integrazione_mappature_agente_update on public.integrazione_mappature
  for update using (
    origine = 'auto'
    and exists (select 1 from public.integrazione_agenti a
                where a.ruolo_db = current_user and a.attivo
                  and a.tenant_id = integrazione_mappature.tenant_id
                  and a.sistema  = integrazione_mappature.sistema)
  ) with check (
    origine = 'auto'
    and exists (select 1 from public.integrazione_agenti a
                where a.ruolo_db = current_user and a.attivo
                  and a.tenant_id = integrazione_mappature.tenant_id
                  and a.sistema  = integrazione_mappature.sistema)
  );

-- ---------------------------------------------------------------------
-- 4. Il ruolo dell'agente FPM
-- ---------------------------------------------------------------------
-- Creato SENZA password: cosi' non puo' ancora autenticarsi. La password la
-- imposta a mano chi gestisce l'infrastruttura, e non passa da un file
-- versionato:
--     alter role kommessa_sync with password '<scelta a mano>';
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'kommessa_sync') then
    create role kommessa_sync login noinherit;
  end if;
end
$$;

grant usage on schema public to kommessa_sync;

-- Privilegi di tabella. Sono il primo cancello; le policy sopra sono il
-- secondo. Servono entrambi.
grant select                         on public.integrazione_agenti     to kommessa_sync;
grant select, update                 on public.integrazione_outbox     to kommessa_sync;
grant select, insert, update, delete on public.integrazione_staging    to kommessa_sync;
grant select, insert, update         on public.integrazione_esecuzioni to kommessa_sync;
grant select, insert, update         on public.integrazione_mappature  to kommessa_sync;

-- Registrazione dell'agente FPM.
insert into public.integrazione_agenti (ruolo_db, tenant_id, sistema, note)
select 'kommessa_sync', t.id, 'ergo', 'Agente sulla VM Ubuntu dentro la rete FPM'
from public.tenants t
where t.slug::text = 'FPMIMP'
on conflict (ruolo_db) do nothing;
