-- =====================================================================
-- 20260101000900_file_refs.sql
-- Riferimenti ai file fisici (foto, PDF, schemi) sul provider storage.
-- Specifica: Architettura_Soluzione.md §4 (tabella file_refs).
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ocr_status') THEN
    CREATE TYPE public.ocr_status AS ENUM (
      'none',
      'pending',
      'done',
      'error'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.file_refs (
  id                uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  commessa_id       uuid NOT NULL REFERENCES public.commesse(id) ON DELETE CASCADE,
  voce_id           smallint REFERENCES public.voci_catalogo(id),    -- nullable: file generico commessa
  ticket_id         uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  momento           public.momento_foto,                              -- sopralluogo/in_corso/finale (foto)
  path              text NOT NULL,                                    -- path completo sul provider storage
  filename          text NOT NULL,
  mime              text NOT NULL,
  size_bytes        bigint NOT NULL,
  sha256            text,
  uploaded_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  uploaded_at       timestamptz NOT NULL DEFAULT now(),
  taken_at          timestamptz,                                      -- da EXIF (foto)
  geo_lat           numeric(9,6),
  geo_lng           numeric(9,6),
  thumbnail_url     text,
  ocr_status        public.ocr_status NOT NULL DEFAULT 'none',
  ocr_text          text
);

CREATE INDEX IF NOT EXISTS file_refs_tenant_idx     ON public.file_refs(tenant_id);
CREATE INDEX IF NOT EXISTS file_refs_commessa_idx   ON public.file_refs(commessa_id);
CREATE INDEX IF NOT EXISTS file_refs_voce_idx       ON public.file_refs(commessa_id, voce_id) WHERE voce_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS file_refs_ticket_idx     ON public.file_refs(ticket_id) WHERE ticket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS file_refs_filename_trgm
  ON public.file_refs USING gin (filename extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS file_refs_ocr_fts
  ON public.file_refs USING gin (to_tsvector('italian', coalesce(ocr_text, '')))
  WHERE ocr_text IS NOT NULL;

COMMENT ON TABLE public.file_refs IS 'Metadata + path dei file caricati. La sorgente fisica vive su Supabase Storage o Nextcloud (provider del tenant).';

-- ----- Trigger: aggiorna foto_caricate_count su commessa_voci ------------
-- Ogni INSERT/DELETE di file_refs di tipo immagine collegato a una voce
-- aggiorna il contatore. La transizione di stato fase->completata resta
-- esplicita lato applicazione (vedi Edge Function commesse).
CREATE OR REPLACE FUNCTION public.tg_file_refs_sync_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_commessa uuid;
  v_voce     smallint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_commessa := NEW.commessa_id;
    v_voce     := NEW.voce_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_commessa := OLD.commessa_id;
    v_voce     := OLD.voce_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- gestiamo separatamente entrambe le righe (vecchia e nuova voce)
    IF OLD.voce_id IS DISTINCT FROM NEW.voce_id THEN
      IF OLD.voce_id IS NOT NULL THEN
        UPDATE public.commessa_voci
           SET foto_caricate_count = (
             SELECT count(*) FROM public.file_refs
              WHERE commessa_id = OLD.commessa_id
                AND voce_id     = OLD.voce_id
                AND mime LIKE 'image/%'
           )
         WHERE commessa_id = OLD.commessa_id AND voce_id = OLD.voce_id;
      END IF;
    END IF;
    v_commessa := NEW.commessa_id;
    v_voce     := NEW.voce_id;
  END IF;

  IF v_voce IS NOT NULL THEN
    UPDATE public.commessa_voci
       SET foto_caricate_count = (
         SELECT count(*) FROM public.file_refs
          WHERE commessa_id = v_commessa
            AND voce_id     = v_voce
            AND mime LIKE 'image/%'
       )
     WHERE commessa_id = v_commessa AND voce_id = v_voce;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_file_refs_sync_count ON public.file_refs;
CREATE TRIGGER trg_file_refs_sync_count
  AFTER INSERT OR UPDATE OR DELETE ON public.file_refs
  FOR EACH ROW EXECUTE FUNCTION public.tg_file_refs_sync_count();
