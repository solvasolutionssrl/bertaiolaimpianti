-- =====================================================================
-- 20260624030000_maggiorazioni_condizioni.sql
-- Regole di maggiorazione "a condizioni": ogni regola lega
-- giorno-della-settimana + fascia oraria + festivo + tier (ord/straord) +
-- lavoro a turni → una percentuale. Il motore sceglie la regola PIÙ
-- SPECIFICA che combacia (no somma ingenua), come da tabella CCNL.
-- Additivo. Bertaiola non impattata.
-- =====================================================================

alter table public.kantiere_regole_ore
  add column if not exists giorni_settimana smallint[];           -- 1=lun..7=dom; null/empty = tutti
alter table public.kantiere_regole_ore
  add column if not exists ora_da time;                            -- null = tutta la giornata
alter table public.kantiere_regole_ore
  add column if not exists ora_a time;
alter table public.kantiere_regole_ore
  add column if not exists festivo_match text not null default 'qualsiasi'
  check (festivo_match in ('qualsiasi', 'solo_festivo', 'solo_feriale'));
alter table public.kantiere_regole_ore
  add column if not exists applica_a text not null default 'tutte'
  check (applica_a in ('tutte', 'ordinario', 'straordinario'));
alter table public.kantiere_regole_ore
  add column if not exists a_turni text not null default 'qualsiasi'
  check (a_turni in ('qualsiasi', 'si', 'no'));

-- Attributo del dipendente: lavoro a turni (seleziona la colonna tariffaria).
alter table public.dipendenti
  add column if not exists a_turni boolean not null default false;
