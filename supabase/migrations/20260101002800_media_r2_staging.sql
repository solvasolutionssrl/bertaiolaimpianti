-- =====================================================================
-- 20260101002800_media_r2_staging.sql
-- Fase 1 del media upload pipeline: introduce R2 come staging buffer
-- per bypassare il limite payload Vercel (4.5 MB).
--
-- Architettura:
--   client → presigned PUT/multipart su Cloudflare R2 (diretto, no Vercel)
--   server crea/aggiorna file_refs con r2_key + status
--   resolver /api/media/[id] serve i file da R2 con signed URL (TTL 5 min)
--
-- Nextcloud resta source of truth aziendale: il campo `path` esistente
-- conserva la destinazione Nextcloud (pre-calcolata al momento dell'init).
-- Il sync R2 → Nextcloud arriverà in Fase 2 (worker idempotente con SHA-256).
--
-- Cleanup R2 e modalità offline reale: fuori da questa fase.
-- =====================================================================

-- ----- Enum: stati del media nel pipeline R2 + Nextcloud -----------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'media_status') THEN
    CREATE TYPE public.media_status AS ENUM (
      'uploading',    -- presigned URL emesso, upload R2 in corso
      'uploaded',     -- file su R2 e verificato (size + sha256), visibile in app
      'syncing',      -- worker Fase 2 sta caricando su Nextcloud
      'synced',       -- presente su Nextcloud, source of truth confermata
      'sync_failed',  -- ultimo tentativo di sync fallito, ritentabile
      'failed',       -- upload R2 abortito o non completato (terminale)
      'deleted'       -- soft delete (cleanup R2 in Fase 3)
    );
  END IF;
END$$;

-- ----- Estende file_refs con i campi del nuovo flusso --------------------
-- Nota: status default 'uploaded' = righe legacy (già fisicamente presenti
-- sul provider Nextcloud) restano valide senza backfill.
ALTER TABLE public.file_refs
  ADD COLUMN IF NOT EXISTS status          public.media_status NOT NULL DEFAULT 'uploaded',
  ADD COLUMN IF NOT EXISTS r2_key          text,         -- chiave nel bucket R2; NULL per legacy
  ADD COLUMN IF NOT EXISTS r2_upload_id    text,         -- session id multipart attiva (NULL se single PUT o completato)
  ADD COLUMN IF NOT EXISTS sync_attempts   smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sync_error text,
  ADD COLUMN IF NOT EXISTS deleted_at      timestamptz;

COMMENT ON COLUMN public.file_refs.status IS
  'Stato nel pipeline: uploading→uploaded→syncing→synced (happy path). Legacy rows: uploaded di default.';
COMMENT ON COLUMN public.file_refs.r2_key IS
  'Chiave oggetto su Cloudflare R2. Formato: tenants/{tenant_id}/commesse/{commessa_id}/media/{file_ref_id}/original/{filename}. NULL per righe legacy pre-R2.';
COMMENT ON COLUMN public.file_refs.r2_upload_id IS
  'UploadId della sessione multipart S3-compatible. Popolato solo durante upload multipart in corso, NULL dopo complete/abort.';
COMMENT ON COLUMN public.file_refs.deleted_at IS
  'Soft delete. Resolver risponde 404; cleanup fisico R2/Nextcloud è gestito separatamente.';

-- ----- Indici per query operative ---------------------------------------
-- File in uno stato attivo del pipeline (worker, dashboard ops).
CREATE INDEX IF NOT EXISTS file_refs_status_active_idx
  ON public.file_refs(status)
  WHERE status IN ('uploading','uploaded','syncing','sync_failed');

-- Cleanup multipart orfani: sessioni uploading vecchie di 24h+.
CREATE INDEX IF NOT EXISTS file_refs_upload_in_progress_idx
  ON public.file_refs(uploaded_at)
  WHERE status = 'uploading' AND r2_upload_id IS NOT NULL;

-- Soft-deleted rows (audit + future cleanup).
CREATE INDEX IF NOT EXISTS file_refs_deleted_idx
  ON public.file_refs(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ----- Compat: trigger contatore foto -----------------------------------
-- Il trigger esistente tg_file_refs_sync_count conta TUTTI i file_refs con
-- mime image/*. Per il nuovo flusso vogliamo contare solo i file "visibili"
-- (status in uploaded|syncing|synced|sync_failed, deleted_at IS NULL).
CREATE OR REPLACE FUNCTION public.tg_file_refs_sync_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_commessa uuid;
  v_voce     smallint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_commessa := NEW.commessa_id;
    v_voce     := NEW.voce_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_commessa := OLD.commessa_id;
    v_voce     := OLD.voce_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.voce_id IS DISTINCT FROM NEW.voce_id THEN
      IF OLD.voce_id IS NOT NULL THEN
        UPDATE public.commessa_voci
           SET foto_caricate_count = (
             SELECT count(*) FROM public.file_refs
              WHERE commessa_id = OLD.commessa_id
                AND voce_id     = OLD.voce_id
                AND mime LIKE 'image/%'
                AND deleted_at IS NULL
                AND status IN ('uploaded','syncing','synced','sync_failed')
           )
         WHERE commessa_id = OLD.commessa_id AND voce_id = OLD.voce_id;
      END IF;
    END IF;
    v_commessa := NEW.commessa_id;
    v_voce     := NEW.voce_id;
  END IF;

  IF v_voce IS NOT NULL THEN
    UPDATE public.commessa_voci
       SET foto_caricate_count = (
         SELECT count(*) FROM public.file_refs
          WHERE commessa_id = v_commessa
            AND voce_id     = v_voce
            AND mime LIKE 'image/%'
            AND deleted_at IS NULL
            AND status IN ('uploaded','syncing','synced','sync_failed')
       )
     WHERE commessa_id = v_commessa AND voce_id = v_voce;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ----- tenants.r2_config: config aggiuntiva, NON sostituisce ------------
-- storage_provider/storage_config restano (Nextcloud è source of truth).
-- r2_config è additivo: se presente e non vuoto, il tenant ha lo staging R2 attivo.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS r2_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tenants.r2_config IS
  'Config Cloudflare R2 (additiva, staging). Schema: {"account_id":"…","bucket":"…","access_key_id":"…","secret_access_key":"…","endpoint":"https://<account>.r2.cloudflarestorage.com"}. Se vuoto, il tenant resta sul vecchio flusso buffered.';
