# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Come è organizzato questo file

Per **dominio**, non per data. Ogni voce è una regola che vale ancora; dove una
regola è nata da un difetto pagato, il difetto è scritto accanto, perché è
quello che impedisce di rifarlo. La cronaca di cosa è stato fatto e quando sta
in `git log`.

- **La memoria: cosa aprire, e quando**
- **Stato, stack e infrastruttura**
- **Cos'è questo repository**
- **Decisioni che non si contraddicono in silenzio**
- **Mondo commesse (Bertaiola)**
- **Accessi, identità e avvisi**
- **Mondo presenze — Kantiere (FPM)**
- **Interfaccia**
- **Audit, sicurezza e pulizia**
- **Convenzioni dei documenti**

> Le due superfici sono **invisibili fra loro**: ogni modifica va pensata
> Bertaiola-safe (mondo commesse) **e** FPM-safe (mondo presenze).
>
> ⚠️ **Non tutto sta qui, di proposito.** Le logiche di un dominio grosso
> vivono nel loro manuale in `documentazione_generale/08_LOGICHE/`, e qui resta
> il blocco corto con il gating e il rimando: questo file si carica **intero** a
> ogni conversazione, quindi quello che serve a una sessione su cinque pesa su
> tutte e cinque. Dal 26/10/2026 è il caso del **mondo presenze**
> (`Logiche_Kantiere.md`, ~1.400 righe): la sezione qui dice dov'è e cosa vale
> comunque.

## La memoria: cosa aprire, e quando

Oltre a questo file c'è una **memoria a richiesta** (`MEMORY.md` + un file per
voce). Di quella, solo l'indice è sempre caricato: il resto si apre quando
serve, e aprire i file sbagliati costa contesto senza dare niente.

**La regola, in breve:**

| Stai lavorando su… | Apri |
|---|---|
| **commesse** (Bertaiola) | «sempre» + **Mondo COMMESSE** |
| **presenze** (Kantiere/FPM) | «sempre» + **Mondo PRESENZE** |
| qualcosa di **condiviso** — guscio ufficio, PWA, upload, avvisi, API, sicurezza | anche **«vale per tutti e due»**, in qualunque mondo tu sia |

⚠️ **I due mondi sono invisibili fra loro a schermo, non nel codice.** Una
modifica va pensata **Bertaiola-safe E FPM-safe**: per questo chi tocca un
pezzo condiviso apre la sezione trasversale anche se sta lavorando su un
cliente solo.

⭐ **Cosa sta in memoria e cosa sta qui.** Qui: le regole del prodotto e
l'architettura, cioè quello che vale per chiunque tocchi questo repo. In
memoria: chi è Luca e come lavora, il metodo, le trappole pagate, le cose
aperte, i puntatori fuori dal repo, i fatti misurati sui dati veri. **La
cronaca non sta in nessuno dei due**: quella è `git log`.

## Stato, stack e infrastruttura

### Stato della produzione

> **L'app è in produzione dal 28/05/2026.** Bertaiola Impianti è il cliente reale attivo. Ogni push su `main` viene deployato automaticamente. Tratta il DB e i dati come produzione — no test casuali, no reset senza conferma esplicita.

### Stack AI

| Fase | Modello | Override |
|---|---|---|
| Trascrizione audio dettato | **`gpt-4o-mini-transcribe`** (per-tenant override su Bertaiola) | `tenants.transcribe_model` o env `OPENAI_MODEL_TRANSCRIBE` |
| Estrazione campi strutturati da transcript | `gpt-4o-mini` | env `OPENAI_MODEL_EXTRACT` |
| Suggerimento nome cartella + copilot | `gpt-5-mini` (fallback `gpt-4o-mini`) | env `OPENAI_MODEL_CHAT` |

Il modello di trascrizione è scegliebile per tenant dal pannello super admin (`/admin/tenants/[id]` → tab "AI"): whisper-1 / gpt-4o-mini-transcribe / gpt-4o-transcribe. Bertaiola usa `gpt-4o-mini-transcribe` (più accurato di whisper-1 su rumore di cantiere, costa la metà).

### Infrastruttura di produzione

| Servizio | Dettaglio |
|---|---|
| **Vercel** | team `solvasolutions`, progetto `bertaiolaimpianti`. Deploy automatico da `main`. URL: `https://bertaiolaimpianti.vercel.app` |
| **Supabase** | progetto `BertaiolaImpianti_GestioneCommesse`, ref `vuhqioixvgaadyxnerfg`, region **West EU (Ireland)**. Dashboard: `https://supabase.com/dashboard/project/vuhqioixvgaadyxnerfg` |
| **Nextcloud** | Hetzner Storage Share managed, già acquistato e configurato dal cliente. `basePath` e credenziali in `apps/web/.env.local` sotto `STORAGE_*`. |
| **Cloudflare R2** | Bucket staging per upload media. Credenziali `R2_*` in `.env.local`. I file vengono inviati prima su R2 poi sincronizzati su Nextcloud. |

**Credenziali**: tutte in `apps/web/.env.local` (gitignored). **Mai citare password in chiaro in prompt/transcript/commit.**

> **Segreti su `tenants` (hardening, migration `20260627010000`)**: le colonne `storage_config` (credenziali Nextcloud) e `r2_config` (secret key R2) sono **segreti** e NON sono leggibili dal client `authenticated`/`anon` (privilegi di colonna: SELECT di tabella revocato, ri-concesso solo sulle colonne non sensibili). Vanno lette **esclusivamente via service role** (`createServiceSupabase`, scoping esplicito `.eq('id', tenantId)`) — già così in tutto il codice. **Mai** passare questi due campi a un componente client per i tenant. ⚠️ Aggiungendo una **nuova colonna NON segreta** a `tenants`, concederla: `grant select (col) on public.tenants to anon, authenticated;` (le colonne segrete NON si concedono). La chiave Google Maps non sta qui (è env globale): vedi sopra.

**Migrazioni DB**: scrivere il file SQL in `supabase/migrations/`. L'apply al DB cloud si fa con `supabase db query --linked < supabase/migrations/<file>.sql` — **`db push` non funziona su questo repo**.

> ⚠️ **Ogni migration DEVE essere idempotente.** Applicate con `db query` non finiscono in `supabase_migrations.schema_migrations`, quindi un domani un `db push` proverebbe a rilanciarle tutte. Il registro è fermo a `20260814150000` mentre nel repo ci sono 10 file più recenti: verificato il 23/09/2026 che **tutti e 10 sono idempotenti** (drop-if-exists in pari con ogni create, `on conflict` sugli insert), quindi una riesecuzione gira a vuoto senza danni.
>
> **Non registrarle a mano** in `schema_migrations` per "sistemare" il disallineamento: il rischio è asimmetrico. Segnare come applicata una migration che non lo è la fa saltare **per sempre**, cioè deriva silenziosa dello schema; non segnarla costa al massimo una riesecuzione a vuoto. In pratica: `add column if not exists`, `drop constraint if exists` prima di `add constraint`, `drop policy if exists` prima di `create policy`, `on conflict` sugli insert.

**Deploy**: solo `git push origin main`. La GitHub integration Vercel fa tutto. Non usare `vercel deploy --prod` manualmente (raddoppia la build sul piano Hobby).

Working language for all documents is **Italian**. Preserve it when editing; do not translate existing content unless asked.

> **Product name**: `Kommessa` (rebrand definitivo da `impiantiXplus`, maggio 2026). Pacchetti workspace: `@kommessa/api`, `@kommessa/ui`, `@kommessa/integrations`, `@kommessa/web`.

## Cos'è questo repository

### Codice e documentazione

This is the working repo for the **Bertaiola Impianti × SOLVA (Kommessa)** project. It contains:

1. **Codice di prodotto** (sviluppo attivo):
   - `apps/web/` — Next.js 14 App Router (3 superfici sotto un solo app: `office/`, `mobile/`, `portal/`)
   - `packages/api/`, `packages/ui/`, `packages/integrations/` — pacchetti workspace (`@kommessa/*`)
   - `supabase/migrations/` — schema versionato (55 migrazioni applicate al cloud al 18/06/2026)
   - `supabase/functions/` — Edge Functions (Deno)
   - `scripts/` — script operativi (es. `reset-tenant-data.mjs`, banchi di prova UI in `banco-ui/`)
2. **Documentazione di prodotto** sotto `documentazione_generale/` — kickoff, architettura, brand, roadmap, mockup, preventivo, presentazioni.

### Come è disposto il repository

- `README.md`, `CLAUDE.md` — root-level docs
- `documentazione_generale/` — all kickoff documentation, consolidated:
  - `00_input_cliente/` — original client meeting PDFs (14/11 and 28/11/2025), source-of-truth raw input
  - `01_KICKOFF/` — Documento Zero (vision/context), Report Riunione (decisions log), Flusso_Operativo (product flow), Domande_Cliente_SOLVA.md (compiled client questionnaire)
  - `02_ARCHITETTURA/` — technical architecture, stack choices, storage comparison, infra cost estimate
  - `03_BRAND/` — three legacy candidate names (Cantiera, Posa, ImpiantOS) kept as historical material; current working name `impiantiXplus` is in the top-of-file note
  - `04_ROADMAP/` — Sprint 0 → Sprint 5 plan with effort estimates
  - `05_MOCKUP/` — UI wireframes (6 priority screens)
  - `06_PREVENTIVO/` — commercial quote with 3 package tiers
  - `07_PRESENTAZIONI/` — generated `.pptx` slide decks (Executive, Tecnica; Commerciale TBD) — **out of date with current product name, need regeneration**

The `README.md` reading order (Documento_Zero → Report_Riunione → Flusso_Operativo → Comparativa_Storage → Architettura_Soluzione → Roadmap → Preventivo → PPTs) is the canonical onboarding path. All paths there are now relative to `documentazione_generale/`.

### Documenti che si citano fra loro

These files cite each other and must stay in sync — when changing one, check the others:

- Scope/decisions: `README.md` ↔ `documentazione_generale/01_KICKOFF/Documento_Zero.md` ↔ `documentazione_generale/01_KICKOFF/Report_Riunione.md` ↔ `documentazione_generale/01_KICKOFF/Flusso_Operativo.md`
- Tech choices: `documentazione_generale/02_ARCHITETTURA/Stack_Tecnico.md` ↔ `documentazione_generale/02_ARCHITETTURA/Architettura_Soluzione.md` ↔ `documentazione_generale/07_PRESENTAZIONI/Bertaiola_Tecnica.pptx`
- Costs: `documentazione_generale/02_ARCHITETTURA/Stima_Costi_Infrastruttura.md` ↔ `documentazione_generale/06_PREVENTIVO/Preventivo_Base.md`
- High-level pitch: both PPTs in `documentazione_generale/07_PRESENTAZIONI/` reflect the choices above and need to be regenerated when those choices change (see open-items list at the bottom of `README.md`).

## Decisioni che non si contraddicono in silenzio

### Le scelte portanti

These decisions evolved across versions — the current state is **v3** (commit `5000547`: "v3: abbandono Freshdesk + PWA tecnici al posto di Expo"). When editing any document, keep these aligned:

| Decision | Status |
|---|---|
| **Product name** | **Kommessa** (definitivo dal maggio 2026, rebrand da `impiantiXplus`). Legacy alternatives in `03_BRAND/` sono solo contesto storico. |
| **Freshdesk** | **Abandoned** post go-live: ticketing nativo nell'app. Lo script di migrazione one-time è stato rimosso il 16/09/2026 (non funzionava più); resta solo l'enum storico `imported_from_freshdesk`. Do not describe it as "integrated". |
| **Mobile tecnici** | **PWA** (Next.js + Service Worker + Web App Manifest). **Not** Expo, **not** React Native, **not** native iOS/Android. No App Store / Play Store. |
| **Storage cloud** | ✅ **Nextcloud confirmed** (Hetzner Storage Share managed). Decisione chiusa: il cliente Bertaiola ha già acquistato e configurato Nextcloud, il file browser mobile vede i file reali. Mantenere comunque l'astrazione `StorageProvider` nel codice per supportare in futuro altri tenant con provider diversi. |
| **Backend** | Supabase Pro, region **Frankfurt EU** (GDPR). Postgres + Auth + Realtime + Edge Functions. |
| **Web** | Next.js 14 on Vercel. Monorepo with shared codebase across web office / PWA tecnici / portale cliente. |
| **Multitenant** | From day 1. Bertaiola is the **pilot tenant** of a SaaS product (working name **impiantiXplus**). |
| **Hosting** | 100% EU. GDPR compliance is a hard requirement. |
| **Pricing reference** | Pacchetto B ≈ €20.020 + IVA year 1; ≈ €3.920/year recurring. Update `documentazione_generale/06_PREVENTIVO/Preventivo_Base.md` if numbers change anywhere else. |

## Mondo commesse (Bertaiola)

### Modifica, versioni e tipologie (migration `20260618000000`)

La modifica di una commessa finalizzata riapre il flusso di creazione:

- **Desktop**: pagina `/office/commesse/[id]/modifica` (editor globale completo). Il bottone "Modifica" sulla scheda apre questa pagina; il vecchio mini-dialog a 3 campi è stato rimosso.
- **PWA**: wizard `/mobile/commessa/[id]/modifica` a 3 step (Dati → Tipologie → Conferma), precompilato, con dettatura vocale **opzionale** (merge non distruttivo via `/api/voice/extract`). Solo `admin`/`office`.
- **Action**: `aggiornaCommessaCompleta` (`apps/web/app/_actions/aggiorna-commessa-completa.ts`). UI condivisa: `apps/web/app/_components/commessa-editor/`.

> **Regola ferrea (editor + versioning + tipologie)**: `codice_interno`, `nome_cartella`, `cloud_folder_path` NON si toccano MAI (rinominare romperebbe i file su Nextcloud — dirlo in UI). Le voci/tipologie sono **append-only**: si aggiungono soltanto, mai si rimuovono (le cartelle sono fisiche). La modifica è **online-only** (serve il server per versioning + provisioning cartelle).

**Versioning** — tabella `commessa_versioni` (snapshot jsonb + diff + `modificato_da`/`modificato_da_nome` + `azione` ∈ creazione|modifica|aggiunta_tipologie|ripristino). La versione 1 è scritta da `creaCommessa` (hook best-effort); le esistenti hanno v1 da backfill (`scripts/backfill-versioni-v1.mjs`). Storico nella tab **Cronologia** office. **Ripristino solo superadmin** (`ripristinaVersione`, content-only — mai voci/cartelle), gating `isSuperadminActor()` da `admin/_lib/guard` che riconosce anche l'impersonation (cookie `shadow_admin`). Helper: `_lib/versioni/snapshot.ts`, `_actions/_lib/scrivi-versione.ts`.

**Tipologie impianto** ("cosa si fa") — sono un **elemento master nella sidebar** office (`commessa-sidebar.tsx` → `tipologie-panel.tsx`), NON nella tab Fasi (che monitora l'avanzamento). Azione rapida `AggiungiTipologieDialog` (append-only, conferma con avviso "creerà le cartelle su Nextcloud") disponibile in sidebar office, scheda mobile ed editor. Action `aggiungiTipologie`; provisioning condiviso `_actions/_lib/provisiona-cartelle.ts` + `_actions/_lib/aggiungi-voci.ts`. NB: anche `aggiungiVoce` della tab Fasi ora provisiona le cartelle (prima inseriva solo la riga DB).

### Etichette degli stati

L'enum `stato_commessa` resta `bozza/aperta/in_corso/collaudo/completata/archiviata`. A schermo però si mostrano queste **diciture** (decise dal cliente — le commesse non sono "critiche/a rischio", sono lavori nel loro ciclo): `aperta` → **"Non presa"**, `collaudo` → **"In collaudo"**, gli altri col nome naturale. La label vive in `StatoBadge` (`packages/ui`) + mappe locali allineate (liste/filtri, stato-picker, scheda, editor, PWA, admin). Non reintrodurre "Aperta"/"Collaudo" né framing "a rischio" sulla dashboard (la sezione è "Commesse in lavorazione").

### Il titolo e il nome cartella sono due cose

Segnalato da una persona dell'ufficio: «non riesco a modificare le note nella
sezione Descrizione cantiere». Erano **due** difetti attaccati, e dietro il
secondo c'era un campo che faceva due mestieri.

- ⭐ **Un campo, due mestieri, e vinceva quello sbagliato.**
  `commesse.descrizione_ai_finale` era insieme il **titolo mostrato** e il
  **terzo segmento di `nome_cartella`**. Siccome una cartella non tollera gli
  spazi, vinceva lei: l'AI proponeva direttamente `ImpiantiMeccaniciCasaLegno`,
  quel valore finiva in tabella, e a schermo si leggeva **un nome di file al
  posto di una frase**. Da ora la descrizione è una frase umana e il CamelCase
  si **deriva** alla creazione — ⚠️ **senza una colonna nuova**: la versione
  CamelCase ha già una casa definitiva, `nome_cartella`, che per regola ferrea
  non si rinomina mai. Regole pure in `@kommessa/api/nome-cartella`
  (17 asserzioni): ⚠️ una parola che ha **già** una maiuscola non si tocca
  (`kW` resta `kW`, e chi scrive ancora `ImpiantiMeccanici` non viene
  appiattito), e il taglio a 40 caratteri è **a parola intera** — il vecchio
  `sanitize()` troncava a metà e `…RifacimentoImpiant` restava così per sempre.
  ⚠️ **Le commesse esistenti NON si toccano**: il titolo resta attaccato, è una
  scelta. Si correggono una per una dalla matita, che non rinomina la cartella.
- ⚠️ **La doppia verità era già in produzione**: una commessa nata da una
  richiesta al telefono ha sempre avuto il titolo **con gli spazi**
  (`richiesta-bozza.ts` passa il titolo del todo) e una cartella
  `Cambiocaldaia`, tutta minuscola. Due sapori a seconda di da dove entrava la
  commessa; ora la regola è una.
- ⚠️ **L'anteprima del percorso era scritta a mano in tre posti e due
  mostravano un formato abbandonato**: `Cliente_2026-10-08_Lavoro`, con la data
  che il formato vero non ha da mesi; la terza scriveva «BER» nel sorgente,
  quindi era falsa per ogni altro cliente. ⭐ Ora l'anteprima **chiama la
  stessa funzione del server**, e un test verifica che combacino. Il codice si
  mostra come `<codice>` dichiarato invece di inventarne uno.
- **Quattro prompt riscritti**: `/api/suggerisci-nome` (sistema + tre esempi) e
  l'estrazione della dettatura (`api/voice/_lib/extract-prompt.ts`, sette
  esempi) chiedevano **esplicitamente** CamelCase, max 30 caratteri. Ora
  chiedono una frase italiana, max 60. ⚠️ La tabella delle voci dominanti era
  **copiata** dentro il ripiego della dettatura — dieci voci invece di tredici,
  sotto il commento «stessa logica di suggerisci-nome», vero il giorno in cui è
  stato scritto: ora la importa.
