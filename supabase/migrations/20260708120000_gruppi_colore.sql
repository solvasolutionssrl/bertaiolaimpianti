-- =====================================================================
-- 20260708120000_gruppi_colore.sql
-- Colore identificativo del gruppo lavoro (palette aziendale), usato in UI
-- (gruppi, pianificazione). Additivo, nullable. Bertaiola non impattata.
-- =====================================================================

alter table public.gruppi_approvazione
  add column if not exists colore text;

comment on column public.gruppi_approvazione.colore is
  'Colore identificativo del gruppo (hex) per UI gruppi/pianificazione.';
