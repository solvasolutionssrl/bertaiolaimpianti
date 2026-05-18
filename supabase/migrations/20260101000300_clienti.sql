-- =====================================================================
-- 20260101000300_clienti.sql
-- Anagrafica clienti (committenti finali del tenant).
-- Specifica: Tassonomia_Lavori.md §5 "Modello dati clienti".
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_cliente') THEN
    CREATE TYPE public.tipo_cliente AS ENUM (
      'persona_fisica',
      'azienda'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.clienti (
  id                uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ragione_sociale   text NOT NULL,                            -- "Rossi Mario" o "Comune di Castagnole"
  tipo              public.tipo_cliente NOT NULL DEFAULT 'persona_fisica',
  partita_iva       text,
  codice_fiscale    text,
  indirizzo         text,
  citta             text,
  cap               text,
  provincia         text,
  telefoni          text[] NOT NULL DEFAULT '{}',
  email             text[] NOT NULL DEFAULT '{}',
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clienti_tenant_idx ON public.clienti(tenant_id);
-- Trigram per ricerca fuzzy ragione sociale
CREATE INDEX IF NOT EXISTS clienti_ragione_trgm
  ON public.clienti USING gin (ragione_sociale extensions.gin_trgm_ops);

DROP TRIGGER IF EXISTS trg_clienti_updated_at ON public.clienti;
CREATE TRIGGER trg_clienti_updated_at
  BEFORE UPDATE ON public.clienti
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMENT ON TABLE public.clienti IS 'Anagrafica dei committenti (persone o aziende). Vive solo in DB, mai duplicata in cartella cloud.';
