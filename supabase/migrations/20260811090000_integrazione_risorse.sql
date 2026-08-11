-- =====================================================================
-- 20260811090000_integrazione_risorse.sql
-- Da coda di lavoro ad API a risorse.
--
-- COS'ERA SBAGLIATO. Kommessa preparava un elenco di operazioni da eseguire
-- (`integrazione_outbox`) e l'agente lo consumava. Sembrava disaccoppiato ma
-- non lo era: per decidere *cosa* accodare, Kommessa applicava politiche —
-- solo rapportini approvati, solo l'autista, solo spese confermate. Sono
-- scelte giuste per FPM e arbitrarie per chiunque altro. E se all'agente
-- serviva un campo che non mandavamo, bisognava cambiare il NOSTRO codice.
--
-- COME FUNZIONA ORA. Kommessa espone le **risorse complete** in sola lettura,
-- con tutti gli attributi e senza filtri di merito. L'agente interroga, decide
-- cosa gli serve, traduce e scrive sul suo gestionale. Aggiungere un attributo
-- domani non rompe nessun agente gia' installato.
--
-- COSA RESTA DALLA VECCHIA IMPOSTAZIONE, e perche'. Il registro di **cio' che
-- e' gia' stato scritto**. Su un gestionale dove non si rilegge e non si
-- cancella e' l'informazione piu' preziosa del sistema: se vivesse solo nel
-- giornale locale della VM, il giorno che quel disco muore non ci sarebbe modo
-- di sapere cosa e' gia' partito, e riprovare significherebbe scrivere doppio
-- per sempre. Quel registro sta da noi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Via la coda di lavoro
-- ---------------------------------------------------------------------
-- Conteneva solo righe di collaudo. Le politiche che decidevano cosa
-- accodare se ne vanno con lei: adesso stanno dall'altra parte.
drop table if exists public.integrazione_outbox;

-- ---------------------------------------------------------------------
-- 2. Registro delle scritture
-- ---------------------------------------------------------------------
create table if not exists public.integrazione_scritture (
  id           uuid primary key default extensions.gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  sistema      text not null,

  -- Quale risorsa di Kommessa e' finita sul gestionale, e quale riga.
  -- Non c'e' chiave esterna: le risorse vivono in tabelle diverse (ore,
  -- spese, viaggi) e un vincolo per ciascuna renderebbe la tabella rigida
  -- proprio dove serve che sia estendibile.
  risorsa      text not null,
  risorsa_id   uuid not null,

  -- Una stessa riga puo' produrre piu' scritture distinte: una riga di
  -- rapportino porta ordinarie, straordinarie e viaggio, che sul gestionale
  -- sono registrazioni separate. Stringa vuota quando non serve, cosi' il
  -- vincolo di unicita' funziona senza espressioni.
  variante     text not null default '',

  esito        text not null default 'ok',
  -- Cosa ha risposto il gestionale (numero documento, protocollo...). E'
  -- l'unica traccia: la' non si rilegge.
  external_ref jsonb,
  errore       text,

  -- Chi l'ha confermata: serve a capire quale agente ha scritto cosa quando
  -- ce n'e' piu' d'uno, o dopo che uno e' stato sostituito.
  token_id     uuid references public.api_tokens(id) on delete set null,
  scritto_at   timestamptz not null default now(),

  -- La difesa contro il doppio invio: confermare due volte la stessa cosa
  -- non crea due righe, e `gia inviato` resta una domanda con una risposta
  -- sola.
  unique (tenant_id, sistema, risorsa, risorsa_id, variante),
  constraint integrazione_scritture_esito_valido check (esito in ('ok', 'errore'))
);

-- La domanda piu' frequente e' «cosa e' gia' partito per questa risorsa».
create index if not exists integrazione_scritture_risorsa_idx
  on public.integrazione_scritture (tenant_id, sistema, risorsa, risorsa_id);

create index if not exists integrazione_scritture_recenti_idx
  on public.integrazione_scritture (tenant_id, sistema, scritto_at desc);

comment on table public.integrazione_scritture is
  'Registro di cio'' che e'' gia'' stato scritto sul gestionale. Su ERP append-only e'' l''unica difesa contro il doppio invio.';

alter table public.integrazione_scritture enable row level security;

-- Lettura per l'ufficio (vedere cosa e' partito) e per il super admin.
-- Scrittura solo via service role: la conferma passa dall'API, che sa quale
-- token sta parlando.
drop policy if exists integrazione_scritture_tenant_read on public.integrazione_scritture;
create policy integrazione_scritture_tenant_read on public.integrazione_scritture
  for select to authenticated using (tenant_id = public.current_tenant_id());

drop policy if exists integrazione_scritture_platform_admin_read on public.integrazione_scritture;
create policy integrazione_scritture_platform_admin_read on public.integrazione_scritture
  for select to authenticated using (public.is_platform_admin());

-- ---------------------------------------------------------------------
-- 3. Modalita' di invio
-- ---------------------------------------------------------------------
-- `simulazione` (predefinita): le risorse si leggono, ma ogni record arriva
-- con `inviabile: false`. L'agente puo' provare tutta la catena — traduzione,
-- paginazione, ripresa — senza che una sola riga finisca davvero nel
-- gestionale del cliente.
--
-- Il gate manuale per-riga non esiste piu': l'approvazione in Kommessa E' il
-- consenso. Questo interruttore e' un'altra cosa — una sicura di collaudo,
-- che si toglie una volta sola quando il cliente ha visto.
--
-- `collaudo_esterni`: identificativi del gestionale che restano inviabili
-- anche in simulazione. Serve a provare sul cantiere di prova senza aprire
-- tutto il resto.
update public.tenant_modules tm
   set config = tm.config
              || jsonb_build_object('modalita', 'simulazione')
              || jsonb_build_object('collaudo_esterni', '[]'::jsonb),
       updated_at = now()
 where tm.module_code = 'integrazione'
   and not (tm.config ? 'modalita');

-- `sinc_manuale` e `auto_push` non vogliono piu' dire niente: la
-- sincronizzazione non la decide piu' Kommessa.
update public.tenant_modules
   set config = config - 'sinc_manuale' - 'auto_push'
 where module_code = 'integrazione';
