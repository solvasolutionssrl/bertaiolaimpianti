-- ============================================================
-- Cio' che si legge, si protegge
-- ============================================================
-- Tre buchi trovati rileggendo due giorni di lavoro. Hanno tutti la stessa
-- forma, ed e' la forma della migration di ieri scritta al contrario:
--
--   ⭐ **un campo diventa un presidio nel momento in cui qualcuno lo legge** —
--   e la lista di cio' che si protegge non lo sa, perche' e' stata scritta
--   prima.
--
-- ## 1. `users.created_at`, e la scadenza che si spegne da sola
--
-- Da stamattina `statoScadenzaPassword` usa `users.created_at` come orologio
-- di riserva: se uno non ha mai scelto la sua password, la scadenza si conta
-- dalla nascita dell'account. ⚠️ Ma `users_proteggi_privilegi` quella colonna
-- non la elencava — e su `public.users` i grant sono di **tabella**, quindi
-- `users_update_self` la lascia scrivibile all'interessato.
--
-- Chiunque, dalla console del browser:
--     supabase.from('users').update({ created_at: '2030-01-01' }).eq('id', mio)
-- e la password non gli scade piu'. Niente riga fissa, niente popup, niente
-- muro il 10 dicembre, per sempre, e nessuna traccia da nessuna parte. Non
-- aggira `must_change_password` (quello era protetto): aggira esattamente la
-- cosa nuova, e proprio su chi serve — i cinquantaquattro che hanno
-- `password_changed_at` a NULL.
--
-- Si aggiungono `created_at` e `updated_at`: nessuno dei due e' roba che
-- l'interessato debba poter riscrivere, con o senza scadenze.
--
-- ## 2. Chi ha spuntato una cosa da fare, e quando
--
-- `commessa_todo_tecnico_guard` elencava tredici colonne e ne lasciava fuori
-- quattro: `completato_da`, `completato_at`, `created_at`, `id`. Il trigger
-- `commessa_todo_touch` scrive `completato_da := coalesce(NEW.completato_da,
-- auth.uid())` — cioe' **il valore che arriva dal client vince** — e gira
-- DOPO la guardia (ordine alfabetico dei nomi).
--
-- Quindi un tecnico che puo' aggiornare una riga poteva spuntarla a nome di un
-- collega, con la data che preferiva:
--     update commessa_todo set stato='completato',
--            completato_at='2026-09-01', completato_da='<uuid di un collega>'
-- e la scheda «Attivita' per persona», che esiste dal 07/10 proprio per dire
-- chi ha fatto cosa, attribuisce il lavoro a un altro.
--
-- ⚠️ Non e' una scalata di privilegi: e' falsificazione dell'attribuzione,
-- cioe' la cosa che la migration di ieri diceva di voler difendere.
--
-- La regola per il tecnico: puo' lasciare quei campi **come stanno**, oppure
-- spuntare a nome **suo** e adesso. Il caso normale non cambia di una riga —
-- il client manda solo `stato`, e `touch` riempie il resto dopo.
--
-- ## 3. La squadra di un'altra azienda
--
-- `commessa_todo_squadra_write` controllava tenant, ruolo e «solo richieste»,
-- ma non che la **persona** mandata fosse dello stesso spazio di lavoro: quel
-- controllo viveva solo nell'azione. Non produce una fuga (chi e' fuori non
-- legge niente), ma lascia una riga che punta a un altro cliente.
--
-- E il `grant` su quella tabella comprendeva `update`, che non serve a
-- nessuno: l'azione fa solo insert e delete.
--
-- Idempotente: create or replace, drop ... if exists prima di ogni create.
-- ============================================================

