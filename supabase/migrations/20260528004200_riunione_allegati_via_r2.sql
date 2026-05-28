-- =====================================================================
-- 20260528004200_riunione_allegati_via_r2.sql
-- Ondata 2 — Bertaiola feedback (28/05/2026).
--
-- 1. Allegati di una riunione possono ora essere VIDEO (oltre a foto e
--    PDF acquisiti). Si estende il CHECK su commessa_riunione_allegato.kind.
--
-- 2. Gli allegati riunione passano dal flusso R2 staging come tutti gli
--    altri media (prima andavano diretti a Nextcloud — bloccante e
--    senza ripristino). Si aggiunge file_refs.riunione_id come FK
--    nullable: quando valorizzata, l'API media/init calcola il path
--    "Riunioni/YYYY-MM-DD/…" e l'API complete crea il link in
--    commessa_riunione_allegato.
-- =====================================================================

-- 1) Estende il CHECK kind per accettare 'video'.
ALTER TABLE public.commessa_riunione_allegato
  DROP CONSTRAINT IF EXISTS commessa_riunione_allegato_kind_check;

ALTER TABLE public.commessa_riunione_allegato
  ADD CONSTRAINT commessa_riunione_allegato_kind_check
  CHECK (kind IN ('foto', 'video', 'pdf_acquisito'));

-- 2) file_refs.riunione_id (FK opzionale).
-- Se valorizzata: il file appartiene a quella riunione. Il sync R2→Nextcloud
-- userà un path "Riunioni/<data>/…" calcolato dal complete endpoint.
ALTER TABLE public.file_refs
  ADD COLUMN IF NOT EXISTS riunione_id uuid NULL
    REFERENCES public.commessa_riunione(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS file_refs_riunione_idx
  ON public.file_refs(riunione_id)
  WHERE riunione_id IS NOT NULL;

COMMENT ON COLUMN public.file_refs.riunione_id IS
  'Se NOT NULL, l''allegato appartiene a quella riunione (commessa_riunione). Il complete endpoint linkerà anche commessa_riunione_allegato. Il path Nextcloud viene calcolato in Riunioni/<data>/.';
