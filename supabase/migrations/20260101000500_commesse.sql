-- =====================================================================
-- 20260101000500_commesse.sql
-- Commesse + funzione di generazione codice interno per-tenant per-anno.
-- Riferimenti: Architettura_Soluzione.md §4, Tassonomia_Lavori.md §5,
--              Flusso_Operativo.md §2 (passo 7).
-- =====================================================================

-- ----- Enum: stato commessa ---------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stato_commessa') THEN
    CREATE TYPE public.stato_commessa AS ENUM (
      'bozza',
      'aperta',
      'in_corso',
      'collaudo',
      'completata',
      'archiviata'
    );
  END IF;
END$$;

-- ----- Tabella commesse --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commesse (
  id                          uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cliente_id                  uuid NOT NULL REFERENCES public.clienti(id) ON DELETE RESTRICT,
  codice_interno              text NOT NULL,                       -- es. BER-26-001
  nome_cartella               text NOT NULL,                       -- es. Rossi_2026-05-10_SistemazioneBagno
  cloud_folder_path           text,                                -- popolato dopo creazione cartella
  cliente_indirizzo_cantiere  text,
  descrizione_ai_proposta     text,                                -- output raw Claude Haiku
  descrizione_ai_finale       text,                                -- versione editata dal capo
  stato                       public.stato_commessa NOT NULL DEFAULT 'bozza',
  responsabile_id             uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ticket_id                   uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  preset_id                   uuid,                                -- FK aggiunta in 20260101000800_preset.sql
  data_apertura               date NOT NULL DEFAULT CURRENT_DATE,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, codice_interno),
  UNIQUE (tenant_id, nome_cartella)
);

CREATE INDEX IF NOT EXISTS commesse_tenant_idx          ON public.commesse(tenant_id);
CREATE INDEX IF NOT EXISTS commesse_tenant_stato_idx    ON public.commesse(tenant_id, stato);
CREATE INDEX IF NOT EXISTS commesse_responsabile_idx    ON public.commesse(responsabile_id) WHERE responsabile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commesse_codice_trgm
  ON public.commesse USING gin (codice_interno extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS commesse_nome_trgm
  ON public.commesse USING gin (nome_cartella extensions.gin_trgm_ops);

DROP TRIGGER IF EXISTS trg_commesse_updated_at ON public.commesse;
CREATE TRIGGER trg_commesse_updated_at
  BEFORE UPDATE ON public.commesse
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Back-reference: ticket → commessa (per evitare ciclo nel DDL, gestiamo
-- l associazione lato app; il legame `commesse.ticket_id` è già qui sopra
-- e copre il caso "ticket diventa commessa").
-- Esponiamo anche una vista comoda:
CREATE OR REPLACE VIEW public.commesse_con_cliente AS
SELECT
  c.id, c.tenant_id, c.codice_interno, c.nome_cartella, c.stato,
  c.data_apertura, c.responsabile_id, c.ticket_id, c.cloud_folder_path,
  c.cliente_indirizzo_cantiere,
  cl.id           AS cliente_id,
  cl.ragione_sociale AS cliente_ragione_sociale,
  cl.tipo         AS cliente_tipo
FROM public.commesse c
JOIN public.clienti  cl ON cl.id = c.cliente_id;

COMMENT ON TABLE public.commesse IS 'Commesse: una per intervento. Codice tecnico (BER-26-001) + nome cartella leggibile.';

-- ----- Sequence per-tenant-per-anno per progressivo commessa -------------
-- Tabella di stato che incrementiamo atomicamente.
CREATE TABLE IF NOT EXISTS public.commessa_counter (
  tenant_id   uuid    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  anno        smallint NOT NULL,                 -- ultime 2 cifre dell anno (es. 26)
  ultimo_num  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, anno)
);

COMMENT ON TABLE public.commessa_counter IS 'Progressivo per-tenant per-anno usato da genera_codice_commessa(). Reset implicito a gennaio (nuovo record).';

-- ----- Funzione genera_codice_commessa -----------------------------------
CREATE OR REPLACE FUNCTION public.genera_codice_commessa(
  p_tenant_slug citext,
  p_anno        smallint DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_anno_short smallint;
  v_num integer;
BEGIN
  -- Risolvi tenant
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = p_tenant_slug;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant slug % non trovato', p_tenant_slug;
  END IF;

  -- Anno (default: anno corrente, ultime 2 cifre)
  v_anno_short := COALESCE(p_anno, EXTRACT(YEAR FROM CURRENT_DATE)::int % 100);

  -- UPSERT atomico sul counter (transaction-safe)
  INSERT INTO public.commessa_counter (tenant_id, anno, ultimo_num)
       VALUES (v_tenant_id, v_anno_short, 1)
  ON CONFLICT (tenant_id, anno)
       DO UPDATE SET ultimo_num = public.commessa_counter.ultimo_num + 1
  RETURNING ultimo_num INTO v_num;

  RETURN upper(p_tenant_slug::text) || '-' || lpad(v_anno_short::text, 2, '0') || '-' || lpad(v_num::text, 3, '0');
END;
$$;

COMMENT ON FUNCTION public.genera_codice_commessa IS 'Restituisce <SLUG>-<AA>-<NNN> progressivo per-tenant per-anno (atomico).';
