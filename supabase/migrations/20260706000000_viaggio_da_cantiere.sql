-- =====================================================================
-- 20260706000000_viaggio_da_cantiere.sql
-- Cantiere di PARTENZA delle tratte di viaggio: per il "cambio cantiere"
-- (switch) la tratta è cantiere→cantiere. Finora `sede_id` era null e la UI
-- mostrava "Sede → cantiere"; con `da_cantiere_id` si mostra "A → B".
-- Additivo, nullable. Gating app via modulo kantiere → Bertaiola non impattata.
-- =====================================================================

alter table public.timbratura_viaggio
  add column if not exists da_cantiere_id uuid references public.cantieri(id) on delete set null;

create index if not exists timbratura_viaggio_da_cantiere_idx
  on public.timbratura_viaggio (da_cantiere_id);
