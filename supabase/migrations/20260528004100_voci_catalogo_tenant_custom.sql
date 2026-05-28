-- =====================================================================
-- 20260528004100_voci_catalogo_tenant_custom.sql
-- Estende voci_catalogo per supportare voci custom create da un tenant.
--
-- Modello:
--   tenant_id IS NULL     → voce globale (le 39 canoniche da seed.sql)
--   tenant_id IS NOT NULL → voce custom, visibile/editabile solo da
--                           quel tenant (owner/admin).
--
-- Le voci custom hanno id auto-generato dalla sequence dedicata
-- (range 1000+) per non collidere col seed 1..39.
--
-- RLS attivata sulla tabella per scopare lettura/scrittura. Le query
-- esistenti `SELECT * FROM voci_catalogo` continuano a funzionare:
-- restituiscono globali + custom del tenant chiamante.
-- =====================================================================

-- 1) Colonna tenant_id (nullable)
ALTER TABLE public.voci_catalogo
  ADD COLUMN IF NOT EXISTS tenant_id uuid NULL
    REFERENCES public.tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS voci_catalogo_tenant_idx
  ON public.voci_catalogo(tenant_id)
  WHERE tenant_id IS NOT NULL;

COMMENT ON COLUMN public.voci_catalogo.tenant_id IS
  'NULL = voce globale (seed canonico). NOT NULL = voce custom visibile solo a quel tenant. Id custom generati da voci_catalogo_custom_id_seq (range 1000+).';

-- 2) Sequence per id voci custom (1000..32767 = limite di smallint)
CREATE SEQUENCE IF NOT EXISTS public.voci_catalogo_custom_id_seq
  START WITH 1000
  MINVALUE 1000
  MAXVALUE 32767
  NO CYCLE;

COMMENT ON SEQUENCE public.voci_catalogo_custom_id_seq IS
  'Id auto-generato per voci_catalogo custom-tenant. Range 1000..32767 (smallint). Le voci globali usano 1..999.';

-- 3) RLS scopata
ALTER TABLE public.voci_catalogo ENABLE ROW LEVEL SECURITY;
-- Non FORCE: il service-role (seed, manutenzione globale) deve poter
-- inserire voci globali con tenant_id=NULL.

DROP POLICY IF EXISTS voci_catalogo_read  ON public.voci_catalogo;
DROP POLICY IF EXISTS voci_catalogo_write ON public.voci_catalogo;

-- READ: voci globali (tenant_id NULL) + voci del tenant corrente.
CREATE POLICY voci_catalogo_read ON public.voci_catalogo
  FOR SELECT
  USING (
    tenant_id IS NULL
    OR tenant_id = public.current_tenant_id()
  );

-- WRITE: solo owner/admin del tenant, solo sulle proprie voci custom.
-- Le voci globali (tenant_id NULL) restano gestibili solo dal service-role.
CREATE POLICY voci_catalogo_write ON public.voci_catalogo
  FOR ALL
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_tenant_id()
    AND public.current_role() IN ('owner','admin')
  )
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_tenant_id()
    AND public.current_role() IN ('owner','admin')
  );

-- 4) Vincolo: per le voci custom, (tenant_id, nome) deve essere unico
-- (case-insensitive). Evita che lo stesso tenant crei "Nuovo impianto"
-- e "NUOVO IMPIANTO" come due voci distinte.
CREATE UNIQUE INDEX IF NOT EXISTS voci_catalogo_tenant_nome_uniq
  ON public.voci_catalogo (tenant_id, lower(nome))
  WHERE tenant_id IS NOT NULL;

-- 5) Helper RPC per consumare la sequence dal client Supabase.
-- Necessario perché supabase-js non espone direttamente nextval().
-- SECURITY DEFINER + scope check: l'invocante deve essere autenticato e
-- avere ruolo owner/admin del tenant corrente.
CREATE OR REPLACE FUNCTION public.next_voce_custom_id()
RETURNS smallint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := public.current_role();
  IF v_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'Permessi insufficienti per generare un id voce custom';
  END IF;
  RETURN nextval('public.voci_catalogo_custom_id_seq')::smallint;
END;
$$;

REVOKE ALL ON FUNCTION public.next_voce_custom_id() FROM public;
GRANT EXECUTE ON FUNCTION public.next_voce_custom_id() TO authenticated;

COMMENT ON FUNCTION public.next_voce_custom_id() IS
  'Restituisce il prossimo id disponibile per una voce custom (sequence 1000+). Solo owner/admin.';
