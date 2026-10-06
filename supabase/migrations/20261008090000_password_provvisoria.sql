-- ============================================================
-- Due fatti diversi, due colonne: «chi gliel'ha data» e «la blocco»
-- ============================================================
-- Ieri `must_change_password` faceva due lavori in uno: diceva *che* la
-- password in uso l'aveva scelta qualcun altro, e *che* per questo l'app
-- doveva sbarrare la strada. Finche' le due cose coincidono una colonna basta.
-- Non coincidono: domani tredici tecnici di Bertaiola entrano per la prima
-- volta con la password stampata su un foglio, e la scelta e' di farli entrare
-- **senza muro**, con un promemoria che resta finche' non la cambiano.
--
-- Con una colonna sola questo caso non si puo' scrivere: `false` perde
-- l'informazione che la password e' provvisoria, `true` li blocca.
--
--   password_provvisoria   LO STATO: la password in uso l'ha scelta qualcun
--                          altro. Finche' e' true, l'app lo dice.
--   must_change_password   LA POLICY: e per questo non si passa.
--   password_changed_at    QUANDO l'ha scelta lei (resta com'era).
--
-- Invariante: `must_change_password` vero implica `password_provvisoria` vero.
-- Il contrario no, ed e' esattamente il caso nuovo.
--
-- ⚠️ **Gli utenti che c'erano restano a `false`, e non e' una svista.**
-- `password_changed_at` e' NULL su tutti e cinquantaquattro, quindi a rigore
-- nessuno ha mai scelto la propria password (il modulo per farlo e' di ieri).
-- Ma mettere `true` a tutti vorrebbe dire aprire l'app domani mattina con un
-- avviso in faccia a Mauro, a Barbara e a tutto l'ufficio, su una password che
-- usano da maggio e che non e' su nessun foglio. Si dichiara provvisorio solo
-- cio' che nasce provvisorio da adesso: un avviso che compare a tutti e'
-- un avviso che si impara a non leggere.
--
-- ⚠️ IL PUNTO DELICATO, DI NUOVO
-- Su `public.users` i grant sono a livello di TABELLA: la colonna nuova nasce
-- scrivibile dall'utente stesso. Chi non vuole vedere il promemoria se lo
-- spegne da solo dalla console del browser — e un promemoria che il
-- destinatario puo' spegnere senza fare la cosa che chiede e' peggio di
-- niente. La difesa sta nel trigger, come l'altra volta.
--
-- Idempotente: add column if not exists + create or replace.
-- ============================================================

alter table public.users
  add column if not exists password_provvisoria boolean not null default false;

comment on column public.users.password_provvisoria is
  'true = la password in uso l''ha scelta qualcun altro (ufficio, pannello, script). L''app mostra un promemoria finche'' resta true. La scrive solo il service role: vedi users_proteggi_privilegi. Diversa da must_change_password, che e'' il blocco.';

comment on column public.users.must_change_password is
  'true = al prossimo ingresso l''app chiede di scegliere una password nuova, e non lascia passare. Implica password_provvisoria. La scrive solo il service role.';

-- -------------------------------------------------------
-- La difesa: la colonna nuova non si tocca dall'app
-- -------------------------------------------------------
-- Riscritta per intero, come la volta scorsa: il testo di un trigger di
-- sicurezza si deve poter leggere tutto in una volta.
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

  -- Identita', tenant, poteri di piattaforma e tutto cio' che riguarda la
  -- password: non li cambia nessuno dall'app, nemmeno un amministratore. Chi
  -- deve reimpostare una password passa dall'azione server, che usa il
  -- service role.
  if new.id is distinct from old.id
     or new.tenant_id is distinct from old.tenant_id
     or new.is_platform_admin is distinct from old.is_platform_admin
     or new.must_change_password is distinct from old.must_change_password
     or new.password_provvisoria is distinct from old.password_provvisoria
     or new.password_changed_at is distinct from old.password_changed_at then
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

-- -------------------------------------------------------
-- Allineamento di cio' che esiste
-- -------------------------------------------------------
-- Chi era bloccato era per definizione su una password provvisoria: l'unica
-- riga che questa migration corregge e' quella, e oggi in produzione sono
-- zero. Scritto comunque perche' domani non lo sia piu'.
update public.users
   set password_provvisoria = true
 where must_change_password
   and not password_provvisoria;

-- «Chi e' ancora sulla password che gli abbiamo dato noi»: la domanda che fa
-- l'elenco utenti dell'ufficio.
create index if not exists users_password_provvisoria_idx
  on public.users (tenant_id)
  where password_provvisoria;
