-- =====================================================================
-- 20260101002200_file_annotations.sql
-- Annotazioni foto cantiere (overlay vettoriale su file_refs immagine).
--
-- Scelte di design:
--  - Una riga per (file_ref_id, version): possiamo conservare lo storico
--    delle annotazioni (es. il tecnico annota v=1, l'ufficio rivede e
--    salva v=2). La logica applicativa fa UPSERT sempre sull'ultima
--    version oppure crea v+1 a seconda del flusso.
--  - layer_json: array di "shapes" stile Konva (line/arrow/rect/ellipse/
--    text/highlight). Serialized in apps/web/app/_lib/annotation-shapes.ts.
--  - width_px / height_px: dimensioni del canvas di riferimento. Il viewer
--    riscala proporzionalmente; le shapes hanno coordinate in pixel
--    relative a questo riferimento.
--  - composite_thumb_path: opzionale, path su Storage di una versione
--    "flatten" della foto + annotazioni renderizzata client-side, utile
--    per anteprime nella galleria senza dover caricare Konva.
--  - Lock pessimistico semplice: editing_by + editing_until. Il client
--    chiama acquisisciLock() prima di aprire l'editor. Auto-rilascio dopo
--    5 minuti via check applicativo (now() < editing_until).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.file_annotations (
  id                   uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES public.tenants(id)   ON DELETE CASCADE,
  file_ref_id          uuid NOT NULL REFERENCES public.file_refs(id) ON DELETE CASCADE,
  version              smallint NOT NULL DEFAULT 1,
  layer_json           jsonb NOT NULL DEFAULT '[]'::jsonb,   -- array di shapes
  composite_thumb_path text,                                  -- opzionale, thumb appiattita
  width_px             integer NOT NULL,                      -- dimensione canvas di riferimento
  height_px            integer NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  editing_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  editing_until        timestamptz,
  UNIQUE (file_ref_id, version)
);

CREATE INDEX IF NOT EXISTS file_annotations_file_idx
  ON public.file_annotations (file_ref_id);
CREATE INDEX IF NOT EXISTS file_annotations_tenant_idx
  ON public.file_annotations (tenant_id);
CREATE INDEX IF NOT EXISTS file_annotations_editing_idx
  ON public.file_annotations (editing_until)
  WHERE editing_by IS NOT NULL;

COMMENT ON TABLE public.file_annotations IS
  'Overlay vettoriale (shapes Konva-style) sopra a una foto/PDF in file_refs. Una riga per (file_ref_id, version). Concorrenza gestita via editing_by + editing_until (lock pessimistico best-effort, auto-rilascio 5 min).';

-- ----- Trigger updated_at ------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_file_annotations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_file_annotations_updated_at ON public.file_annotations;
CREATE TRIGGER trg_file_annotations_updated_at
  BEFORE UPDATE ON public.file_annotations
  FOR EACH ROW EXECUTE FUNCTION public.tg_file_annotations_updated_at();

-- ----- RLS ---------------------------------------------------------------
ALTER TABLE public.file_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_annotations FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS file_annotations_tenant_scope ON public.file_annotations;
CREATE POLICY file_annotations_tenant_scope ON public.file_annotations
  FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- Platform admin: SELECT cross-tenant (allineato al pattern di
-- 20260101001900_platform_admin.sql)
DROP POLICY IF EXISTS file_annotations_platform_admin_read ON public.file_annotations;
CREATE POLICY file_annotations_platform_admin_read ON public.file_annotations
  FOR SELECT
  USING (public.is_platform_admin());
