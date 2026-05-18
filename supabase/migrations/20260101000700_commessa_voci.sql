-- =====================================================================
-- 20260101000700_commessa_voci.sql
-- Junction tra commessa e voce catalogo. Una riga = una fase attiva.
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stato_fase') THEN
    CREATE TYPE public.stato_fase AS ENUM (
      'da_iniziare',
      'in_corso',
      'completata',
      'bloccata'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'momento_foto') THEN
    CREATE TYPE public.momento_foto AS ENUM (
      'sopralluogo',
      'in_corso',
      'finale'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.commessa_voci (
  commessa_id          uuid     NOT NULL REFERENCES public.commesse(id) ON DELETE CASCADE,
  voce_id              smallint NOT NULL REFERENCES public.voci_catalogo(id) ON DELETE RESTRICT,
  tenant_id            uuid     NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stato                public.stato_fase NOT NULL DEFAULT 'da_iniziare',
  min_foto_richieste   smallint NOT NULL DEFAULT 0,
  foto_caricate_count  integer  NOT NULL DEFAULT 0,
  note                 text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (commessa_id, voce_id)
);

CREATE INDEX IF NOT EXISTS commessa_voci_tenant_idx   ON public.commessa_voci(tenant_id);
CREATE INDEX IF NOT EXISTS commessa_voci_commessa_idx ON public.commessa_voci(commessa_id);
CREATE INDEX IF NOT EXISTS commessa_voci_voce_idx     ON public.commessa_voci(voce_id);

DROP TRIGGER IF EXISTS trg_commessa_voci_updated_at ON public.commessa_voci;
CREATE TRIGGER trg_commessa_voci_updated_at
  BEFORE UPDATE ON public.commessa_voci
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMENT ON TABLE  public.commessa_voci IS 'Selezione di voci catalogo per commessa (Sezione A automatica + Sezione B scelta capo).';
COMMENT ON COLUMN public.commessa_voci.foto_caricate_count IS 'Aggiornato dal trigger su file_refs (vedi 20260101000900_file_refs.sql).';
