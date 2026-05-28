-- =====================================================================
-- 20260528004800_tenant_voci_cartella_override.sql
--
-- Estende tenant_voci_override per permettere il SOVRASCRIVERE del
-- cartella_template di una voce globale per il proprio tenant.
--
-- Pre-esistente: override aveva solo nome_override, min_foto_override,
-- attiva. Quindi se una voce globale aveva cartella_template = NULL
-- (es. 'Nuovo Impianto') il tenant non poteva attivarla né cambiarla.
-- Per le voci CUSTOM del tenant (tenant_id NOT NULL su voci_catalogo)
-- la cartella si modifica direttamente sul record — l'override è solo
-- per le voci GLOBALI.
--
-- L'app legge il valore effettivo come:
--   COALESCE(override.cartella_template_override, voce.cartella_template)
-- =====================================================================

ALTER TABLE public.tenant_voci_override
  ADD COLUMN IF NOT EXISTS cartella_template_override text
    CHECK (
      cartella_template_override IS NULL
      OR length(cartella_template_override) <= 200
    );

COMMENT ON COLUMN public.tenant_voci_override.cartella_template_override IS
  'Path cartella che la voce genera (override del valore globale). NULL = eredita dal catalogo. Stringa vuota convenzionale per "esplicitamente nessuna cartella" non gestita: per disattivare la cartella usare attiva=false.';
