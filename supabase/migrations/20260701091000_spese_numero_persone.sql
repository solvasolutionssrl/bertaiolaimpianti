-- Numero di persone per cui è stata pagata la spesa (coperti). Default 1.
alter table public.spese
  add column if not exists numero_persone smallint not null default 1
  check (numero_persone >= 1);
