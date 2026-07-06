-- ============================================================================
-- Hardening RLS: scrittura presenze vincolata al proprio dipendente (o capo).
--
-- PRIMA: le policy FOR ALL su timbrature / rapportini / rapportino_righe /
-- rapportino_versioni / timbratura_viaggio richiedevano solo
--   tenant_id = current_tenant_id()  AND  current_role() IN (owner,admin,office,tecnico)
-- → un tecnico, con la anon key (pubblica) + il proprio JWT, poteva scrivere
--   direttamente su /rest/v1/timbrature usando il dipendente_id di un COLLEGA e
--   alterarne/cancellarne le presenze (integrità/ripudio su dati payroll).
--
-- DOPO: office/admin/owner restano tenant-wide (correzioni d'ufficio). Il tecnico
-- può scrivere SOLO le proprie righe, con l'eccezione del CAPOSQUADRA — che è un
-- ruolo `tecnico` e timbra legittimamente per i membri della sua squadra (via il
-- client RLS con il proprio JWT). L'eccezione capo è espressa dalla funzione
-- `public.sono_capo_di()`.
--
-- ⚠️ APPLICARE CON CAUTELA (dati payroll in produzione): una policy errata
-- rompe silenziosamente la timbratura del caposquadra. Verificare in staging /
-- con un test di integrazione (login come tecnico e come capo) PRIMA del cloud.
-- Idempotente (drop policy if exists + create; create or replace function).
-- ============================================================================

-- ── Helper: dipendente dell'utente loggato (nel tenant corrente) ───────────
create or replace function public.dipendente_del_utente()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.dipendenti
  where user_id = auth.uid()
    and tenant_id = public.current_tenant_id()
  limit 1
$$;

-- ── Helper: l'utente loggato è CAPO di una squadra che contiene `p_dip`? ────
--     Vale sia per i cantieri (mondo Kantiere) sia per le commesse (mondo
--     kommessa): il target è nella stessa squadra dove io sono capo.
create or replace function public.sono_capo_di(p_dip uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.cantiere_squadra cs_me
      join public.cantiere_squadra cs_t on cs_t.cantiere_id = cs_me.cantiere_id
      where cs_me.dipendente_id = public.dipendente_del_utente()
        and cs_me.ruolo = 'capo'
        and cs_t.dipendente_id = p_dip
    )
    or exists (
      select 1
      from public.commessa_squadra cs_me
      join public.commessa_squadra cs_t on cs_t.commessa_id = cs_me.commessa_id
      where cs_me.dipendente_id = public.dipendente_del_utente()
        and cs_me.ruolo_commessa = 'capo'
        and cs_t.dipendente_id = p_dip
    )
$$;

revoke all on function public.dipendente_del_utente() from public, anon;
revoke all on function public.sono_capo_di(uuid) from public, anon;
grant execute on function public.dipendente_del_utente() to authenticated;
grant execute on function public.sono_capo_di(uuid) to authenticated;

-- Predicato riusato: office tenant-wide, oppure tecnico self/capo.
-- (Inlined nelle policy sotto perché ogni tabella referenzia il proprio dipendente_id.)

-- ── timbrature ─────────────────────────────────────────────────────────────
drop policy if exists timbrature_tenant_write on public.timbrature;
drop policy if exists timbrature_office_write on public.timbrature;
drop policy if exists timbrature_self_write on public.timbrature;

create policy timbrature_office_write on public.timbrature
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

create policy timbrature_self_write on public.timbrature
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() = 'tecnico'::public.app_role
    and (dipendente_id = public.dipendente_del_utente() or public.sono_capo_di(dipendente_id))
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() = 'tecnico'::public.app_role
    and (dipendente_id = public.dipendente_del_utente() or public.sono_capo_di(dipendente_id))
  );

-- ── timbratura_viaggio ─────────────────────────────────────────────────────
drop policy if exists timbratura_viaggio_tenant_write on public.timbratura_viaggio;
drop policy if exists timbratura_viaggio_office_write on public.timbratura_viaggio;
drop policy if exists timbratura_viaggio_self_write on public.timbratura_viaggio;

create policy timbratura_viaggio_office_write on public.timbratura_viaggio
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

create policy timbratura_viaggio_self_write on public.timbratura_viaggio
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() = 'tecnico'::public.app_role
    and (dipendente_id = public.dipendente_del_utente() or public.sono_capo_di(dipendente_id))
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() = 'tecnico'::public.app_role
    and (dipendente_id = public.dipendente_del_utente() or public.sono_capo_di(dipendente_id))
  );

-- ── rapportini ─────────────────────────────────────────────────────────────
drop policy if exists rapportini_tenant_write on public.rapportini;
drop policy if exists rapportini_office_write on public.rapportini;
drop policy if exists rapportini_self_write on public.rapportini;

create policy rapportini_office_write on public.rapportini
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

create policy rapportini_self_write on public.rapportini
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() = 'tecnico'::public.app_role
    and (dipendente_id = public.dipendente_del_utente() or public.sono_capo_di(dipendente_id))
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() = 'tecnico'::public.app_role
    and (dipendente_id = public.dipendente_del_utente() or public.sono_capo_di(dipendente_id))
  );

-- ── rapportino_righe (scoping via il rapportino padre) ─────────────────────
drop policy if exists rapportino_righe_tenant_write on public.rapportino_righe;
drop policy if exists rapportino_righe_office_write on public.rapportino_righe;
drop policy if exists rapportino_righe_self_write on public.rapportino_righe;

create policy rapportino_righe_office_write on public.rapportino_righe
  for all
  using (
    exists (
      select 1 from public.rapportini r
      where r.id = rapportino_righe.rapportino_id
        and r.tenant_id = public.current_tenant_id()
    )
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    exists (
      select 1 from public.rapportini r
      where r.id = rapportino_righe.rapportino_id
        and r.tenant_id = public.current_tenant_id()
    )
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

create policy rapportino_righe_self_write on public.rapportino_righe
  for all
  using (
    public.current_role() = 'tecnico'::public.app_role
    and exists (
      select 1 from public.rapportini r
      where r.id = rapportino_righe.rapportino_id
        and r.tenant_id = public.current_tenant_id()
        and (r.dipendente_id = public.dipendente_del_utente() or public.sono_capo_di(r.dipendente_id))
    )
  )
  with check (
    public.current_role() = 'tecnico'::public.app_role
    and exists (
      select 1 from public.rapportini r
      where r.id = rapportino_righe.rapportino_id
        and r.tenant_id = public.current_tenant_id()
        and (r.dipendente_id = public.dipendente_del_utente() or public.sono_capo_di(r.dipendente_id))
    )
  );

-- ── rapportino_versioni (scoping via il rapportino padre) ──────────────────
drop policy if exists rapportino_versioni_tenant_write on public.rapportino_versioni;
drop policy if exists rapportino_versioni_office_write on public.rapportino_versioni;
drop policy if exists rapportino_versioni_self_write on public.rapportino_versioni;

create policy rapportino_versioni_office_write on public.rapportino_versioni
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

create policy rapportino_versioni_self_write on public.rapportino_versioni
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() = 'tecnico'::public.app_role
    and exists (
      select 1 from public.rapportini r
      where r.id = rapportino_versioni.rapportino_id
        and (r.dipendente_id = public.dipendente_del_utente() or public.sono_capo_di(r.dipendente_id))
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() = 'tecnico'::public.app_role
    and exists (
      select 1 from public.rapportini r
      where r.id = rapportino_versioni.rapportino_id
        and (r.dipendente_id = public.dipendente_del_utente() or public.sono_capo_di(r.dipendente_id))
    )
  );
