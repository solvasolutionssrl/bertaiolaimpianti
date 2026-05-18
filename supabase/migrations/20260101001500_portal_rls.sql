-- =====================================================================
-- 20260101001500_portal_rls.sql
-- Estensioni post-MVP richieste da portale cliente, edge functions e
-- migrazione Freshdesk.
--   1. helper SQL current_cliente_id()
--   2. policy aggiuntive scope-cliente su commesse/voci/tickets/messages
--   3. INSERT tickets stretto per ruolo cliente
--   4. ALTER file_refs ADD pubblico + view portal_files_view
--   5. genera_codice_ticket(slug, anno) atomica
--   6. estensione enum notifiche.tipo (idempotente)
--   7. ALTER file_refs.commessa_id DROP NOT NULL (allegati ticket-only)
--   8. ALTER tenants ADD inbound_email citext UNIQUE
-- =====================================================================

-- --- (1) helper -------------------------------------------------------
create or replace function public.current_cliente_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.cliente_id', true), '')::uuid,
    nullif((auth.jwt() ->> 'cliente_id'), '')::uuid,
    nullif((auth.jwt() -> 'app_metadata' ->> 'cliente_id'), '')::uuid
  );
$$;

comment on function public.current_cliente_id() is
  'Ritorna il cliente_id dell''utente external (portale) corrente, NULL per gli utenti staff.';

-- --- (2) policy aggiuntive per ruolo cliente --------------------------
-- Aggiungiamo policy "*_cliente_scope" che VINCOLANO ulteriormente l'accesso
-- quando current_role() = 'cliente'. Le policy esistenti *_tenant_scope
-- continuano a essere valide per gli utenti staff.

-- commesse: cliente vede solo le proprie
drop policy if exists commesse_cliente_scope on public.commesse;
create policy commesse_cliente_scope on public.commesse
  for select
  using (
    public.current_role() = 'cliente'
    and tenant_id = public.current_tenant_id()
    and cliente_id = public.current_cliente_id()
  );

-- commessa_voci: cliente vede solo le voci delle proprie commesse
drop policy if exists commessa_voci_cliente_scope on public.commessa_voci;
create policy commessa_voci_cliente_scope on public.commessa_voci
  for select
  using (
    public.current_role() = 'cliente'
    and tenant_id = public.current_tenant_id()
    and commessa_id in (
      select id from public.commesse
      where cliente_id = public.current_cliente_id()
    )
  );

-- tickets: cliente vede solo i propri ticket (qualsiasi source) — SELECT
drop policy if exists tickets_cliente_scope on public.tickets;
create policy tickets_cliente_scope on public.tickets
  for select
  using (
    public.current_role() = 'cliente'
    and tenant_id = public.current_tenant_id()
    and cliente_id = public.current_cliente_id()
  );

-- tickets: il cliente può creare solo ticket con source='portal_cliente'
-- e cliente_id coerente. Stringe l'INSERT esistente.
drop policy if exists tickets_cliente_insert on public.tickets;
create policy tickets_cliente_insert on public.tickets
  for insert
  with check (
    public.current_role() = 'cliente'
    and tenant_id = public.current_tenant_id()
    and source = 'portal_cliente'
    and cliente_id = public.current_cliente_id()
  );

-- ticket_messages: cliente vede solo messaggi dei propri ticket E non interni
drop policy if exists ticket_messages_cliente_scope on public.ticket_messages;
create policy ticket_messages_cliente_scope on public.ticket_messages
  for select
  using (
    public.current_role() = 'cliente'
    and tenant_id = public.current_tenant_id()
    and ticket_id in (
      select id from public.tickets
      where cliente_id = public.current_cliente_id()
    )
    and coalesce(is_internal_note, false) = false
  );

-- ticket_messages: il cliente può inserire messaggi solo sui propri ticket
drop policy if exists ticket_messages_cliente_insert on public.ticket_messages;
create policy ticket_messages_cliente_insert on public.ticket_messages
  for insert
  with check (
    public.current_role() = 'cliente'
    and tenant_id = public.current_tenant_id()
    and coalesce(is_internal_note, false) = false
    and ticket_id in (
      select id from public.tickets
      where cliente_id = public.current_cliente_id()
    )
  );

