-- Spese: analisi AI ASINCRONA (upload immediato, estrazione in cloud dopo).
--
-- Nuovo flusso mobile: il tecnico sceglie il cantiere, scatta la foto e la riga
-- `spese` viene creata SUBITO in stato 'in_elaborazione' (foto già su R2), senza
-- attendere l'AI. La vision gira dopo lato server (waitUntil) e compila i campi.
-- Perciò:
--   * importo_totale può essere NULL finché l'AI (o l'ufficio) non lo valorizza;
--   * lo stato ammette 'in_elaborazione' (in coda/analisi) oltre a bozza/confermata;
--   * due colonne diagnostiche per la CERTEZZA lato super admin (quando è stata
--     fatta l'analisi ed eventuale motivo di fallimento).
--
-- Additiva e idempotente. Modulo Kantiere → i tenant 'kommessa' (Bertaiola) non
-- toccati.

-- 1) Le righe in elaborazione non hanno ancora l'importo.
alter table public.spese alter column importo_totale drop not null;

-- 2) Nuovo stato ammesso: 'in_elaborazione'. Il check inline originale è
--    auto-nominato `spese_stato_check`.
alter table public.spese drop constraint if exists spese_stato_check;
alter table public.spese
  add constraint spese_stato_check
  check (stato in ('bozza', 'confermata', 'in_elaborazione'));

-- 3) Diagnostica analisi cloud (osservabilità super admin + recovery).
alter table public.spese add column if not exists analisi_at timestamptz;
alter table public.spese add column if not exists analisi_errore text;

-- Indice per il recupero delle righe rimaste in elaborazione (recovery/cron).
create index if not exists spese_in_elaborazione_idx
  on public.spese (tenant_id, created_at)
  where stato = 'in_elaborazione';
