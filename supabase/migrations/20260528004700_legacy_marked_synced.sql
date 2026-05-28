-- =====================================================================
-- 20260528004700_legacy_marked_synced.sql
--
-- Backfill: i file caricati PRIMA del flusso R2 staging (Ondata 2)
-- sono già su Nextcloud ma hanno status='uploaded' di default
-- (vedi commento in 20260101002800_media_r2_staging.sql).
--
-- Il batch sync li pescava e falliva con "r2_key mancante" — peggio,
-- una foto legacy mostrava errore re-sync nel pannello admin.
--
-- Soluzione: marcare synced tutti i record legacy in un colpo
-- (r2_key IS NULL AND status='uploaded'). Sono già su Nextcloud,
-- niente da fare lato R2/server.
--
-- Idempotente: rieseguito non cambia nulla.
-- =====================================================================

UPDATE public.file_refs
SET
  status = 'synced',
  last_sync_error = NULL
WHERE r2_key IS NULL
  AND status = 'uploaded'
  AND deleted_at IS NULL;
