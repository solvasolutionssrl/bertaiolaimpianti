-- =====================================================================
-- 20260101003400_todo_riunione.sql
--
-- Aggiunge alla commessa due "oggetti" di workflow ortogonali alle fasi:
--   1. commessa_todo     — checklist di cose da fare, con assegnazione,
--                          priorità, scadenza, audit completamento.
--      + commessa_todo_nota      — note datate sui todo (chiunque può
--                                   commentare; serve per la "storia").
--      + commessa_todo_allegato  — link a file_refs (foto/PDF allegati).
--
--   2. commessa_riunione — verbalizzazione meeting: testo libero +
--                          trascrizione dettato + reportino AI generato
--                          (OpenAI). I TODO proposti dall'AI vengono
--                          materializzati come commessa_todo separati con
--                          metadata.fonte = 'riunione:<id>'.
--      + commessa_riunione_allegato — foto + PDF acquisiti via camera.
--
-- Tutte le UI le aggrega in una "tab Lavori" cronologica (TODO aperti
-- sticky + cronologia eventi completati/riunioni/note).
--
-- RLS:
--   - read: tutti i membri del tenant (i tecnici vedono i todo di tutte
--     le commesse del tenant — il filtro "solo quelle assegnate a me" è
--     applicativo, non SQL, coerente con il resto del prodotto)
--   - insert/update/delete TODO:    admin/office
--   - update stato TODO (complete): admin/office/tecnico
--   - insert nota TODO:             admin/office/tecnico
--   - insert/update/delete RIUNIONE: admin/office
--   - allegati: stessa policy del parent
-- =====================================================================

-- ─── Enum priorità ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'todo_priorita') THEN
    CREATE TYPE public.todo_priorita AS ENUM (
      'bassa',
      'media',
      'alta',
      'urgente'
    );
  END IF;
END
$$;

-- ─── Enum stato todo ──────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'todo_stato') THEN
    CREATE TYPE public.todo_stato AS ENUM (
      'aperto',
      'in_corso',
      'completato',
      'annullato'
    );
  END IF;
END
$$;

