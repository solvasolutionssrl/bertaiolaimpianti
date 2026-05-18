-- =====================================================================
-- 20260101001700_ticket_sla.sql
-- SLA Ticketing: politiche per-tenant per priorità + target_response_at /
-- target_close_at sui ticket + view con stato SLA calcolato.
--
-- Idempotente. Tutte le DDL usano IF NOT EXISTS / OR REPLACE.
--
-- Riferimenti:
--   - tabella tickets, enum priorita_ticket: migration 20260101000400_tickets.sql
--   - helper RLS current_tenant_id / current_role: migration 20260101000200_users.sql
-- =====================================================================

-- ----- Tabella sla_policy ------------------------------------------------
-- Una riga per (tenant, priorita). Definisce i minuti entro cui rispondere
-- (primo messaggio non-internal_note dallo staff) e chiudere il ticket.
CREATE TABLE IF NOT EXISTS public.sla_policy (
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  priorita         public.priorita_ticket NOT NULL,
  response_minutes integer NOT NULL CHECK (response_minutes > 0),
  close_minutes    integer NOT NULL CHECK (close_minutes >= response_minutes),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, priorita)
);

CREATE INDEX IF NOT EXISTS sla_policy_tenant_idx ON public.sla_policy(tenant_id);

COMMENT ON TABLE public.sla_policy IS
  'Politiche SLA per-tenant: response_minutes (primo riscontro) e close_minutes (chiusura) per ciascuna priorità.';

-- Trigger updated_at (riusa tg_set_updated_at già definita in tenants migration)
DROP TRIGGER IF EXISTS trg_sla_policy_updated_at ON public.sla_policy;
CREATE TRIGGER trg_sla_policy_updated_at
  BEFORE UPDATE ON public.sla_policy
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ----- RLS scope tenant --------------------------------------------------
ALTER TABLE public.sla_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_policy FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sla_policy_read  ON public.sla_policy;
DROP POLICY IF EXISTS sla_policy_write ON public.sla_policy;

-- READ: chiunque autenticato del tenant può leggere le policy (serve al
-- trigger BEFORE INSERT e ai client per mostrare i target stimati).
CREATE POLICY sla_policy_read ON public.sla_policy
  FOR SELECT
  USING (tenant_id = public.current_tenant_id());

-- WRITE (INSERT/UPDATE/DELETE): solo owner/admin del tenant.
CREATE POLICY sla_policy_write ON public.sla_policy
  FOR ALL
  USING (tenant_id = public.current_tenant_id()
         AND public.current_role() IN ('owner','admin'))
  WITH CHECK (tenant_id = public.current_tenant_id()
              AND public.current_role() IN ('owner','admin'));

-- ----- Aggiunta colonne SLA a tickets -----------------------------------
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS target_response_at  timestamptz,
  ADD COLUMN IF NOT EXISTS target_close_at     timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at   timestamptz;

COMMENT ON COLUMN public.tickets.target_response_at IS
  'Scadenza SLA per il primo riscontro dello staff (calcolata da sla_policy al momento dell INSERT).';
COMMENT ON COLUMN public.tickets.target_close_at IS
  'Scadenza SLA per la chiusura del ticket (calcolata da sla_policy al momento dell INSERT).';
COMMENT ON COLUMN public.tickets.first_response_at IS
  'Timestamp del primo messaggio non-internal_note inviato dallo staff. NULL = ancora in attesa di risposta.';

-- Indici per query "a rischio" / "in breach"
CREATE INDEX IF NOT EXISTS tickets_target_close_idx
  ON public.tickets(tenant_id, target_close_at)
  WHERE closed_at IS NULL AND target_close_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS tickets_target_response_idx
  ON public.tickets(tenant_id, target_response_at)
  WHERE first_response_at IS NULL AND target_response_at IS NOT NULL;

-- ----- Trigger: popolamento automatico target_* in INSERT ---------------
-- Se l'INSERT non valorizza esplicitamente target_response_at / target_close_at,
-- li deriviamo da sla_policy(tenant_id, priorita).
-- Edge case: nessuna policy per quella combinazione -> target_* restano NULL
-- e ticket_sla_status() li tratta come "ok" (nessuna scadenza definita).
CREATE OR REPLACE FUNCTION public.set_ticket_sla_targets()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_response_minutes integer;
  v_close_minutes    integer;
