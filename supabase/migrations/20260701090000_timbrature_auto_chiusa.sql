-- Marca una ripresa-pausa materializzata automaticamente (pausa dimenticata oltre soglia).
alter table public.timbrature
  add column if not exists auto_chiusa boolean not null default false;
