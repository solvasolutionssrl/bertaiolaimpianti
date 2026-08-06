-- =====================================================================
-- 20260806160000_staging_campi_canonici.sql
-- I dati letti dal gestionale arrivano gia' in lingua canonica.
--
-- COS'ERA SBAGLIATO. `POST /letture` accettava solo `{externalId, dati}`, con
-- `dati` = la risposta grezza dell'ERP. Kommessa doveva quindi *indovinare*
-- dove fosse il nome e dove il codice, provando una lista di chiavi possibili
-- (`descrizione`/`description`/`nome`/`name`…). Su ERGO nessuna di quelle
-- funzionava: i campi si chiamano `objectId`, `description`, `companyId`.
--
-- Aggiungere quei nomi al nostro lettore avrebbe risolto il caso e rotto il
-- principio: sarebbe stato dialetto ERGO dentro Kommessa, in direzione
-- lettura. Il prossimo cliente avrebbe richiesto un'altra lista di chiavi, e
-- il lettore sarebbe diventato una collezione di casi particolari.
--
-- COME FUNZIONA ORA. La traduzione la fa l'agente, che il suo gestionale lo
-- conosce, e ci consegna campi con un nome solo. `dati` resta, ma come
-- allegato grezzo per capire cosa e' arrivato — non come fonte da interpretare.
-- =====================================================================

alter table public.integrazione_staging
  add column if not exists codice              text,
  add column if not exists nome                text,
  add column if not exists cliente_external_id text,
  add column if not exists attiva              boolean;

comment on column public.integrazione_staging.codice is
  'Codice leggibile sul gestionale. Se li'' l''identificativo funge da codice, l''agente ripete l''externalId.';
comment on column public.integrazione_staging.nome is
  'Descrizione leggibile: e'' cio'' che l''ufficio vede quando abbina.';
comment on column public.integrazione_staging.cliente_external_id is
  'Committente sul gestionale. Serve ai documenti (km, spese) che lo pretendono.';
comment on column public.integrazione_staging.attiva is
  'false = chiusa/cessata sul gestionale. Guida i default: un dipendente non piu'' in forza nasce disattivato, una commessa chiusa non si propone.';

-- Chi abbina cerca per codice: senza indice, con qualche migliaio di record
-- diventa una scansione a ogni apertura di pagina.
create index if not exists integrazione_staging_codice_idx
  on public.integrazione_staging (tenant_id, sistema, entita, codice);
