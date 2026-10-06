-- ============================================================
-- Il tecnico scrive le cose da fare, e le spunta solo dove lavora
-- ============================================================
-- Due cambi di regola, opposti fra loro, e per questo stanno insieme:
--
--   SI APRE  un tecnico puo' CREARE una cosa da fare dentro una commessa su
--            cui lavora. E' il gesto che manca a chi sta sul posto: «qui ci
--            vuole una guarnizione nuova» oggi se lo deve ricordare a voce
--            fino all'ufficio.
--
--   SI CHIUDE a livello di database un tecnico poteva SPUNTARE qualunque cosa
--            da fare di tutto lo spazio di lavoro, anche di una commessa che
--            non ha mai visto. Il filtro «solo le mie» stava nella pagina, e
--            una pagina non e' un presidio: basta una chiamata diretta.
--
-- Cosa un tecnico NON puo' fare, e resta cosi':
--   - assegnare a qualcun altro (il trigger `commessa_todo_tecnico_guard` lo
--     blocca in modifica; qui lo blocchiamo anche in creazione)
--   - creare una richiesta al telefono (quella nasce senza commessa, ed e' un
--     gesto d'ufficio: chi risponde al telefono e' in ufficio)
--   - annullare, eliminare, riordinare, cambiare titolo o priorita'
--
-- ⚠️ VERIFICATO SUI DATI PRIMA DI APPLICARE: `commessa_todo` ha 78 righe in
-- tutto, tutte di tenant del mondo commesse (BER 15, DEMOK 63). FPM ne ha
-- ZERO, quindi questa stretta non puo' toccare il mondo presenze.
--
-- Idempotente: drop policy if exists prima di ogni create.
-- ============================================================

-- -------------------------------------------------------
-- Creazione: l'ufficio come prima, il tecnico con tre vincoli
-- -------------------------------------------------------
drop policy if exists commessa_todo_insert_tecnico on public.commessa_todo;
create policy commessa_todo_insert_tecnico on public.commessa_todo
  for insert
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() = 'tecnico'::public.app_role
    -- Dentro una commessa, non una richiesta al telefono.
    and commessa_id is not null
    -- Solo su una commessa su cui e' in squadra.
    and exists (
      select 1 from public.commessa_tecnici ct
       where ct.commessa_id = commessa_todo.commessa_id
         and ct.user_id = auth.uid()
    )
    -- Firmata da lui, e non assegnata a nessun altro: senza assegnatario
    -- resta una cosa da fare «per chiunque passi», che e' esattamente cio'
    -- che serve a chi la scrive dal cantiere.
    and created_by = auth.uid()
    and (assegnato_a is null or assegnato_a = auth.uid())
  );

-- -------------------------------------------------------
-- Modifica: il tecnico tocca solo cio' che lo riguarda
-- -------------------------------------------------------
-- Prima: `current_role() = 'tecnico'` e basta — qualunque riga del tenant.
-- Adesso due strade, e bastano una delle due:
--   1. la cosa da fare sta su una commessa su cui e' in squadra;
--   2. la cosa da fare e' assegnata a lui (anche una richiesta senza
--      commessa: e' il caso della home dell'app, dove l'ufficio gli passa
--      una telefonata da gestire).
-- Quali CAMPI puo' cambiare resta deciso dal trigger
-- `commessa_todo_tecnico_guard`: di fatto solo lo stato.
drop policy if exists commessa_todo_update_tecnico on public.commessa_todo;
create policy commessa_todo_update_tecnico on public.commessa_todo
  for update
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() = 'tecnico'::public.app_role
    and (
      assegnato_a = auth.uid()
      or (
        commessa_id is not null
        and exists (
          select 1 from public.commessa_tecnici ct
           where ct.commessa_id = commessa_todo.commessa_id
             and ct.user_id = auth.uid()
        )
      )
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() = 'tecnico'::public.app_role
    and (
      assegnato_a = auth.uid()
      or (
        commessa_id is not null
        and exists (
          select 1 from public.commessa_tecnici ct
           where ct.commessa_id = commessa_todo.commessa_id
             and ct.user_id = auth.uid()
        )
      )
    )
  );

-- -------------------------------------------------------
-- Le note: chi puo' scrivere una nota, puo' vedere quella cosa da fare
-- -------------------------------------------------------
-- La policy di inserimento delle note accettava qualunque tecnico del tenant.
-- Stessa logica di sopra, per non lasciare aperta la porta di servizio.
drop policy if exists commessa_todo_nota_insert_tecnico on public.commessa_todo_nota;
create policy commessa_todo_nota_insert_tecnico on public.commessa_todo_nota
  for insert
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() = 'tecnico'::public.app_role
    and author_id = auth.uid()
    and exists (
      select 1 from public.commessa_todo td
       where td.id = commessa_todo_nota.todo_id
         and td.tenant_id = public.current_tenant_id()
         and (
           td.assegnato_a = auth.uid()
           or (
             td.commessa_id is not null
             and exists (
               select 1 from public.commessa_tecnici ct
                where ct.commessa_id = td.commessa_id
                  and ct.user_id = auth.uid()
             )
           )
         )
    )
  );

-- La vecchia policy, che accettava admin/office/tecnico senza distinzioni,
-- resta per admin e office: la si riscrive senza il tecnico.
drop policy if exists commessa_todo_nota_insert on public.commessa_todo_nota;
create policy commessa_todo_nota_insert on public.commessa_todo_nota
  for insert
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('admin'::public.app_role, 'office'::public.app_role)
  );

-- -------------------------------------------------------
-- Chi ha spuntato cosa: l'indice che serve alla scheda della persona
-- -------------------------------------------------------
create index if not exists commessa_todo_completato_da_idx
  on public.commessa_todo (completato_da, completato_at desc)
  where completato_da is not null;
