-- =====================================================================
-- 20260528004600_file_refs_updated_at.sql
--
-- HOTFIX critico: la stale-detection del sync R2 → Nextcloud (Ondata 2)
-- usa file_refs.updated_at per identificare i job 'syncing' abbandonati
-- da > 10 min. Ma file_refs originariamente non aveva updated_at: il
-- batch query falliva con "column updated_at does not exist" → niente
-- recovery automatico → i file restavano stuck in 'syncing' per sempre.
--
-- Effetto del fix:
--  - Aggiunge updated_at (DEFAULT now()).
--  - Backfill non-destructive: tutti i record esistenti ricevono
--    updated_at = uploaded_at (proxy sensato — è il momento "originale"
--    del file).
--  - Trigger tg_set_updated_at (riusato dalle altre tabelle) refresha
--    updated_at su ogni UPDATE.
--  - La stale-detection ora funziona correttamente.
-- =====================================================================

ALTER TABLE public.file_refs
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill: allinea updated_at a uploaded_at per i record esistenti.
-- Idempotente per chi rifa il push.
UPDATE public.file_refs
SET updated_at = uploaded_at
WHERE uploaded_at IS NOT NULL;

DROP TRIGGER IF EXISTS trg_file_refs_updated_at ON public.file_refs;
CREATE TRIGGER trg_file_refs_updated_at
  BEFORE UPDATE ON public.file_refs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMENT ON COLUMN public.file_refs.updated_at IS
  'Timestamp dell''ultima modifica del record (refresh automatico via trigger). Usato dalla sync stale-detection per identificare i file abbandonati in stato syncing.';