-- -------------------------------------------------------
-- 1. Lo stato di un account non lo riscrive l'account
-- -------------------------------------------------------
-- Riscritta per intero, come sempre: il testo di un trigger di sicurezza si
-- deve poter leggere tutto in una volta, non ricostruire da quattro file.
create or replace function public.users_proteggi_privilegi()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Service role, migrazioni, cron e Auth: nessun limite.
  if current_user in ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role')
     or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Non consentito: gli utenti si creano dal server'
      using errcode = '42501';
  end if;

  -- Identita', tenant, poteri di piattaforma, stato della password e **le date
  -- di vita della riga**: non li cambia nessuno dall'app, nemmeno un
  -- amministratore. Chi deve reimpostare una password passa dall'azione
  -- server, che usa il service role.
  --
  -- ⚠️ `created_at` e' in questa lista dal 09/10: da quando la scadenza della
  -- password lo usa come orologio di riserva, spostarlo avanti vuol dire
  -- spegnersi la scadenza.
  if new.id is distinct from old.id
     or new.tenant_id is distinct from old.tenant_id
     or new.is_platform_admin is distinct from old.is_platform_admin
     or new.must_change_password is distinct from old.must_change_password
     or new.password_provvisoria is distinct from old.password_provvisoria
     or new.password_changed_at is distinct from old.password_changed_at
     or new.created_at is distinct from old.created_at
     or new.updated_at is distinct from old.updated_at then
    raise exception 'Non consentito: identità, tenant, poteri di piattaforma e stato della password non si cambiano dall''app'
      using errcode = '42501';
  end if;

  if new.id = auth.uid() and (
       new.role is distinct from old.role
       or new.permissions is distinct from old.permissions
       or new.attivo is distinct from old.attivo
       or new.puo_approvare_permessi is distinct from old.puo_approvare_permessi) then
    raise exception 'Non consentito: ruolo e permessi li cambia un amministratore'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_users_proteggi_privilegi on public.users;
create trigger trg_users_proteggi_privilegi
  before insert or update on public.users
  for each row execute function public.users_proteggi_privilegi();

comment on column public.users.created_at is
  'Quando e'' nato l''account. ⚠️ NON e'' solo una curiosita'': e'' l''orologio di riserva della scadenza password (chi non ha mai scelto la sua, la conta da qui). Protetta da users_proteggi_privilegi.';

-- -------------------------------------------------------
-- 2. Chi ha spuntato, e quando
-- -------------------------------------------------------
create or replace function public.commessa_todo_tecnico_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  role public.app_role;
begin
  -- Solo se la sessione corrente e' di un tecnico. Admin, ufficio, service
  -- role e migrazioni passano senza limiti.
  role := public.current_role();
  if role is null or role <> 'tecnico'::public.app_role then
    return new;
  end if;

  -- Cosa descrive il lavoro: lo decide chi lo assegna.
  if new.titolo      is distinct from old.titolo      then raise exception 'Tecnico: titolo non modificabile';       end if;
  if new.descrizione is distinct from old.descrizione then raise exception 'Tecnico: descrizione non modificabile';  end if;
  if new.priorita    is distinct from old.priorita    then raise exception 'Tecnico: priorita non modificabile';     end if;
  if new.assegnato_a is distinct from old.assegnato_a then raise exception 'Tecnico: assegnazione non modificabile'; end if;
  if new.scadenza_at is distinct from old.scadenza_at then raise exception 'Tecnico: scadenza non modificabile';     end if;
  if new.sort_order  is distinct from old.sort_order  then raise exception 'Tecnico: riordino non consentito';       end if;
  if new.commessa_id is distinct from old.commessa_id then raise exception 'Tecnico: commessa non modificabile';     end if;
  if new.metadata    is distinct from old.metadata    then raise exception 'Tecnico: metadata non modificabile';     end if;

  -- L'identita' della riga e la sua storia.
  if new.id         is distinct from old.id         then raise exception 'Tecnico: l''identita'' della riga non si cambia'; end if;
  if new.created_by is distinct from old.created_by then raise exception 'Tecnico: l''autore non si riscrive';             end if;
  if new.created_at is distinct from old.created_at then raise exception 'Tecnico: la data di creazione non si cambia';     end if;

  -- Le colonne delle richieste al telefono: chi ha chiamato, come
  -- richiamarlo, dove andare.
  if new.cliente_id    is distinct from old.cliente_id    then raise exception 'Tecnico: il cliente non si cambia';   end if;
  if new.cliente_testo is distinct from old.cliente_testo then raise exception 'Tecnico: il cliente non si cambia';   end if;
  if new.contatto      is distinct from old.contatto      then raise exception 'Tecnico: il contatto non si cambia';  end if;
  if new.indirizzo     is distinct from old.indirizzo     then raise exception 'Tecnico: l''indirizzo non si cambia'; end if;

  -- ⚠️ Chi ha spuntato, e quando. Si puo' lasciare com'e', oppure spuntare a
  -- nome **proprio** e **adesso**. Il caso normale non passa nemmeno di qui:
  -- il client manda solo `stato`, e `commessa_todo_touch` riempie il resto
  -- subito dopo (questo trigger gira prima, per ordine alfabetico del nome).
  if new.completato_da is distinct from old.completato_da
     and new.completato_da is not null
     and new.completato_da is distinct from auth.uid() then
    raise exception 'Tecnico: si spunta a nome proprio';
  end if;
  if new.completato_at is distinct from old.completato_at
     and new.completato_at is not null
     and (new.completato_at < now() - interval '5 minutes'
          or new.completato_at > now() + interval '5 minutes') then
    raise exception 'Tecnico: si spunta adesso, non a una data scelta';
  end if;

  -- «Annullato» e' una cancellazione travestita: resta di admin/ufficio.
  if new.stato = 'annullato'::public.todo_stato
     and old.stato is distinct from 'annullato'::public.todo_stato then
    raise exception 'Tecnico: stato annullato riservato ad admin/office';
  end if;

  return new;
