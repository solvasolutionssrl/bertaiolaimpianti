-- =====================================================================
-- 20260101001900_platform_admin.sql
-- Super admin SOLVA + piani + quote per-tenant.
--
-- Concetti:
--  - `is_platform_admin` flag su public.users: utenti SOLVA che vedono e
--    governano TUTTI i tenant (cross-tenant). Hanno tenant_id NULL.
--  - tabella `plans`: piani commerciali (starter/pro/enterprise) con limiti.
--  - tabella `tenant_quotas`: override quote per singolo tenant.
--  - tabella `tenant_usage_snapshot`: cache aggregata, popolata da cron.
--  - RLS policy "platform admin bypass": gli admin SOLVA possono SELECT
--    qualsiasi tenant; le scritture restano protette dalle policy tenant.
-- =====================================================================

-- ----- 1. Flag platform admin su users ---------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_platform_admin IS
  'Se true → utente SOLVA con accesso cross-tenant (NON conta come utente del tenant ai fini delle quote). tenant_id può essere NULL.';

-- Rilassa NOT NULL su tenant_id se presente (i platform admin non hanno tenant)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND table_schema='public' AND column_name='tenant_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.users ALTER COLUMN tenant_id DROP NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS users_platform_admin_idx
  ON public.users (is_platform_admin)
  WHERE is_platform_admin = true;

-- ----- 2. Helper SQL ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    (auth.jwt() ->> 'platform_admin')::boolean,
    (auth.jwt() -> 'app_metadata' ->> 'platform_admin')::boolean,
    false
  );
$$;

COMMENT ON FUNCTION public.is_platform_admin() IS
  'Ritorna true se il JWT contiene custom claim platform_admin=true. Usato da policy RLS per bypass cross-tenant.';

-- Trigger sync_user_claims esteso: propaga is_platform_admin a auth.users.raw_app_meta_data
CREATE OR REPLACE FUNCTION public.sync_user_claims()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_slug text;
BEGIN
  SELECT slug INTO v_tenant_slug FROM public.tenants WHERE id = NEW.tenant_id;
  UPDATE auth.users
  SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'tenant_id', NEW.tenant_id,
    'tenant_slug', v_tenant_slug,
    'role', NEW.role::text,
    'platform_admin', NEW.is_platform_admin
  )
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

