-- =====================================================================
-- 20260101001400_search.sql
-- Indici di ricerca aggiuntivi + view materializzata `search_documents`
-- che unisce commesse + tickets + file_refs per la ricerca trasversale.
--
-- Gli indici trigram principali sono già stati creati nelle migrazioni
-- specifiche (clienti.ragione_sociale, commesse.codice_interno e
-- nome_cartella, tickets.oggetto, file_refs.filename).
-- Qui aggiungiamo la materialized view + indici a supporto.
-- =====================================================================

-- ----- Materialized view: search_documents ------------------------------
-- Una riga per ogni "documento ricercabile". `kind` distingue il tipo.
CREATE MATERIALIZED VIEW IF NOT EXISTS public.search_documents AS
  -- Commesse
  SELECT
    'commessa'::text                                    AS kind,
    c.id                                                AS id,
    c.tenant_id                                         AS tenant_id,
    c.codice_interno || ' ' || c.nome_cartella || ' ' || coalesce(cl.ragione_sociale,'') AS label,
    c.codice_interno                                    AS codice,
    coalesce(c.descrizione_ai_finale, c.descrizione_ai_proposta, '') AS body,
    c.updated_at                                        AS updated_at
  FROM public.commesse c
  LEFT JOIN public.clienti cl ON cl.id = c.cliente_id

  UNION ALL

  -- Tickets
  SELECT
    'ticket'::text                                      AS kind,
    t.id                                                AS id,
    t.tenant_id                                         AS tenant_id,
    t.codice || ' ' || t.oggetto                        AS label,
    t.codice                                            AS codice,
    coalesce(t.descrizione, '')                         AS body,
    t.updated_at                                        AS updated_at
  FROM public.tickets t

  UNION ALL

  -- File refs
  SELECT
    'file'::text                                        AS kind,
    f.id                                                AS id,
    f.tenant_id                                         AS tenant_id,
    f.filename                                          AS label,
    NULL::text                                          AS codice,
    coalesce(f.ocr_text, '')                            AS body,
    f.uploaded_at                                       AS updated_at
  FROM public.file_refs f;

-- Indici sulla MV
CREATE UNIQUE INDEX IF NOT EXISTS search_documents_pk
  ON public.search_documents(kind, id);

CREATE INDEX IF NOT EXISTS search_documents_tenant_idx
  ON public.search_documents(tenant_id);

CREATE INDEX IF NOT EXISTS search_documents_label_trgm
  ON public.search_documents USING gin (label extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS search_documents_body_fts
  ON public.search_documents USING gin (to_tsvector('italian', body));

COMMENT ON MATERIALIZED VIEW public.search_documents IS
  'Indice di ricerca unificato (commesse + tickets + file). Refresh manuale o via cron Edge Function.';

-- ----- Helper refresh ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_search_documents()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.search_documents;
END;
$$;

COMMENT ON FUNCTION public.refresh_search_documents() IS
  'Refresh CONCURRENTLY della MV search_documents. Da agganciare a cron (es. ogni 5 minuti) o a trigger di scrittura.';

-- Nota: la MV non ha RLS (Postgres non supporta RLS su MV); l accesso
-- deve essere mediato da una funzione/view sicura. Esponiamo qui sotto
-- una view filtrata che applica il tenant scope:
CREATE OR REPLACE VIEW public.search_documents_scoped AS
  SELECT *
    FROM public.search_documents
   WHERE tenant_id = public.current_tenant_id();

COMMENT ON VIEW public.search_documents_scoped IS
  'View filtrata della MV: applica tenant_id = current_tenant_id(). Usare questa dal client, non la MV nuda.';
