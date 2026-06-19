-- Kantiere Fase I/B — PWA per-modalità.
--
-- Aggiunge `tenants.app_mode` per scegliere l'esperienza mobile per-tenant.
-- Default 'kommessa' = comportamento ATTUALE (shell gestione/campo per ruolo):
-- Bertaiola resta identica byte-per-byte (nessun tenant esistente cambia shell).
--
--   kommessa = comportamento attuale (default)
--   kantiere = PWA solo Kantiere (timbratura/ore/cantieri) — FPM
--   full     = layout combinato (kommessa + entry point Kantiere)
--
-- Additiva e idempotente. Nessun impatto su tenant esistenti.

alter table public.tenants
  add column if not exists app_mode text not null default 'kommessa';

-- CHECK constraint guardato (drop-then-add) per essere ri-eseguibile.
alter table public.tenants
  drop constraint if exists tenants_app_mode_chk;

alter table public.tenants
  add constraint tenants_app_mode_chk
  check (app_mode in ('kommessa', 'kantiere', 'full'));
