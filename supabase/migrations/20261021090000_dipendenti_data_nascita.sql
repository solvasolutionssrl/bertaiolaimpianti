-- =====================================================================
-- 20261021090000_dipendenti_data_nascita.sql
--
-- La data di nascita di una persona del personale.
--
-- A cosa serve, perche' il campo esiste solo se qualcuno lo legge: la
-- timbratrice Timbro fa gli auguri quando la persona passa il badge
-- all'ingresso. Il dato esce da `GET /api/v1/dipendenti` come `dataNascita`.
-- Dentro Kommessa si compila e si vede nell'elenco di Personale -> Dipendenti.
--
-- ⚠️ E' la PRIMA colonna anagrafica di legge su `dipendenti`: finora la
-- tabella teneva solo cio' che serve ad attribuire ore e costi (niente codice
-- fiscale, niente indirizzo, niente documenti). L'aggiunta e' voluta e ha uno
-- scopo dichiarato; chi ne aggiungera' altre sappia che la linea e' stata
-- attraversata qui, di proposito, e non per abitudine.
--
-- ⚠️ Su `dipendenti` i privilegi sono di TABELLA, non per colonna come su
-- `tenants`: la colonna nasce quindi leggibile da ogni utente autenticato del
-- tenant, come il resto della riga. Per una data di nascita fra colleghi e'
-- una scelta accettata; se un domani servisse restringerla, il posto non e' il
-- `grant` ma una policy per colonna o una vista.
--
-- Additiva e idempotente. Nessun default, nessun backfill: una data di nascita
-- non si indovina, e NULL vuol dire «non la sappiamo», che e' la verita' per
-- tutte le 58 righe esistenti.
-- =====================================================================

alter table public.dipendenti
  add column if not exists data_nascita date;

comment on column public.dipendenti.data_nascita is
  'Data di nascita. Scopo dichiarato: gli auguri di compleanno della '
  'timbratrice all''ingresso. Esposta da /api/v1/dipendenti come dataNascita. '
  'NULL = non la sappiamo. Prima colonna anagrafica di legge su questa '
  'tabella: vedi la migration 20261021090000.';
