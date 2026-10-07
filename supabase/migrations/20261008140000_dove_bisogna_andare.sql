-- ============================================================
-- Dove bisogna andare
-- ============================================================
-- Una richiesta al telefono diceva **cosa** serve, **chi** ha chiamato e
-- **come** richiamarlo. Non diceva **dove**.
--
-- Finche' la richiesta restava in ufficio non si notava: la segretaria ha il
-- cliente in anagrafica e l'indirizzo lo guarda li'. Dal momento in cui la
-- richiesta si gira a un tecnico, quel buco diventa una telefonata in piu' per
-- ogni intervento: lui ha il nome e il numero e non sa dove andare.
--
-- ## Perche' un campo e non l'indirizzo del cliente
--
-- Perche' spesso **non coincidono**: si chiama dalla propria abitazione per la
-- caldaia della seconda casa, o l'amministratore chiama per un condominio.
-- E' la stessa ragione per cui il modulo di creazione commessa ha «Indirizzo
-- cantiere · se diverso dall'indirizzo cliente» accanto a quello del cliente.
--
-- ⭐ Quindi il campo e' un **override**, non una copia: vuoto significa «quello
-- del cliente», e chi legge ripiega li'. Copiare l'indirizzo del cliente
-- dentro la richiesta al momento della creazione sarebbe peggio: diventerebbe
-- una seconda verita' che non si aggiorna piu' quando l'anagrafica cambia.
--
-- ## Un campo solo, come nel modulo della commessa
--
-- Testo libero «via, civico, citta'» invece di tre colonne: e' quello che
-- l'ufficio batte mentre tiene la cornetta, e quello che serve a chi ci deve
-- arrivare. L'indirizzo **strutturato** sta in anagrafica, dove serve davvero,
-- e la richiesta diventa una commessa passando per un modulo che lo chiede.
--
-- ⚠️ Vale anche sulle cose da fare dentro una commessa, dove normalmente resta
-- vuoto (il posto e' quello del lavoro): la colonna e' sulla stessa tabella e
-- non ha senso vietarla, ma la **scrive** solo il modulo della richiesta.
--
-- Idempotente: add column if not exists.
-- ============================================================

alter table public.commessa_todo
  add column if not exists indirizzo text;

comment on column public.commessa_todo.indirizzo is
  'Dove bisogna andare, SE diverso dall''indirizzo del cliente. Vuoto = quello del cliente: chi legge ripiega su clienti.indirizzo, non si copia qui alla creazione (diventerebbe una seconda verita'' che non si aggiorna). Testo libero «via, civico, citta''», come «Indirizzo cantiere» nel modulo di creazione commessa.';

-- ⚠️ Nessun indice: non ci si cerca sopra e non ci si filtra. Un indice su una
-- colonna che nessuna query interroga e' solo scritture piu' lente.
