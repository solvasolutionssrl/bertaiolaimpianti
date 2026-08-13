-- =====================================================================
-- 20260813140000_integrazione_ignorati.sql
-- «Questo record del gestionale non ci riguarda.»
--
-- PERCHE'. Quando il gestionale ha qualcuno (o qualcosa) che noi non abbiamo,
-- l'ufficio deve poter scegliere fra tre strade: collegarlo a un record
-- esistente, crearlo, oppure **dire che non e' un nostro dato**. Senza la
-- terza, l'avviso resta acceso per sempre e in due settimane nessuno lo
-- guarda piu' — che e' il modo tipico in cui un avviso smette di funzionare.
--
-- Non e' un caso di scuola. Nell'anagrafica dipendenti di ERGO, accanto alle
-- persone, ci sono `User Ergo SW`, `Master Mobile`, `Officina Mobile`,
-- `Staggista FPM`: account di servizio e postazioni. **Ogni ERP ne ha.**
--
-- Volutamente generica su `entita`: vale per i dipendenti oggi, per i
-- cantieri o qualunque altra anagrafica domani, senza una seconda tabella.
-- =====================================================================

create table if not exists public.integrazione_ignorati (
  id             uuid primary key default extensions.gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  sistema        text not null,
  entita         text not null,
  external_id    text not null,
  /** Come si chiamava quando lo si e' ignorato: serve a ricordarsi perche'. */
  etichetta      text,
  motivo         text,
  ignorato_da    uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (tenant_id, sistema, entita, external_id)
);

create index if not exists integrazione_ignorati_lookup_idx
  on public.integrazione_ignorati (tenant_id, sistema, entita);

alter table public.integrazione_ignorati enable row level security;

drop policy if exists integrazione_ignorati_tenant_read on public.integrazione_ignorati;
create policy integrazione_ignorati_tenant_read on public.integrazione_ignorati
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists integrazione_ignorati_office_write on public.integrazione_ignorati;
create policy integrazione_ignorati_office_write on public.integrazione_ignorati
  for all using (
    tenant_id = public.current_tenant_id()
    and public.current_role()::text = any (array['owner', 'admin', 'office'])
  ) with check (
    tenant_id = public.current_tenant_id()
    and public.current_role()::text = any (array['owner', 'admin', 'office'])
  );

drop policy if exists integrazione_ignorati_platform_admin_read on public.integrazione_ignorati;
create policy integrazione_ignorati_platform_admin_read on public.integrazione_ignorati
  for select using (public.is_platform_admin());

comment on table public.integrazione_ignorati is
  'Record del gestionale che l''ufficio ha dichiarato non essere dati nostri (account di servizio, postazioni, doppioni). Si tolgono dagli avvisi senza cancellare niente.';
