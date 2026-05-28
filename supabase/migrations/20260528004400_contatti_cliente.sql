-- =====================================================================
-- 20260528004400_contatti_cliente.sql
-- Ondata 4 — Contatti referente cliente (feedback Bertaiola 28/05/2026).
--
-- Modello pre-esistente: clienti.telefoni text[] + clienti.email text[].
-- Limite: il cliente è una singola entità → niente nome del referente,
-- niente ruolo, nessuna distinzione "chi rispondere al telefono".
--
-- Nuova tabella contatto_cliente: 1-N contatti per cliente con nome,
-- ruolo, telefono, email, note. Backward-compat:
--   - clienti.telefoni / email restano (read-only legacy, mostrati ma
--     non più editati dal nuovo form);
--   - backfill: per ogni telefono distinto del cliente creo un contatto
--     "Generico" → is_primary=true sul primo. Idempotente via UNIQUE.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.contatto_cliente (
  id          uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  cliente_id  uuid        NOT NULL REFERENCES public.clienti(id)  ON DELETE CASCADE,
  nome        text        NOT NULL CHECK (length(nome) BETWEEN 1 AND 160),
  ruolo       text        CHECK (ruolo IS NULL OR length(ruolo) <= 80),
  telefono    text        CHECK (telefono IS NULL OR length(telefono) <= 40),
  email       text        CHECK (email IS NULL OR length(email) <= 200),
  note        text        CHECK (note IS NULL OR length(note) <= 1000),
  is_primary  boolean     NOT NULL DEFAULT false,
  ordine      smallint    NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contatto_cliente_cliente_idx
  ON public.contatto_cliente(cliente_id, ordine);
CREATE INDEX IF NOT EXISTS contatto_cliente_tenant_idx
  ON public.contatto_cliente(tenant_id);

-- Un solo contatto primario per cliente.
CREATE UNIQUE INDEX IF NOT EXISTS contatto_cliente_primary_uniq
  ON public.contatto_cliente(cliente_id)
  WHERE is_primary = true;

-- Evita duplicati esatti nome+telefono per stesso cliente (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS contatto_cliente_dedup
  ON public.contatto_cliente(cliente_id, lower(nome), coalesce(telefono, ''));

-- Updated_at trigger
DROP TRIGGER IF EXISTS trg_contatto_cliente_updated_at ON public.contatto_cliente;
CREATE TRIGGER trg_contatto_cliente_updated_at
  BEFORE UPDATE ON public.contatto_cliente
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- RLS scopata sul tenant
ALTER TABLE public.contatto_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contatto_cliente FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contatto_cliente_read  ON public.contatto_cliente;
DROP POLICY IF EXISTS contatto_cliente_write ON public.contatto_cliente;

-- READ: chiunque autenticato del tenant
CREATE POLICY contatto_cliente_read ON public.contatto_cliente
  FOR SELECT
  USING (tenant_id = public.current_tenant_id());

-- WRITE: admin/office del tenant
CREATE POLICY contatto_cliente_write ON public.contatto_cliente
  FOR ALL
  USING (
    tenant_id = public.current_tenant_id()
    AND public.current_role() IN ('admin'::public.app_role, 'office'::public.app_role)
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_role() IN ('admin'::public.app_role, 'office'::public.app_role)
  );

COMMENT ON TABLE public.contatto_cliente IS
  'Rubrica multi-contatto per cliente. Sostituisce clienti.telefoni/email come fonte di verità, mantenendoli però per backward compatibility.';

-- =====================================================================
-- Backfill non-destructive: trasforma ogni telefono in un contatto
-- "Generico" con stesso ordine. Il primo telefono diventa is_primary.
-- Idempotente: ON CONFLICT DO NOTHING su (cliente_id, lower(nome), telefono).
-- =====================================================================

INSERT INTO public.contatto_cliente
  (tenant_id, cliente_id, nome, ruolo, telefono, email, is_primary, ordine)
SELECT
  c.tenant_id,
  c.id,
  'Contatto principale' AS nome,
  NULL AS ruolo,
  t.tel  AS telefono,
  -- Allinea primo telefono con prima email del cliente, se entrambe esistono.
  CASE WHEN t.idx = 1 AND array_length(c.email, 1) >= 1 THEN c.email[1] ELSE NULL END AS email,
  (t.idx = 1) AS is_primary,
  (t.idx - 1)::smallint AS ordine
FROM public.clienti c
CROSS JOIN LATERAL unnest(c.telefoni) WITH ORDINALITY AS t(tel, idx)
WHERE c.telefoni IS NOT NULL
  AND array_length(c.telefoni, 1) >= 1
  AND length(trim(t.tel)) > 0
ON CONFLICT DO NOTHING;

-- Per clienti SENZA telefono ma CON email, crea comunque un contatto
-- principale con sola email.
INSERT INTO public.contatto_cliente
  (tenant_id, cliente_id, nome, telefono, email, is_primary, ordine)
SELECT
  c.tenant_id,
  c.id,
  'Contatto principale',
  NULL,
  c.email[1],
  true,
  0
FROM public.clienti c
WHERE (c.telefoni IS NULL OR array_length(c.telefoni, 1) IS NULL)
  AND c.email IS NOT NULL
  AND array_length(c.email, 1) >= 1
  AND NOT EXISTS (
    SELECT 1 FROM public.contatto_cliente cc WHERE cc.cliente_id = c.id
  )
ON CONFLICT DO NOTHING;