BEGIN
  IF NEW.target_response_at IS NULL OR NEW.target_close_at IS NULL THEN
    SELECT response_minutes, close_minutes
      INTO v_response_minutes, v_close_minutes
      FROM public.sla_policy
      WHERE tenant_id = NEW.tenant_id
        AND priorita  = NEW.priorita;

    IF FOUND THEN
      NEW.target_response_at := COALESCE(
        NEW.target_response_at,
        NEW.created_at + (v_response_minutes || ' minutes')::interval
      );
      NEW.target_close_at := COALESCE(
        NEW.target_close_at,
        NEW.created_at + (v_close_minutes || ' minutes')::interval
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_sla_targets ON public.tickets;
CREATE TRIGGER trg_ticket_sla_targets
  BEFORE INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_ticket_sla_targets();

-- ----- Helper: status SLA corrente --------------------------------------
-- Ritorna uno dei valori:
--   'ok' | 'risposta_a_rischio' | 'risposta_breach' |
--   'chiusura_a_rischio' | 'chiusura_breach'
--
-- NOTA: marcata IMMUTABLE per consentire l'uso in view e cast.
-- In realtà dipende da now(); ciò significa che il valore non viene
-- ricalcolato in modo automatico — per esposizione in SELECT va bene
-- (la view viene rivalutata ad ogni query), ma NON usarla in indici o WHERE
-- predicati materializzati.
CREATE OR REPLACE FUNCTION public.ticket_sla_status(
  p_first_response_at   timestamptz,
  p_target_response_at  timestamptz,
  p_closed_at           timestamptz,
  p_target_close_at     timestamptz
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Breach risposta: nessuna prima risposta entro target_response_at.
  IF p_first_response_at IS NULL AND p_target_response_at IS NOT NULL THEN
    IF now() > p_target_response_at THEN
      RETURN 'risposta_breach';
    END IF;
    IF now() > p_target_response_at - interval '30 minutes' THEN
      RETURN 'risposta_a_rischio';
    END IF;
  END IF;

  -- Breach chiusura: ticket non chiuso entro target_close_at.
  IF p_closed_at IS NULL AND p_target_close_at IS NOT NULL THEN
    IF now() > p_target_close_at THEN
      RETURN 'chiusura_breach';
    END IF;
    IF now() > p_target_close_at - interval '1 hour' THEN
      RETURN 'chiusura_a_rischio';
    END IF;
  END IF;

  RETURN 'ok';
END;
$$;

COMMENT ON FUNCTION public.ticket_sla_status(timestamptz, timestamptz, timestamptz, timestamptz) IS
  'Calcola lo stato SLA corrente di un ticket. Marcata IMMUTABLE per uso in view: NON usare in indici.';

-- ----- View: tickets_with_sla -------------------------------------------
-- Espone tutte le colonne di tickets + sla_status calcolato. security_invoker
-- garantisce che la RLS della tabella sottostante si applichi (default
-- delle view in Postgres = security_definer).
CREATE OR REPLACE VIEW public.tickets_with_sla AS
SELECT
  t.*,
  public.ticket_sla_status(
    t.first_response_at,
    t.target_response_at,
    t.closed_at,
    t.target_close_at
  ) AS sla_status
FROM public.tickets t;

ALTER VIEW public.tickets_with_sla SET (security_invoker = true);

COMMENT ON VIEW public.tickets_with_sla IS
  'View su public.tickets con sla_status calcolato. security_invoker=true (RLS della tabella si applica).';

-- ----- Seed default policy per tutti i tenant esistenti -----------------
-- I valori di default sono allineati alla proposta commerciale (Pacchetto B).
-- Possono essere modificati dal tenant in /office/impostazioni/sla.
-- ON CONFLICT DO NOTHING garantisce idempotenza.
INSERT INTO public.sla_policy (tenant_id, priorita, response_minutes, close_minutes)
SELECT t.id, p.priorita, p.r, p.c
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('bassa'::public.priorita_ticket,   1440, 10080),  -- 24h risposta, 7gg chiusura
    ('media'::public.priorita_ticket,    480,  4320),  -- 8h risposta,  3gg chiusura
    ('alta'::public.priorita_ticket,     120,  1440),  -- 2h risposta,  24h chiusura
    ('urgente'::public.priorita_ticket,   30,   480)   -- 30m risposta, 8h chiusura
) AS p(priorita, r, c)
ON CONFLICT (tenant_id, priorita) DO NOTHING;
