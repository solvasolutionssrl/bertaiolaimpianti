-- =====================================================================
-- 20260528004500_contatto_scope_commessa.sql
-- Aggiunge scope "commessa" ai contatti referente.
--
-- Pre-esistente: contatto_cliente con (tenant_id, cliente_id, …) e
-- backfill da clienti.telefoni[]. Tutti i contatti finora sono del
-- cliente (riusabili su tutte le sue commesse).
--
-- Nuovo: colonna commessa_id NULLABLE per legare un contatto a UNA
-- specifica commessa.
--   commessa_id IS NULL     → contatto del cliente (riusabile)
--   commessa_id IS NOT NULL → contatto specifico di quella commessa
--
-- Backward compatible: i record esistenti hanno commessa_id NULL →
-- restano "del cliente" come prima.
-- =====================================================================

ALTER TABLE public.contatto_cliente
  ADD COLUMN IF NOT EXISTS commessa_id uuid NULL
    REFERENCES public.commesse(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS contatto_cliente_commessa_idx
  ON public.contatto_cliente(commessa_id)
  WHERE commessa_id IS NOT NULL;

COMMENT ON COLUMN public.contatto_cliente.commessa_id IS
  'Se NULL: contatto del cliente, visibile su tutte le sue commesse. Se valorizzato: contatto specifico SOLO di quella commessa (es. geometra del cantiere, capocantiere del lavoro X).';

-- Estende l'indice unique parziale per il primary: il vincolo "solo 1
-- primary per cliente" si applica solo ai contatti del cliente
-- (commessa_id IS NULL). I contatti della commessa non hanno un
-- "primary" — sono semplicemente ordinati.
DROP INDEX IF EXISTS contatto_cliente_primary_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS contatto_cliente_primary_uniq
  ON public.contatto_cliente(cliente_id)
  WHERE is_primary = true AND commessa_id IS NULL;