-- ═════════════════════════════════════════════════════════════════════
-- TODO
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.commessa_todo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  commessa_id     uuid NOT NULL REFERENCES public.commesse(id) ON DELETE CASCADE,
  titolo          text NOT NULL CHECK (length(btrim(titolo)) > 0),
  descrizione     text,
  stato           public.todo_stato      NOT NULL DEFAULT 'aperto',
  priorita        public.todo_priorita   NOT NULL DEFAULT 'media',
  assegnato_a     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  scadenza_at     timestamptz,
  sort_order      integer NOT NULL DEFAULT 0,
  -- Metadata libera: { fonte: 'riunione:<id>' | 'manuale', ... }
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  completato_at   timestamptz,
  completato_da   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CHECK (
    (stato = 'completato') = (completato_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS commessa_todo_commessa_idx
  ON public.commessa_todo(commessa_id);
CREATE INDEX IF NOT EXISTS commessa_todo_tenant_idx
  ON public.commessa_todo(tenant_id);
CREATE INDEX IF NOT EXISTS commessa_todo_assegnato_idx
  ON public.commessa_todo(assegnato_a);
CREATE INDEX IF NOT EXISTS commessa_todo_stato_idx
  ON public.commessa_todo(stato);
CREATE INDEX IF NOT EXISTS commessa_todo_commessa_open_idx
  ON public.commessa_todo(commessa_id, sort_order)
  WHERE stato IN ('aperto', 'in_corso');

COMMENT ON TABLE public.commessa_todo IS
  'TODO di una commessa: checklist di lavori da fare, con assegnazione opzionale, priorita e scadenza. UI tab Lavori.';

-- Trigger updated_at + auto-touch completato_at quando stato → completato
CREATE OR REPLACE FUNCTION public.commessa_todo_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.stato = 'completato' AND OLD.stato IS DISTINCT FROM 'completato' THEN
    NEW.completato_at := COALESCE(NEW.completato_at, now());
    NEW.completato_da := COALESCE(NEW.completato_da, auth.uid());
  ELSIF NEW.stato <> 'completato' AND OLD.stato = 'completato' THEN
    NEW.completato_at := NULL;
    NEW.completato_da := NULL;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS commessa_todo_touch_trg ON public.commessa_todo;
CREATE TRIGGER commessa_todo_touch_trg
  BEFORE UPDATE ON public.commessa_todo
  FOR EACH ROW
  EXECUTE FUNCTION public.commessa_todo_touch();

-- ─── Note datate sui todo ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commessa_todo_nota (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  todo_id     uuid NOT NULL REFERENCES public.commessa_todo(id) ON DELETE CASCADE,
  author_id   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  body        text NOT NULL CHECK (length(btrim(body)) > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commessa_todo_nota_todo_idx
  ON public.commessa_todo_nota(todo_id, created_at DESC);

COMMENT ON TABLE public.commessa_todo_nota IS
  'Note datate su un TODO. Servono per la "storia" del lavoro e per coordinarsi tra office/tecnici.';

-- ─── Allegati ai todo (link a file_refs) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.commessa_todo_allegato (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  todo_id     uuid NOT NULL REFERENCES public.commessa_todo(id) ON DELETE CASCADE,
  file_ref_id uuid NOT NULL REFERENCES public.file_refs(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (todo_id, file_ref_id)
);

CREATE INDEX IF NOT EXISTS commessa_todo_allegato_todo_idx
  ON public.commessa_todo_allegato(todo_id);

-- ═════════════════════════════════════════════════════════════════════
-- RIUNIONE
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.commessa_riunione (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  commessa_id         uuid NOT NULL REFERENCES public.commesse(id) ON DELETE CASCADE,
  data_riunione       date NOT NULL DEFAULT current_date,
  titolo              text,
  corpo_libero        text,
  trascrizione        text,
  reportino           text,
  reportino_modello   text,
  reportino_generato_at timestamptz,
  created_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commessa_riunione_commessa_idx
  ON public.commessa_riunione(commessa_id, data_riunione DESC);
CREATE INDEX IF NOT EXISTS commessa_riunione_tenant_idx
  ON public.commessa_riunione(tenant_id);

COMMENT ON TABLE public.commessa_riunione IS
  'Verbale riunione/sopralluogo legato a una commessa. Contenuto = corpo_libero (scritto) + trascrizione (dettato STT) + reportino (riassunto AI). UI tab Lavori.';

CREATE OR REPLACE FUNCTION public.commessa_riunione_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS commessa_riunione_touch_trg ON public.commessa_riunione;
CREATE TRIGGER commessa_riunione_touch_trg
  BEFORE UPDATE ON public.commessa_riunione
  FOR EACH ROW
  EXECUTE FUNCTION public.commessa_riunione_touch();

-- ─── Allegati riunione (foto + pdf acquisiti) ────────────────────────
CREATE TABLE IF NOT EXISTS public.commessa_riunione_allegato (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  riunione_id  uuid NOT NULL REFERENCES public.commessa_riunione(id) ON DELETE CASCADE,
  file_ref_id  uuid NOT NULL REFERENCES public.file_refs(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('foto', 'pdf_acquisito')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (riunione_id, file_ref_id)
);

CREATE INDEX IF NOT EXISTS commessa_riunione_allegato_riunione_idx
  ON public.commessa_riunione_allegato(riunione_id);

-- ═════════════════════════════════════════════════════════════════════
-- RLS
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE public.commessa_todo               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commessa_todo_nota          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commessa_todo_allegato      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commessa_riunione           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commessa_riunione_allegato  ENABLE ROW LEVEL SECURITY;

-- ─── TODO ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS commessa_todo_read   ON public.commessa_todo;
DROP POLICY IF EXISTS commessa_todo_insert ON public.commessa_todo;
DROP POLICY IF EXISTS commessa_todo_update ON public.commessa_todo;
DROP POLICY IF EXISTS commessa_todo_delete ON public.commessa_todo;

CREATE POLICY commessa_todo_read ON public.commessa_todo
  FOR SELECT
  USING (tenant_id = public.current_tenant_id());

CREATE POLICY commessa_todo_insert ON public.commessa_todo
  FOR INSERT
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_role() IN ('admin'::public.app_role, 'office'::public.app_role)
  );

-- Update: admin/office full; tecnico può cambiare solo stato (complete)
-- e sort_order. La distinzione "solo stato" la enforziamo lato applicativo
-- via colonna allow-list nel server action — qui in RLS basta che tecnico
-- possa scrivere righe del proprio tenant.
CREATE POLICY commessa_todo_update ON public.commessa_todo
  FOR UPDATE
  USING (
    tenant_id = public.current_tenant_id()
    AND public.current_role() IN (
      'admin'::public.app_role,
      'office'::public.app_role,
      'tecnico'::public.app_role
    )
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
  );

CREATE POLICY commessa_todo_delete ON public.commessa_todo
  FOR DELETE
  USING (
    tenant_id = public.current_tenant_id()
    AND public.current_role() IN ('admin'::public.app_role, 'office'::public.app_role)
  );

-- ─── TODO note ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS commessa_todo_nota_read   ON public.commessa_todo_nota;
DROP POLICY IF EXISTS commessa_todo_nota_insert ON public.commessa_todo_nota;
DROP POLICY IF EXISTS commessa_todo_nota_delete ON public.commessa_todo_nota;

CREATE POLICY commessa_todo_nota_read ON public.commessa_todo_nota
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY commessa_todo_nota_insert ON public.commessa_todo_nota
  FOR INSERT
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_role() IN (
      'admin'::public.app_role,
      'office'::public.app_role,
      'tecnico'::public.app_role
    )
  );

-- L'autore può rimuovere la propria nota; admin/office qualunque
CREATE POLICY commessa_todo_nota_delete ON public.commessa_todo_nota
  FOR DELETE
  USING (
    tenant_id = public.current_tenant_id()
    AND (
      author_id = auth.uid()
      OR public.current_role() IN ('admin'::public.app_role, 'office'::public.app_role)
    )
  );

-- ─── TODO allegati ─────────────────────────────────────────────────
DROP POLICY IF EXISTS commessa_todo_allegato_read   ON public.commessa_todo_allegato;
DROP POLICY IF EXISTS commessa_todo_allegato_insert ON public.commessa_todo_allegato;
DROP POLICY IF EXISTS commessa_todo_allegato_delete ON public.commessa_todo_allegato;

CREATE POLICY commessa_todo_allegato_read ON public.commessa_todo_allegato
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY commessa_todo_allegato_insert ON public.commessa_todo_allegato
  FOR INSERT
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_role() IN (
      'admin'::public.app_role,
      'office'::public.app_role,
      'tecnico'::public.app_role
    )
  );

CREATE POLICY commessa_todo_allegato_delete ON public.commessa_todo_allegato
  FOR DELETE
  USING (
    tenant_id = public.current_tenant_id()
    AND public.current_role() IN ('admin'::public.app_role, 'office'::public.app_role)
  );

-- ─── Riunione ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS commessa_riunione_read   ON public.commessa_riunione;
DROP POLICY IF EXISTS commessa_riunione_write  ON public.commessa_riunione;

CREATE POLICY commessa_riunione_read ON public.commessa_riunione
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY commessa_riunione_write ON public.commessa_riunione
  FOR ALL
  USING (
    tenant_id = public.current_tenant_id()
    AND public.current_role() IN ('admin'::public.app_role, 'office'::public.app_role)
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_role() IN ('admin'::public.app_role, 'office'::public.app_role)
  );

-- ─── Riunione allegati ─────────────────────────────────────────────
DROP POLICY IF EXISTS commessa_riunione_allegato_read  ON public.commessa_riunione_allegato;
DROP POLICY IF EXISTS commessa_riunione_allegato_write ON public.commessa_riunione_allegato;

CREATE POLICY commessa_riunione_allegato_read ON public.commessa_riunione_allegato
  FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY commessa_riunione_allegato_write ON public.commessa_riunione_allegato
  FOR ALL
  USING (
    tenant_id = public.current_tenant_id()
    AND public.current_role() IN ('admin'::public.app_role, 'office'::public.app_role)
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_role() IN ('admin'::public.app_role, 'office'::public.app_role)
  );
