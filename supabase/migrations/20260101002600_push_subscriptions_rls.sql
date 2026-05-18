-- ============================================================
-- push_subscriptions: abilita RLS (era stata creata senza in 001000)
-- ============================================================
-- La tabella esisteva da 20260101001000_notifiche.sql ma senza
-- ALTER TABLE ENABLE RLS né policy → ogni utente autenticato poteva
-- leggere/modificare le subscription di chiunque.
--
-- Modello: l'utente vede/scrive solo le proprie. Insert deve
-- combaciare anche tenant_id corrente. Platform admin bypassa via
-- claim app_metadata.platform_admin.
-- ============================================================

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subs_self_select on public.push_subscriptions;
drop policy if exists push_subs_self_insert on public.push_subscriptions;
drop policy if exists push_subs_self_update on public.push_subscriptions;
drop policy if exists push_subs_self_delete on public.push_subscriptions;
drop policy if exists push_subs_platform   on public.push_subscriptions;

create policy push_subs_self_select on public.push_subscriptions
  for select using (user_id = auth.uid());

create policy push_subs_self_insert on public.push_subscriptions
  for insert with check (
    user_id = auth.uid()
    and tenant_id = current_tenant_id()
  );

create policy push_subs_self_update on public.push_subscriptions
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy push_subs_self_delete on public.push_subscriptions
  for delete using (user_id = auth.uid());

create policy push_subs_platform on public.push_subscriptions
  for all using (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'platform_admin')::boolean, false)
  );
