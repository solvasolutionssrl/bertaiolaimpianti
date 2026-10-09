-- ============================================================
-- Una commessa non si cancella, e non la riscrive chi passa
-- ============================================================
-- `commesse_tenant_scope` era una policy permissiva `FOR ALL` col solo filtro
-- dello spazio di lavoro: nessun controllo di ruolo, nessuna distinzione fra
-- leggere, scrivere e cancellare. Identica, nella forma, a
-- `clienti_tenant_scope` chiusa il 08/10 — e identica nella conseguenza.
--
-- ## Provato, non dedotto
--
-- Collegandosi come un **tecnico** vero (claim `app_metadata.role = tecnico`),
-- in transazione annullata sul tenant dimostrativo:
--
--   modifica una commessa qualsiasi  →   1 riga     (riuscito)
--   archivia TUTTE le commesse       →  19 righe    (riuscito)
--   cancella le voci di tutte        → 220 righe    (riuscito)
--   cancella TUTTE le commesse       →  20 righe    (riuscito)
--
-- Su Bertaiola «tutte» vuol dire oltre duecento commesse, con dentro la storia
-- del lavoro, le cose da fare, i riferimenti ai file su Nextcloud e i codici
-- progressivi che non si possono riusare. Una chiamata diretta, nessuna
-- conferma, nessun cestino.
--
-- ## Cosa cambia, e perche' non rompe niente
--
-- Si scrive nel database **la stessa regola che le azioni applicano gia'**:
--
--   leggere    tutti (il cliente resta fuori dalla policy RESTRITTIVA)
--   creare     tutti  ⚠️ serve: un tecnico con la capacita' `capo_squadra`
--                     apre commesse nuove (`creaCommessa` → `possoAprireLavori`)
--   modificare ufficio e amministratori  (bulk.ts, aggiornaCommessaCompleta,
--                     aggiornaDettagliCommessa, ripristinaVersione: tutte
--                     gia' chiuse a questi due ruoli nel codice)
--   cancellare NESSUNO
--
-- ⚠️ Il nome della funzione va fra virgolette: `current_role` senza parentesi
-- e' una parola chiave SQL, e `current_role()` nudo e' un errore di sintassi.
--
-- ⚠️ **Cancellare non e' «solo per gli amministratori»: e' per nessuno.** Non
-- esiste nessuna azione nell'applicazione che cancelli una commessa — e' una
-- scelta di prodotto scritta in CLAUDE.md («non esiste nessuna azione per
-- eliminarla»), perche' il codice progressivo non deve avere buchi e le
-- cartelle su Nextcloud restano comunque. Senza policy, la `delete` e'
-- negata a tutti; lo script dimostrativo `togli-commessa-demo.ts` continua a
-- funzionare perche' usa la **service role**, che scavalca la RLS.
--
-- Stesso trattamento per `commessa_voci`, che e' **append-only** per regola di
-- prodotto («le voci si aggiungono soltanto, mai si rimuovono: le cartelle
-- sono fisiche»): nel codice non esiste nessun `update` ne' `delete` su quella
-- tabella, quindi scriverlo nella policy non toglie niente a nessuno.
--
-- ⚠️ **Le altre sette tabelle con la stessa forma restano aperte**, di
-- proposito e non per dimenticanza: `file_refs`, `file_annotations`,
-- `commessa_tags`, `preset`, `interventi`, `tickets`, `ticket_messages`. Li' un
-- tecnico **scrive davvero** (carica le foto, le annota, apre interventi) e
-- separare «le proprie» da «quelle di tutti» vuole una lettura riga per riga
-- dei percorsi di caricamento, non una policy scritta di fretta. Censimento
-- ripetibile in coda a questo file.
--
-- Idempotente: drop policy if exists prima di ogni create.
-- ============================================================

-- ─── commesse ───────────────────────────────────────────────

drop policy if exists commesse_tenant_scope on public.commesse;
drop policy if exists commesse_read on public.commesse;
drop policy if exists commesse_insert on public.commesse;
drop policy if exists commesse_write on public.commesse;

create policy commesse_read on public.commesse
  for select
  using (tenant_id = current_tenant_id());

-- ⚠️ Aperta a tutto lo spazio di lavoro: un tecnico con `capo_squadra` apre
-- lavori nuovi. Chi puo' farlo lo decide l'azione, che legge la capacita'.
create policy commesse_insert on public.commesse
  for insert
  with check (tenant_id = current_tenant_id());

create policy commesse_write on public.commesse
  for update
  using (
    tenant_id = current_tenant_id()
    and public."current_role"() in ('admin'::app_role, 'office'::app_role)
  )
  with check (
    tenant_id = current_tenant_id()
    and public."current_role"() in ('admin'::app_role, 'office'::app_role)
  );

-- Nessuna policy di DELETE: la cancellazione e' negata a chiunque passi dalla
-- RLS. Solo la service role (script di manutenzione) puo' farlo.

-- ─── commessa_voci (append-only) ────────────────────────────

drop policy if exists commessa_voci_tenant_scope on public.commessa_voci;
drop policy if exists commessa_voci_read on public.commessa_voci;
drop policy if exists commessa_voci_insert on public.commessa_voci;
drop policy if exists commessa_voci_write on public.commessa_voci;

create policy commessa_voci_read on public.commessa_voci
  for select
  using (tenant_id = current_tenant_id());

-- Serve a `creaCommessa` e a `aggiungiTipologie`: la prima la chiama anche un
-- tecnico capo squadra.
create policy commessa_voci_insert on public.commessa_voci
  for insert
  with check (tenant_id = current_tenant_id());

create policy commessa_voci_write on public.commessa_voci
  for update
  using (
    tenant_id = current_tenant_id()
    and public."current_role"() in ('admin'::app_role, 'office'::app_role)
  )
  with check (
    tenant_id = current_tenant_id()
    and public."current_role"() in ('admin'::app_role, 'office'::app_role)
  );

-- Nessuna policy di DELETE: le voci sono append-only perche' alle voci
-- corrispondono cartelle fisiche su Nextcloud.

comment on table public.commesse is
  'I lavori. RLS: leggono e creano tutti nello spazio di lavoro (un tecnico capo squadra apre lavori nuovi), modificano solo ufficio e amministratori, CANCELLA NESSUNO — non esiste un''azione che cancelli una commessa e il codice progressivo non deve avere buchi. Solo la service role puo'' cancellare.';

comment on table public.commessa_voci is
  'Le tipologie di impianto di una commessa. APPEND-ONLY: a ogni voce corrisponde una cartella fisica su Nextcloud, quindi la RLS non ammette DELETE da nessun ruolo e l''UPDATE e'' di ufficio e amministratori.';
