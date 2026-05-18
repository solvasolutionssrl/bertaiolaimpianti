-- =====================================================================
-- 20260101002100_users_onboarded_at.sql
-- Aggiunge la colonna `onboarded_at` alla tabella public.users.
-- Drive il primo-login tour: NULL = mostra il tour; timestamp = completato/saltato.
-- =====================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

COMMENT ON COLUMN public.users.onboarded_at IS
  'Timestamp completamento/skip onboarding tour. NULL = mostra ancora il tour.';
