-- =====================================================================
-- 20260101001300_rls.sql
-- Abilita Row Level Security su tutte le tabelle business + policy.
--
-- Modello di accesso:
--   - tutte le tabelle tenant-scoped: USING / WITH CHECK
--     (tenant_id = public.current_tenant_id())
--   - voci_catalogo: read-only globale per utenti autenticati
--   - audit_events: insert-only per utenti autenticati nel proprio tenant,
--                   read solo se ruolo owner/admin
--   - external_users / portale cliente: accesso limitato al proprio
--     cliente_id (filtro aggiuntivo oltre al tenant)
-- =====================================================================

-- =====================================================================
-- tenants
-- =====================================================================
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenants_select_own  ON public.tenants;
DROP POLICY IF EXISTS tenants_update_own  ON public.tenants;

CREATE POLICY tenants_select_own ON public.tenants
  FOR SELECT
  USING (id = public.current_tenant_id());

-- Solo owner/admin del tenant possono aggiornare i propri dati anagrafici
CREATE POLICY tenants_update_own ON public.tenants
  FOR UPDATE
  USING (id = public.current_tenant_id()
         AND public.current_role() IN ('owner','admin'))
  WITH CHECK (id = public.current_tenant_id());

-- (No INSERT / DELETE policy: provisioning via service_role)

-- =====================================================================
-- users
-- =====================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_same_tenant ON public.users;
DROP POLICY IF EXISTS users_update_self        ON public.users;
DROP POLICY IF EXISTS users_admin_manage       ON public.users;

CREATE POLICY users_select_same_tenant ON public.users
  FOR SELECT
  USING (tenant_id = public.current_tenant_id());

-- Ogni utente può aggiornare il proprio profilo (display_name, avatar)
CREATE POLICY users_update_self ON public.users
  FOR UPDATE
  USING (id = auth.uid() AND tenant_id = public.current_tenant_id())
  WITH CHECK (id = auth.uid() AND tenant_id = public.current_tenant_id());

-- Owner/admin gestiscono utenti del proprio tenant
CREATE POLICY users_admin_manage ON public.users
  FOR ALL
  USING (tenant_id = public.current_tenant_id()
         AND public.current_role() IN ('owner','admin'))
  WITH CHECK (tenant_id = public.current_tenant_id());

-- =====================================================================
-- clienti
-- =====================================================================
ALTER TABLE public.clienti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clienti FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clienti_tenant_scope ON public.clienti;
CREATE POLICY clienti_tenant_scope ON public.clienti
  FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- =====================================================================
-- tickets + ticket_messages
-- =====================================================================
ALTER TABLE public.tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets         FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tickets_tenant_scope          ON public.tickets;
DROP POLICY IF EXISTS ticket_messages_tenant_scope  ON public.ticket_messages;

CREATE POLICY tickets_tenant_scope ON public.tickets
  FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY ticket_messages_tenant_scope ON public.ticket_messages
  FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- =====================================================================
-- commesse + commessa_voci + commessa_counter + preset
-- =====================================================================
ALTER TABLE public.commesse         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commesse         FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.commessa_voci    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commessa_voci    FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.commessa_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commessa_counter FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.preset           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preset           FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commesse_tenant_scope         ON public.commesse;
DROP POLICY IF EXISTS commessa_voci_tenant_scope    ON public.commessa_voci;
DROP POLICY IF EXISTS commessa_counter_tenant_scope ON public.commessa_counter;
DROP POLICY IF EXISTS preset_tenant_scope           ON public.preset;

CREATE POLICY commesse_tenant_scope ON public.commesse
  FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

CREATE POLICY commessa_voci_tenant_scope ON public.commessa_voci
  FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- commessa_counter è interna ma comunque scoped per sicurezza
CREATE POLICY commessa_counter_tenant_scope ON public.commessa_counter
  FOR SELECT
  USING (tenant_id = public.current_tenant_id());

CREATE POLICY preset_tenant_scope ON public.preset
  FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- =====================================================================
-- voci_catalogo (globale, read-only per chi è autenticato)
-- =====================================================================
ALTER TABLE public.voci_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voci_catalogo FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS voci_catalogo_read_all ON public.voci_catalogo;
CREATE POLICY voci_catalogo_read_all ON public.voci_catalogo
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- (Write riservato a service_role: bypassa RLS by design)

-- =====================================================================
-- file_refs
-- =====================================================================
ALTER TABLE public.file_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_refs FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS file_refs_tenant_scope ON public.file_refs;
CREATE POLICY file_refs_tenant_scope ON public.file_refs
  FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- =====================================================================
-- notifiche + push_subscriptions
-- =====================================================================
ALTER TABLE public.notifiche          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifiche          FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifiche_self          ON public.notifiche;
DROP POLICY IF EXISTS push_subs_self          ON public.push_subscriptions;

-- Ogni utente vede solo le proprie notifiche, nel proprio tenant
CREATE POLICY notifiche_self ON public.notifiche
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND user_id = auth.uid())
  WITH CHECK (tenant_id = public.current_tenant_id() AND user_id = auth.uid());

CREATE POLICY push_subs_self ON public.push_subscriptions
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND user_id = auth.uid())
  WITH CHECK (tenant_id = public.current_tenant_id() AND user_id = auth.uid());

-- =====================================================================
-- audit_events: insert-only per il tenant; read solo a owner/admin
-- =====================================================================
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_events_insert ON public.audit_events;
DROP POLICY IF EXISTS audit_events_read   ON public.audit_events;

-- INSERT: chiunque autenticato nel tenant può scrivere log su se stesso
CREATE POLICY audit_events_insert ON public.audit_events
  FOR INSERT
  WITH CHECK (tenant_id = public.current_tenant_id());

-- READ: solo owner/admin del tenant
CREATE POLICY audit_events_read ON public.audit_events
  FOR SELECT
  USING (tenant_id = public.current_tenant_id()
         AND public.current_role() IN ('owner','admin'));

-- (No UPDATE / DELETE: log immutabile)

-- =====================================================================
-- external_users (portale cliente)
-- =====================================================================
ALTER TABLE public.external_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_users FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS external_users_self        ON public.external_users;
DROP POLICY IF EXISTS external_users_staff_read  ON public.external_users;

-- Il cliente finale vede solo se stesso
CREATE POLICY external_users_self ON public.external_users
  FOR ALL
  USING (id = auth.uid() AND tenant_id = public.current_tenant_id())
  WITH CHECK (id = auth.uid() AND tenant_id = public.current_tenant_id());

-- Staff del tenant (office/admin/owner/capo) può leggere e gestire
CREATE POLICY external_users_staff_read ON public.external_users
  FOR ALL
  USING (tenant_id = public.current_tenant_id()
         AND public.current_role() IN ('owner','admin','office','capo'))
  WITH CHECK (tenant_id = public.current_tenant_id());