-- --- (4) file_refs.pubblico + portal_files_view -----------------------
alter table public.file_refs
  add column if not exists pubblico boolean not null default false;

comment on column public.file_refs.pubblico is
  'Override esplicito staff: se true, il file è visibile sul portale anche fuori dalle cartelle whitelist.';

create index if not exists file_refs_commessa_pubblico_idx
  on public.file_refs (commessa_id, pubblico);

-- Whitelist cartelle "naturalmente pubblicabili": le cartelle che, per design
-- del template scaffold (Tassonomia_Lavori §2.2), contengono materiale che
-- l'azienda è disposta a esporre al cliente finale.
create or replace view public.portal_files_view as
select
  f.id,
  f.tenant_id,
  f.commessa_id,
  f.voce_id,
  f.path,
  f.filename,
  f.mime as mime_type,
  f.size_bytes,
  f.uploaded_at,
  f.taken_at,
  f.pubblico
from public.file_refs f
join public.commesse c on c.id = f.commessa_id
where f.commessa_id is not null
  and (
    f.pubblico
    or f.path like c.cloud_folder_path || '/Preventivi/%'
    or f.path like c.cloud_folder_path || '/Documenti/POS/%'
    or f.path like c.cloud_folder_path || '/Documenti/DICO/%'
    or f.path like c.cloud_folder_path || '/Documenti/Certificazioni/%'
    or f.path like c.cloud_folder_path || '/Chiusura/%'
  );

comment on view public.portal_files_view is
  'Vista pubblica del catalogo file per il portale cliente: applica la whitelist cartelle + override pubblico.';

-- La view eredita RLS dalle tabelle sottostanti se invocata con security_invoker.
alter view public.portal_files_view set (security_invoker = true);

-- --- (5) genera_codice_ticket(slug, anno) -----------------------------
create table if not exists public.ticket_counter (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  anno smallint not null,
  ultimo_num integer not null default 0,
  primary key (tenant_id, anno)
);

create or replace function public.genera_codice_ticket(p_slug text, p_anno integer)
returns text
language plpgsql
as $$
declare
  v_tenant_id uuid;
  v_num integer;
begin
  select id into v_tenant_id from public.tenants where slug = p_slug;
  if v_tenant_id is null then
    raise exception 'Tenant % not found', p_slug;
  end if;

  insert into public.ticket_counter (tenant_id, anno, ultimo_num)
  values (v_tenant_id, p_anno, 1)
  on conflict (tenant_id, anno)
    do update set ultimo_num = public.ticket_counter.ultimo_num + 1
  returning ultimo_num into v_num;

  return upper(p_slug) || '-TKT-' || lpad(p_anno::text, 4, '0') || '-' || lpad(v_num::text, 4, '0');
end
$$;

comment on function public.genera_codice_ticket(text, integer) is
  'Genera codice ticket atomico tenant-scoped: <SLUG>-TKT-<AAAA>-<NNNN>.';

-- --- (6) notifiche.type → niente da fare ------------------------------
-- `notifiche.type` è dichiarata `text` (non enum) nella migration base,
-- quindi accetta nativamente qualsiasi nuovo tipo (incluso 'ticket_nuovo_portale').
-- Nessuna ALTER necessaria.
-- NB: il portale cliente referenzia `notifiche.tipo` ma la colonna canonica è
-- `notifiche.type`. Allineare il codice applicativo quando passi sul portale.

-- --- (7) file_refs.commessa_id nullable -------------------------------
-- Necessario per allegati ticket-only (es. inbound email da Freshdesk
-- migration) che non sono ancora associati a una commessa.
alter table public.file_refs
  alter column commessa_id drop not null;

comment on column public.file_refs.commessa_id is
  'NULL = allegato ticket-only (non ancora linkato a una commessa).';

-- --- (8) tenants.inbound_email ---------------------------------------
alter table public.tenants
  add column if not exists inbound_email citext;

create unique index if not exists tenants_inbound_email_uniq
  on public.tenants (inbound_email)
  where inbound_email is not null;

comment on column public.tenants.inbound_email is
  'Indirizzo email inbound (es. ticket@bertaiolaimpianti.it) per webhook Resend → ticket nativo.';
