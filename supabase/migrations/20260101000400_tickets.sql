-- =====================================================================
-- 20260101000400_tickets.sql
-- Ticketing nativo (sostituisce Freshdesk dopo go-live).
-- Riferimenti: Architettura_Soluzione.md §4 e §6.
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stato_ticket') THEN
    CREATE TYPE public.stato_ticket AS ENUM (
      'aperto',
      'in_lavorazione',
      'attesa_cliente',
      'chiuso'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'priorita_ticket') THEN
    CREATE TYPE public.priorita_ticket AS ENUM (
      'bassa',
      'media',
      'alta',
      'urgente'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_source') THEN
    CREATE TYPE public.ticket_source AS ENUM (
      'manual',
      'email',
      'portal_cliente',
      'imported_from_freshdesk'
    );
  END IF;
END$$;

-- ----- Tabella tickets ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tickets (
  id                    uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  codice                text NOT NULL,                                -- es. TKT-2026-0042
  cliente_id            uuid REFERENCES public.clienti(id) ON DELETE SET NULL,
  oggetto               text NOT NULL,
  descrizione           text,
  stato                 public.stato_ticket NOT NULL DEFAULT 'aperto',
  priorita              public.priorita_ticket NOT NULL DEFAULT 'media',
  assegnato_a           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  source                public.ticket_source NOT NULL DEFAULT 'manual',
  freshdesk_legacy_id   integer,                                       -- popolato solo se source=imported_from_freshdesk
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  closed_at             timestamptz,
  UNIQUE (tenant_id, codice)
);

CREATE INDEX IF NOT EXISTS tickets_tenant_idx       ON public.tickets(tenant_id);
CREATE INDEX IF NOT EXISTS tickets_tenant_stato_idx ON public.tickets(tenant_id, stato);
CREATE INDEX IF NOT EXISTS tickets_assegnato_idx    ON public.tickets(assegnato_a) WHERE assegnato_a IS NOT NULL;
CREATE INDEX IF NOT EXISTS tickets_oggetto_trgm
  ON public.tickets USING gin (oggetto extensions.gin_trgm_ops);

DROP TRIGGER IF EXISTS trg_tickets_updated_at ON public.tickets;
CREATE TRIGGER trg_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMENT ON TABLE public.tickets IS 'Ticket nativi (manuali, email, portale cliente, import Freshdesk one-time).';

-- ----- Tabella ticket_messages -------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id            uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ticket_id     uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  sender_user_id        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  sender_external_email text,                  -- valorizzato se mittente è cliente non loggato (email entrante)
  body          text NOT NULL,
  attachments   jsonb NOT NULL DEFAULT '[]'::jsonb,  -- array di file_refs.id
  is_internal_note boolean NOT NULL DEFAULT false,   -- nota interna ufficio non visibile al cliente
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_messages_ticket_idx ON public.ticket_messages(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS ticket_messages_tenant_idx ON public.ticket_messages(tenant_id);

COMMENT ON TABLE public.ticket_messages IS 'Conversazione (cliente, ufficio, note interne) collegata a un ticket.';
