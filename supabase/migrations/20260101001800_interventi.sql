-- =====================================================================
-- 20260101001800_interventi.sql
-- Time tracking interventi (turni) per utente / commessa / voce.
--
-- Modello:
--   - una riga = un intervento (turno) di un utente su una commessa
--   - end_at NULL  → intervento "aperto" (cronometro corrente)
--   - end_at !NULL → intervento "chiuso", duration_minutes calcolato a stop
--   - vincolo: massimo UN intervento aperto per utente
--     (partial unique index su user_id WHERE end_at IS NULL)
--   - geo (lat/lng) catturata al start (best-effort) lato client
--
-- Nota: NON usiamo GENERATED ALWAYS AS perché Postgres non permette
-- funzioni volatili (`now()`) in colonne stored. La duration viene
-- aggiornata server-side a stop (vedi Server Action `terminaTurno`).
--
-- RLS scope-tenant standard.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.interventi (
  id               uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id)        ON DELETE CASCADE,
  commessa_id      uuid NOT NULL REFERENCES public.commesse(id)       ON DELETE CASCADE,
  voce_id          smallint REFERENCES public.voci_catalogo(id)       ON DELETE SET NULL,
  user_id          uuid NOT NULL REFERENCES public.users(id)          ON DELETE CASCADE,
  start_at         timestamptz NOT NULL DEFAULT now(),
  end_at           timestamptz,
  duration_minutes integer,                                            -- aggiornato server-side a stop
  geo_lat          numeric(9,6),
  geo_lng          numeric(9,6),
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interventi_end_after_start
    CHECK (end_at IS NULL OR end_at >= start_at)
);

CREATE INDEX IF NOT EXISTS interventi_tenant_user_start_idx
  ON public.interventi (tenant_id, user_id, start_at DESC);
CREATE INDEX IF NOT EXISTS interventi_tenant_commessa_start_idx
  ON public.interventi (tenant_id, commessa_id, start_at DESC);

-- Solo un intervento aperto per utente (cronometro singolo).
-- Partial unique index: vincola solo le righe con end_at IS NULL.
CREATE UNIQUE INDEX IF NOT EXISTS interventi_unique_open_per_user
  ON public.interventi (user_id)
  WHERE end_at IS NULL;

DROP TRIGGER IF EXISTS trg_interventi_updated_at ON public.interventi;
CREATE TRIGGER trg_interventi_updated_at
  BEFORE UPDATE ON public.interventi
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMENT ON TABLE public.interventi IS
  'Time tracking: turni/interventi per utente su commessa (opz. su voce). Solo un turno aperto per utente.';

-- =====================================================================
-- RLS: scope tenant standard (allineato a tutte le altre tabelle business).
-- =====================================================================
ALTER TABLE public.interventi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interventi FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS interventi_tenant_scope ON public.interventi;
CREATE POLICY interventi_tenant_scope ON public.interventi
  FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());
