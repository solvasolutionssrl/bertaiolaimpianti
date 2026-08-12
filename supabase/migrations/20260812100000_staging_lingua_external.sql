-- =====================================================================
-- 20260812100000_staging_lingua_external.sql
-- `integrazione_staging` parla la lingua canonica dell'API v2.
--
-- REGOLA: `external_*` = dato del gestionale. Senza prefisso = dato di
-- Kommessa. Il prefisso sta in TESTA, sempre.
--
-- Perche' rinominare anche in tabella e non solo nel JSON: la colonna si
-- chiamava `codice` e conteneva il codice LORO, mentre in tutto il resto del
-- database `codice` e' il NOSTRO (`cantieri.codice` = CAN-00190). Due
-- significati opposti per la stessa parola sono la trappola che questa
-- rinomina esiste per chiudere; lasciarla dentro il database la lascerebbe
-- viva per il prossimo che ci mette le mani.
--
-- I tre campi nuovi arrivano da una richiesta concreta: ERGO manda gia'
-- `group.description` (= la nostra categoria) su 240 record su 243, e
-- `address` su 49. Li stavamo buttando nel grezzo senza raccoglierli.
-- Tutti opzionali: un gestionale che non li ha resta valido.
--
-- Nessuna perdita di dati: rename, non drop. Il deposito verra' comunque
-- riscritto al primo giro dell'agente aggiornato.
-- =====================================================================

alter table public.integrazione_staging
  rename column codice to external_codice;

alter table public.integrazione_staging
  rename column cliente_external_id to external_cliente_id;

alter table public.integrazione_staging
  -- Categoria/gruppo di lavoro sul gestionale (ERGO: `group.description`).
  add column if not exists categoria    text,
  -- Indirizzo gia' composto in una riga dall'agente: la nostra colonna e'
  -- una stringa sola, e il geocoder vuole quella. Se il gestionale lo tiene
  -- a pezzi, ricomporli e' compito suo — accettare la sua forma vorrebbe
  -- dire farsi entrare il dialetto in casa.
  add column if not exists indirizzo    text,
  -- Nome del committente denormalizzato: serve quando l'agente deposita le
  -- commesse ma non i clienti, e senza l'ufficio abbinerebbe alla cieca.
  add column if not exists cliente_nome text;

comment on column public.integrazione_staging.external_codice is
  'Codice leggibile SUL GESTIONALE (commessa o dipendente). Mai il nostro.';
comment on column public.integrazione_staging.external_cliente_id is
  'Identificativo del committente sul gestionale.';
