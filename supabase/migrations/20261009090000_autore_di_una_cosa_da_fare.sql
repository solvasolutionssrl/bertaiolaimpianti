-- ============================================================
-- Chi l'ha scritta: la colonna c'era, nessuno la guardava
-- ============================================================
-- `commessa_todo.created_by` esiste dal primo giorno, e **tutte** le righe
-- create dall'applicazione la hanno popolata (le due sole strade di inserimento
-- scrivono `ctx.userId`). Non la leggeva nessuno: fuori dalla scheda di una
-- commessa d'ufficio, l'autore non compariva da nessuna parte. Da oggi si
-- vede sulla board «Task e Richieste», sulla scheda del telefono e sulla
-- scheda di una richiesta.
--
-- ⭐ **E qui sta il punto di questa migration: un campo diventa un presidio
-- nel momento in cui qualcuno lo legge.** Finche' nessuno lo guardava, che un
-- tecnico potesse riscriverselo era un dettaglio senza conseguenze. Adesso
-- l'ufficio leggera' quel nome per sapere a chi chiedere spiegazioni di una
-- riga che non si capisce: se chiunque lo puo' cambiare, quel nome non e'
-- un'informazione, e' un'opinione.
--
-- Il trigger `commessa_todo_tecnico_guard` elencava i campi che un tecnico non
-- puo' toccare: titolo, descrizione, priorita, assegnato_a, scadenza_at,
-- sort_order, commessa_id, metadata. ⚠️ Mancavano:
--
--   created_by      chi l'ha scritta (adesso si legge)
--   cliente_id      chi ha chiamato, se e' in anagrafica
--   cliente_testo   chi ha chiamato, come e' stato detto
--   contatto        come richiamarlo
--   indirizzo       dove bisogna andare
--
-- Le ultime quattro sono le colonne delle **richieste al telefono**, aggiunte
-- il 05/10 e il 07/10 — dopo che questo trigger era stato scritto, ed e'
-- esattamente il modo in cui un elenco scritto a mano resta indietro: nessuno
-- ha dimenticato niente, semplicemente la lista non sapeva delle colonne nuove.
-- Un tecnico mandato su una richiesta ha diritto di aggiornarla (la policy
-- `commessa_todo_update_tecnico` glielo concede, e deve: e' lui che la chiude)
-- ma non di cambiare chi ha chiamato o dove si va.
--
-- Cio' che il tecnico puo' ancora cambiare resta quello di prima: `stato`
-- (tranne «annullato»), `completato_at`, `completato_da`, `updated_at`. Le note
-- stanno in una tabella loro e non c'entrano.
--
-- ⚠️ Riscritta **per intero**, come le altre volte: il testo di un trigger di
-- sicurezza si deve poter leggere tutto in una volta, non ricostruire da tre
-- migration in fila.
--
-- Idempotente: create or replace + drop trigger if exists.
-- ============================================================

create or replace function public.commessa_todo_tecnico_guard()
returns trigger
language plpgsql
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

  -- Chi l'ha scritta. Nuovo: da oggi questo nome si legge a schermo.
  if new.created_by is distinct from old.created_by then
    raise exception 'Tecnico: l''autore non si riscrive';
  end if;

  -- Le colonne delle richieste al telefono: chi ha chiamato, come
  -- richiamarlo, dove andare. Nuove rispetto a questo trigger.
  if new.cliente_id    is distinct from old.cliente_id    then raise exception 'Tecnico: il cliente non si cambia';   end if;
  if new.cliente_testo is distinct from old.cliente_testo then raise exception 'Tecnico: il cliente non si cambia';   end if;
  if new.contatto      is distinct from old.contatto      then raise exception 'Tecnico: il contatto non si cambia';  end if;
  if new.indirizzo     is distinct from old.indirizzo     then raise exception 'Tecnico: l''indirizzo non si cambia'; end if;

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

comment on column public.commessa_todo.created_by is
  'Chi ha scritto questa riga: su una richiesta al telefono, chi ha risposto. Popolata da `creaTodo` e da `materializzaTodoDaRiunione`. Si legge a schermo (board «Task e Richieste», scheda commessa, scheda richiesta): per questo un tecnico non la puo'' riscrivere — vedi commessa_todo_tecnico_guard.';

-- «Chi ha scritto cosa», la domanda della scheda di una persona. Nessun indice
-- c'era, e l'elenco dell'attivita' per persona dovra' farla.
create index if not exists commessa_todo_created_by_idx
  on public.commessa_todo (created_by)
  where created_by is not null;
