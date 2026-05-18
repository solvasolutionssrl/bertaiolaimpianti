-- =====================================================================
-- 20260101001000_notifiche.sql
-- Notifiche in-app + push subscriptions (Web Push API per la PWA).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.notifiche (
  id           uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  type         text NOT NULL,                                  -- es. "ticket_assigned", "fase_zero_foto"
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,             -- dati per render UI / deep-link
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifiche_user_unread_idx
  ON public.notifiche(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifiche_tenant_idx ON public.notifiche(tenant_id);

COMMENT ON TABLE public.notifiche IS 'Notifiche applicative (in-app). Ogni notifica può anche tradursi in push/email via worker.';

-- ----- Push subscriptions Web Push API ---------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  endpoint     text NOT NULL,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS push_subs_tenant_idx ON public.push_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS push_subs_user_idx   ON public.push_subscriptions(user_id);

COMMENT ON TABLE public.push_subscriptions IS 'Subscription Web Push per la PWA tecnici. Una per (user, endpoint).';
