-- =====================================================================
-- 20260624040000_viaggio_km.sql
-- Distanza (km) delle tratte di viaggio. I km arrivano dall'API di routing e
-- sono trattati come DEFINITIVI (il tecnico/ufficio corregge solo il TEMPO).
-- Storico viaggi per mezzo e per dipendente = query su timbratura_viaggio.
-- Additivo. Bertaiola non impattata.
-- =====================================================================

alter table public.timbratura_viaggio
  add column if not exists distanza_km numeric(8, 2);

-- cache: oltre alla durata, memorizza anche la distanza per coppia coord
alter table public.routing_cache
  add column if not exists distanza_km numeric(8, 2);

-- indice per "storico viaggi per mezzo"
create index if not exists timbratura_viaggio_mezzo_idx
  on public.timbratura_viaggio (mezzo_id);
