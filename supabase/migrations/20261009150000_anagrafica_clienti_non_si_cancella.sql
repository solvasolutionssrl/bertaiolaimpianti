-- ============================================================
-- L'anagrafica clienti non la cancella un tecnico
-- ============================================================
-- `clienti_tenant_scope` e' `for all` con il **solo** filtro del tenant: a
-- livello di database qualunque persona dello spazio di lavoro — compreso un
-- tecnico, dal browser, con la chiave pubblica che ha gia' in mano — poteva
-- leggere, modificare e **cancellare l'intera anagrafica clienti**.
--
-- ⚠️ Non e' un'ipotesi teorica: su Bertaiola sono 195 schede, e il gesto e'
-- una riga sola in console. Nessun audit, nessuna conferma, nessun cestino.
--
-- ## Perche' si puo' chiudere senza rompere niente
--
-- Perche' **l'applicazione lo fa gia'**, e in modo piu' stretto:
--
--   creaCliente      ruolo diverso da `cliente`   ← aperta, e deve restarlo:
--                                                   la usa il sopralluogo e il
--                                                   modulo della telefonata
--   aggiornaCliente  admin | office
--   rinominaCliente  admin | office
--   eliminaCliente   admin | office
--
-- E sono le **uniche** tre strade che modificano o cancellano una scheda:
-- verificato cercando ogni `.update` / `.delete` / `.upsert` a ridosso di un
-- `from('clienti')` in tutto `apps/web/app` — stanno tutte in
-- `office/_actions/clienti.ts`. Quindi la policy non fa che ripetere al
-- database cio' che il server gia' pretende: nessun percorso vero cambia.
--
-- ⭐ **La lettura resta di tutti**: il tecnico deve vedere di chi e' la
-- commessa su cui lavora, e la scheda del cliente e' nella pagina. E la
-- **creazione** resta di tutti meno il ruolo `cliente`: e' il capo squadra che
-- apre un sopralluogo per un cliente nuovo, ed e' il gesto per cui la scheda
-- si crea davvero invece di restare un nome scritto a mano.
--
-- Idempotente: drop policy if exists prima di ogni create.
-- ============================================================

-- La vecchia policy unica si sostituisce con tre, una per mestiere.
drop policy if exists clienti_tenant_scope on public.clienti;

-- Leggere: tutti quelli dello spazio di lavoro (il ruolo `cliente` resta
-- escluso dalla restrittiva `clienti_no_cliente`, che non si tocca).
drop policy if exists clienti_read on public.clienti;
create policy clienti_read on public.clienti
  for select
  using (tenant_id = public.current_tenant_id());

-- Creare: chiunque lavori qui. Serve al sopralluogo e alla telefonata, dove
-- una scheda nuova nasce mentre si parla col cliente.
drop policy if exists clienti_insert on public.clienti;
create policy clienti_insert on public.clienti
  for insert
  with check (tenant_id = public.current_tenant_id());

-- Modificare e cancellare: l'ufficio. Una scheda cliente e' anagrafica
-- condivisa — ci si appoggiano commesse, richieste e documenti — e un errore
-- qui non si vede subito e non si recupera.
drop policy if exists clienti_write on public.clienti;
create policy clienti_write on public.clienti
  for update
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists clienti_delete on public.clienti;
create policy clienti_delete on public.clienti
  for delete
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('admin'::public.app_role, 'office'::public.app_role)
  );

comment on table public.clienti is
  'Anagrafica clienti del tenant. Leggono tutti, creano tutti (serve al sopralluogo e alla richiesta al telefono), modificano e cancellano solo admin e ufficio — come fanno gia'' le azioni in office/_actions/clienti.ts.';
