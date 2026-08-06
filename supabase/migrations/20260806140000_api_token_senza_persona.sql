-- =====================================================================
-- 20260806140000_api_token_senza_persona.sql
-- Un token di integrazione non appartiene a una persona.
--
-- `api_tokens` e' nata per il comando iOS "Carica su Kommessa": li' il token
-- E' una persona — i file caricati risultano suoi, e l'audit deve dire chi ha
-- fatto cosa. Da cui `user_id NOT NULL`.
--
-- Per un agente di sincronizzazione quella premessa non regge: chi chiama e'
-- una macchina dentro la rete del cliente, non un dipendente. Obbligare a
-- sceglierne uno significherebbe attribuire a quella persona ore e documenti
-- che non ha inserito — un dato falso nell'audit, per soddisfare un vincolo
-- tecnico.
--
-- Quindi `user_id` diventa opzionale, ma **solo** per i token che non agiscono
-- per conto di nessuno: chi ha lo scope `upload` deve continuare ad averlo.
-- =====================================================================

alter table public.api_tokens alter column user_id drop not null;

-- Il vincolo tiene insieme le due esigenze: l'agente puo' non avere persona,
-- il comando iOS deve averla.
alter table public.api_tokens drop constraint if exists api_tokens_persona_se_upload;
alter table public.api_tokens add constraint api_tokens_persona_se_upload
  check (user_id is not null or not ('upload' = any(scopes)));

comment on column public.api_tokens.user_id is
  'Persona per conto della quale il token agisce. NULL per i token di integrazione: li'' il chiamante e'' una macchina, non un dipendente.';
