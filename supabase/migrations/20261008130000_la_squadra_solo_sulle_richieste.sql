-- ============================================================
-- La seconda mano vale solo per le richieste al telefono
-- ============================================================
-- Stamattina `commessa_todo_squadra` e' nata per **tutte** le righe di
-- `commessa_todo`: sia le richieste al telefono (`commessa_id is null`) sia le
-- cose da fare dentro una commessa. Era troppo.
--
-- ## Perche' il confine sta qui
--
-- Una **richiesta** arriva dal telefono e non e' ancora un lavoro: la
-- segretaria la affida a un caposquadra, che poi decide chi ci manda. Sono due
-- decisioni, prese da due persone, in due momenti.
--
-- Una **cosa da fare dentro una commessa** sta gia' dentro un lavoro che ha la
-- sua squadra (`commessa_tecnici`). Chi la deve fare e' uno solo, e la seconda
-- mano non aggiunge niente: aggiunge un campo da compilare, un'altra tendina
-- nella riga, e un secondo posto dove guardare per sapere chi ci pensa.
--
-- ⭐ **Un campo che esiste dove non serve non e' neutro**: e' una domanda in
-- piu' a cui qualcuno prova a rispondere, e una seconda verita' su «chi se ne
-- occupa» proprio dove ce n'era gia' una sola e chiara.
--
-- ## Dove si mette il divieto
--
-- Nel `with check`, non nel `using`: non si puo' **aggiungere** nessuno alla
-- squadra di una cosa da fare che appartiene a una commessa, ma l'ufficio puo'
-- ancora togliere righe gia' esistenti. (In produzione non ce n'e' nessuna —
-- contate: zero — ma una policy che impedisce di ripulire e' una trappola.)
--
-- Il divieto sta **anche** nell'azione `affidaSquadraTodo`, che risponde in
-- italiano invece di far arrivare una violazione di vincolo.
--
-- Idempotente: drop policy if exists prima di create policy.
-- ============================================================

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
    -- Solo sulle richieste al telefono: dentro una commessa la squadra e' gia'
    -- quella della commessa.
    and exists (
      select 1 from public.commessa_todo t
       where t.id = commessa_todo_squadra.todo_id
         and t.commessa_id is null
    )
  );

comment on table public.commessa_todo_squadra is
  'Chi ci va: i tecnici a cui chi ha in mano una RICHIESTA AL TELEFONO l''ha girata. Solo per le righe con commessa_id is null: dentro una commessa la squadra e'' commessa_tecnici. Distinta da commessa_todo.assegnato_a, che dice chi ne RISPONDE.';

-- Niente da ripulire: la tabella e' nata stamattina e non ha mai avuto righe
-- su cose da fare di commessa. La cancellazione resta scritta per chi
-- rieseguisse questa migration su un database dove invece ce ne fossero.
delete from public.commessa_todo_squadra sq
 using public.commessa_todo t
 where t.id = sq.todo_id
   and t.commessa_id is not null;
