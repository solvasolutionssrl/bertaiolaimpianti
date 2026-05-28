-- file_refs.r2_thumb_key: chiave R2 del thumbnail 400x400 webp persistente,
-- generato al complete dell'upload. Persistente anche dopo cleanup Fase 3
-- dell'originale R2 (il thumb pesa ~30-50 KB, lasciarlo a vita costa pochi
-- centesimi/anno).
--
-- Path convenzionale (derivato dal r2_key dell'originale):
--   originale:  tenants/{slug}/commesse/{codice}[_{nome}]/{section}/{shortId}_{filename}
--   thumb:      tenants/{slug}/commesse/{codice}[_{nome}]/{section}/thumbs/{shortId}.webp
--
-- Solo per file con mime image/*. Per video useremo poster frame in futuro.

ALTER TABLE file_refs
  ADD COLUMN IF NOT EXISTS r2_thumb_key text;

COMMENT ON COLUMN file_refs.r2_thumb_key IS
  'Chiave R2 del thumbnail 400x400 webp persistente. NULL = thumb non generato (file vecchio, video o generazione fallita): la UI fa fallback al proxy full-size.';

-- Index parziale per query future di backfill / cleanup
CREATE INDEX IF NOT EXISTS file_refs_thumb_missing_idx
  ON file_refs (created_at DESC)
  WHERE r2_thumb_key IS NULL
    AND mime LIKE 'image/%'
    AND status IN ('uploaded','syncing','synced');