- ⭐ **Guadagno di contorno, misurabile**: cercare «impianti meccanici» non
  trovava `ImpiantiMeccaniciCasaLegno` — la ricerca fa `ilike %…%`. I titoli
  nuovi sono cercabili.
- **Via la card «Descrizione cantiere»**: stampava di nuovo il titolo (è la
  **stessa variabile**, non un altro campo) e serviva solo a ospitare una
  matita. La matita è salita accanto al titolo. Due volte la stessa frase a
  dieci pixel di distanza fa credere che siano due campi diversi — ed è
  esattamente l'equivoco da cui è partita la segnalazione.
- ⚠️ **E le note: un comando che prometteva e poi rifiutava.**
  `aggiornaDettagliCommessa` ammetteva **solo `admin`** dal giorno in cui il
  campo è nato, ma dal 18/06 la scheda desktop mostra la matita a
  `admin || office` (la riprogettazione passò il `canEdit` della pagina a
  entrambi gli editor). Quattro persone su sei in Bertaiola aprivano il
  riquadro, scrivevano, premevano Salva e leggevano «Solo gli admin possono
  modificare i dettagli». ⭐ **E il divieto non proteggeva niente**: lo stesso
  campo l'ufficio lo scriveva da «Modifica» → editor completo, che passa da
  `aggiornaCommessaCompleta` (admin + office). Non era un confine: era una
  seconda risposta alla stessa domanda. Ora ufficio e amministratori, in
  entrambe le superfici. ⚠️ Tolta anche la modalità «aggiungi in fondo» di
  `DettagliEdit`: aveva titolo, descrizione e stato dedicati, e **nessun tasto
  che la aprisse**, in nessuna delle due superfici.

Banco: `scripts/banco-ui/scheda-commessa.mjs` (15 controlli, si accede come
**ufficio** — col `demo@` di sempre, che è admin, il difetto non si sarebbe
visto). ⚠️ Due modi in cui questo banco ha mentito prima di dire il vero: il
primo controllo passava su una **pagina ancora vuota** (aspettava
`readyState`, che è «completo» mentre si vede lo scheletro di `loading.tsx`), e
l'anteprima della cartella si misurava **prima** che `useBozzaDraft` avesse
finito di rimettere lo stato, quindi leggeva il campo svuotato e dava la colpa
al codice.

### Trascrizione, vocabolario della dettatura, priorità, anteprime video