end
$$;

drop trigger if exists commessa_todo_tecnico_guard_trg on public.commessa_todo;
create trigger commessa_todo_tecnico_guard_trg
  before update on public.commessa_todo
  for each row
  execute function public.commessa_todo_tecnico_guard();

-- -------------------------------------------------------
-- 3. Si manda chi e' di casa
-- -------------------------------------------------------
drop policy if exists commessa_todo_squadra_write on public.commessa_todo_squadra;
create policy commessa_todo_squadra_write on public.commessa_todo_squadra
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('admin'::public.app_role, 'office'::public.app_role)
    -- Solo sulle richieste: dentro una commessa la squadra e' quella del
    -- lavoro, e una seconda verita' su «chi se ne occupa» non si crea.
    and exists (
      select 1 from public.commessa_todo t
       where t.id = commessa_todo_squadra.todo_id
         and t.tenant_id = public.current_tenant_id()
         and t.commessa_id is null
    )
    -- E si manda qualcuno di **questo** spazio di lavoro. Il controllo c'era
    -- solo nell'azione: da PostgREST si poteva scrivere una riga che punta a
    -- una persona di un altro cliente.
    and exists (
      select 1 from public.users u
       where u.id = commessa_todo_squadra.user_id
         and u.tenant_id = public.current_tenant_id()
    )
  );

-- L'`update` non lo usa nessuno: l'azione fa insert e delete. Un permesso che
-- non serve a nessuno e' solo superficie.
revoke update on public.commessa_todo_squadra from authenticated;

-- -------------------------------------------------------
-- 4. Le parole, anche nel database
-- -------------------------------------------------------
-- I commenti delle tabelle insegnano il vocabolario a chi legge lo schema, e
-- il loro diceva ancora «chi ha in mano la richiesta» / «chi ci va». Dal 09/10
-- le parole sono **Responsabile** e **Tecnici assegnati**
-- (`@kommessa/api/assegnazione`): due modi di dire casalunghi che sembravano
-- smentirsi sono il motivo per cui si e' scelto un vocabolario unico.
comment on table public.commessa_todo_squadra is
  'I TECNICI ASSEGNATI a una richiesta al telefono: chi ci va davvero. Il RESPONSABILE (chi ne risponde) resta in commessa_todo.assegnato_a — due domande diverse, non due verita'' sulla stessa. ⚠️ Solo sulle richieste (commessa_id is null): dentro una commessa la squadra e'' quella del lavoro.';

comment on column public.commessa_todo.assegnato_a is
  'Il RESPONSABILE: chi ne risponde. Su una richiesta al telefono puo'' essere un caposquadra che poi manda i suoi, e i tecnici mandati stanno in commessa_todo_squadra. Non e'' per forza un tecnico: una cosa da fare si da'' a chiunque.';
