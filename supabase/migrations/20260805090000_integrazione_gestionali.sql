-- =====================================================================
-- 20260805090000_integrazione_gestionali.sql
-- Ponte fra Kommessa e il gestionale del cliente (primo caso: ERGO di
-- Infominds per FPM Impianti; domani altri clienti con altri ERP).
--
-- ARCHITETTURA — perche' e' fatta cosi':
-- L'agente di sync gira su una VM DENTRO la rete del cliente: ha IP privato
-- e nessuna porta esposta, quindi Vercel NON puo' chiamarlo. Il verso e'
-- sempre agente → cloud. Il "canale" fra i due non e' un'API HTTP ma queste
-- tabelle: Kommessa accoda un'intenzione in `integrazione_outbox`, l'agente
-- la raccoglie, la traduce nel dialetto del gestionale, la invia e riscrive
-- l'esito. Nessuna porta da aprire nella rete del cliente = nessuna security
-- review da superare.
--
-- LINGUA — in `payload` non entra MAI un termine del gestionale (niente
-- workcycleId, niente codici articolo): quelli vivono solo nell'agente.
-- Il vocabolario canonico sta in `packages/api/src/integrazione.ts`.
--
-- ⚠️ VINCOLO che spiega meta' di questo schema: su ERGO le scritture sono
-- append-only e irreversibili via API — non si rileggono (GET → 405) e non
-- si cancellano (nessuna chiave utile per DELETE/PUT). Di conseguenza:
--   * l'idempotenza la garantiamo NOI, con `idempotency_key` UNIQUE;
--   * `esito_esterno` e' l'unica traccia di cio' che e' finito nel gestionale
--     (il nostro registro: la' non possiamo andare a rileggere);
--   * si spinge soltanto cio' che l'ufficio ha gia' approvato.
--
-- Gating: tutto sotto il modulo `integrazione` in `tenant_modules`. Bertaiola
-- non ha la riga → non vede nulla e non e' toccata.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. MAPPATURE — il ponte fra i nostri id e quelli del gestionale
-- ---------------------------------------------------------------------
-- Tabella unica invece di colonne `ergo_*` sparse sulle tabelle di dominio:
-- un cliente nuovo con un ERP diverso non richiede una migration, e la stessa
-- entita' puo' essere mappata su piu' sistemi. Le tabelle di dominio restano
-- pulite da dettagli di integrazione.
create table if not exists public.integrazione_mappature (
  id            uuid primary key default extensions.gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  -- Gestionale di destinazione ('ergo', ...). Testo e non enum: aggiungere un
  -- cliente non deve richiedere una migration.
  sistema       text not null,
  -- Che cosa mappiamo: 'cantiere' | 'dipendente' | 'cliente'.
  entita        text not null,
  -- Id del record in Kommessa (cantieri.id, dipendenti.id, clienti.id).
  entita_id     uuid not null,
  -- Id sul gestionale, come testo: su ERGO sono interi (objectId), altrove
  -- potrebbero essere codici alfanumerici.
  external_id   text not null,
  -- Ultimo snapshot letto dal gestionale: serve a mostrare in UI *cosa* si sta
  -- collegando ("Fincantieri Monfalcone") senza una chiamata all'agente.
  external_dati jsonb not null default '{}'::jsonb,
  -- Come e' nato il collegamento: 'auto' (match automatico) o 'manuale'
  -- (confermato in ufficio). I match automatici incerti vanno rivisti a mano.
  origine       text not null default 'manuale',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Un record di Kommessa → un solo id sul gestionale...
  unique (tenant_id, sistema, entita, entita_id),
  -- ...e viceversa: due cantieri non possono puntare allo stesso objectId,
  -- altrimenti le ore finirebbero sulla commessa sbagliata.
  unique (tenant_id, sistema, entita, external_id)
);

create index if not exists integrazione_mappature_lookup_idx
  on public.integrazione_mappature (tenant_id, sistema, entita, entita_id);

comment on table public.integrazione_mappature is
  'Ponte id Kommessa <-> id gestionale esterno. Una riga per entita e per sistema.';

-- ---------------------------------------------------------------------
-- 2. OUTBOX — cosa Kommessa vuole scrivere sul gestionale
-- ---------------------------------------------------------------------
create table if not exists public.integrazione_outbox (
  id               uuid primary key default extensions.gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  sistema          text not null,
  -- 'ore' | 'km' | 'spesa'
  tipo             text not null,
  -- Payload in lingua Kommessa (vedi packages/api/src/integrazione.ts).
  payload          jsonb not null,
  -- Difesa contro i doppioni: ancorata alla riga di Kommessa che ha originato
  -- l'operazione, non al contenuto. Un retry, un doppio click o un riavvio
  -- dell'agente non creano un secondo documento sul gestionale — dove non
  -- potremmo piu' cancellarlo.
  idempotency_key  text not null,
  stato            text not null default 'in_attesa',
  tentativi        int  not null default 0,
  ultimo_errore    text,
  -- Cosa ha risposto il gestionale (docId, insertedId...). E' il NOSTRO
  -- registro di cio' che e' stato scritto: sul gestionale non si rilegge.
  esito_esterno    jsonb,
  -- Da quale riga di Kommessa nasce: serve per risalire dal documento sul
  -- gestionale alla spesa/timbratura originale quando l'ufficio chiede conto.
  origine_tipo     text,
  origine_id       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  inviato_at       timestamptz,
  unique (tenant_id, sistema, idempotency_key),
  constraint integrazione_outbox_tipo_valido
    check (tipo in ('ore', 'km', 'spesa')),
  constraint integrazione_outbox_stato_valido
    check (stato in ('in_attesa', 'in_corso', 'inviato', 'errore', 'annullato'))
);

-- La coda che l'agente interroga a ogni giro: solo il lavoro da fare.
create index if not exists integrazione_outbox_coda_idx
  on public.integrazione_outbox (tenant_id, sistema, stato, created_at)
  where stato in ('in_attesa', 'errore');

create index if not exists integrazione_outbox_origine_idx
  on public.integrazione_outbox (tenant_id, origine_tipo, origine_id);

comment on table public.integrazione_outbox is
  'Coda delle scritture verso il gestionale. Idempotente per costruzione: sul gestionale non si puo'' cancellare.';

-- ---------------------------------------------------------------------
-- 3. STAGING — cosa l'agente ha letto dal gestionale
-- ---------------------------------------------------------------------
-- I dati letti atterrano qui grezzi e NON vengono scritti direttamente nelle
-- tabelle di dominio: un gestionale che risponde male, a meta' o con campi
-- cambiati non deve poter corrompere le commesse vere. La promozione a
-- `cantieri`/`clienti` e' un passo separato e revisionabile.
create table if not exists public.integrazione_staging (
  id           uuid primary key default extensions.gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  sistema      text not null,
  -- 'commessa' | 'cliente' | 'dipendente'
  entita       text not null,
  external_id  text not null,
  dati         jsonb not null,
  -- Hash del contenuto: se non cambia, non c'e' niente da riconciliare.
  contenuto_hash text,
  letto_at     timestamptz not null default now(),
  unique (tenant_id, sistema, entita, external_id)
);

create index if not exists integrazione_staging_entita_idx
  on public.integrazione_staging (tenant_id, sistema, entita);

comment on table public.integrazione_staging is
  'Dati grezzi letti dal gestionale, prima della riconciliazione nelle tabelle di dominio.';

-- ---------------------------------------------------------------------
-- 4. ESECUZIONI — il diario del sync
-- ---------------------------------------------------------------------
-- Un'integrazione che si rompe in silenzio e' peggio di una che non c'e':
-- l'ufficio continua a fidarsi di dati fermi. Qui si vede l'ultimo giro
-- riuscito, ed e' su questa tabella che si costruisce l'allarme.
create table if not exists public.integrazione_esecuzioni (
  id           uuid primary key default extensions.gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  sistema      text not null,
  -- 'lettura' (gestionale → Kommessa) | 'scrittura' (Kommessa → gestionale)
  direzione    text not null,
  -- Chi l'ha avviato: 'manuale' (tasto Sincronizza) | 'schedulato'
  avvio        text not null default 'manuale',
  avviata_at   timestamptz not null default now(),
  conclusa_at  timestamptz,
  -- 'ok' | 'parziale' | 'errore' — 'parziale' e' il caso vero piu' comune:
  -- 8 righe passate e 2 in errore.
  esito        text,
  letti        int not null default 0,
  scritti      int not null default 0,
  errori       int not null default 0,
  messaggio    text,
  dettaglio    jsonb,
  constraint integrazione_esecuzioni_direzione_valida
    check (direzione in ('lettura', 'scrittura')),
  constraint integrazione_esecuzioni_esito_valido
    check (esito is null or esito in ('ok', 'parziale', 'errore'))
);

create index if not exists integrazione_esecuzioni_recenti_idx
  on public.integrazione_esecuzioni (tenant_id, sistema, avviata_at desc);

comment on table public.integrazione_esecuzioni is
  'Diario dei giri di sincronizzazione. Base per l''allarme "nessun sync riuscito da N ore".';

-- ---------------------------------------------------------------------
-- 5. updated_at automatico (riusa il trigger condiviso del repo)
-- ---------------------------------------------------------------------
drop trigger if exists tg_integrazione_mappature_updated on public.integrazione_mappature;
create trigger tg_integrazione_mappature_updated
  before update on public.integrazione_mappature
  for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_integrazione_outbox_updated on public.integrazione_outbox;
create trigger tg_integrazione_outbox_updated
  before update on public.integrazione_outbox
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------
-- Lettura: chi sta in ufficio deve poter vedere lo stato della coda e gli
-- errori. Scrittura dal browser: solo l'accodamento (il tasto "Sincronizza").
--
-- ⚠️ Qui NON ci sono le policy dell'agente di sync, ed e' un difetto corretto
-- dalla migration `20260806090000_integrazione_ruolo_agente.sql`: un ruolo
-- Postgres dedicato e' soggetto a RLS come tutti, quindi senza policy proprie
-- non riuscirebbe ne' a leggere la coda ne' a farla avanzare. Le policy di
-- questo file passano da `current_tenant_id()`, che legge `auth.jwt()` e su
-- una connessione diretta e' NULL. Vedi quel file per il modello completo.
alter table public.integrazione_mappature   enable row level security;
alter table public.integrazione_outbox      enable row level security;
alter table public.integrazione_staging     enable row level security;
alter table public.integrazione_esecuzioni  enable row level security;

-- --- mappature: l'ufficio le legge e le corregge (match sbagliato) ---
drop policy if exists integrazione_mappature_tenant_read on public.integrazione_mappature;
create policy integrazione_mappature_tenant_read on public.integrazione_mappature
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists integrazione_mappature_office_write on public.integrazione_mappature;
create policy integrazione_mappature_office_write on public.integrazione_mappature
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists integrazione_mappature_platform_admin_read on public.integrazione_mappature;
create policy integrazione_mappature_platform_admin_read on public.integrazione_mappature
  for select using (public.is_platform_admin());

-- --- outbox: lettura tenant, accodamento office, avanzamento solo agente ---
drop policy if exists integrazione_outbox_tenant_read on public.integrazione_outbox;
create policy integrazione_outbox_tenant_read on public.integrazione_outbox
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists integrazione_outbox_office_insert on public.integrazione_outbox;
create policy integrazione_outbox_office_insert on public.integrazione_outbox
  for insert
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists integrazione_outbox_platform_admin_read on public.integrazione_outbox;
create policy integrazione_outbox_platform_admin_read on public.integrazione_outbox
  for select using (public.is_platform_admin());

-- --- staging: sola lettura per il tenant, la scrive l'agente ---
drop policy if exists integrazione_staging_tenant_read on public.integrazione_staging;
create policy integrazione_staging_tenant_read on public.integrazione_staging
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists integrazione_staging_platform_admin_read on public.integrazione_staging;
create policy integrazione_staging_platform_admin_read on public.integrazione_staging
  for select using (public.is_platform_admin());

-- --- esecuzioni: sola lettura per il tenant, le scrive l'agente ---
drop policy if exists integrazione_esecuzioni_tenant_read on public.integrazione_esecuzioni;
create policy integrazione_esecuzioni_tenant_read on public.integrazione_esecuzioni
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists integrazione_esecuzioni_platform_admin_read on public.integrazione_esecuzioni;
create policy integrazione_esecuzioni_platform_admin_read on public.integrazione_esecuzioni
  for select using (public.is_platform_admin());

-- ---------------------------------------------------------------------
-- 7. Attivazione del modulo per FPM Impianti
-- ---------------------------------------------------------------------
-- `sinc_manuale`: in questa fase di collaudo si sincronizza SOLO col tasto in
-- alto a destra. Nessun automatismo finche' non abbiamo verificato con il
-- cliente, davanti a ERGO aperto, che quello che scriviamo e' giusto.
insert into public.tenant_modules (tenant_id, module_code, attivo, config, configured_at)
select t.id,
       'integrazione',
       true,
       jsonb_build_object(
         'sistema', 'ergo',
         'sinc_manuale', true,
         'auto_push', false
       ),
       now()
from public.tenants t
-- `slug` e' un tipo custom: il cast a text e' necessario per il confronto.
where t.slug::text = 'FPMIMP'
on conflict (tenant_id, module_code) do nothing;

-- =====================================================================
-- NOTA OPERATIVA — utente DB per l'agente (da eseguire a mano, non qui:
-- una password non va committata).
--
-- L'agente NON deve usare la service role, che bypassa ogni RLS. Creare un
-- ruolo dedicato con i soli privilegi che gli servono:
--
--   create role kommessa_sync login password '<scelta a mano>';
--   grant usage on schema public to kommessa_sync;
--   grant select, update on public.integrazione_outbox      to kommessa_sync;
--   grant select, insert, update, delete on public.integrazione_staging to kommessa_sync;
--   grant select, insert, update on public.integrazione_esecuzioni to kommessa_sync;
--   grant select, insert, update on public.integrazione_mappature to kommessa_sync;
--
-- Se compromesso, il danno si ferma alle tabelle di integrazione.
-- =====================================================================