- **Trascrizione: niente elenco di modelli nel codice** (migration `20261006090000`). Quali modelli si possono scegliere e qual e' il predefinito stanno in `platform_settings` riga `modelli_trascrizione`; il `CHECK` su `tenants.transcribe_model` e' stato **tolto** (era la forma piu' rigida di elenco scritto nel codice). Nel codice resta solo la **grammatica della richiesta**, che e' un fatto sul contratto HTTP e si ricava **dal prefisso del nome** (`@kommessa/api/trascrizione`): `moderna` vuole `languages[]`+`keywords[]`, `gpt4o` e `whisper` vogliono `language` singola. ⚠️ I `gpt-4o` si riconoscono **prima** dei `gpt-`: invertire le due righe rompe tutto in silenzio. Bertaiola non ha piu' una scelta propria: segue il predefinito (`gpt-transcribe`), cosi' un domani si cambia una riga e si muovono tutti.
- **Il vocabolario della dettatura esce dai dati, mai da una lista** (`api/voice/_lib/vocabolario.ts`): i comuni dell'anagrafica (67 per Bertaiola, «Valeggio sul Mincio» compreso) e le lavorazioni a catalogo. ⚠️ **Niente nomi di clienti, di proposito**: OpenAI avverte che un elenco puo' far comparire termini mai pronunciati, e su un cognome significa una commessa aperta sulla persona sbagliata. ⚠️ Se la richiesta col vocabolario viene rifiutata (4xx non 401/429) si **riprova una volta senza**: i campi sono nuovi e la documentazione di OpenAI non e' allineata con se' stessa.
- **La creazione commessa non aspetta piu' le cartelle.** `provisionaCartelle`, audit e versione 1 sono in `waitUntil`. Il provider Nextcloud **ricorda** cosa ha gia' creato (`MKCOL` non e' ricorsivo: ~35 chiamate su 49 ricreavano cartelle appena fatte), crea **un livello alla volta in parallelo**, e ha un timeout — prima una `fetch` appesa bloccava tutto per sempre. ⚠️ E' sicuro perche' `sync-r2-to-nextcloud` crea da se' la cartella padre.
- **Priorita' a TRE livelli** (migration `20261006100000`): `1 - Urgente`, `2 - Alta`, `3 - Bassa` (predefinito). I 53 task su «media» sono diventati «bassa» perche' «media» era il default, cioe' l'assenza di scelta — e «bassa» non era mai stata usata da nessuno in cinque mesi. ⚠️ `media` **resta nel tipo Postgres** (e' usato da una chiave primaria, un trigger e due default): non si scrive piu' e `normalizzaPriorita` lo traduce in lettura. Vocabolario unico in `@kommessa/api/priorita` + `_components/priorita-ui.tsx`: prima c'erano **otto tavolozze divergenti** e cinque mappe di ordinamento copiate.
- **I video hanno un'anteprima vera.** Il fotogramma lo estrae il telefono all'invio (`_lib/poster-video.ts`) e lo manda a `api/upload/media/[id]/poster`. ⚠️ L'ordine degli eventi e' tutto: `loadedmetadata` → sposto il tempo → `seeked` → disegno. Impostare `currentTime` prima dei metadati non ha effetto e si cattura il fotogramma zero, quasi sempre nero. Attesa, errore e segnaposto stanno in `_components/miniatura-media.tsx`: **mai piu' un `<video preload="metadata">` sul file intero per disegnare un riquadro**.
- **Il cliente si sceglie con UN campo** (`_components/scelta-cliente.tsx`): si cerca, e solo se non c'e' l'app chiede il resto (prima persona o azienda, poi contatti, poi indirizzo con i comuni suggeriti). ⚠️ Il wizard sopralluogo scaricava 200 clienti e filtrava in memoria: con 214 in anagrafica gli ultimi quattordici erano **invisibili** e si creavano doppioni senza nessun segnale.
- **Menu a tendina con ricerca** (`_components/scelta.tsx`, su `@kommessa/api/scelta-opzioni`): singolo e multiplo, ricerca a token su piu' campi, accenti piegati. Il `<select>` nativo resta giusto sotto la decina di voci — non si sostituisce per simmetria.

### Richieste al telefono: un task senza commessa (migration `20261005120000`)

L'ufficio risponde al telefono («c'è da cambiare la caldaia, signora Elena, è una Viessmann») e finora scriveva un **post-it** da portare a mano a chi se ne doveva occupare. Il flusso del prodotto parte dal **sopralluogo**: questo momento sta a monte di tutto e non esisteva da nessuna parte.

⭐ **Una richiesta È un task senza commessa**: `commessa_todo.commessa_id` è diventata **nullable**. La lista condivisa esisteva già (pagina **Task**, ora «Task e richieste»): le mancava solo poter contenere qualcosa che non è ancora un lavoro. Non è una commessa perché una commessa brucia un codice interno da un contatore senza buchi e crea ~15 cartelle su Nextcloud, e non esiste nessuna azione per eliminarla.

- **Colonne nuove** su `commessa_todo`: `cliente_id` (se chi chiama è in anagrafica), `cliente_testo` (il nome come è stato detto, quando non c'è — **non** si crea una riga in `clienti` per una telefonata), `contatto` (numero o email, testo libero). Indice parziale `commessa_todo_richieste_idx` su `where commessa_id is null`.
- **La catena**: `Richiesta` → «Crea commessa» → **bozza precompilata** (`commessa_bozze`, costa un INSERT, non brucia niente, vive 30 giorni) → `/office/commesse/nuova?bozza=<id>` chiede il resto → alla finalizzazione `finalizzaBozza` **aggancia** la richiesta alla commessa (`_richiestaTodoId` nel payload). Il post-it diventa la prima riga di storia del lavoro invece di essere buttato. Puro e testato: `@kommessa/api/richiesta-bozza`.
- ⚠️ **La descrizione non si tronca**: diventerebbe il `nome_cartella` su Nextcloud, che non si rinomina più. Un titolo oltre 60 caratteri finisce nelle note e il form lo chiede.
- **Se non si assegna a nessuno** resta nella stessa lista: non c'è una seconda coda. Si trova con la scorciatoia **«Da assegnare»** (un clic, filtro `assegnato=nessuno`) e col contatore ambra in alto; e si assegna **dalla riga**, con una tendina, senza aprire nulla — è il gesto che l'ufficio ripete a raffica smaltendo il mucchio. L'avviso `todo_urgenti_non_assegnati` copre già urgenti e alte rimaste senza nessuno.
- **Si assegna a CHIUNQUE** (`elencaAssegnabiliTenant`), non solo ai `role='tecnico'`: «ordina la pompa» è roba d'ufficio, «passa a vedere la caldaia» è roba da capo. `elencaTecniciTenant` resta per `commessa_tecnici`, dove solo un tecnico ha senso.
- **Chi viene assegnato lo sa**: evento `todo_assegnato` + `notificaAssegnazione` (`_actions/_lib/notifica-assegnazione.ts`). Prima assegnare un task scriveva **solo** su `audit_events` e l'interessato non riceveva niente. Non si avvisa chi assegna a se stesso, e si avvisa solo se l'assegnatario **cambia**.
- **Sul telefono** la richiesta compare in «Cosa fare» e, se c'è un numero, il tasto lo **chiama** (`tel:`): non porta a una commessa perché non ce l'ha. ⚠️ La home mobile non esce più subito quando non hai commesse assegnate: un capo con una sola richiesta in mano vedeva «nessuna commessa assegnata».
- ⚠️ **Ogni punto che legge i task deve gestire la commessa mancante**: `/office/commesse/null/lavori` è un link rotto. Sistemati board Task, card dashboard, avvisi (`_lib/alerts.ts`), home mobile; le revalidation passano da `rivalida()`.

- 📘 **Manuale**: `documentazione_generale/08_LOGICHE/Logiche_Richieste_Telefono.md` (perché non è una commessa, la catena completa, le regole da non violare). Aperti in `08_LOGICHE/Osservazioni_Audit_2026-10-05.md`.

> **Ricerca cliente: un componente per tutta l'app.** `_components/cliente-picker.tsx` (`ClientePicker` + hook `useRicercaClienti`). Prima la stessa domanda «chi è il cliente?» aveva **tre** risposte diverse: il form di creazione commessa interrogava Supabase **dal browser** (debounce 200 ms, 8 risultati), il dettato vocale passava dall'azione server (400 ms, 5 risultati, minimo 3 caratteri), e per il telefono non c'era niente. Ora la meccanica è una (`cercaClientiPerNome`, minimo **2** caratteri, `limite` opzionale); il dettato vocale conserva la sua resa perché è un'altra interazione — **avvisa che il cliente forse esiste già**, non lo fa scegliere. ⚠️ Se l'elenco finisce dentro un dialog serve un Portal **marcato** `data-popover-portale` (vedi la nota sui dropdown nei dialog): un Portal non marcato è un clic «fuori» e chiude il dialog sotto, ma un overlay in-flow viene tagliato dal riquadro che scorre.

> **Display titolo commessa**: nelle UI non mostrare mai `nome_cartella` raw (è la directory Nextcloud nel formato `{codice}_{cliente}_{lavoro}`). Usare sempre `risolviTitoloCommessa()` da `apps/web/app/_lib/commessa-display.ts` che pesca da `descrizione_ai_finale → proposta → note_iniziali` con fallback estrattivo da nome_cartella (CamelCase → spazi).

### La scheda di una richiesta

Migration `20261008140000`. Il tecnico la riceveva e non poteva farci niente:
vedeva un titolo e un tasto per chiamare.

- **`commessa_todo.indirizzo`: dove bisogna andare.** Mancava del tutto. ⭐ E'
  un **override**, non una copia: vuoto significa «quello del cliente», e chi
  legge **ripiega li'** (`_actions/_lib/contesto-lavoro.ts`). Copiarci dentro
  l'indirizzo dell'anagrafica alla creazione farebbe una seconda verita' che
  non si aggiorna piu'. Si porta fino alla commessa: richiesta →
  `indirizzoCantiere` della bozza → modulo.
- **Una pagina sua**: `/mobile/richiesta/[id]`, con cliente, indirizzo (tasto
  mappa), contatto (tasto chiama), cosa e' stato detto al telefono, priorita',
  scadenza, chi ne risponde e chi ci va, le **note** (stessa tabella delle note
  di una cosa da fare: non un secondo posto dove scrivere la stessa cosa) e il
  tasto per chiuderla. ⚠️ **La RLS qui non basta**: `commessa_todo_read` e'
  tenant-wide, il filtro «le mie» vive nelle pagine — il controllo e' scritto
  **identico** a quello della home.
- ⭐ **Il colore dice che cosa e'.** `Hero` ha una prop `tono`: `lavoro` (blu
  del marchio) e `richiesta` (arancione, token `--accent` che esisteva gia').
  E' lo **stesso** segnale che le richieste hanno nei due elenchi — il bordo
  ambra sulla scheda del telefono, il badge nella board — e aprendola il colore
  continua invece di ricominciare. ⚠️ Con l'intestazione arancione va coperta
  anche la **striscia dietro la Dynamic Island**, che il guscio disegna blu
  fissa: `ScrimStatusBar`, `z-40` sopra il `z-30` del layout.

### Chi ci va e chi ne risponde (migration `20261008120000`)

- ⭐ **«In mano a» e «chi ci va» sono due domande, non due verita' sulla
  stessa — e solo sulle RICHIESTE.** La segretaria affida la richiesta a un
  caposquadra (in Bertaiola un dipendente con ruolo **`office`**, non una
  capacita') e lui la gira a uno o piu' tecnici.
  `commessa_todo.assegnato_a` **resta** e dice chi ne RISPONDE; la tabella
  `commessa_todo_squadra` dice chi ci VA. Si legge la catena intera: Erica →
  Cristian → Luca + Thomas. L'alternativa era sostituire la colonna: 103
  letture in 19 file, in produzione, per perdere chi aveva incaricato chi.
  ⚠️ **Dentro una commessa no** (migration `20261008130000`): li' il lavoro ha
  gia' la sua squadra (`commessa_tecnici`) e la cosa da fare ha un assegnatario
  solo. ⭐ **Un campo che esiste dove non serve non e' neutro**: e' una domanda
  in piu' a cui qualcuno prova a rispondere, e una seconda verita' su «chi se
  ne occupa» dove ce n'era una sola e chiara. Lo impediscono il `with check`
  della policy e l'azione, che risponde in italiano.
  ⚠️ Un tecnico non riassegna: lo dicono la policy **e** il trigger
  `commessa_todo_tecnico_guard` che gia' gli impediva di toccare `assegnato_a`.
  ⚠️⚠️ **Aprire la seconda mano vuol dire aprirla in TUTTI i presidi.** La
  RLS riconosceva il tecnico mandato e la guardia applicativa di
  `cambiaTodoStato` no: lui vedeva la richiesta sul telefono, premeva il
  cerchietto e si sentiva rispondere «Questa richiesta non e' tua». Stessa
  forma del riassunto delle riunioni sparito il giorno prima — ⭐ *aprire un
  permesso vuol dire aprirlo per tutto il gesto* — ma questa volta l'ha trovato
  un banco, non due riunioni perse.
  ⚠️ Una richiesta e' l'unica cosa da fare **senza una pagina** (non ha una
  commessa): il cerchietto per chiuderla sta nell'elenco della home, o chi ci
  va non ha modo di dire che e' fatta.
- **Il cliente nuovo si registra al telefono.** C'era `ClientePicker`, che del
  cliente prendeva **solo il nome** e non salvava niente in anagrafica. Ora
  `SceltaCliente`, lo stesso del sopralluogo e del dettato, e la scheda si crea
  davvero (`creaCliente`). La scheda ha **gli stessi sei campi del modulo
  «nuova commessa»**, nello stesso ordine e su due colonne: chi apre un lavoro
  e chi risponde al telefono compilano la stessa cosa, o si finisce con due
  anagrafiche diverse a seconda di da dove e' entrato il cliente. Tolto il
  passo «e' una persona o un'azienda?»: il tipo e' il secondo campo, come li'.
  ⚠️ ⭐ **Un suggerimento della mappa non deve mai rendere il campo meno
  preciso di com'era.** Photon e Nominatim, quando la via non la trovano,
  restituiscono volentieri il **comune**: chi scriveva «Via Roma 12 Valeggio» e
  sceglieva quel suggerimento si ritrovava «Valeggio sul Mincio», con la via
  sparita. Ora `/api/geocode/autocomplete` dichiara la `via` del suggerimento e
  la regola sta in `@kommessa/api/indirizzo-scelto` (pura, 10 asserzioni):
  dipende da cosa risponde un servizio esterno quel giorno, e non si collauda a
  mano. ⚠️ `AddressAutocomplete` chiama `onSelect` **a ogni carattere battuto**,
  insieme a `onChange` e con lo stesso `valore` vecchio: una riga che rileggeva
  `valore.indirizzo` bloccava il campo sul primo carattere. Una scelta vera si
  riconosce dalle coordinate (`lat !== null`). ⚠️ E `aggiornaTodo` non accettava
  `clienteId`/`clienteTesto`/`contatto`: **una richiesta registrata non si
  poteva correggere**, ne' il nome ne' il numero. Misurato sui dati veri:
  «Lago Maria Rosanna» come testo libero, col telefono in un campo a parte, e
  la stessa richiesta scritta **due volte a quattro minuti di distanza**.
- **Spuntare chiede conferma**, nei tre punti dove si spunta (commessa ufficio,
  board Task, commessa PWA). Il cerchietto e' un bersaglio di 40-44px accanto
  al titolo: scorrendo si prende per sbaglio, e dall'altra parte qualcuno
  smette di aspettare quella cosa. ⚠️ `askConfirm` **fuori** da
  `startTransition`, sempre.
- **Eliminare si puo', dalla board Task.** `eliminaTodo` esisteva ed era
  collegata **solo** dentro una commessa: l'unica uscita era segnare come fatta
  una cosa mai fatta. Non si confonde con `annullato`, che il codice stesso
  chiama «una cancellazione travestita»: quello e' cio' che era vero e non si
  fa piu', e resta nello storico.
- **L'elenco del tecnico e' fatto di blocchi.** Una cosa da fare poteva stare
  dieci righe sopra la commessa a cui appartiene. ⭐ **L'ordine dei gruppi non
  e' una regola nuova**: si ordina con `ordinaElenco` di sempre e i gruppi
  seguono la voce piu' urgente che contengono, cosi' non esiste una seconda
  regola da tenere allineata alla prima. `raggruppaElenco` in
  `@kommessa/api/elenco-lavoro` (26 asserzioni). ⚠️ Un gruppo puo' non avere
  capofila — succede cercando — e la riga va mostrata lo stesso.
- **La registrazione troppo breve non e' un errore.** ⚠️ **Non c'era un limite
  da togliere: ne mancava uno.** Il modulo delle riunioni ha un registratore
  tutto suo e non conosceva la soglia dei tre secondi che gli altri cinque
  punti dell'app hanno da agosto: mezzo secondo di audio arrivava all'AI,
  tornava vuoto (422) e diventava il popup «Trascrizione fallita». Sotto il
  decimo di secondo rifiuta OpenAI stessa, quindi il bordo esiste comunque e
  l'unica cosa che si sceglie e' **come dirlo**: avviso calmo in linea, tasto
  subito ripremibile. Regola e messaggi in `app/_lib/registrazione.ts`, un
  posto solo per entrambi i registratori. ⚠️ Trovato di contorno: il dettato
  finiva nel testo mandato all'AI **due volte** (sta sia in `corpoLibero` sia
  in `trascrizione`, ed e' voluto; era il concatenamento a non saperlo).
- Di contorno, nella stessa pagina: la commessa si sceglieva da un `<select>`
  di sistema con **202 voci** su Bertaiola, che stampava il `nome_cartella`
  grezzo; e `.limit(200)` su 202 commesse attive rendeva **invisibili** le
  ultime due, nel filtro e nel modulo, senza nessun segnale.

### Task e richieste: le due colonne

Tre rifiniture sulla board «Task e Richieste», tutte misurate col banco.

- **Una richiesta era alta 220px, un task 65.** Ora **134px** (−39%), con la
  stessa informazione: la priorità torna sulla riga del titolo come **icona
  colorata** invece di una pastiglia che si prendeva una riga intera (il titolo
  occupa tutta la larghezza, quindi la mandava a capo da sola — nuovo token
  `testo` in `@kommessa/api/priorita`), e i comandi stanno in **una riga sola
  che va a capo solo se serve** invece di tre (tendine impilate, tasti,
  cestino: 80px sotto ogni riga, anche su quelle già smistate).
  ⚠️ `flex-wrap` resta obbligatorio: senza, a 250px «Crea commessa» finiva
  **sopra** il cestino. ⭐ La soglia del banco è **2,2×** un task e non la
  parità: una richiesta porta comandi che un task non ha, e nella colonna larga
  quei comandi stanno **accanto** al titolo invece che sotto — chiedere la
  parità vorrebbe dire nascondere qualcosa.
  ⚠️ **Il comando dice cosa fa, non come si chiama il campo**
  (`ETICHETTA_ASSEGNA_A`): su un task l'assegnazione è una sola, quindi non
  serve nominarla — serve farla; su una richiesta restano due passaggi, e il
  primo tiene il nome («Responsabile…») proprio per non confondersi col
  secondo.
  ⚠️⚠️ **Ma il comando deve dire il suo stato.** Per un giorno il tasto ha
  mostrato sempre l'etichetta dell'azione (prop `comando`, poi ritirata) per
  non ripetere un nome già scritto due righe sopra: a vederla in uso, una
  tendina che dice «Assegna a…» mentre una persona **è** assegnata sembra dire
  che non lo sia, e chi guarda è costretto ad aprirla per sapere come stanno le
  cose. ⭐ **Ripetere un nome costa meno che nasconderlo.** Ora il tasto dice
  il gesto finché non c'è nessuno e il **nome** appena qualcuno c'è
  (`riassunto` sulla scelta multipla: un nome per esteso, da due in su il
  conto).
- ⚠️ **Assegnata non voleva dire chiusa a chiave, e invece lo era.** La tendina
  di chi ne risponde compariva solo sulle righe senza nessuno
  (`!row.assegnato_a`): assegnata una richiesta alla persona sbagliata, dalla
  board non la si poteva più correggere — il comando spariva nel momento esatto
  in cui serviva. Ora c'è sempre, e la riga costa ~38px in più (134 → **172px**):
  è il prezzo dichiarato di poter cambiare idea.
- ⭐ **La ricerca guarda quello che la riga mostra, nome cliente compreso** —
  era la cosa che l'ufficio cercava e l'unica che non si poteva cercare. Il
  cliente **non è una colonna** di `commessa_todo`: su una richiesta sta in
  anagrafica o nel testo della telefonata, su un task sul cliente della
  commessa. Filtrarlo lato server avrebbe voluto dire due letture in più e
  centinaia di UUID in un `in.(…)` che cresce a ogni pagina; si filtra in
  memoria con la **stessa meccanica a token delle tendine**
  (`testoCorrisponde`, ora esportata da `@kommessa/api/scelta-opzioni`), e il
  costo non cambia perché senza ricerca la pagina legge già tutte le righe
  aperte per i conteggi in alto.
  ⚠️ **Non rimettere un `or=(…)` col testo digitato**: PostgREST lo spezza
  sulle virgole e «Rossi, via Verdi» diventa una pagina d'errore. Ora quel
  rischio non c'è più perché il testo non arriva al database.
- ⭐ **«Creato da», una frase sola.** Si diceva in tre modi su tre schermate —
  «da Barbara» nella board, «Registrata da» sulla scheda di una richiesta,
  «Creata da» dentro una commessa. Ora `ETICHETTA_CREATO_DA` in
  `@kommessa/api/assegnazione`, uguale ovunque anche sul femminile: è
  un'etichetta fissa come «Creato il», non un participio che concorda.

⚠️⚠️ **Un banco che scrive nella casella sbagliata passa lo stesso.** Il
controllo della ricerca cercava `input[placeholder*="Cerca"]` e prendeva la
**ricerca globale del guscio** («Cerca commesse, clienti…»): la board non si
filtrava e il controllo positivo era verde su una cosa mai provata. L'ha
smascherato il **controllo negativo** («una parola che non esiste non trova
niente»), che è rimasto rosso. ⭐ Ogni controllo di un filtro vuole il suo
negativo, o non sta misurando il filtro.

### Link pubblico di una commessa (migration `20261006110000`)

Un indirizzo da mandare al cliente che mostra **titolo, eventualmente i dettagli, e la libreria foto/video**. Rotta `/c/[token]`, media da `/api/pubblico/[token]/media/[fileId]`, entrambe escluse dal middleware.

> **Chi ha l'indirizzo entra.** Niente password: e' il punto, altrimenti non si potrebbe mandare in un messaggio. Quindi l'indirizzo **e'** il segreto: 32 byte casuali, in tabella solo lo SHA-256, scadenza a 30 giorni, revoca immediata, contatore delle aperture, **uno attivo per commessa** imposto da un indice unico.
>
> ⚠️ `commessa_link_pubblici` ha RLS accesa e **nessuna policy permissiva**, piu' `revoke all from anon, authenticated`. Non e' una dimenticanza: ci accede **solo il service role**, perche' la pagina pubblica una sessione non ce l'ha per definizione.
>
> ⚠️ **I campi vietati non sono nascosti: la query non li legge.** Telefono, indirizzo, mappa, cliente, stato, codice e documenti non arrivano fino alla pagina, cosi' nessuno li fa comparire aggiungendo una riga a un componente.
>
> ⚠️ **Non usare `risolviTitoloCommessa` su superfici pubbliche.** Ripiega su `note_iniziali` (la dettatura del capo, che finirebbe fuori **anche con i dettagli disattivati**) e poi su `nome_cartella`, che ha dentro il nome del cliente. Il titolo pubblico si compone a mano in `c/[token]/page.tsx`. Un ripiego comodo diventa una fuga di dati appena cambia il pubblico.
>
> I **dettagli** sono una scelta per singolo link, non una regola nel codice, e il pannello mostra il testo per intero sotto la casella: non si condivide per sbaglio un telefono che si e' appena letto. Sorveglianza cross-tenant in `/admin/link-pubblici`.

### Foto: anteprime persistenti su R2

Le gallerie immagini (PWA mobile, office riunioni, foto-tab) servono **thumb 400×400 webp ~30 KB persistenti su R2** invece del full-size 3-5 MB proxato da Nextcloud.

- **Generazione**: hook fire-and-forget nel `/api/upload/media/[id]/complete` chiama `generateAndUploadThumb()` (helper `apps/web/app/_lib/thumbnails.ts`). Solo `mime image/*`, usa `sharp ^0.33.5`.
- **Path R2**: `{stesso_path_originale}/thumbs/{shortId}.webp` — derivato via `deriveThumbKey()`.
- **DB**: colonna `file_refs.r2_thumb_key text` (migration `20260528010000`).
- **Endpoint**: `/api/photo/[id]?size=thumb` redirect 302 a signed GET R2 5min TTL; fallback al full-size proxy se thumb mancante (foto vecchie funzionano comunque).
- **Backfill**: POST `/api/admin/thumbs/backfill` con header `X-Internal-Backfill-Secret: $CRON_SECRET`, body `{limit?, dryRun?}`.
- **Admin osservabilità**: `/admin/media` mostra `% thumb generate` + flag visivo per riga (synced+thumb → riga emerald).
- **Video**: NON gestiti (`sharp` non li supporta). Restano su `<video preload="metadata">`. Futuro: ffmpeg-server o frame extraction client-side.

### Limiti di invio media, configurabili (migration `20261005090000`)

Quanti file per volta e quanto può pesare una foto / un video / un PDF **non sono più costanti nel codice**: sono dato su tre livelli, e il default del conteggio è passato da 30 a **50**.

| Livello | Dove | Chi lo cambia |
|---|---|---|
| **Tetti tecnici** | `packages/api/src/limiti-upload.ts` (`TETTI_UPLOAD`) | nessuno: paracadute contro il refuso |
| **Default globale** | `platform_settings`, riga `limiti_upload` | super admin, card in `/admin/media` |
| **Override per tenant** | `tenants.upload_config` | super admin, tab **Upload** di `/admin/tenants/[id]` |

Una chiave **assente eredita** il livello sopra, non azzera: `{}` significa «fai come dice il globale», ed è perché l'apply non ha cambiato il comportamento di nessun tenant. Logica pura e testata in `@kommessa/api/limiti-upload` (`risolviLimitiUpload`, `validaLimitiUpload`, `applicaLimitiAConfig`, `sogliaAvvisoNumero`, `sogliaAvvisoVideoMb`), 30 asserzioni.

> ⚠️ **`platform_settings`: mai un segreto.** È leggibile dagli utenti autenticati (serve: il selettore file deve sapere cosa accetta) e la policy elenca le chiavi pubbliche una per una (`chiave IN ('limiti_upload')`), così una chiave nuova nasce **non** leggibile. Chiavi API e token restano in env.
>
> ⚠️ **`audit_events.tenant_id` è ora NULLABLE** = evento di **piattaforma**, nessun cliente. Serviva: con il `NOT NULL` il salvataggio del default globale non lasciava **nessuna** traccia (l'insert veniva rifiutato e l'errore moriva nel best-effort di `auditPlatform`, che non guardava l'esito perché supabase-js non solleva). Ora `auditPlatform` **logga** i fallimenti: resta best-effort, non è più muto.

- **Due atteggiamenti opposti, ed è voluto**: in **lettura** (`risolviLimitiUpload`) si taglia ai tetti in silenzio e non si solleva mai — un dato storto nel database non deve impedire a un tecnico di caricare le foto del cantiere; in **scrittura** (`validaLimitiUpload`) si **rifiuta** dicendo campo e bordo, perché tagliare di nascosto il numero che un umano ha appena battuto nel pannello gli fa credere di aver salvato altro.
- **Come arriva al browser**: reader server `_lib/limiti-upload-server.ts` (`server-only` + `cache()`, tollerante alla colonna assente come `tenant-features.ts`) → context `_components/limiti-upload-provider.tsx` montato nei **due gusci** (`office/layout.tsx`, `mobile/layout.tsx`) → `useLimitiUpload()`. Si aggancia una volta per guscio invece di passare prop lungo cinque alberi di componenti; **fuori dai gusci** (banco `/prova-upload`) valgono i valori di sicurezza.
- ⚠️ **Il conteggio file misura la SELEZIONE in corso, non la commessa.** Dove la lista resta in piedi fino al salvataggio (creazione commessa, wizard sopralluogo, dettatura) il limite è di fatto cumulativo; dove i file vengono accodati e la lista si svuota (tab Scatto, tab Media) è un limite per infornata, ripetibile. Non è un tetto di foto per commessa.
- ⚠️ **Il tetto dei video ha due bordi sopra di sé, e vince il più basso**: `MAX_SIZE_BYTES` = **2 GiB** nello schema zod di `api/upload/media/init/route.ts` (oltre, l'init risponde `400 Body non valido` e l'utente vede un errore tecnico su un file che il pannello gli ha detto di poter caricare) e `SYNC_MAX_BUFFER_BYTES` = 5 GiB in `_lib/sync-r2-to-nextcloud.ts`. Il vincolante è il primo, quindi `TETTI_UPLOAD.maxVideoMb` sta a **2000 MB** (1,86 GiB). Alzandolo, alzare PRIMA quel cap. Riferimento incrociato annotato in entrambi i file.
- 📘 **Manuale**: `documentazione_generale/08_LOGICHE/Logiche_Upload_Media.md` §8. Cose **lasciate aperte di proposito** (nessun presidio lato server, allegati riunione limitati solo nel video, scanner PDF che scavalca): `08_LOGICHE/Osservazioni_Audit_2026-10-05.md`.
- **Niente seconde verità**: la vecchia `VIDEO_MAX_SIZE_BYTES` (500 MB) di `_lib/upload-queue/types.ts` è stata **rimossa** — era un limite indipendente usato dai tre percorsi degli allegati riunione, che avrebbero continuato a rifiutare a 500 MB dopo un cambio nel pannello. Aggiungendo un nuovo punto di ingresso file, leggere i limiti da `useLimitiUpload()`, non scrivere un numero.

### Password che scade, zoom delle foto, autore, due colonne

Otto punti dopo il secondo giro di prova del cliente. Migration
`20261009090000`. Cio' che resta vero:

- **La password scade quattro volte l'anno**, date fisse: 10 dicembre, 10
  marzo, 10 giugno, 10 settembre. ⚠️ **Si accende per cliente**
  (`tenants.features.scadenza_password`, nasce **spenta**): le date le ha
  scelte un'azienda, il muro lo prendono le persone, e accesa per tutti il 10
  dicembre trentacinque tecnici di un altro cliente si troverebbero bloccati
  davanti a un QR in cantiere per una regola che nessuno gli ha annunciato.
  Accesa su BER e DEMOK l'08/10. Dal **primo del mese** si avvisa
  (riga fissa nel guscio + popup **una volta al giorno**, perche' il numero di
  giorni cambia ogni giorno); dal giorno della scadenza non si passa.
  ⭐ **Una regola sola**: la scadenza che riguarda una persona e' la prima data
  del calendario che la sua password non ha soddisfatto, e una data e'
  soddisfatta se la password e' stata scelta **dentro la finestra di avviso**.
  Cambiarla il 3 dicembre vale per il 10 — altrimenti l'avviso non servirebbe a
  niente. ⚠️ Il contrario di una finestra e' un bordo: chi la cambia il 30
  novembre viene riavvisato il primo dicembre. E' il prezzo delle date fisse, in
  cambio tutta l'azienda ha la password nuova dal 10.
  ⚠️ **`password_changed_at` era scritta da tre strade e letta da nessuna**:
  esisteva dal 07/10 e non compariva in nessuna `select`. Terzo caso di «scritto
  e mai letto» in due giorni.
  ⚠️⚠️ **L'orologio ha tre ripieghi in fila, e togliendone uno si mura
  qualcuno**: la data in cui l'ha scelta, altrimenti la nascita dell'account,
  mai prima di `REGOLA_DAL` (il giorno in cui la regola esiste). Senza il
  secondo, un tecnico assunto a febbraio e fatto entrare *senza muro* (la
  scelta dell'08/10) si troverebbe murato al primo accesso; senza il terzo, ci
  si troverebbe tutta l'azienda il mattino del deploy — `password_changed_at`
  e' NULL su tutti e cinquantaquattro gli utenti che c'erano. Regola pura in
  `@kommessa/api/scadenza-password` (25 asserzioni, **viste fallire**: 5 rosse
  togliendo la finestra, 7 togliendo il pavimento). Verificato sui dati veri:
  tutti e 65 gli utenti attivi dei quattro clienti partono dal 07/10, prima
  scadenza **10 dicembre 2026**, nessuno bloccato oggi.
  ⚠️ **Un cancello solo per due ragioni**: `obbligato = must_change_password ||
  scaduta` dentro `statoPassword()`, cosi' i **quattro** presidi che gia'
  sbarrano la strada (i due gusci, `/t/[token]`, la pagina del cambio) non si
  toccano. ⚠️ E resta **fail-open**: un errore di lettura che diventasse
  «scaduta» chiuderebbe fuori l'azienda nello stesso istante.
  ⚠️ Il testo della pagina del cambio ha **tre** versioni (password
  dell'ufficio / scaduta / scelta tua): dire la frase sbagliata fa sembrare
  l'applicazione rotta.
- **Le foto si ingrandiscono, in tutta l'applicazione.** ⚠️ Lo zoom del browser
  qui e' **spento di proposito** (`maximumScale: 1`, `userScalable: false`,
  `touch-action: manipulation`): in cantiere un pizzicotto coi guanti lascia la
  pagina storta, ed e' una scelta del cliente. Quindi lo zoom vive **dentro il
  visore**, dove l'unica cosa che si muove e' l'immagine: pizzicotto a due dita,
  rotellina, doppio clic, piu' i **tasti +/−** per chi non prova nessuno dei
  due (uno zoom nascosto in un gesto che nessuno annuncia e' uno zoom che non
  esiste). Conti puri in `@kommessa/api/zoom-foto` (22 asserzioni): ⭐ il punto
  sotto le dita resta fermo (senza, si pizzica un angolo e quello che si voleva
  vedere scappa via) e ⭐ lo spostamento si ferma dove la foto finisce (e' cio'
  che rende inservibili i visori fatti in casa: la foto scorre via e non si sa
  come riportarla). Motore unico: `_components/foto-zoomabile.tsx`
  (`FotoZoomabile` + `VisoreFoto`), innestato in `MediaLightbox` (7 superfici),
  nella galleria del link pubblico, nella ricevuta di una spesa e — dove una
  foto c'era e **non si poteva aprire affatto** — nelle anteprime dei file in
  coda (`media-attach-section`, che copre creazione commessa, Scatto, tab Foto,
  sopralluogo e dettatura) e negli allegati di una riunione.
  ⚠️ **Tre trappole, tutte gia' costate tempo qui**: `react-remove-scroll`
  annulla ogni `wheel`/`touchmove` che non venga da dentro il dialog (si ferma
  l'evento prima, ascoltatore **nativo** `passive: false`); il gesto del dito
  vuol dire due cose e vince lo stato (`puoScorrereFraLeFoto`); e `VisoreFoto`
  sta su `body`, quindi vuole `pointerEvents: 'auto'` **e** la marcatura
  `data-popover-portale`, o dentro un dialog Radix si vede e il dito ci passa
  attraverso. ⚠️ **Un `useState` dopo un'uscita anticipata** in
  `media-lightbox.tsx`: trovato dal build, non rileggendo il codice.
  ⚠️ Lasciate fuori di proposito le foto mostrate **mentre** qualcosa le
  elabora (invio spesa, analisi OCR, scatto del QR): sotto una rotella, per due
  secondi, lo zoom non vuol dire niente.
- **Chi l'ha creata si vede.** `commessa_todo.created_by` era popolata su tutte
  le righe da sempre e si leggeva **solo** dentro la scheda di una commessa
  d'ufficio. Ora: nella board (riga, col mestiere di chi smista), nella scheda
  del telefono (nel dettaglio: sul telefono non si smista, si fa) e sulla
  richiesta («Registrata da», prima il nome era appiccicato alla data senza
  dire che cosa fosse). ⭐ **Un campo diventa un presidio nel momento in cui
  qualcuno lo legge**: il trigger `commessa_todo_tecnico_guard` non proteggeva
  `created_by` — ne' `cliente_id`, `cliente_testo`, `contatto`, `indirizzo`,
  cioe' le colonne delle richieste, aggiunte **dopo** che quel trigger era
  stato scritto. Riscritto per intero (migration `20261009090000`).
- ⭐ **«In mano a» e «Ci va» erano giusti come modello e sbagliati come
  parole.** A schermo si leggeva «In mano a: Nessuno» con, una riga sotto, «Ci
  va: Mario»: due modi di dire casalinghi che sembravano smentirsi su una
  richiesta semplicemente girata a Mario. Vocabolario unico in
  `@kommessa/api/assegnazione` (11 asserzioni): **Responsabile** (⚠️ non
  «tecnico assegnato»: chi ne risponde non e' per forza un tecnico — in
  Bertaiola il caposquadra ha ruolo `office`) e **Tecnico assegnato / Tecnici
  assegnati**. ⭐ **E la riga vuota non si scrive**: una riga senza valore non
  e' un'informazione, e' un punto interrogativo in piu'. Le stesse parole sulla
  colonna dell'elenco commesse, che era «In mano a» e accanto allo stato «Non
  presa» si leggeva male — ⚠️ chiusa l'ambiguita' «Non preso»/«Non presa» che
  era annotata come aperta.
- **Due colonne, perche' sono due mucchi** (`/office/todo`, ora «Task e
  Richieste»): Task a sinistra (65%, tinta blu) e Richieste a destra (35%, tinta
  ambra). Prima era un elenco solo con le richieste in cima **perche' ordinate
  prima**, e nessuno poteva sapere se fosse una regola o un caso. ⚠️ Con due
  colonne sempre visibili **il filtro «Tipo» non ha piu' senso** e si poteva
  svuotare una colonna da un filtro che sta altrove: tolto. ⚠️ Il badge
  «Richiesta» sulla riga: tolto, lo dice la colonna. ⚠️ Si affiancano da `xl`:
  sotto, con i 220px dei filtri, la colonna stretta scenderebbe sotto i 300px e
  le sue due tendine non ci starebbero. La tinta e' **ambra**, come la barretta che
  le richieste hanno sulla scheda del telefono. ⚠️ Ma l'intestazione della
  scheda, sempre sul telefono, usa `--accent` (#F26B23): **due arancioni per
  la stessa cosa**, a 16 gradi di distanza. Censimento completo fatto l'08/10:
  7 punti ambra, 12 punti `--accent`. Da unificare quando si decide quale —
  `--accent` costerebbe meno (e' un token, segue il tema), l'ambra e' quella
  che la memoria della densita' d'ufficio dichiara parte della tavolozza.
  Di contorno, sulla stessa pagina: aggiunto il `loading.tsx` che mancava (era
  `force-dynamic` senza), tolto il doppio margine (la pagina si stringeva di
  360px: ⭐ i margini li mette il guscio), via «TODO» dalle scritte, e l'empty
  state non cita piu' un pulsante che non esiste.
- **Un posto solo dice le voci del menu.** La barra dell'ufficio nel mondo
  commesse era una lista piatta di nove voci; ora ha le macrofamiglie come il
  mondo presenze: **Dashboard** in alto da sola, **Progetti** (Commesse,
  Clienti, Task e Richieste), **Personale**, **Altro**. ⚠️ `injectPersonale`
  ora **si aggiunge** a una sezione che esiste gia' invece di crearne una
  seconda con lo stesso id. ⚠️ E la palette ⌘K aveva un **secondo elenco
  scritto a mano** «che riflette la nav»: non la rifletteva — aveva *Tickets*,
  che in barra non c'e' per nessuno, e **non aveva** Task, Turni, Co-pilot,
  Kontabilita', Personalizzazioni, Gestionale, Sedi, Parco mezzi, Ore e costi,
  Report, Registro modifiche. Ora le voci «Vai a» si **appiattiscono dalla
  barra** (e col filtro per moduli in regalo), piu' un elenco corto e
  dichiarato di pagine che in barra non ci sono.
- ⚠️ **Il terzo tetto scelto a occhio in tre giorni.** `.limit(120)` sulla
  lista commesse del telefono (su un cliente che ne ha oltre duecento): non
  «le ultime 120 e poi si scorre», le altre **non esistevano**, nemmeno per la
  ricerca, che lavora in memoria su cio' che e' arrivato. E il contatore
  scriveva «120 attive nel tenant», cioe' un numero falso. Dal computer si
  vedevano tutte (la pagina d'ufficio e' paginata): la stessa domanda aveva due
  risposte a seconda di dove la facevi. Sistemati con `leggiTutto`/`leggiPerId`
  anche `.limit(300)` sulla board e `.limit(200)` **senza ordinamento** sulle
  commesse del tecnico (non duecento ultime: duecento qualsiasi).

## Accessi, identità e avvisi

### Accessi, poteri veri, cose da fare

- **Un posto solo crea gli account**: `app/_actions/account.ts`. Prima erano
  CINQUE strade (due inviti per posta, tre creazioni manuali), ognuna con la sua
  copia delle regole sull'username e la sua formula per l'alias. Il contratto
  dell'identita' sta in `@kommessa/api/identita`: regole username, formula
  `<utente>@<sigla>.kommessa.local`, policy password, e la composizione della
  password temporanea — sillabe pronunciabili senza i caratteri che si
  confondono a voce (l/1, q/g, v/b, 0/O): `Tabero47`. Il risolutore del login
  **importa** quelle regole invece di riscriverle.
- **`must_change_password`**: cancello nei due gusci (ufficio e telefono),
  pagina `/cambia-password`. ⚠️ Su `public.users` i grant sono a livello di
  **TABELLA**, non per colonna come su `tenants`: una colonna nuova nasce
  scrivibile dall'utente stesso, e la difesa va nel trigger
  `users_proteggi_privilegi`, mai nel grant. ⚠️ La pagina colma un buco piu'
  grosso del primo accesso: **nessun utente di nessun cliente poteva cambiarsi
  la password** — l'unico modulo ce l'aveva il super admin.
- **Poteri veri al posto di un pannello che non faceva niente**: il sistema di
  permessi a 7 aree x 4 livelli **non era letto da nessuna riga di codice** (0
  utenti su 54 lo avevano compilato). Sostituito da `@kommessa/api/capacita`,
  con una voce sola — `capo_squadra` — e un posto che la legge. ⭐ **Criterio
  per aggiungerne una**: non «sarebbe comodo poterlo decidere», ma «c'e' una
  riga di codice che la legge e si comporta di conseguenza».
- **Aprire un lavoro e' un potere, non un ruolo**: `creaCommessa` guarda
  `capo_squadra`. ⚠️ Dall'08/10 le riunioni **non** lo guardano piu' (vedi
  sotto): `capo_squadra` vuol dire «aprire un lavoro NUOVO», non «lavorare
  dentro un lavoro». Chi non ce l'ha
  non vede il microfono al centro della barra: al suo posto un casco spento che
  al tocco dice a chi rivolgersi. Lo slot **non sparisce** — una barra che
  cambia numero di tasti a seconda di chi guarda disorienta.
- **Scrivere una riunione e' di ogni tecnico in squadra** (migration
  `20261008110000`). ⚠️ **E modificarla**: il riassunto dell'AI non si scrive
  alla creazione — la riunione nasce prima e il riassunto arriva subito dopo
  con `aggiornaRiunione`. Aperta solo la creazione, per un tecnico la riunione
  si salvava, le cose da fare si creavano e **il riassunto spariva in
  silenzio** (il client non ne guardava nemmeno l'esito). Successo davvero, su
  due riunioni vere, prima che qualcuno se ne accorgesse. ⭐ **Aprire un
  permesso vuol dire aprirlo per tutto il gesto, non per la prima chiamata del
  gesto.** Banco: `scripts/banco-ui/riunione-tecnico.mjs`. Una riunione qui non e' un verbale: e' il sopralluogo
  raccontato, cioe' lavoro **dentro** una commessa gia' assegnata, come una
  cosa da fare. ⚠️ Prima non poteva **nessun tecnico**, nemmeno un capo
  squadra: `commessa_riunione_write` ammetteva solo admin e ufficio, quindi il
  controllo applicativo lasciava passare un capo squadra e poi il database lo
  fermava. Puo' scriverne e correggere **le proprie**, solo sulle commesse su
  cui e' in squadra; cancellarne resta dell'ufficio (una riunione e' storia del
  lavoro). I todo che ne nascono non si assegnano a un collega: lo impedisce
  gia' la RLS dei todo, e l'azione toglie l'assegnatario **prima** di scrivere,
  perche' il messaggio «violazione di policy» non e' una cosa che una persona
  possa correggere.
- **Scrivere una cosa da fare e' di ogni tecnico in squadra** (migration
  `20261007100000`), senza assegnatario. ⚠️ Chiuso un buco: a livello di
  database un tecnico poteva spuntare **qualunque** cosa da fare dello spazio
  di lavoro — il filtro «solo le mie» viveva nella pagina, e una pagina non e'
  un presidio.
- **«Momento» si chiama «Fase lavori»**, e il campo «Fase» non c'e' piu':
  `file_refs.voce_id` era valorizzato su **0 file su 346**. Con lui sono stati
  ritirati `fase_target_raggiunto` e `fase_zero_foto` (migration
  `20261007110000`): senza il campo il contatore resta a zero per sempre e il
  cron avrebbe gridato «fase senza foto» in eterno su commesse piene di foto.
  Vocabolario unico in `@kommessa/api/fase-lavori`.
- **Il personale non e' una cosa del mondo presenze**: l'anagrafica si e'
  spostata in **Personale → Dipendenti** (`/office/personale/dipendenti`), e
  cio' che riguarda i turni compare solo dove si timbra. Il vecchio indirizzo
  rimanda dal **middleware**. Nuova **Attivita' per persona** (cose spuntate,
  foto caricate, registro): i dati c'erano tutti, nessuna pagina li interrogava
  per persona. ⚠️ `pianificazione_attiva` resta spenta sui tenant commesse:
  `pianificazione_blocchi.cantiere_id` e' una chiave esterna rigida su
  `cantieri`, e un tenant del mondo commesse ha commesse.
- **Profilo PWA**: via la matrice «cosa, quando, come» (7 eventi x 3 canali) e
  le ore di silenzio. Non per alleggerire: governavano `/api/push/send-internal`,
  che **non ha nessun chiamante**, e le sottoscrizioni push sono **zero su
  tutti e quattro i clienti**. ✅ L'08/10 l'invio e' stato collegato e il
  pannello e' tornato — con un interruttore per avviso invece di ventuno
  caselle, e solo per gli avvisi che qualcuno manda davvero.
- **Notifiche**: `commessa_assegnata` esisteva da marzo, compariva nelle
  preferenze, e **nessuno la mandava**; un'azione in blocco ne mandava una con
  un nome diverso (`commessa_assigned`, in inglese, non registrato). Ora
  `assegnaTecnico` avvisa, il nome e' uno, e le etichette stanno in un posto
  solo (`_components/notifiche-meta.tsx`) con **solo i tipi che qualcuno manda
  davvero**.
- **Funzioni per-tenant gestibili dall'ufficio**: `/office/impostazioni/funzioni`.
  Il registro dice quali sono dell'ufficio (`gestibileDaUfficio`) e quali
  restano nostre. Prima funzione cosi': **Turno in cantiere**, che nasce spenta
  (usata una volta in tutto, su un tenant di prova).

> ⚠️ **Un `redirect()` sotto `<Suspense>` lascia una pagina bianca.** Con un
> `loading.tsx` accanto — e ce l'ha ogni pagina dell'app — la risposta e' gia'
> partita quando la pagina renderizza: l'indirizzo resta quello e si vede solo
> la barra in basso. **Misurato, non dedotto**: il banco
> `scripts/banco-ui/tecnico-poteri.mjs` ha bocciato la prima versione. Per
> negare l'accesso a una pagina si usa `mobile/_components/non-abilitato.tsx`
> (che spiega) oppure il **middleware** (dove il reindirizzamento e' una
> risposta HTTP e basta). La stessa nota c'era gia' per la landing dell'app, e
> non e' bastata a non ricascarci.

### Un posto solo fa nascere un account

`app/_actions/_lib/account-core.ts` → `faiNascereUnAccount()`. **Tutte** le
porte passano di qui: l'ufficio (nome utente, invito), il pannello di
piattaforma (crea manuale, nuovo utente con email, invito) e l'amministratore
che nasce insieme a un cliente nuovo. La funzione **non decide chi puo'**: la
guardia la mette chi chiama. Qui sta solo *come* nasce un account.

⚠️ Prima erano **otto strade** e solo due unificate. Cosa divergeva, contato:
- **Quattro su sei non scrivevano `must_change_password`**: un account creato
  dal pannello con password dettata a voce restava su quella per sempre. Lo
  stesso valeva per `impostaPasswordManuale`.
- `tenant_slug` mancante nei claim di un percorso (`requireTenantContext`
  solleva finche' il trigger non ripara).
- `invite_sent_at` scritto da uno solo dei tre inviti: gli altri due
  risultavano a schermo come «mai invitati».
- Due percorsi lasciavano l'**utente Auth orfano** se l'inserimento del profilo
  falliva; uno — l'owner di un cliente nuovo — **non leggeva nemmeno l'esito**
  e rispondeva «fatto».
- `cambiaRuoloTenantUser` accettava **qualunque stringa** come ruolo.
- Il controllo «questa email e' gia' di un altro cliente» lo faceva uno solo.
- Quattro nomi nell'audit per «e' nato un account» e due `entity_type`.

⚠️ **Il cancello del primo accesso copre anche `/t/[token]`**: il tecnico di un
cliente del mondo presenze vive sulla timbratura da QR, fuori dai gusci
`/office` e `/mobile`. Senza, poteva timbrare all'infinito sulla password
dell'ufficio.

### Password provvisoria ed elenco del tecnico

Lavorato nella notte del 07/10; la squadra di Bertaiola entra per la prima
volta l'08/10 (migration con quel prefisso). Le cose che restano vere:

- **Lo stato della password e la policy sono due colonne** (migration
  `20261008090000`). `password_provvisoria` dice che la password in uso l'ha
  scelta qualcun altro; `must_change_password` dice che per questo non si
  passa. Coincidevano finche' l'unica risposta allo stato era il blocco: dal
  momento in cui si vuole far entrare qualcuno **senza muro ma dicendoglielo**,
  una colonna sola non basta a scrivere il caso. Invariante: bloccato implica
  provvisorio, non il contrario. La regola che combina «nato per invito» e
  «blocco o promemoria» sta in `statoPasswordAllaNascita`
  (`@kommessa/api/identita`), condivisa fra il nucleo degli account e lo script
  a riga di comando — che e' l'ottava strada e non puo' importare il nucleo
  (`server-only`): **non si unifica il client, si unifica la decisione.**
  ⚠️ Su `public.users` i grant sono a livello di TABELLA: la colonna nuova
  nasce scrivibile dall'utente stesso, e un promemoria che il destinatario puo'
  spegnere senza fare la cosa che chiede e' peggio di niente. La difesa sta nel
  trigger `users_proteggi_privilegi`. ⚠️ Gli utenti che c'erano restano a
  `false` di proposito: dichiarare provvisoria la password che l'ufficio usa da
  maggio aprirebbe l'app con un avviso in faccia a tutti, e **un avviso che
  compare a tutti e' un avviso che si impara a non leggere.**
- **La home del tecnico si chiama «Commesse»**, come la tab in basso e come la
  sezione dell'ufficio. «OGGI» prometteva una giornata e mostrava tutto. Un
  elenco solo con ricerca, tre pastiglie (Tutto · Commesse · Da fare) e
  l'ordine **scritto a schermo**: un elenco ordinato per una regola che non si
  vede e' un elenco di cui non ti fidi. Filtro, ricerca e ordine sono puri e
  provati in `@kommessa/api/elenco-lavoro`. La regola: cio' che ha una data
  entro cui va fatto viene prima, dalla piu' vicina; il resto segue
  nell'ordine in cui e' stato affidato, dall'ultimo. ⚠️ Le scadenze passate
  salgono in cima **da se'** (una data passata e' un numero piu' piccolo):
  nessun ramo a parte, cioe' nessun posto in piu' dove sbagliarsi. ⚠️ Chi non
  ha nemmeno la data di affidamento scende in fondo invece di finire in testa
  come farebbe uno zero.
  ⚠️ **Due dati erano gia' in tabella e si buttavano via**: `assegnato_at` di
  `commessa_tecnici` e le cose da fare **senza assegnatario** (la home guardava
  solo `assegnato_a = me`, quindi quelle «di chiunque passi» non comparivano).
  Il predicato e' ora **scritto identico** a quello della scheda commessa: due
  predicati diversi farebbero comparire una cosa da fare in un posto e non
  nell'altro, e nessuno saprebbe quale ha ragione.
- **Lato ufficio si vede CHI, non solo SE**: colonna «In mano a» nell'elenco
  commesse (due nomi e il resto contato; il caso vuoto dice «Nessuno»).
  L'elenco leggeva `commessa_tecnici` e se ne faceva un si'/no per l'etichetta
  «Non preso»: diceva «preso» senza dire da chi, e per saperlo bisognava aprire
  le commesse una per una. ⚠️ **Da decidere**: lo stato `aperta` si legge «Non
  presa» e accanto a «In mano a: Mario» si legge male — due etichette che
  differiscono per una lettera («Non preso» = nessuno, «Non presa» = lo stato)
  e vogliono dire cose diverse.
- **Condividere un lavoro: non funzionava, per nessuno.** Il componente stava
  dentro il Portal del menu «⋯»; al tocco impostava il proprio stato e chiudeva
  il menu, React batcha i due aggiornamenti, il Portal si smontava e lo stato
  appena impostato moriva con lui. ⭐ **Nel menu stanno i tasti, non lo stato.**
  Secondo difetto emerso spostandolo fuori: finiva dentro l'`Hero`, che ha
  `overflow-hidden` — ora il dialog va su `document.body`.
  ⚠️ **`navigator.share` non si puo' chiamare dopo un `await`**: vale solo
  finche' vale l'attivazione dell'utente, e un giro di rete la consuma. Quindi
  **due tocchi** (il primo crea il collegamento, il secondo lo manda) e nel
  secondo nessun `await` fra il click e la chiamata. Gli appunti si scrivono
  **prima** della share, perche' share consuma l'attivazione e dopo WebKit
  rifiuterebbe la scrittura. `AbortError` non e' un guasto.
  Testo: **«Condividi il lavoro»**, e via ogni «cliente» — il collegamento non
  va per forza al cliente.

### Fatti pagati facendo la commessa dimostrativa (ritirata il 26/10/2026)

`scripts/demo/crea-commessa-demo.ts` e `togli-commessa-demo.ts`, dry-run di
default.

> ⚠️ **Non chiama `genera_codice_commessa`**: quella funzione brucia il numero
> progressivo anche quando l'inserimento successivo fallisce, e il contatore
> delle commesse vere non deve avere buchi per una dimostrazione. Il codice
> `BER-DEMO-01` sta fuori dallo schema `BER-26-NNN`.
>
> ⚠️ **Il video si converte in H.264/mp4.** Wikimedia Commons tiene i filmati
> in WebM, che su iPhone si riproduce solo da Safari 17.4 in avanti.
> `-pix_fmt yuv420p` (i profili 4:2:2 non li decodifica l'hardware e si cade su
> un riquadro nero senza errori) e `-movflags +faststart` (sposta l'indice in
> testa: senza, il telefono scarica tutto il filmato prima del primo
> fotogramma).
>
> ⚠️ **Ogni media ha la sua miniatura, video compreso**: con `status='synced'`
> il cron non va a cercare i file su Nextcloud (dove non ci sono), ma
> `/api/photo/<id>` senza `r2_thumb_key` ripiegherebbe proprio su Nextcloud.
>
> ⚠️ La chiave R2 ha il **codice due volte**
> (`.../BER-DEMO-01_BER-DEMO-01_Cliente_Lavoro/...`): non e' un refuso da
> aggiustare, e' la forma vera: `buildR2Key` mette il codice davanti e poi il
> nome cartella, che il codice ce l'ha dentro. Verificato sulle chiavi reali.

> ⚠️ **Il codice azienda NON e' la sigla, e `login_senza_codice` non vuol dire
> «non ha un codice».** Per Bertaiola la sigla e' `BER` ma il codice e'
> **`BERTAIOLA`**: battendo `BER` il login risponde «codice azienda non
> valido». Misurato con un account vero, non dedotto.
>
> `login_senza_codice = true` vuol dire «e' il cliente **predefinito**»: a
> campo vuoto il risolutore cerca il tenant con quel flag, e un indice unico
> parziale garantisce che ce ne sia **uno solo**. Quindi il campo vuoto non e'
> ambiguo — ma dipende da un flag che un domani puo' spostarsi su un altro
> cliente, e chi ha imparato «campo vuoto» resterebbe fuori senza capire
> perche'. **Sul foglio delle credenziali va il codice**, con «si puo' anche
> lasciare vuoto» come nota.
>
> Nessun rischio di collisione fra aziende: l'identita' vera e'
> `<utente>@<sigla>.kommessa.local`, quindi un `luca.ottoboni` di un altro
> cliente e' un altro account. Il codice serve solo a dire **da quale azienda
> vieni**, non a rendere unico il nome utente.

### Lo script che consegna gli accessi

`scripts/crea-utenti-da-file.ts`.

> ⚠️ **Il segno di codifica che Excel mette in testa a ogni CSV mangia i primi
> caratteri della prima cella.** Misurato: `"Nome"` arriva come `"me"`, e
> nessun taglio di stringa li rimette perche' non ci sono piu'. L'effetto era
> un'intestazione non riconosciuta come tale, cioe' una persona di nome «Nome»
> con nome utente «Utente» creata per prima nell'elenco. `codepage: 65001` non
> basta: un CSV si decodifica prima e si passa alla libreria come testo.
>
> ⚠️ **Il campo «utente» accetta una casella vera.** Senza, per chi ha un
> accesso da prima con la posta aziendale lo script costruiva l'alias
> `nome@sigla.kommessa.local`, non trovava niente, e gli **creava un secondo
> account**. A chi esiste l'accesso non si tocca, ma la scheda del personale
> gliela si fa se manca.

### Vocabolari unici, e come si riconosce quello che manca

Al 07/10/2026 i vocabolari condivisi sono: `priorita`, `fase-lavori`,
`capacita`, `identita` (username, alias, password, **etichette dei ruoli**),
`notifiche-meta` (etichette degli avvisi). Il segnale che ne serve uno nuovo e'
sempre lo stesso: **la stessa parola scritta in piu' di due posti, con rese
diverse**. In un giorno ne sono emersi cinque, e in tre casi uno dei posti
mostrava il valore grezzo del database a schermo.

> ⭐ **Un pannello che promette e non fa niente e' peggio di nessun pannello.**
> Ne sono stati trovati tre in un giorno: i permessi per utente (7 aree × 4
> livelli, **zero** utenti su 54 lo avevano compilato, nessun gate lo
> leggeva), le preferenze notifiche nel profilo (governano
> `/api/push/send-internal`, che **non ha chiamanti**, e le sottoscrizioni push
> sono **zero** su tutti e quattro i clienti), e il campo «Fase» (valorizzato
> su **0 file su 346**). Il danno non e' il codice morto: e' che chi compila
> crede di aver deciso qualcosa.
>
> **La regola per aggiungere una voce a un pannello di impostazioni**: non
> «sarebbe comodo poterlo decidere», ma **«c'e' una riga di codice che la legge
> e si comporta di conseguenza?»**. Se non c'e', la voce non si aggiunge.

### Bacheca: la pagina da televisione (migration `20261007130000`)

Un indirizzo per cliente da aprire sul televisore dell'ufficio: una casella per
persona, dentro quello che le resta da fare. Rotta `/tv/[token]`, esclusa dal
middleware. Si accende da **Impostazioni → Bacheca**.

> **Due strati, e diversamente dal collegamento di una commessa.** Li'
> l'indirizzo **e'** il segreto, perche' deve finire in un messaggio a un
> cliente. Qui l'indirizzo vive per mesi su uno schermo in una stanza di
> passaggio: quindi indirizzo casuale **piu'** password (scrypt con sale per
> riga, mai rileggibile), sessione di 30 giorni, e un freno ai tentativi (10,
> poi 15 minuti) perche' chi ha l'indirizzo puo' provarle a raffica.
>
> ⚠️ **Il cliente lo decide la riga trovata dall'indirizzo, mai il cookie.** Un
> biglietto firmato con un `tenantId` diverso ma l'indirizzo giusto apriva i
> dati di un altro cliente. Non sfruttabile da fuori (per firmare serve la
> chiave del server), ma era il difetto di fidarsi di cio' che il cookie
> afferma invece di cio' che la riga dice. Trovato provando, non leggendo.
>
> ⚠️ `bacheche_pubbliche` ha RLS accesa e **nessuna policy permissiva**, piu'
> `revoke all from anon, authenticated`: ci accede solo il service role.
> ⚠️ **I campi vietati non sono nascosti: la query non li legge** — niente
> clienti, telefoni, indirizzi, foto. Prima della password non si vede nemmeno
> di chi e' la bacheca.
>
> Serve a entrambi i mondi: dove non ci sono cose da fare (FPM ne ha zero)
> mostra la **pianificazione di oggi**. Logica pura in `@kommessa/api/bacheca`.

### Le notifiche push (migration `20261008100000`)

**Un mittente solo**: `app/_actions/_lib/avvisa.ts`. Prima otto punti
inserivano a mano una riga in `notifiche`, quattro mandavano anche la push
ognuno a modo suo, e **nessuno guardava le preferenze della persona**.

- **L'avviso in app e' il registro e si scrive sempre**; la preferenza governa
  cio' che *interrompe*. Spegnere una push non deve cancellare la traccia.
- **Chi non lo puo' ricevere non lo riceve affatto**, nemmeno in app.
- ⚠️ **Il `waitUntil` sta dentro `avvisa()`, non nei chiamanti.** Tre su quattro
  se lo ricordavano e uno no: `pianificazione.ts` mandava le push della
  settimana con un `await` secco, quindi a volte le mandava e a volte no, senza
  che si vedesse niente. Una cosa che va ricordata a ogni chiamata prima o poi
  si dimentica: la si mette dove si decide.
- **Il predefinito dipende dal mestiere**, non e' un valore solo per tutti:
  `@kommessa/api/avvisi`. Con un valore solo, a un tecnico arriverebbero le
  richieste di permesso da approvare, che non puo' approvare. ⚠️ E una
  preferenza in tabella **non puo' riaprire una porta chiusa dal mestiere**:
  una riga scritta quando la persona era in ufficio non deve far squillare il
  telefono di un tecnico.
- **Il testo**: «Ti e' stato affidato un lavoro» / «… Apri per vedere la
  commessa». ⚠️ Il nome del lavoro va nel **corpo**, non nel titolo: su iOS il
  titolo si taglia intorno ai quaranta caratteri, e un titolo tagliato a meta'
  di un indirizzo non dice ne' cosa e' successo ne' dove.
- **Pagina**: `/mobile/profilo/notifiche` — «su questo telefono» (la
  sottoscrizione, che appartiene al singolo browser) e «cosa farti sapere» (un
  interruttore per avviso). Un interruttore e non tre: dei tre canali di prima
  uno non esiste (nessuna riga manda email di avviso) e un altro non e' una
  scelta. ⚠️ Il permesso si chiede **dentro il tocco**; su iPhone il caso «non
  supportato» spiega che serve la PWA installata invece di dire «browser
  vecchio», perche' su un iPhone del 2025 e' il caso piu' probabile.
- **Il service worker aveva tre difetti** che si vedono solo quando le push
  partono davvero (`CACHE_VERSION` v4 → v5): `url` arriva in cima al payload e
  non finiva in `data`, quindi al tocco si apriva sempre `/mobile`; si apriva
  una **seconda finestra** anche con l'app aperta (chi caricava foto se le
  vedeva sparire dietro); mancava `pushsubscriptionchange`, quindi una
  sottoscrizione rinnovata dal browser non arrivava al server e il telefono
  **smetteva di ricevere in silenzio**.

> ⚠️ **Due verita' sulle preferenze: ne resta una.** Collegando l'invio si e'
> scoperto che alla domanda «questa persona vuole questo avviso sul telefono?»
> il sistema sapeva rispondere in due modi: la vista
> `notification_preferences_effective` (predefinito **globale**) e il nuovo
> `pushAttiva` (predefinito del **mestiere**). Non equivalenti. Tolta la vista
> e la rotta orfana `/api/push/send-internal`. La **tabella**
> `notification_event_types` resta e non e' un residuo: la chiave esterna da
> `notification_preferences` e' cio' che impedisce di salvare la preferenza di
> un avviso inesistente. Cosa non si legge piu' sta scritto nei commenti in
> tabella (`default_*`, `in_app`, `email`, `quiet_hours_*`).

### Cosa dice un avviso: cosa, per chi, dove

- ⚠️⚠️ **`payload.body` veniva scritto e mai letto dalla PWA.** Il mittente ci
  mette apposta il nome del lavoro (il titolo non lo puo' contenere: su iOS si
  taglia sui quaranta caratteri), e `notifiche-list.tsx` leggeva `descrizione`
  poi `title`, **mai** `body`. Si leggeva tre volte «Ti e' stata affidata una
  cosa da fare», e **la schermata bloccata del telefono diceva piu' cose
  dell'app**, perche' la push il corpo lo mostra.
- Il corpo ora e' **cosa · per chi · dove** (`componiAssegnazione`), e si vede
  **nell'elenco**, non solo aprendo. Via il «Apri per…» in coda: quello spazio
  e' indirizzo che non si legge. I quattro mittenti passano il contesto — ce
  l'avevano gia' in mano, era solo una riga non scritta; la catena dei ripieghi
  sta in un posto solo (`contestoDelTodo` / `contestoDellaCommessa`).
- ⭐ **Il collegamento lo scrive il mittente, non lo indovina il lettore.** La
  PWA **ricostruiva** la destinazione da `commessa_id` ignorando `payload.url`
  — che il desktop invece legge: due logiche divergenti sulla stessa riga. Ora
  si legge l'indirizzo scritto, con la ricostruzione sotto per le righe vecchie.
- ⚠️ **`#lavori` era un'àncora morta**: in tutto il repo non esiste nessun
  `id="lavori"`, e i todo stanno dentro una tab che un hash non puo'
  selezionare. Una richiesta porta alla sua pagina; una cosa da fare porta a
  `/mobile/commessa/<id>?evidenzia=<todoId>`, e **quella riga si porta a
  schermo e si accende per tre secondi** (`_components/evidenzia.tsx`).
  ⚠️ L'anello si spegne da solo e l'indirizzo non si tocca: riscriverlo
  romperebbe il tasto «indietro». Per chi ha chiesto meno movimento l'anello
  resta **fermo e visibile**, perche' serve a trovare una riga fra venti.

Banchi: `scripts/banco-ui/richieste.mjs` (45 controlli: telefonata → cliente
nuovo → dove andare → chi ci va → il tecnico la **apre**, legge l'avviso che
dice cosa/per chi/dove, atterra sulla scheda dal tasto e la **chiude dal
telefono** → l'ufficio la elimina, e si ripulisce da solo),
`elenco-commesse.mjs` (25, l'evidenziazione che si accende e **si spegne**) e
`riunione-audio-corto.mjs` (10, con microfono finto).

### Push che arrivano davvero, e il foglio che le chiede

Prove vere con due telefoni (Samsung e iPhone) sull'account di una persona
dell'ufficio FPM. Tre difetti, tutti nostri, e un pezzo di interfaccia.

- ⚠️⚠️ **Le push partivano senza priorità** (`lib/push.ts`): su Android una
  notifica «normale» resta nella coda del risparmio energetico finché l'app
  non si sveglia — misurato: compariva solo aprendo l'app. Ora `urgency:
  'high'` e `TTL` di 12 ore (un promemoria delle 18 consegnato domani non
  serve). Con la priorità alta arriva a telefono bloccato **anche col
  risparmio energetico acceso**.
- ⚠️⚠️ **Il telefono è di chi ci è dentro adesso** (`_lib/push-client.ts`,
  `api/push/subscribe`): il browser tiene UNA sottoscrizione per origine e non
  sa chi è loggato; l'unique è `(user_id, endpoint)`, quindi lo stesso
  telefono restava registrato a due persone e la pagina diceva «attive»
  mentre gli avvisi andavano all'utente precedente. A ogni apertura dell'app
  (`SincronizzaPush`, una volta per sessione) e nella pagina Notifiche la
  sottoscrizione si rimanda al server, che la assegna a chi è dentro e la
  **toglie agli altri** (service role: la RLS fa vedere solo le proprie).
- **Il logout spegne**: prima di chiudere la sessione si toglie la riga sul
  server e la sottoscrizione dal browser, nei due logout (telefono e ufficio).
  Chi entra dopo riparte da «spento» e riattiva a suo nome: è il prezzo di non
  far arrivare a nessuno gli avvisi di un altro.
- **Il foglio «Attiva le notifiche»** (`mobile/_components/attiva-notifiche-sheet.tsx`)
  sostituisce la riga sottile di prima: compare a **ogni apertura dell'app**
  (una volta per sessione, «Non ora» lo mette via fino alla prossima) finché
  il telefono non è registrato. Tre forme: il tasto grande con i tre motivi;
  **iPhone fuori dall'app installata** → i due passi per la Home (Safari non
  riceve push); **permesso negato** → dove riaprirlo. ⚠️ Su un Mac
  l'emulazione mobile tiene `platform` MacIntel con il touch: per la
  rilevazione è un iPad, e il banco imposta la piattaforma a mano.
- **`ore_da_inserire` ha tre mittenti, ed è un avviso solo** (un interruttore
  solo nel profilo): la **fine giornata dichiarata** al terminale, che arriva
  entro il giro di import — due minuti dal cron, qualche secondo col webhook
  (`_lib/timbro/avvisa-fine`, finestra `fine_turno`); il promemoria della sera
  e della mattina (cron ai minuti 07/22/37/52, finestra di 15 minuti
  dall'orario del cliente; FPM senza orario proprio → 18:00 e 08:00); il
  sollecito a mano dell'ufficio (finestra `ufficio`). ⚠️ Le **finestre sono
  nomi diversi di proposito**: il dedupe è `utente|giorno|finestra` su 20 ore,
  quindi con lo stesso nome un mittente spegnerebbe l'altro. La sera **salta
  chi ha già ricevuto `fine_turno`** per quel giorno — la stessa frase due
  volte in mezz'ora insegna a non leggere l'avviso — la mattina no, perché il
  giorno dopo è la seconda occasione vera.
  ⚠️ Un badge **senza fase dichiarata** non manda niente: resta il promemoria
  della sera. Per provarlo si chiama `/api/cron/promemoria-ore?finestra=sera`
  con il segreto, dopo aver tolto la riga in `notifiche`.
- «Presenze e ore»: barra dei filtri su una riga, tutto alto 40px, dipendente
  e cantiere con la tendina cercabile (`Scelta`: nome, codice, cliente);
  Ricalcola ed Esporta solo icona. Banchi: `notifiche-foglio.mjs`,
  `filtri-presenze.mjs`.

### Entrare come una persona di un cliente (impersonazione)

Segnalato: «l'impersonificazione funziona solo con Owner Bertaiola, e a volte
la perdo». Erano **due cose diverse**, e il registro le ha dette entrambe:
**56 `impersonate_start` e 8 `impersonate_end`** — 48 impersonazioni su 56
(86%) non sono mai rientrate dalla porta — con **tutti e 56 i bersagli
`admin`**: mai un ufficio, mai un tecnico, cioè mai i due mestieri per cui
l'assistenza serve.

- ⭐ **I ruoli non sono una cosa del singolo cliente**, quindi la scelta non si
  scrive «per Bertaiola». Sono l'enum `app_role`, uguale per tutti: al 12/10
  Bertaiola ha 2 amministratori, 4 ufficio, 15 tecnici; FPM 1, 3 e 31. Valori
  vivi: `admin`, `office`, `tecnico` (+ `cliente`, chiuso dal 16/09);
  `owner` e `capo` restano nell'enum ma sono morti da marzo. Il nucleo
  indipendente dal cliente sta in `@kommessa/api/impersonazione` (22
  asserzioni, **viste fallire**): chi si può impersonare, come si chiama a
  schermo, in che ordine si raggruppa. ⚠️ `motivoNonImpersonabile` la usano
  **la tendina e il server**: due regole separate vorrebbero dire una tendina
  che offre una voce e un server che la rifiuta.
- ⭐ **Si sceglie sempre una persona, e il ruolo è il filtro che te la fa
  trovare.** Avevo proposto anche tre scorciatoie «entra come
  amministratore/ufficio/tecnico»: su FPM 31 utenti su 35 sono tecnici, quindi
  «entra come tecnico» dovrebbe pescarne uno a caso — che è **esattamente** il
  difetto da chiudere. ⭐ *Un comando che sceglie al posto tuo quando la scelta
  conta non è una scorciatoia: è lo stesso difetto con un nome gentile.*
  Tolta `impersonate(tenantId)`, che faceva `role='admin'` con `.limit(1)`
  **senza ordinamento** (Bertaiola ha due amministratori: chi diventavi era un
  caso). Un selettore solo — `admin/_components/scegli-impersonazione.tsx` —
  per i due punti d'ingresso. ⚠️ Lo stato di apertura sta **fuori**: un menu
  Radix si smonta al click e se lo porterebbe via.
- ⚠️⚠️ **Una GET non chiude una sessione.** Il rientro era
  `/api/admin/rientro`, una GET che terminava l'impersonazione; il guard di
  `/admin` ci rimandava chiunque avesse il cookie. Quindi bastava il **tasto
  «indietro»** — che ripassa dalla pagina `/admin/tenants/...` da cui si era
  partiti — per ritrovarsi fuori dal cliente **senza che nessuno chiedesse
  niente**. Ora c'è `/impersonazione`, una pagina che dice cosa stai guardando
  e offre le due strade; l'uscita è una Server Action, cioè una POST.
  ⚠️ Sta **fuori** dai gusci `/office` e `/mobile`: dentro prenderebbe i loro
  cancelli e un tecnico impersonato ci rimbalzerebbe prima di leggere la
  domanda.
- ⚠️⚠️ **Il ritorno non si appoggia più solo al refresh token messo da parte.**
  Mentre si impersona, la sessione del super admin non la rinfresca nessuno e
  Supabase la può invalidare: allora `refreshSession` falliva e il codice
  faceva `signOut` + login. Succedeva: **1 degli 8 rientri registrati ha
  `restore_ok: false`.** Ora, se il refresh non va, la sessione si
  **rigenera** come quella della persona impersonata (magic-link verificato
  lato server), dopo aver riletto **nel database** che quell'utente è ancora
  super admin — l'autorizzazione la dà la riga, non il cookie. Un posto solo
  per i due versi: `scambiaSessione`. Il registro ora dice anche *come*
  (`come: 'ripresa' | 'rigenerata' | 'fallita'`), e `restore_ok` resta col
  significato di sempre perché il registro si legge anche indietro nel tempo.
- ⚠️⚠️ **Il cancello della password acchiappava chi impersona.** È un
  promemoria rivolto a una persona; un super admin che la guarda non è quella
  persona, e `/cambia-password` lo chiudeva in una pagina **senza barra e
  senza via di ritorno**, con davanti un modulo che avrebbe cambiato la
  password **di qualcun altro**. Oggi in Bertaiola nessuno è obbligato, ma
  `scadenza_password` è accesa: **dal 10 dicembre ci finiva ogni
  impersonazione di quel cliente.** Ora `statoPassword()` lascia passare chi ha
  il cookie firmato.
- ⭐ **Una verità sola su chi stai guardando.** Il nome viveva anche in
  `impersonating_label`, un cookie visibile al browser con una scadenza
  propria: dopo quattro ore spariva e la barra ripiegava sul nome del cliente
  mentre l'impersonazione era ancora in corso. Ora nome, mestiere e cliente
  stanno **dentro il cookie firmato** e la frase la compone
  `etichettaImpersonazione`, la stessa per la barra e per il bivio. La barra
  dice **«Stai guardando l'app come Chiara Bianchi · ufficio · Rossi Impianti
  (DEMO)»**: il mestiere non è decorativo — sapere il nome senza il mestiere
  non dice se quello che vedi è quello che vede un tecnico.
- ⚠️ **Dove si atterra lo decide il mestiere, non l'impersonazione.**
  `casaPerRuolo` è salita in `@kommessa/api/identita` accanto a
  `etichettaRuolo` (è un fatto sul ruolo, e ora due posti molto diversi fanno
  la stessa domanda); da `/office` e `/mobile` il middleware porta ciascuno nel
  mondo del suo cliente. Prima si andava sempre su `/office`: per un tecnico un
  rimbalzo in più e per un istante la schermata sbagliata. ⚠️ **Dal 23/10/2026
  conta anche il dispositivo**: `casaPerRuolo(ruolo, { telefono })` con
  `telefonoDaUserAgent` — un tecnico guardato da un computer va in
  `/office/mio`, dal telefono resta su `/mobile`. Vale per l'avvio
  dell'impersonazione, il bivio `/impersonazione` e il cambio password.
- ⚠️ **Il rinnovo del cookie non può stare nel middleware**, che sarebbe il
  posto giusto: gira sul runtime edge, dove `node:crypto` non esiste e quella
  firma non si può né leggere né rifare. Resta la barra, ogni 15 minuti.
  Durata invariata a 4h: è il cookie che permette di riottenere una sessione da
  super admin, non si allarga per comodità.

> ⚠️ **`isSuperadminActor()` resta vero mentre si impersona, ed è una scelta.**
> I comandi da super admin (il ripristino di una versione di commessa) restano
> visibili anche mentre fai finta di essere un tecnico: la simulazione mente un
> po', in cambio chi risponde di un'azione pericolosa è sempre identificato.

Banco: `scripts/banco-ui/impersonazione.mjs`. ⚠️ **Serve un accesso da super
admin e non sta nel sorgente** (quelle credenziali aprono *tutti* i clienti,
produzione compresa): si passa da `BANCO_SUPER_EMAIL` / `BANCO_SUPER_PASSWORD`,
e senza quelle il banco **dice «NON MISURATO» e si ferma** invece di misurare a
vuoto. Il lato lettura è stato comunque provato componendo il cookie firmato
(14 controlli) e il cancello della password alzando e rimettendo il flag su un
utente dimostrativo (5): la barra dice nome·mestiere·cliente, un giro in
console **non** chiude più l'impersonazione, un cookie inventato non accende
niente, chi impersona passa il cancello e la persona vera resta murata.

### Funzioni per-tenant (feature flag) (migration `20260629120000`)

`tenants.features jsonb` (NON segreto, `grant select (features) to anon, authenticated`) per **mostrare/nascondere funzioni office per-tenant** dal super admin. Tab **"Funzioni"** in `/admin/tenants/[id]` (Predefinito/Mostra/Nascondi). Default per-funzione derivato dall'app_mode (mondo commesse = `app_mode ≠ kantiere`). Reader **difensivo** `_lib/tenant-features.ts` (+ registry client-safe `_lib/tenant-features-registry.ts`) → finché la colonna non c'è, si usano i default. Oggi gestisce **Voci catalogo** e **Preset di lavoro** (nascoste ai tenant solo-Kantiere, anche via route `notFound()`). Per aggiungerne: 1 voce nel registry + `tenantFeatureEnabled(key, kommessaWorld)` al gate. Migration **applicata** al cloud il 29/06.

### I permessi dell'API: un vocabolario solo

`@kommessa/api/scope-api` (18 asserzioni, **3 mutazioni viste fallire**).
L'elenco degli scope esisteva in **due copie** — `ScopeToken` in
`_lib/api-token.ts` (chi verifica) e `ScopeTokenAdmin` in
`admin/_actions/api-tokens.ts` (chi emette) — in due file che nessuno modifica
insieme: il primo scope aggiunto da una parte e non dall'altra sarebbe
diventato un permesso emettibile che nessuno riconosce.

Scope nuovi: **`leggi:dipendenti`** (senza costo orario) e
**`leggi:dipendenti:costi`**. ⭐ **Nessuna migration**: `api_tokens.scopes` è un
`text[]` **senza vincolo**, quindi l'elenco di ciò che esiste sta nel codice —
come per i modelli di trascrizione. Aggiungerne uno vuole una voce nel
vocabolario e una rotta che la legga.

- ⚠️⚠️ **La gerarchia è scritta a mano, non dedotta dal prefisso.**
  `leggi:dipendenti:costi` comincia come `leggi:dipendenti`, ma ricavarlo dalla
  stringa vorrebbe dire che un domani `leggi:dipendenti:qualsiasialtracosa`
  concede il primo per sbaglio — e **un permesso nato per errore non dà nessun
  segnale: funziona**. C'è un test che lo difende.
- ⚠️ **`integrazione` non concede `upload`, né viceversa**: era una scelta nei
  commenti, ora è una riga che un test può bocciare.
- ⭐⭐ **Il modulo Integrazione lo pretende il TOKEN, non la rotta.** Se
  dipendesse dalla rotta, un token del gestionale su una rotta di sola lettura
  scavalcherebbe l'interruttore del modulo. Così spegnere il modulo **continua
  a fermare l'agente ERGO** (provato: 403 `modulo_spento`), mentre un token di
  sola lettura non lo pretende — quello lo emette il super admin uno per uno, e
  si toglie revocandolo.
- ⚠️ **`sistema` resta nullo per i token di sola lettura**, ed è voluto: da lui
  dipendono le mappature verso il gestionale, cioè gli identificativi di **un
  altro sistema**. Una timbratrice non deve vedere i codici di ERGO.
- ⚠️ **I campi non concessi si OMETTONO, non si mandano a `null`**: un
  `costoOrario: null` dice «non lo sappiamo», che è falso, e chi lo mette in
  cache registra costi a zero. E **non si leggono nemmeno dal database**: la
  select cambia con il profilo. Profilo base **11 campi**, completo **17**.
- ⚠️ **Uno scope sconosciuto si rifiuta**, non si corregge: ripiegare su
  `upload` emetterebbe un token con permessi diversi da quelli chiesti, e chi
  l'ha chiesto non se ne accorgerebbe.
- Il **pannello** (`/admin/token-app`) legge il vocabolario: voci della
  tendina, spiegazione, esempio di nome e se serve una persona. Uno scope nuovo
  compare da sé.

> **Per dare accesso a un applicativo esterno**: `/admin/token-app` → azienda →
> permesso → etichetta. Il token si vede **una volta sola**. Nessun modulo da
> accendere per i permessi di sola lettura.
>
> ⚠️ **Restano fuori, dichiarati**: `/api/v1/info` è riservata a
> `integrazione` (espone `sistema` e `modalita`, cioè la configurazione del
> gestionale; a chi legge basta il `contratto` che ogni risposta porta già); non
> esiste **nessun registro delle chiamate** (solo `api_tokens.last_used_at`, al
> massimo una volta al minuto), e con più integratori su più aziende diventerà
> una domanda a cui saper rispondere; e **`sistema` viene ancora dalla
> configurazione del tenant, non dal token** — finché un integratore legge
> soltanto non serve, ma due integratori che *scrivono* sullo stesso cliente
> archivierebbero le mappature sotto lo stesso nome. ⚠️ Le query di salute in
> `admin/_lib/integrazione/foto.ts` filtrano solo per `tenant_id` e non per
> `sistema`: con due integrazioni sullo stesso tenant i contatori si
> sommerebbero.

## Mondo presenze — Kantiere (FPM)

Modulo presenze: tenant con `app_mode=kantiere` (**FPM Impianti**, `FPMIMP`).
Tutto è gated da `tenantHasModule('kantiere')` → **Bertaiola non ne è toccata**,
e ogni modifica va pensata **Bertaiola-safe e FPM-safe**.

> 📘📘 **Le logiche del mondo presenze stanno in
> `documentazione_generale/08_LOGICHE/Logiche_Kantiere.md`** (~1.400 righe), che
> è **la** fonte: timbrature e arrotondamenti, viaggi e chilometri, sedi e
> cantieri, pause, ore e quote, auto-approvazione, cronologia, sottocantieri
> (fasi), le superfici dell'ufficio e del tecnico, i file chiave del codice.
> **Prima di toccare qualsiasi cosa del mondo presenze, aprire quel file.**
> Fino al 26/10/2026 queste 577 righe stavano qui: CLAUDE.md si carica **intero**
> a ogni conversazione, e una sessione sul mondo commesse non ha motivo di
> portarsi dietro le regole delle timbrature.
>
> I manuali vicini, ognuno col suo file in `08_LOGICHE/`:
> **`Logiche_Integrazione_Timbro.md`** (la timbratrice Timbro ↔ Kommessa:
> contenitore virtuale, import a cursore, fasi del turno. **Attiva in produzione
> su FPM dal 26/10/2026**), **`Logiche_Export_Paghe.md`** (il `DatiMese.txt` per
> il consulente del lavoro), **`Logiche_Pianificazione.md`** (settimana, ferie e
> permessi), **`Logiche_Control_Room.md`**.

Le poche cose che servono **anche** a chi non sta lavorando sul mondo presenze:

- **Due mondi, invisibili fra loro.** `app_mode` + moduli per-tenant decidono
  cosa esiste: pagine, voci di barra, ⌘K, API. Una pagina del mondo commesse su
  un tenant Kantiere fa `notFound()`, e viceversa. Aggiungendo una superficie,
  decidere **a quale mondo appartiene** prima di scriverla.
- ⭐⭐ **`timbrature` ha un solo scrittore**: `_actions/_lib/timbrature-scrivi.ts`
  (`scriviTimbrature`). Prima erano quattordici `insert` sparsi. Un punto nuovo
  che scrive timbrature passa di lì, o si perdono gli invarianti (eredità della
  fase, specchio della chiusura nel registro, `modalita` obbligatoria).
- ⭐ **Le ore si registrano pure e le quote si derivano**: `minuti_lavoro` /
  `minuti_viaggio` per cantiere, e ordinario/straordinario/viaggio eccedente si
  calcolano dall'orario del cliente (`@kommessa/api/kantiere-quote`). Scrittore
  unico `scriviRigheGiornata`; chi legge usa `quoteDaRiga`, **mai**
  `ore_ordinarie` da solo.
- ⚠️ **Le timbrature si arrotondano nei calcoli, non nel database** (dal
  23/10/2026): l'orario scritto è esatto, le ore sono multipli del passo del
  cliente (FPM: 5 min). Un posto solo, `@kommessa/api/arrotondamento-timbri`.
- **Personalizzazioni** (`/office/personalizzazioni`): il contenitore delle
  funzioni su misura, gated dal modulo `personalizzazioni` — **non** è una cosa
  del mondo presenze, qualunque cliente può averla accesa (Bertaiola non ha la
  riga). Registro in `_lib/personalizzazioni-registry.ts`: per aggiungerne una
  servono una voce nel registro e la sua pagina. ⭐ **Due porte**: il layout
  controlla l'area, la pagina controlla la sua funzione. Prima funzione:
  **Export paghe** → `Logiche_Export_Paghe.md`.

## Interfaccia

### Dove atterra la PWA installata

- ⭐ **L'app installata parte da `/avvio`** (`manifest.start_url`): un puntatore
  «coarse» è un telefono → `/mobile`, altrimenti → `/office`
  (`app/avvio/page.tsx`, pubblica nel middleware). Chiude il caso dell'utente
  ufficio che si era installato la PWA sul PC e vedeva il telefono.
  ⚠️ `id` resta `/mobile`: cambiarlo farebbe nascere una seconda app sui
  telefoni.

### Dialog, tendine e fogli: trappole pagate sul campo

- **Overflow orizzontale «form gigante»**: un `DialogContent` `display:grid` ha
  grid item con `min-width:auto` (= min-content); un titolo `truncate` (nowrap)
  allarga il *track* della griglia → tutto sborda. Fix: `min-w-0` sul grid item
  (e `grid-cols-[minmax(0,1fr)]`), `overflow-x-hidden`, `min-w-0` su tutta la
  catena, testi troncati.
- **Scroll che non ingaggia / dialog che cresce**: a `flex-1 overflow-y-auto`
  serve un antenato ad **altezza definita** e **`min-h-0`** sul figlio flex.
  Struttura: header `shrink-0` · body `min-h-0 flex-1 overflow-y-auto` · footer
  `shrink-0`.
- **Dialog che sborda sopra o sotto**: con `viewport-fit=cover`, `100dvh`
  include la status bar e l'home indicator → il `max-h` deve **sottrarre**
  `env(safe-area-inset-top/bottom)`.
- **Zoom iOS all'apertura**: input con font < 16px → WebKit zooma la pagina.
  Per gli input custom usare `text-base`.
- **Elemento nascosto sotto la bottom-nav**: un `fixed` dentro il guscio resta
  intrappolato nel contesto di impilamento → **`createPortal` su body** con z
  alto (`mobile/_components/portal.tsx`).
- **Tastiera che copre i tasti**: agganciarsi alla **`visualViewport`**.
- ⚠️⚠️ **Dropdown dentro un dialog Radix — servono QUATTRO cose insieme**, e per
  settimane ce n'erano due: **(1)** Portal su `document.body` (un overlay
  in-flow viene **tagliato**: `DialogContent` ha `overflow-y-auto` *e* una
  `transform`, e una trasformazione impedisce persino a un `position: fixed` di
  uscire); **(2)** il pannello **marcato** `data-popover-portale`
  (`SEGNO_PANNELLO_PORTATO` in `packages/ui/.../dialog.tsx`), altrimenti
  Radix legge il clic su una voce come «fuori» e chiude il dialog sotto; **(3)**
  **`pointerEvents: 'auto'` esplicito** — un dialog modale Radix mette
  `pointer-events: none` su tutto il `<body>` e li riaccende **solo** nel
  proprio recinto: il pannello si vedeva e **il dito ci passava
  attraverso** (`elementFromPoint` sul centro di una voce restituiva la
  `<textarea>` che stava sotto);
  **(4)** un **`FocusScope`** attorno al pannello — non per intrappolare
  (`trapped` resta falso) ma perché montandosi mette in **pausa** la gabbia del
  fuoco del dialog, che altrimenti strappa il cursore alla casella di ricerca.
  E la tastiera va agganciata **anche al pannello**: gli eventi di un Portal
  risalgono l'albero di React, dove il pannello è un *fratello* del tasto.
  Banco: `tendine.mjs` (23 controlli).
- ⚠️ **E la rotellina del mouse**, quinta cosa: Radix blocca lo scorrimento con
  `react-remove-scroll`, che mette un ascoltatore di `wheel` su `document` e
  **annulla** ogni evento che non venga da dentro il dialog. Il pannello sta su
  `body`, quindi era «fuori»: l'elenco si scorreva **solo** trascinando la barra
  di lato. La via d'uscita prevista dalla libreria
  (`shards`) la passa Radix e non è raggiungibile: si ferma l'evento **prima** che arrivi a `document`, con uno
  `stopPropagation` sul pannello (ascoltatore **nativo**, `passive: false`,
  anche `touchmove`).
- ⚠️⚠️ **Un banco che sceglie con `elemento.click()` non misura niente di tutto
  questo**: è una chiamata al DOM e **ignora `pointer-events`**. Quel banco dava
  **11 verdi** su una tendina che nessuno riusciva a usare. In
  `scripts/banco-ui/comune.mjs` ci sono `clicVero`, `scriviVero`, `premiTasto`,
  `chiHaIlFuoco`, `chiRiceveIlTocco`: eventi veri del browser.
- ⚠️⚠️ **Sfocatura di iOS 26/27 in cima all'app installata**. Apple disegna un
  effetto vetro sopra la barra di stato e per ~40 punti sotto; nessun meta o CSS
  lo spegne. **Lo stile della barra (`black-translucent`) è memorizzato
  all'installazione**: cambiarlo in `layout.tsx` non tocca le app già sulla
  Home. Difesa in `mobile/_components/anti-sfocatura-ios.tsx`.
- **Tasti fissi in alto** (campanella, «＋ Spesa»): 34px a `safe-area + 10px`,
  tocco da 44px con un'area invisibile `before:`. ⚠️ La fascia in alto a destra
  fino a 40px resta libera: «Aggiornato alle» va sulla riga sotto. Banco
  `campanella.mjs`.
- **`scrollbar-gutter`**: i gusci ufficio e admin non scorrono mai sulla pagina
  (scorre `<main>`). Prima si perdevano 15px su ogni pagina e i `fixed right-0`
  si fermavano a 1425 invece di 1440.
- **Tasti dell'ufficio**: azioni di pagina e di barra = `<Button size="sm">`
  (40px, testo 12px, nero; outline per le secondarie). ⚠️ **Mai** tasti fatti a
  mano con `bg-primary`: il cobalto è per link, badge e stato «selezionato».
  Censimento ripetibile: `node scripts/banco-ui/tasti.mjs`.
- `TastoComando` (packages/ui) dice «⌘K» su Mac e «Ctrl K» altrove; frecce e
  invio nella palette sono icone Lucide, non glifi (su Windows «⏎» usciva un
  quadratino).
- ⚠️ **Il bundle di sviluppo invecchia sull'indice di `@kommessa/ui`**: un export
  nuovo nel barrel risultava `undefined` nel componente che lo importava («type
  is invalid») finché non si è pulito `.next`.

### PWA: atterraggio per ruolo e fluidità

- **Landing mobile role-based nel MIDDLEWARE, non nel render.** `/mobile` → `/mobile/kantiere/cruscotto` (admin/office) o `/cantieri` (tecnici) è un **redirect HTTP** in `middleware.ts` (`resolveMobileLanding` in `packages/api/src/server.ts`), scoped al solo `/mobile`, fail-soft. ⚠️ NON rimettere il `redirect()` dentro `mobile/page.tsx` (resta lì solo come fallback): un `redirect()` in un Server Component sotto `<Suspense>` innesca il **bug Next.js #63121 → React #310 transitorio** (schermata "Errore critico" all'avvio a freddo, visibile SOLO sui tenant kantiere perché solo loro rediregono). Vedi memoria `project-pwa-chunk-reload`.
- **Fluidità PWA**: ogni rotta mobile `force-dynamic` deve avere un `loading.tsx` skeleton (helper `apps/web/app/mobile/_components/skeletons.tsx`) → al tap tab compare subito lo skeleton invece di restare fermi. Transizione pagina in `apps/web/app/mobile/template.tsx` (`animate-page-in`, fill-mode **`backwards`** per non lasciare transform residui che romperebbero elementi `position:fixed`). Mai `Date.now()`/`new Date()` in `useState(initializer)` o direttamente nel render di un client component SSRato (mismatch di hydration): seed deterministico da una prop, poi tempo reale in `useEffect`.

### Attese nelle pagine d'ufficio

`office/_components/scheletri.tsx` (`ScheletroTabella`, `ScheletroCard`).
⚠️ L'area Kantiere dell'ufficio — lo strumento quotidiano di FPM — **non aveva
nemmeno un `loading.tsx`**: al clic non succedeva niente finche' il server non
aveva finito. Sedici pagine coperte il 07/10. Una pagina `force-dynamic` senza
`loading.tsx` e' una pagina che al tocco non dice niente.

> ⚠️ **Il banco di prova puo' mentire, e mentiva.**
> `(document.querySelector(...)||{click(){}}).click()` faceva un clic a vuoto
> **in silenzio** quando il collegamento stava in una sezione chiusa della
> sidebar, e riportava «nessun segno nei primi 500 ms» — un difetto dell'app
> che non esisteva. Ora apre la sezione, **aspetta il ridisegno** e, se il
> collegamento proprio non c'e', lo dice. Un banco che non distingue «non
> funziona» da «non l'ho trovato» e' peggio di nessun banco.

### Rifiniture dell'interfaccia d'ufficio

Quattro cose viste usandola, e due sono difetti introdotti il giorno prima.

- ⚠️⚠️ **La barra dell'ufficio disegna DUE livelli, non tre.** Spostando
  «Impostazioni» dentro il gruppo «Altro», le sue sei sotto-voci sono finite al
  terzo livello e **non le disegnava piu' nessuno** — al loro posto restava una
  freccia che apriva il vuoto, cioe' ⭐ *un comando che promette e non fa
  niente*. Ora `renderNavLink` non mette la freccia a una voce di secondo
  livello (`!isChild`), e Impostazioni e' un collegamento, come fa gia' il
  mondo presenze. **Niente e' andato perso**: la pagina delle impostazioni ha
  una barra di **tredici** schede filtrate per modulo e per ruolo, e le
  sotto-pagine sono tornate nella ⌘K — lette da `VOCI_IMPOSTAZIONI`, cioe' da
  quello stesso elenco, non da una terza copia. Banco: `desktop.mjs` controlla
  ora che **nessuna voce di menu abbia una freccia che non apre niente**.
- ⚠️ **`CardContent` nasce `p-6 pt-3 sm:p-7 sm:pt-4`, e `p-0` da solo non lo
  annulla**: sopra i 640px vince la regola con la media query. Le due colonne
  di «Task e Richieste» perdevano **56px ciascuna** — in quella stretta un
  quarto della larghezza, ed era il motivo per cui i comandi non ci stavano.
  Serve `p-0 sm:p-0`. Trovato risalendo la catena degli antenati con una
  misura, dopo tre tentativi fatti a stima che peggioravano le cose.
- **La colonna stretta delle richieste, rivista misurando.** A 1280px sono 250
  pixel: li' il titolo si riduceva a «PROVA LAR…», i comandi si sfilacciavano
  su quattro righe (138px di soli tasti) e un indirizzo di posta usciva dal
  bordo. Ora il titolo prende **tutta la riga** su due righe, la priorita' si
  dice con la sola parola, le tendine stanno su righe loro e i tasti su una
  sola col cestino all'estremo opposto. ⚠️ Due tentativi hanno peggiorato le
  cose prima di questo: `flex-nowrap` sul tasto della scelta multipla riduceva
  le pastiglie a «× U ×», e `flex-1` su «Crea commessa» **non lo tronca** —
  l'etichetta esce dalla scatola e finisce sopra il cestino. ⭐ Prop `riassunto` su
  `SceltaMultipla`: in poco spazio **un nome per esteso**, e da due in su il
  conto («2 persone»). ⚠️ Diceva «2 scelti» anche con una persona sola: il
  caso normale e' una persona, ed e' l'unica cosa che si vuole sapere senza
  aprire.
- **Il tasto delle richieste ha il «+» oltre alla cornetta** e si chiama «Nuova
  richiesta»: la cornetta da sola diceva di cosa si tratta, non che da li' si
  **crea**.
- ⚠️ **L'autore non si dice con una matita.** La matita vuol dire «modifica»:
  in una riga fitta un disegno da indovinare non informa, fa fermare. Ora si
  legge a parole in fondo alla riga, che e' la cosa meno urgente: prima il
  lavoro, poi chi l'ha scritto. ⚠️ Le parole sono **«Creato da»** dal 09/10
  (`ETICHETTA_CREATO_DA`), uguali in tutte e quattro le superfici.

Banchi: `scripts/banco-ui/zoom-foto.mjs` (14 controlli: rotellina, pizzicotto a
due dita vere via CDP, doppio clic, tasti, il freno dello spostamento) e
`richieste.mjs` portato a **56** (le due colonne misurate — 65%/35% e le due
tinte calcolate — l'autore su ogni riga, e le parole nuove).
⚠️ Sul tenant dimostrativo il **formato pieno** di una foto non arriva: i file
stanno solo su R2 e `/api/photo/<id>` senza `size=thumb` passa da Nextcloud. Il
banco lo **dice** invece di misurare a vuoto.

## Audit, sicurezza e pulizia

### Audit generale: sicurezza e convivenza dei mondi

- **Segreti** (cron, webhook, backfill): `segretoValido` / `bearerValido` in `_lib/segreto.ts`, mai `===`. **`?next=`** dopo login e callback: `percorsoInterno` (`_lib/percorso-sicuro.ts`), mai un URL esterno. **Super admin** solo da `app_metadata.platform_admin`: nessuna eccezione per email.
- ⚠️ **Tetto di 1000 righe di PostgREST confermato** (chiesto 5000, restituite 1000, senza errore): una lettura che deve essere completa (totali, export, API) va paginata. API v1: `LIMITE_MAX = 999` perché si chiede `limite+1`.
- **Nuove funzioni SECURITY DEFINER**: `revoke execute ... from public, anon, authenticated` se non servono agli utenti (le funzioni nuove in `public` nascono eseguibili da tutti).
- **Convivenza dei mondi**: pagine commesse mobile con `soloMondoCommesse()` (`mobile/_lib/mondo.ts`), `/office/tickets` chiuso ai tenant solo Kantiere, Kontabilità spenta = niente voce e `notFound()` (layout), `getAppModeCached` torna a `kommessa` se manca il modulo Kantiere, ⌘K filtrata per mondo. `app_mode=full` su mobile: il tab Kantiere prende il posto di Notifiche, Profilo resta.
- **Scritture ore**: `scriviRigheGiornata` inserisce le righe nuove e poi cancella le vecchie (se l'insert fallisce la giornata resta com'era); `inserisciPausaDichiarata` restituisce l'esito e chi chiude il turno si ferma se la pausa non entra.
- **Upload**: l'annullamento vale solo per un caricamento `uploading`, dell'autore o dell'ufficio (prima un file già sincronizzato finiva fra gli upload morti e veniva cancellato). La pagina Storage non manda più la password al browser.
- **Letture complete**: `leggiTutto` / `leggiPerGruppi` da `@kommessa/api/pagine` (pure + test). Ordinamento stabile che finisce su una colonna unica (`.order(...).order('id')`), un errore interrompe la lettura (meglio una pagina d'errore che ore a metà), liste `in(...)` a gruppi da 100 id. Usarle per totali, export, report e API; non per le letture volutamente limitate («ultime N»).
- **Impersonation**: il cookie `shadow_admin` è firmato (HMAC con chiave derivata dalla service role, `admin/_lib/shadow.ts`, scade con il cookie). `isSuperadminActor` accetta solo un cookie valido di un utente ancora super admin nel database; `ripristinaVersione` resta nel tenant della sessione. Mai leggere quel cookie con `JSON.parse`.
- **Librerie** (15/09): Next 14.2.35, sharp 0.35, jsPDF 4 (import nominato `{ jsPDF }`), `pnpm.overrides` per le dipendenze indirette vulnerabili nella stessa major. Ottimizzatore immagini spento (`images.unoptimized`): è l'endpoint delle vulnerabilità di Next 14 chiuse solo da Next 15, che resta da pianificare (React 19, `cookies()`/`params` asincroni).
- Migration **`20260915180000_sicurezza_privilegi_utenti_tenant`**: autorizzata da Luca il 15/09, provata in transazione annullata. Punti ancora aperti → memoria `project-audit-generale-2026-09-15`.
- **Portale clienti chiuso** (16/09, migration `20260916090000`): il ruolo `cliente` non accede a nessuna tabella dello staff (policy RESTRITTIVE `*_no_cliente`), le pagine `/portal` esistono solo con la funzione per-tenant `portale_clienti` accesa (spenta per tutti) e l'invito non propone più quel ruolo. Per riaprirlo servono policy per-tabella scritte apposta: vedi la testa della migration.

### Audit: un campo diventa un presidio quando qualcuno lo legge (migration `20261009140000`)

- ⚠️⚠️ **`users.created_at` era diventato un presidio e nessuno lo sapeva.**
  Da quando la scadenza password lo usa come orologio di riserva, spostarlo in
  avanti **spegne la scadenza per sempre** — e su `public.users` i grant sono
  di tabella, quindi l'interessato lo poteva scrivere da solo dalla console del
  browser. Una riga nel trigger. ⭐ E' la frase della migration del giorno
  prima («un campo diventa un presidio nel momento in cui qualcuno lo legge»)
  applicata a una tabella diversa: quando si comincia a **leggere** una
  colonna, la lista di cio' che si protegge e' gia' vecchia.
- ⚠️ **Un tecnico poteva spuntare a nome di un collega, a una data scelta.**
  `commessa_todo_touch` scrive `completato_da := coalesce(NEW.completato_da,
  auth.uid())` — il valore che arriva dal client **vince** — e gira dopo la
  guardia. Ora la guardia accetta solo «com'era» oppure «io, adesso» (cinque
  minuti di tolleranza). Stessa cosa per `created_by`, `created_at` e `id`.
  Provato sul database vero in transazione annullata: rifiutato, rifiutato, e
  la spunta normale continua a funzionare.
- ⚠️ **Una virgola nella ricerca mandava la board sulla pagina d'errore.**
  PostgREST spezza il corpo di `or=(...)` sulle virgole: cercando «Rossi, via
  Verdi» la richiesta torna 400. Finche' l'errore si buttava via era una board
  vuota; da quando si legge a pagine, `leggiTutto` **solleva**. Ora il testo si
  ripulisce e la lettura ha il suo try/catch. Stessa cosa per i parametri
  dell'indirizzo, che finivano grezzi in `.in()` su una colonna enum: un
  segnalibro vecchio bastava a far cadere la pagina.
- ⚠️ **Il costruttore di postgrest-js e' mutabile e `order()` accoda**:
  riusando la stessa query per tutte le pagine, la seconda chiede
  `order=priorita,id,priorita,id`. Una query **nuova per pagina**.
- ⚠️ **Sul telefono tre letture su quattro ignoravano l'errore** e diventavano
  «niente da fare oggi» — la bugia piu' comoda che quella pagina possa dire a
  un tecnico. E una lettura fallita delle assegnazioni diventava «nessuna
  commessa assegnata», cioe' il falso negativo che quella pagina era stata
  riscritta per togliere, preso dall'altra parte.
- ⚠️ **Un byte NUL dentro `_components/scelta.tsx`** (`const VUOTO =
  '\u0000nessuno'`, scritto come byte vero) rendeva il file **binario** per
  `grep`: 883 righe di un componente che vive in tutti i dialog erano
  invisibili a ogni ricerca nel repo, compreso questo audit finche' non e'
  saltato fuori per caso. Scritto come escape, il valore non cambia.
- ⚠️ **`CardContent` nasce `p-6 pt-3 sm:p-7 sm:pt-4`**: un `p-0` da solo non
  lo annulla sopra i 640px. Le due colonne perdevano 56px ciascuna.
- ⚠️ **Il responsabile si deduceva dal nome, non dall'id**: se l'embed verso
  `users` non risolveva, la riga diceva «Non assegnata» **e** non offriva la
  tendina per assegnarla, perche' quella guarda `assegnato_a`. Una riga di
  nessuno che nessuno poteva prendere.
- ⭐ **Il tipo `Row` era scritto a mano due volte** (22 campi, 4 aggiunti in
  entrambe nello stesso giro, con i commenti riscritti diversi). Ora lo esporta
  il componente che lo consuma.
- ⭐ **`motivo: 'provvisoria'` nasceva da `must_change_password`**, che e'
  un'altra colonna da `password_provvisoria`: con un reset forzato da un
  amministratore la pagina diceva «quella che ti hanno dato in ufficio la sanno
  in due» a chi se l'era scelta da se'. Si chiama `cambio_obbligatorio`.
- ⭐ **Nove `void X;` sotto il commento «usato sopra»**, che era falso: erano
  nove import morti con il linter spento sopra. Zero soppressioni `void`
  rimaste nel repo.
- Di contorno: «TODO» tolto da tutte le scritte che un utente legge (restavano
  nei messaggi d'errore della board, nella board di commessa e nel registro
  modifiche); il giro guidato puntava a `/office/tickets`, che nella barra non
  c'e' per nessuno, e raccontava che le telefonate diventano ticket; due
  collegamenti passavano ancora `?tipo=richieste`, un filtro che non esiste
  piu'; le credenziali dei tenant dimostrativi escono dal sorgente
  (`BANCO_PASSWORD`) — ⚠️ **da ruotare**, perche' DEMOK e DEMOC vivono nello
  stesso progetto Supabase della produzione.

> ⚠️ **Il cancello della password protegge le PAGINE, non le azioni.** Sta nei
> due gusci, in `/t/[token]` e nella pagina del cambio: non nel middleware, non
> nelle rotte `/api`, non nelle server action, non su `/admin`. Una PWA gia'
> aperta continua a funzionare e un'azione gira **prima** del render del layout
> che poi rimanda. ⭐ **E' coerente con l'intento** — e' un promemoria che a un
> certo punto diventa un muro, non un confine di sicurezza — ma va saputo: se
> un domani si vuole «non si passa» davvero, il posto e' il middleware.
>
> ✅ **Chiuso l'08/10**: `clienti_tenant_scope` era `FOR ALL` col solo filtro
> tenant, quindi **un tecnico poteva cancellare l'intera anagrafica clienti**
> del suo spazio di lavoro da una chiamata diretta (195 schede su Bertaiola, un
> comando). Spezzata in quattro policy per mestiere (migration
> `20261009150000`): leggono tutti, creano tutti (serve al sopralluogo),
> modificano e cancellano solo ufficio e admin — che e' cio' che le azioni
> pretendevano gia'. Provato sul database vero: legge ✓, crea ✓, modifica ✗,
> cancella ✗.
>
> ⚠️ **E i tipi generati di Supabase conoscono 40 tabelle su 81**: tutto il
> resto viaggia con `as never` (1157 occorrenze), cioe' **senza controllo dei
> tipi**. Rigenerarli e' un comando; toglierne i cast e' un giorno, e farebbe
> emergere errori veri. Da fare all'inizio di una sessione tranquilla, non
> prima di una funzione nuova.

### Audit: policy troppo larghe e tetti scelti a occhio (migration `20261009160000`)

- ⚠️⚠️ **Un tecnico poteva cancellare tutte le commesse dello spazio di
  lavoro.** `commesse_tenant_scope` era permissiva `FOR ALL` col solo filtro
  del cliente — la **stessa forma** di `clienti_tenant_scope` chiusa il giorno
  prima. Provato come tecnico vero in transazione annullata: modifica una
  commessa ✓, archivia tutte ✓, cancella le voci di tutte (220 righe) ✓,
  cancella tutte le commesse (20 righe) ✓. Su Bertaiola «tutte» sono oltre
  duecento, con dentro la storia del lavoro e i codici progressivi che non si
  riusano. Ora: leggono e **creano** tutti (⚠️ serve: un tecnico con
  `capo_squadra` apre lavori nuovi), modificano ufficio e amministratori,
  **cancella nessuno** — non esiste un'azione che cancelli una commessa, quindi
  la `delete` non ha policy e passa solo dalla service role. Stesso trattamento
  per `commessa_voci`, che e' append-only perche' alle voci corrispondono
  cartelle fisiche. Riprovato dopo: legge 20, modifica 0, cancella 0; l'ufficio
  modifica ✓ e un tecnico crea commessa + voci ✓.
  ⭐ **Il censimento dice che ne restano sette**: `file_refs`,
  `file_annotations`, `commessa_tags`, `preset`, `interventi`, `tickets`,
  `ticket_messages` hanno la stessa forma. Li' un tecnico **scrive davvero**
  (carica foto, annota, apre interventi), quindi separare «le proprie» da
  «quelle di tutti» vuole una lettura dei percorsi di caricamento, non una
  policy scritta di fretta. Query del censimento in coda alla migration.
- ⚠️ **L'AI poteva proporre 200 caratteri, la creazione ne accetta 60.** Il
  rischio era latente da sempre; chiedendo al modello **frasi** da 60 invece di
  nomi da 30 e' diventato probabile, e il modo in cui si manifestava era il
  peggiore: la dettatura moriva **alla fine di tutto il lavoro**, col messaggio
  di zod in inglese sotto il tasto. Ora `MAX_DESCRIZIONE_COMMESSA` sta in
  `@kommessa/api/nome-cartella` (accanto alla regola del nome cartella, perche'
  e' lo stesso fatto) e lo leggono gli otto punti che prima avevano un `60` o
  un `30` scritto a mano; `/api/voice/extract` **taglia a parola intera**
  (`@kommessa/api/testo`) dove la risposta del modello diventa dato.
- ⚠️ **«Salvato» su zero righe.** `aggiornaDettagliCommessa` faceva
  `.update().eq('id')` senza riprendersi la riga: con un id di un altro spazio
  di lavoro la RLS filtra, PostgREST non considera errore un aggiornamento a
  vuoto, e la funzione rispondeva `ok` **scrivendo pure una riga di registro**
  per una modifica mai avvenuta. Ora si chiede indietro l'id.
- ⚠️ **`titoloCase` spezzava le frasi.** Rendeva leggibile un titolo che era un
  nome di cartella; da quando i titoli sono frasi, «Fotovoltaico 6 kW con
  accumulo» diventava «Fotovoltaico 6 K W con Accumulo» sul telefono. Ora il
  CamelCase si spezza **solo su un testo senza spazi**, e una parola con la
  maiuscola interna (`kW`, `iGuzzini`) resta identica — la riga diceva
  «preserva le maiuscole» e poi chiamava `upFirst`, che la prima gliela
  cambiava.
- ⚠️ **Chi e' stato disattivato spariva dalla tendina ma non dalla riga.**
  `elencaAssegnabiliTenant` restituisce solo le persone attive: una richiesta
  affidata a chi non lavora piu' qui diceva «Responsabile: Mario» nella riga e
  «Responsabile…» nella tendina sotto. Ora la voce viene aggiunta in testa,
  marcata «Non piu' in squadra».
- ⭐ **Il nome accessibile deve cominciare con quello che si legge.** Le due
  tendine mostravano «Assegna a…» e dichiaravano «Responsabile di…»: chi usa un
  lettore di schermo sentiva una parola e chi guardava ne leggeva un'altra.
- Di contorno: la quarta superficie che componeva l'autore a mano
  (`lavori-board`) usa il vocabolario; `testoPerFiltroOr` condiviso applicato a
  ricerca globale, elenco commesse, ⌘K e `admin/tenants` (una virgola battuta
  li' spezzava il filtro e la ricerca tornava **vuota in silenzio**); tre
  costanti esportate da `nome-cartella` che nessuno importava sono diventate
  interne; `SummaryRow.mono` senza chiamanti e' stata tolta; il contratto di
  `componiNomeCartella` ora dichiara che **il codice e' l'unico pezzo non
  sanificato** e deve arrivare dal server.
- ⚠️⚠️ **Un test che non puo' bocciare la regressione che descrive.** Quello su
  `ETICHETTA_ASSEGNA_A` chiedeva «comincia con una maiuscola e non finisce coi
  puntini»: ci passavano anche «Tecnici assegnati» e «Responsabile di», cioe'
  esattamente i valori contro cui diceva di difendere. Riscritto e **visto
  fallire** sostituendo la costante.

> ⚠️ **Resta aperto, dichiarato**: la Edge Function `create-commessa` costruisce
> ancora `Cliente_2026-10-09_Lavoro`, il formato abbandonato, con una sua copia
> della sanificazione tagliata a 30. E' la **quinta** copia della regola del
> nome cartella, ha un `serve()` attivo e `convert-ticket` la importa, ma il
> percorso Freshdesk e' abbandonato dal 16/09. Da ricondurre a
> `componiNomeCartella` **oppure** da ritirare insieme alle tre gia' in lista.

### Audit Kantiere: payroll, sicurezza, log

Audit completo (5 investigatori paralleli + verifiche live Supabase) e correzioni. Regole/decisioni che ne derivano — **non reintrodurre i bug**:

- **Fine turno in pausa = VIETATO**: chiudere un turno mentre si è in **pausa** lascerebbe un'uscita orfana e perderebbe le ore del pomeriggio. `AZIONI_AMMESSE.fine = ['lavoro']` (QR + capo), `terminaTurnoMio` rifiuta lo stato `pausa` (`RIPRENDI_PRIMA`), e la card `TurnoAzioniCantiere` in pausa mostra **solo "Riprendi"** (niente "Fine turno"). Prima si riprende (timbra la ripresa reale), poi si chiude.
- **Auto-approvazione pausa-aware**: `esitoAutoApprovazione` accetta `inPausa` → una giornata ferma in pausa (ultimo evento = uscita di pausa) NON si auto-approva con le sole ore del mattino. `ricomputaRapportinoAuto` calcola `inPausa` (serve la colonna `pausa` nella query timbrature).
- **Override manuale vince sempre**: in `ricomputaRapportinoAuto` il guard `auto_compilato=false` è onorato **anche con timbrature presenti** (prima solo se `length===0`) → la "Modifica giornata" del tecnico/ufficio non viene più cancellata dal ricalcolo.
- **Dedupe doppio-tap**: `avviaTurnoMio`/`terminaTurnoMio`/`cambiaStatoTurnoMio` usano `eventoRecenteUguale` (25s) → ritornano idempotente invece di creare doppioni che bloccherebbero l'auto-approvazione.
- **Log strutturato Kantiere**: helper condiviso **`auditTenant`** (`_actions/_lib/audit.ts`, best-effort) su `audit_events` per sede (crea/modifica/elimina/collega/scollega/predefinita), cantiere (crea/modifica/elimina), impostazioni Kantiere (before/after) e **spesa elimina**. Visibile in `/admin/audit`. **Da usare per ogni nuova mutazione Kantiere.**
- **Kontabilità gated davvero**: `kontabilita_attiva=false` ora fa `notFound()` sulla pagina office (`kantiere/kontabilita`) e mobile (`kantiere/spese`) via `kontabilitaAttiva()`.
- **Super admin**: tab **Viaggio** di `/admin/tenants/[id]` mostra la **config Kantiere in sola lettura** (soglie payroll/operative) — supporto senza impersonare.
- **Spese hardening**: `eliminaSpesa` con guard ruolo + scope tenant; `aggiornaSpesa` valida il cantiere del tenant prima di riassegnarlo; split fine turno valida la sede sul cantiere **finale**.
- **RLS presenze (migration `20260706120000`, ✅ APPLICATA 06/07)**: la scrittura di `timbrature/rapportini/rapportino_righe/rapportino_versioni/timbratura_viaggio` è vincolata al **proprio `dipendente_id`** (o capo della squadra, via `public.sono_capo_di()` + `public.dipendente_del_utente()`); office/admin/owner restano tenant-wide; service role bypassa. Prima di applicare ho **validato sui dati reali**: caposquadra **non usato** in prod (0 squadre, 0 timbrature `origine='capo'`) e tutti i self-writer hanno `user_id` → superficie reale = solo "il tecnico scrive le proprie righe", che è già così per tutte le 119 timbrature. **Rollback** = ricreare le vecchie `*_tenant_write` FOR ALL `(tenant_id=current_tenant_id() and current_role() in (owner,admin,office,tecnico))`.

### Codice morto ritirato (migration `20261007140000`)

- **Tolte tre Edge Functions senza nessun chiamante**: `notify-event`,
  `onboard-tenant`, `ai-name`. ⚠️ Restano **deployate** finche' non si esegue
  `supabase functions delete notify-event onboard-tenant ai-name`. I cron veri
  non passano da Edge Functions: chiamano rotte Next via `net.http_post`.
  Togliendo `onboard-tenant` il ruolo `owner` diventa **irraggiungibile**.
- Tolte la vista `users_with_permissions` e le funzioni
  `get_effective_permissions` / `role_default_permissions`. ⚠️ La **colonna**
  `users.permissions` resta: contiene i poteri nuovi.
- Tolti quattro tipi di avviso **senza mittente** (`ticket_assigned`,
  `ticket_created`, `dico_mancante`, `intervento_oggi`). Restano i cinque veri.
- ✅ **Chiuso l'08/10**: le push erano plumbing pronto e non collegato
  (`inviaPushAUtente` chiamato da tre punti vivi, nessun client in grado di
  sottoscriversi). Collegate: vedi «Le notifiche push, collegate».
- ⚠️ **Resta orfana di proposito** `api/upload/media/route.ts`: nessun
  chiamante, ma un telefono con la PWA in cache potrebbe ancora usarla.

## Convenzioni dei documenti

### Come si scrivono i documenti

- Versioned headers (`**Versione**: 1.0`, `**Stato**: …`) at the top of each `.md` — bump them when making substantive changes.
- Pricing or third-party-claim text is wrapped in `<span class="cite">…</span>` to flag it as needing a citation/source — preserve these spans.
- Tables are used heavily for decisions and trade-offs; keep that format rather than converting to prose.
- `.pptx` files are binary artifacts generated from the markdown — editing them by hand is out of scope; regenerate from source when content drifts.
- The word "**cantiere/cantieri**" (with the "e") is the working domain ("construction site/job site") and must NOT be confused with the obsolete product name "Cantiera". Do not rename `cantiere` occurrences.
