-- Aggiunge colonne per il tracciamento del ciclo di vita dell'invito utente.
-- invite_sent_at:     valorizzato da invitaUtente() al momento dell'invio.
-- invite_accepted_at: valorizzato da accettaInvito() dopo che l'utente imposta la password.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS invite_sent_at     timestamptz,
  ADD COLUMN IF NOT EXISTS invite_accepted_at  timestamptz;
