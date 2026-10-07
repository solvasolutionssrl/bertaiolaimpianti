-- ============================================================
-- Scrivere una riunione e' di ogni tecnico in squadra
-- ============================================================
-- Una riunione, qui, non e' un verbale: e' il sopralluogo raccontato — quattro
-- righe dettate davanti alla caldaia, la trascrizione, e il riassunto. E' la
-- cosa che si fa **dentro** un lavoro gia' assegnato, come una cosa da fare,
-- non un atto di apertura. Tenerla ai soli capi squadra voleva dire che il
-- racconto di cio' che si e' visto in cantiere doveva passare per qualcun
-- altro, cioe' quasi sempre non veniva scritto.
--
-- ⚠️ **La cosa che non si vedeva**: `commessa_riunione_write` ammette solo
-- `admin` e `office`. Quindi non e' che i tecnici semplici non potessero: non
-- poteva **nessun tecnico**, nemmeno un capo squadra. Il controllo
-- applicativo (`possoAprireLavori`) lasciava passare un capo squadra, e poi il
-- database lo fermava: un tasto che risponde «violazione di policy» a chi ha
-- il permesso di premerlo. Dal 07/10 la funzione esisteva in questa forma e
-- non e' mai stata esercitata da un tecnico.
--
-- Il confine resta dov'era, e si sposta solo quello giusto:
--   `capo_squadra` = **aprire un lavoro nuovo** (commesse). Invariato.
--   la riunione    = lavoro dentro una commessa a cui sei gia' assegnato.
--
-- COSA PUO' FARE UN TECNICO DA ADESSO
--   - scrivere una riunione **solo** sulle commesse su cui e' in squadra,
--     firmata da lui;
--   - correggere le proprie (la trascrizione e il riassunto arrivano dopo la
--     creazione: senza l'update, la riunione resterebbe vuota);
--   - attaccarci le foto che ha gia' il diritto di caricare.
--
-- COSA NON PUO' FARE, ED E' VOLUTO
--   - toccare le riunioni di qualcun altro;
--   - cancellarne una, nemmeno la sua: una riunione e' un pezzo di storia del
--     lavoro, e chi l'ha scritta la puo' correggere ma non far sparire. Per
--     quello c'e' l'ufficio.
--   - assegnare a un collega le cose da fare che nascono dalla riunione:
--     quello lo impedisce gia' `commessa_todo_insert_tecnico`, che accetta
--     solo «a nessuno» o «a me stesso». Niente da aggiungere qui.
--
-- Idempotente: drop policy if exists prima di ogni create.
-- ============================================================

-- ── La riunione ─────────────────────────────────────────────────────────────
drop policy if exists commessa_riunione_insert_tecnico on public.commessa_riunione;
create policy commessa_riunione_insert_tecnico on public.commessa_riunione
  for insert
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() = 'tecnico'::public.app_role
    -- Solo su una commessa su cui e' in squadra. Senza questa riga un tecnico
    -- potrebbe scrivere sul lavoro di chiunque nello spazio di lavoro.
    and exists (
      select 1 from public.commessa_tecnici ct
       where ct.commessa_id = commessa_riunione.commessa_id
         and ct.user_id = auth.uid()
    )
    -- Firmata da lui: e' anche cio' che gli permette di correggerla dopo.
    and created_by = auth.uid()
  );

drop policy if exists commessa_riunione_update_tecnico on public.commessa_riunione;
create policy commessa_riunione_update_tecnico on public.commessa_riunione
  for update
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() = 'tecnico'::public.app_role
    and created_by = auth.uid()
    and exists (
      select 1 from public.commessa_tecnici ct
       where ct.commessa_id = commessa_riunione.commessa_id
         and ct.user_id = auth.uid()
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
    and created_by = auth.uid()
    -- ⚠️ `using` dice quali righe puo' toccare, `with check` com'e' la riga
    -- DOPO. Senza il secondo, un tecnico potrebbe spostare la propria riunione
    -- su un'altra commessa, o intestarla a un collega, con un solo update.
    and exists (
      select 1 from public.commessa_tecnici ct
       where ct.commessa_id = commessa_riunione.commessa_id
         and ct.user_id = auth.uid()
    )
  );

-- ── Le foto e i video attaccati alla riunione ───────────────────────────────
-- Senza questa, scrivere la riunione si puo' ma allegarci lo scatto appena
-- fatto no, e meta' del gesto non funziona.
drop policy if exists commessa_riunione_allegato_insert_tecnico on public.commessa_riunione_allegato;
create policy commessa_riunione_allegato_insert_tecnico on public.commessa_riunione_allegato
  for insert
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() = 'tecnico'::public.app_role
    and exists (
      select 1
        from public.commessa_riunione r
        join public.commessa_tecnici ct on ct.commessa_id = r.commessa_id
       where r.id = commessa_riunione_allegato.riunione_id
         and ct.user_id = auth.uid()
    )
  );

comment on table public.commessa_riunione is
  'Il sopralluogo raccontato: dettatura, trascrizione, riassunto. Scrivibile da admin/office su tutto il tenant, e da un TECNICO solo sulle commesse su cui e'' in squadra e solo le proprie (dall''08/10/2026). Cancellare resta dell''ufficio: una riunione e'' storia del lavoro.';
