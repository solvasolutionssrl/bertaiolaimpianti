-- =====================================================================
-- 20260703000000_cantieri_fpm_fields.sql
-- Campi per il popolamento massivo dei cantieri FPM (mondo kantiere):
--   - codice_commessa          : codice commessa DEL CLIENTE (verbatim),
--                                 visibile e cercabile; distinto dal codice
--                                 interno app (`codice`, CAN-xxx, nascosto).
--   - cliente_nome             : ragione sociale (denormalizzata: i tenant
--                                 kantiere non popolano commesse/clienti).
--   - categoria                : classificazione lavoro (testo libero).
--   - indirizzo_da_verificare  : indirizzo da ricontrollare (import massivo /
--                                 sede legale != cantiere / geocoding incerto).
-- Additivo, tutte nullable (l'unico NOT NULL ha default false). Nessuna
-- colonna esistente toccata. Bertaiola e i cantieri esistenti NON impattati.
-- =====================================================================

alter table public.cantieri
  add column if not exists codice_commessa          text,
  add column if not exists cliente_nome             text,
  add column if not exists categoria                text,
  add column if not exists indirizzo_da_verificare  boolean not null default false;

comment on column public.cantieri.codice_commessa is
  'Codice commessa del cliente (verbatim). Identificativo VISIBILE e CERCABILE; distinto dal codice interno app (codice, CAN-xxx).';
comment on column public.cantieri.cliente_nome is
  'Ragione sociale cliente (denormalizzata; i tenant kantiere non popolano commesse/clienti).';
comment on column public.cantieri.categoria is
  'Classificazione lavoro (testo libero: CONSUNTIVO MAN, QUADRI, INDUSTRIALE, MANUTENZIONE, ...).';
comment on column public.cantieri.indirizzo_da_verificare is
  'Indirizzo da ricontrollare (import massivo / sede legale != cantiere / non geocodificato con certezza).';

-- Codice commessa univoco per tenant + chiave di upsert idempotente dell'import.
create unique index if not exists cantieri_codice_commessa_uq
  on public.cantieri (tenant_id, codice_commessa)
  where codice_commessa is not null;
