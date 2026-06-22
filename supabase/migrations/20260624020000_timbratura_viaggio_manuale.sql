-- =====================================================================
-- 20260624020000_timbratura_viaggio_manuale.sql
-- Permette tratte di viaggio MANUALI (inserite a fine giornata senza QR):
--   - timbratura_id diventa opzionale (la tratta può non avere timbratura)
--   - cantiere_id + data per attribuire target/giorno alla tratta manuale
-- Le tratte da QR restano collegate alla timbratura (timbratura_id valorizzato).
-- Additivo. Bertaiola non impattata.
-- =====================================================================

alter table public.timbratura_viaggio
  alter column timbratura_id drop not null;

alter table public.timbratura_viaggio
  add column if not exists cantiere_id uuid references public.cantieri(id) on delete cascade;

alter table public.timbratura_viaggio
  add column if not exists data date;

create index if not exists timbratura_viaggio_cantiere_data_idx
  on public.timbratura_viaggio (cantiere_id, data);
