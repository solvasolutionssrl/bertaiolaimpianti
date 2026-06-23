-- =====================================================================
-- 20260625000000_rapportino_auto_compilato.sql
-- Il rapportino giornaliero viene AUTO-COMPILATO dalle timbrature (ore
-- ord/straord da ingresso→uscita + viaggio). Il flag distingue un
-- rapportino ancora "automatico" (ricalcolabile dalle timbrature) da uno
-- toccato a mano dal tecnico (salvataggio manuale → non più sovrascritto).
-- Additivo. Bertaiola non impattata (modulo kantiere off, nessun rapportino).
-- =====================================================================

alter table public.rapportini
  add column if not exists auto_compilato boolean not null default true;
