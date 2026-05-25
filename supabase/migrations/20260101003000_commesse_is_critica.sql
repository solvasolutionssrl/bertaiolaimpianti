-- =====================================================================
-- 20260101003000_commesse_is_critica.sql
-- "Critica" diventa flag boolean trasversale invece di valore enum stato.
--
-- Motivo: una commessa critica può essere in_corso, in collaudo, ecc.
-- "Critica" è un attributo di urgenza ortogonale allo stato del workflow.
-- Lato Nextcloud rimane nella cartella corrispondente al suo stato
-- "vero" (es. 02_In_Lavorazione) — il badge UI segnala la criticità.
-- =====================================================================

ALTER TABLE public.commesse
  ADD COLUMN IF NOT EXISTS is_critica boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.commesse.is_critica IS
  'Flag urgenza/criticità trasversale allo stato workflow. true = badge "Critica" visibile su UI; non sposta la cartella su Nextcloud.';

CREATE INDEX IF NOT EXISTS commesse_critica_idx
  ON public.commesse(tenant_id, is_critica)
  WHERE is_critica = true;
