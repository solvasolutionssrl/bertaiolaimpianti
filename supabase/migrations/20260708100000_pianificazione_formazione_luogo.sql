-- =====================================================================
-- 20260708100000_pianificazione_formazione_luogo.sql
-- Pianificazione: split evento/formazione + coordinate del luogo.
--   - tipo: aggiunge 'formazione' (evento e formazione condividono i campi
--           titolo/luogo, cambiano solo colore/etichetta in UI).
--   - luogo_lat / luogo_lng: coordinate del luogo evento/formazione
--           (autocomplete Google), per link a Maps.
-- Additivo, idempotente. Bertaiola non impattata (gated modulo dipendenti).
-- =====================================================================

alter table public.pianificazione_blocchi
  add column if not exists luogo_lat numeric(9,6),
  add column if not exists luogo_lng numeric(9,6);

-- tipo: da ('cantiere','evento') a ('cantiere','evento','formazione')
alter table public.pianificazione_blocchi
  drop constraint if exists pianificazione_blocchi_tipo_check;
alter table public.pianificazione_blocchi
  add constraint pianificazione_blocchi_tipo_check
  check (tipo in ('cantiere','evento','formazione'));

-- target: cantiere richiede cantiere_id; evento/formazione richiedono titolo
alter table public.pianificazione_blocchi
  drop constraint if exists pianificazione_blocchi_target_chk;
alter table public.pianificazione_blocchi
  add constraint pianificazione_blocchi_target_chk check (
    (tipo = 'cantiere' and cantiere_id is not null)
    or (tipo in ('evento','formazione') and titolo is not null)
  );