-- ----- 3. Tabella plans ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plans (
  id            uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  code          text UNIQUE NOT NULL,                        -- 'starter', 'pro', 'enterprise'
  nome          text NOT NULL,                                -- "Starter", "Professional", "Enterprise"
  descrizione   text,
  prezzo_mensile_eur numeric(10,2) NOT NULL DEFAULT 0,
  max_utenti    integer NOT NULL DEFAULT 10,
  max_commesse_anno integer NOT NULL DEFAULT 200,
  max_storage_gb integer NOT NULL DEFAULT 50,
  max_tickets_mese integer NOT NULL DEFAULT 500,
  features      jsonb NOT NULL DEFAULT '{}'::jsonb,
  attivo        boolean NOT NULL DEFAULT true,
  ordine        smallint NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plans_read_all ON public.plans;
CREATE POLICY plans_read_all ON public.plans
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS plans_write_platform ON public.plans;
CREATE POLICY plans_write_platform ON public.plans
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- Seed piani base
INSERT INTO public.plans (code, nome, descrizione, prezzo_mensile_eur, max_utenti, max_commesse_anno, max_storage_gb, max_tickets_mese, ordine) VALUES
  ('starter',    'Starter',      'Piccola impresa fino a 5 tecnici',    149,  5,   100,  50,   200, 10),
  ('pro',        'Professional', 'PMI con squadra estesa, multi-cantiere', 349, 20,  500,  250, 1000, 20),
  ('enterprise', 'Enterprise',   'Tenant grandi con esigenze custom',     0,   100, 5000, 2000, 10000, 30)
ON CONFLICT (code) DO NOTHING;

-- ----- 4. Tenants: collega a plan + stato sospensione ------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.plans(id),
  ADD COLUMN IF NOT EXISTS sospeso boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sospeso_motivo text,
  ADD COLUMN IF NOT EXISTS sospeso_at timestamptz,
  ADD COLUMN IF NOT EXISTS note_interne text;                -- note SOLVA, non visibili al tenant

-- Default plan: pro (popolato solo per tenant esistenti senza plan)
UPDATE public.tenants
SET plan_id = (SELECT id FROM public.plans WHERE code = 'pro')
WHERE plan_id IS NULL;

-- ----- 5. Tabella tenant_quotas (override per tenant) ------------------
CREATE TABLE IF NOT EXISTS public.tenant_quotas (
  tenant_id     uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  max_utenti    integer,                                       -- NULL = usa plan default
  max_commesse_anno integer,
  max_storage_gb integer,
  max_tickets_mese integer,
  note          text,                                          -- perché l'override (es. "promo Q4")
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.tenant_quotas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_quotas_admin ON public.tenant_quotas;
CREATE POLICY tenant_quotas_admin ON public.tenant_quotas
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ----- 6. Snapshot uso aggregato (cache, popolato da cron) -------------
CREATE TABLE IF NOT EXISTS public.tenant_usage_snapshot (
  tenant_id     uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  utenti_attivi integer NOT NULL DEFAULT 0,
  commesse_anno integer NOT NULL DEFAULT 0,
  commesse_totali integer NOT NULL DEFAULT 0,
  commesse_aperte integer NOT NULL DEFAULT 0,
  tickets_mese  integer NOT NULL DEFAULT 0,
  storage_gb    numeric(10,3) NOT NULL DEFAULT 0,
  foto_settimana integer NOT NULL DEFAULT 0,
  ultima_attivita timestamptz,
  snapshot_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_usage_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usage_snapshot_admin_or_tenant ON public.tenant_usage_snapshot;
CREATE POLICY usage_snapshot_admin_or_tenant ON public.tenant_usage_snapshot
  FOR SELECT
  USING (public.is_platform_admin() OR tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS usage_snapshot_admin_write ON public.tenant_usage_snapshot;
CREATE POLICY usage_snapshot_admin_write ON public.tenant_usage_snapshot
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ----- 7. Function aggiorna_usage_snapshot() ---------------------------
-- Da chiamare manualmente o via pg_cron / Edge Function schedulata.
CREATE OR REPLACE FUNCTION public.aggiorna_usage_snapshot(p_tenant_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  INSERT INTO public.tenant_usage_snapshot (
    tenant_id, utenti_attivi, commesse_anno, commesse_totali, commesse_aperte,
    tickets_mese, storage_gb, foto_settimana, ultima_attivita, snapshot_at
  )
  SELECT
    t.id,
    (SELECT count(*) FROM public.users u WHERE u.tenant_id = t.id AND u.attivo AND NOT u.is_platform_admin),
    (SELECT count(*) FROM public.commesse c WHERE c.tenant_id = t.id AND c.created_at > date_trunc('year', now())),
    (SELECT count(*) FROM public.commesse c WHERE c.tenant_id = t.id),
    (SELECT count(*) FROM public.commesse c WHERE c.tenant_id = t.id AND c.stato IN ('aperta','in_corso','collaudo')),
    (SELECT count(*) FROM public.tickets tk WHERE tk.tenant_id = t.id AND tk.created_at > date_trunc('month', now())),
    coalesce((SELECT sum(f.size_bytes)::numeric / 1073741824 FROM public.file_refs f WHERE f.tenant_id = t.id), 0),
    (SELECT count(*) FROM public.file_refs f WHERE f.tenant_id = t.id AND f.uploaded_at > now() - interval '7 days' AND f.mime LIKE 'image/%'),
    GREATEST(
      (SELECT max(a.created_at) FROM public.audit_events a WHERE a.tenant_id = t.id),
      (SELECT max(c.updated_at) FROM public.commesse c WHERE c.tenant_id = t.id)
    ),
    now()
  FROM public.tenants t
  WHERE (p_tenant_id IS NULL OR t.id = p_tenant_id)
  ON CONFLICT (tenant_id) DO UPDATE SET
    utenti_attivi = EXCLUDED.utenti_attivi,
    commesse_anno = EXCLUDED.commesse_anno,
    commesse_totali = EXCLUDED.commesse_totali,
    commesse_aperte = EXCLUDED.commesse_aperte,
    tickets_mese = EXCLUDED.tickets_mese,
    storage_gb = EXCLUDED.storage_gb,
    foto_settimana = EXCLUDED.foto_settimana,
    ultima_attivita = EXCLUDED.ultima_attivita,
    snapshot_at = EXCLUDED.snapshot_at;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ----- 8. RLS bypass per platform admin su tabelle tenant-scoped ------
-- Aggiungiamo policy ADDITIVE (non sostitutive) chiamate `*_platform_admin`
-- che concedono SELECT a chi ha il claim. Le scritture restano via UI server
-- action con service-role + check applicativo.

-- Helper per gestire i nomi
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'tenants', 'users', 'clienti', 'commesse', 'commessa_voci', 'voci_catalogo',
    'preset', 'tickets', 'ticket_messages', 'file_refs', 'notifiche',
    'push_subscriptions', 'audit_events', 'external_users', 'sla_policy',
    'interventi', 'tenant_voci_override'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_platform_admin_read ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_platform_admin_read ON public.%I FOR SELECT USING (public.is_platform_admin())',
      tbl, tbl
    );
  END LOOP;
END $$;

-- Tenants: anche scrittura cross-tenant per platform admin
DROP POLICY IF EXISTS tenants_platform_admin_write ON public.tenants;
CREATE POLICY tenants_platform_admin_write ON public.tenants
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- Users: platform admin può modificare ruoli/attivo di chiunque (per supporto)
DROP POLICY IF EXISTS users_platform_admin_write ON public.users;
CREATE POLICY users_platform_admin_write ON public.users
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ----- 9. Audit eventi platform ---------------------------------------
-- Marca eventi platform_admin: actor_role='platform_admin' (extending app_role
-- non vogliamo, usiamo metadata.platform=true nei nuovi audit).

COMMENT ON COLUMN public.audit_events.metadata IS
  'jsonb arbitrario. Convenzioni: {platform: true} per azioni super-admin, {commessa_id: uuid} per cross-ref.';
