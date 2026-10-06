-- ============================================================
-- Primo accesso: la password temporanea si cambia, e non si aggira
-- ============================================================
-- Da domani gli account dei tecnici nascono con una password generata
-- dall'ufficio e detta a voce. Una password detta a voce e' una password che
-- sanno in due, quindi non puo' restare quella: al primo ingresso l'app chiede
-- di sceglierne una, e fino a quel momento non si va da nessuna parte.
--
-- Due colonne, nessuna tabella nuova:
--   must_change_password  il cancello
--   password_changed_at   quando e' stata cambiata l'ultima volta (per sapere
--                         se una persona e' ancora sulla password dell'ufficio)
--
-- ⚠️ IL PUNTO DELICATO DI QUESTA MIGRATION
-- Su `public.users` i grant sono a livello di TABELLA (`grant update on
-- public.users to authenticated`), non per colonna come su `tenants`. Quindi
-- una colonna nuova nasce **immediatamente scrivibile dall'utente stesso**:
-- senza il pezzo qui sotto, chi non vuole cambiare la password si spegne il
-- cancello da solo con una riga dalla console del browser. La difesa sta nel
-- trigger `users_proteggi_privilegi`, che va riscritto — non nel grant.
--
-- Idempotente: add column if not exists + create or replace.
-- ============================================================

alter table public.users
  add column if not exists must_change_password boolean not null default false;

alter table public.users
  add column if not exists password_changed_at timestamptz;

comment on column public.users.must_change_password is
  'true = al prossimo ingresso l''app chiede di scegliere una password nuova, e non lascia passare. La scrive solo il service role: vedi users_proteggi_privilegi.';

comment on column public.users.password_changed_at is
  'Ultima volta che la persona ha scelto la propria password. NULL = e'' ancora quella consegnata dall''ufficio.';

-- -------------------------------------------------------
-- La difesa: le due colonne nuove non si toccano dall'app
-- -------------------------------------------------------
-- Stessa funzione della migration 20260915180000, allungata di due nomi.
-- Riscritta per intero (non toccata a pezzi) perche' il testo di un trigger di
-- sicurezza si deve poter leggere tutto in una volta: una `create or replace`
-- parziale lascerebbe il dubbio su cosa ci sia davvero dentro.
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

  -- Identita', tenant, poteri di piattaforma e il cancello del primo accesso:
  -- non li cambia nessuno dall'app, nemmeno un amministratore. Chi deve
  -- reimpostare una password passa dall'azione server, che usa il service role.
  if new.id is distinct from old.id
     or new.tenant_id is distinct from old.tenant_id
     or new.is_platform_admin is distinct from old.is_platform_admin
     or new.must_change_password is distinct from old.must_change_password
     or new.password_changed_at is distinct from old.password_changed_at then
    raise exception 'Non consentito: identità, tenant, poteri di piattaforma e cambio password non si cambiano dall''app'
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

-- -------------------------------------------------------
-- Chi sta ancora sulla password dell'ufficio
-- -------------------------------------------------------
-- Indice parziale: la domanda interessante e' sempre «chi deve ancora
-- cambiarla», mai «chi l'ha gia' cambiata». Su una tabella di 54 righe non
-- serve a niente oggi; serve quando i tecnici saranno trecento.
create index if not exists users_must_change_password_idx
  on public.users (tenant_id)
  where must_change_password;

-- -------------------------------------------------------
-- Lo storico per persona: «cosa ha fatto Mario»
-- -------------------------------------------------------
-- `audit_events` ha indici su (tenant_id, created_at) e su (tenant_id,
-- entity_type, entity_id), cioe' risponde bene a «cosa e' successo» e «cosa e'
-- successo a questa commessa». Non ha nessun indice sull'autore: «cosa ha fatto
-- questa persona» oggi e' una scansione. Serve per la scheda del dipendente e
-- per il registro degli accessi dei tecnici.
create index if not exists audit_events_actor_idx
  on public.audit_events (actor_user_id, created_at desc)
  where actor_user_id is not null;
