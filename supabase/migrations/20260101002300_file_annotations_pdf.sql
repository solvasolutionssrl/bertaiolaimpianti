-- =====================================================================
-- 20260101002300_file_annotations_pdf.sql
-- Estende file_annotations per supportare annotazioni PDF (page-aware).
--
-- Scelte di design:
--  - Aggiungiamo `kind` (image | pdf) per distinguere il modello in tabella.
--    Per le immagini `page` resta NULL (lo schema esistente lo presuppone).
--  - Aggiungiamo `page` (1-based) per le annotazioni PDF. Una riga per
--    (file_ref_id, page, version): permette di gestire ciascuna pagina
--    come oggetto indipendente (utile per editing concorrente e per
--    diff-merge se in futuro vorremo storicizzare per pagina).
--  - Sostituiamo il vincolo UNIQUE (file_ref_id, version) con un indice
--    UNIQUE su (file_ref_id, COALESCE(page, -1), version). Per le immagini
--    `page` è NULL → COALESCE -1 = stessa chiave del vincolo precedente:
--    backwards-compatible.
--  - View `file_annotations_summary` per badge UI: conta righe non vuote
--    e numero di pagine annotate per file_ref_id. SECURITY INVOKER così
--    eredita le RLS della tabella sottostante (no leak cross-tenant).
-- =====================================================================

ALTER TABLE public.file_annotations
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'image' CHECK (kind IN ('image','pdf')),
  ADD COLUMN IF NOT EXISTS page integer;

-- Drop vincolo legacy (file_ref_id, version) e ricreiamo con page-awareness
ALTER TABLE public.file_annotations
  DROP CONSTRAINT IF EXISTS file_annotations_file_ref_id_version_key;

CREATE UNIQUE INDEX IF NOT EXISTS file_annotations_file_page_version_uniq
  ON public.file_annotations (file_ref_id, COALESCE(page, -1), version);

COMMENT ON COLUMN public.file_annotations.kind IS
  'image | pdf — distingue annotazioni su foto da quelle su PDF.';
COMMENT ON COLUMN public.file_annotations.page IS
  'Per kind=pdf: pagina 1-based. NULL per kind=image.';

-- View per badge UI nel listato documenti
CREATE OR REPLACE VIEW public.file_annotations_summary AS
SELECT
  file_ref_id,
  count(*) FILTER (WHERE layer_json::text != '[]')::int AS total,
  count(DISTINCT page) FILTER (WHERE page IS NOT NULL)::int AS pagine_annotate,
  max(updated_at) AS ultimo_aggiornamento
FROM public.file_annotations
GROUP BY file_ref_id;

ALTER VIEW public.file_annotations_summary SET (security_invoker = true);

COMMENT ON VIEW public.file_annotations_summary IS
  'Conteggi aggregati di annotazioni per file. Usato dai badge UI ("N annotazioni · M pagine"). security_invoker = true → RLS della tabella si applicano al chiamante.';
