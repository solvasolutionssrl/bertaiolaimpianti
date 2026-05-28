-- =====================================================================
-- 20260528004300_riunione_allegati_backfill.sql
--
-- Bug fix Ondata 2: l'INSERT in commessa_riunione_allegato fatto dal
-- complete endpoint non passava tenant_id (la colonna è NOT NULL).
-- Risultato: i file_refs sono saliti su R2 correttamente con riunione_id
-- valorizzata, ma il record di link non è stato creato → l'UI non vede
-- gli allegati. Questo backfill recupera i file orfani e li linka.
--
-- Idempotente grazie alla UNIQUE (riunione_id, file_ref_id) + ON CONFLICT.
-- =====================================================================

INSERT INTO public.commessa_riunione_allegato
  (tenant_id, riunione_id, file_ref_id, kind)
SELECT
  fr.tenant_id,
  fr.riunione_id,
  fr.id,
  CASE
    WHEN fr.mime LIKE 'video/%'        THEN 'video'
    WHEN fr.mime = 'application/pdf'   THEN 'pdf_acquisito'
    ELSE 'foto'
  END
FROM public.file_refs fr
LEFT JOIN public.commessa_riunione_allegato cra
  ON cra.file_ref_id = fr.id
WHERE fr.riunione_id IS NOT NULL
  AND cra.id IS NULL
  AND fr.status IN ('uploaded', 'syncing', 'synced', 'sync_failed')
ON CONFLICT (riunione_id, file_ref_id) DO NOTHING;
