-- =====================================================================
-- 20260101000600_voci_catalogo.sql
-- Catalogo globale delle 38 voci (Tassonomia_Lavori.md §2-3).
-- Tabella read-only condivisa tra tutti i tenant (no tenant_id).
-- Il seed delle 38 voci sta in supabase/seed.sql.
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'categoria_voce') THEN
    CREATE TYPE public.categoria_voce AS ENUM (
      'sempre_attiva',     -- Sezione A: 1-10, 26
      'impiantistica',     -- 11-19
      'ventilazione',      -- 20-21
      'documentazione',    -- 22-25
      'tubazioni',         -- 27-29
      'montaggi',          -- 30-32
      'allacci',           -- 33-35
      'supporto',          -- 36-37
      'alimentazione'      -- 38
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.voci_catalogo (
  id                       smallint PRIMARY KEY,           -- 1..38 da tassonomia
  nome                     text     NOT NULL,
  categoria                public.categoria_voce NOT NULL,
  "default"                boolean  NOT NULL DEFAULT false,  -- true = Sezione A (sempre attiva)
  cartella_template        text,                              -- es. "Foto/Sopralluogo" oppure NULL se non genera cartella
  ordine_visualizzazione   smallint NOT NULL,
  note                     text
);

CREATE INDEX IF NOT EXISTS voci_catalogo_categoria_idx
  ON public.voci_catalogo(categoria, ordine_visualizzazione);

COMMENT ON TABLE public.voci_catalogo IS '38 voci/fasi canoniche del PDF cliente. Read-only e condivise tra tenant.';
COMMENT ON COLUMN public.voci_catalogo."default" IS 'Sezione A (true): sempre attive; Sezione B (false): scelte dal capo.';
