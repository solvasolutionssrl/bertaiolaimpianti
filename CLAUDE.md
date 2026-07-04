# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stato produzione

> **L'app è in produzione dal 28/05/2026.** Bertaiola Impianti è il cliente reale attivo. Ogni push su `main` viene deployato automaticamente. Tratta il DB e i dati come produzione — no test casuali, no reset senza conferma esplicita.

### Stack AI (28/05/2026)

| Fase | Modello | Override |
|---|---|---|
| Trascrizione audio dettato | **`gpt-4o-mini-transcribe`** (per-tenant override su Bertaiola) | `tenants.transcribe_model` o env `OPENAI_MODEL_TRANSCRIBE` |
| Estrazione campi strutturati da transcript | `gpt-4o-mini` | env `OPENAI_MODEL_EXTRACT` |
| Suggerimento nome cartella + copilot | `gpt-5-mini` (fallback `gpt-4o-mini`) | env `OPENAI_MODEL_CHAT` |

Il modello di trascrizione è scegliebile per tenant dal pannello super admin (`/admin/tenants/[id]` → tab "AI"): whisper-1 / gpt-4o-mini-transcribe / gpt-4o-transcribe. Bertaiola usa `gpt-4o-mini-transcribe` (più accurato di whisper-1 su rumore di cantiere, costa la metà).

## What this repository is

This is the working repo for the **Bertaiola Impianti × SOLVA (Kommessa)** project. It contains:

1. **Codice di prodotto** (sviluppo attivo):
   - `apps/web/` — Next.js 14 App Router (3 superfici sotto un solo app: `office/`, `mobile/`, `portal/`)
   - `packages/api/`, `packages/ui/`, `packages/integrations/` — pacchetti workspace (`@kommessa/*`)
   - `supabase/migrations/` — schema versionato (55 migrazioni applicate al cloud al 18/06/2026)
   - `supabase/functions/` — Edge Functions (Deno)
   - `scripts/` — script operativi (es. `reset-tenant-data.mjs`, `freshdesk-migration`)
2. **Documentazione di prodotto** sotto `documentazione_generale/` — kickoff, architettura, brand, roadmap, mockup, preventivo, presentazioni.

### Pipeline thumbnail foto (dal 28/05/2026 sera, 50ª migration)

Le gallerie immagini (PWA mobile, office riunioni, foto-tab) servono **thumb 400×400 webp ~30 KB persistenti su R2** invece del full-size 3-5 MB proxato da Nextcloud.

- **Generazione**: hook fire-and-forget nel `/api/upload/media/[id]/complete` chiama `generateAndUploadThumb()` (helper `apps/web/app/_lib/thumbnails.ts`). Solo `mime image/*`, usa `sharp ^0.33.5`.
- **Path R2**: `{stesso_path_originale}/thumbs/{shortId}.webp` — derivato via `deriveThumbKey()`.
- **DB**: colonna `file_refs.r2_thumb_key text` (migration `20260528010000`).
- **Endpoint**: `/api/photo/[id]?size=thumb` redirect 302 a signed GET R2 5min TTL; fallback al full-size proxy se thumb mancante (foto vecchie funzionano comunque).
- **Backfill**: POST `/api/admin/thumbs/backfill` con header `X-Internal-Backfill-Secret: $CRON_SECRET`, body `{limit?, dryRun?}`.
- **Admin osservabilità**: `/admin/media` mostra `% thumb generate` + flag visivo per riga (synced+thumb → riga emerald).
- **Video**: NON gestiti (`sharp` non li supporta). Restano su `<video preload="metadata">`. Futuro: ffmpeg-server o frame extraction client-side.

> **Display titolo commessa**: nelle UI non mostrare mai `nome_cartella` raw (è la directory Nextcloud nel formato `{codice}_{cliente}_{lavoro}`). Usare sempre `risolviTitoloCommessa()` da `apps/web/app/_lib/commessa-display.ts` che pesca da `descrizione_ai_finale → proposta → note_iniziali` con fallback estrattivo da nome_cartella (CamelCase → spazi).

### Modifica commessa, versioning e tipologie (dal 18/06/2026, migration 20260618000000)

La modifica di una commessa finalizzata riapre il flusso di creazione:

- **Desktop**: pagina `/office/commesse/[id]/modifica` (editor globale completo). Il bottone "Modifica" sulla scheda apre questa pagina; il vecchio mini-dialog a 3 campi è stato rimosso.
- **PWA**: wizard `/mobile/commessa/[id]/modifica` a 3 step (Dati → Tipologie → Conferma), precompilato, con dettatura vocale **opzionale** (merge non distruttivo via `/api/voice/extract`). Solo `admin`/`office`.
- **Action**: `aggiornaCommessaCompleta` (`apps/web/app/_actions/aggiorna-commessa-completa.ts`). UI condivisa: `apps/web/app/_components/commessa-editor/`.

> **Regola ferrea (editor + versioning + tipologie)**: `codice_interno`, `nome_cartella`, `cloud_folder_path` NON si toccano MAI (rinominare romperebbe i file su Nextcloud — dirlo in UI). Le voci/tipologie sono **append-only**: si aggiungono soltanto, mai si rimuovono (le cartelle sono fisiche). La modifica è **online-only** (serve il server per versioning + provisioning cartelle).

**Versioning** — tabella `commessa_versioni` (snapshot jsonb + diff + `modificato_da`/`modificato_da_nome` + `azione` ∈ creazione|modifica|aggiunta_tipologie|ripristino). La versione 1 è scritta da `creaCommessa` (hook best-effort); le esistenti hanno v1 da backfill (`scripts/backfill-versioni-v1.mjs`). Storico nella tab **Cronologia** office. **Ripristino solo superadmin** (`ripristinaVersione`, content-only — mai voci/cartelle), gating `isSuperadminActor()` da `admin/_lib/guard` che riconosce anche l'impersonation (cookie `shadow_admin`). Helper: `_lib/versioni/snapshot.ts`, `_actions/_lib/scrivi-versione.ts`.

**Tipologie impianto** ("cosa si fa") — sono un **elemento master nella sidebar** office (`commessa-sidebar.tsx` → `tipologie-panel.tsx`), NON nella tab Fasi (che monitora l'avanzamento). Azione rapida `AggiungiTipologieDialog` (append-only, conferma con avviso "creerà le cartelle su Nextcloud") disponibile in sidebar office, scheda mobile ed editor. Action `aggiungiTipologie`; provisioning condiviso `_actions/_lib/provisiona-cartelle.ts` + `_actions/_lib/aggiungi-voci.ts`. NB: anche `aggiungiVoce` della tab Fasi ora provisiona le cartelle (prima inseriva solo la riga DB).

### Etichette display degli stati commessa (solo forma, non toccare l'enum)

L'enum `stato_commessa` resta `bozza/aperta/in_corso/collaudo/completata/archiviata`. A schermo però si mostrano queste **diciture** (decise dal cliente — le commesse non sono "critiche/a rischio", sono lavori nel loro ciclo): `aperta` → **"Non presa"**, `collaudo` → **"In collaudo"**, gli altri col nome naturale. La label vive in `StatoBadge` (`packages/ui`) + mappe locali allineate (liste/filtri, stato-picker, scheda, editor, PWA, admin). Non reintrodurre "Aperta"/"Collaudo" né framing "a rischio" sulla dashboard (la sezione è "Commesse in lavorazione").

### Kantiere (FPM) — impostazioni e scelte recenti (giu 2026)

Modulo presenze (tenant FPM, `app_mode=kantiere`). Tutto gated da `tenantHasModule('kantiere')` → **Bertaiola non ne è toccata**. Decisioni di prodotto stabili:

- **Arrotondamenti** (Impostazioni Kantiere office, conferma prima di salvare, valgono sui turni **futuri**): tempo di **viaggio** default **5 min** con pavimento di uno step (ogni tragitto > 0 conta ≥ 5 min; 0 resta 0); ore **lavoro** default **0 = nessun arrotondamento** — scelta cliente: si raccoglie tutto **al minuto**, si arrotonda **nel report a fine mese** sul dato aggregato. Helper `arrotondaA(min, step)` (step<1 = off), config in `tenant_modules.config.arrotondamento_{viaggio,ore}_min`.
- **Pausa pranzo dichiarata in uscita**: se il turno è durato oltre una **soglia configurabile** senza pausa timbrata, il dialog di uscita mostra un avviso giallo che **ricorda che timbrare la pausa è il modo corretto** (la dichiarazione è un ripiego) + opzioni 30/45/60 min. La soglia è **per-tenant** (`tenant_modules.config.soglia_pausa_pranzo_ore`, default **5h**, gestita in Impostazioni Kantiere → Approvazione presenze) ed è **identica per QR e tasto in-app** (self scheda cantiere + wizard capo). Costante `SOGLIA_PAUSA_PRANZO_ORE` = solo default; reader `leggiSogliaPausaPranzoOre`. Lato dati è una **coppia pausa** centrata (`origine='manuale'`, helper unico `coppiaPausaCentrata`/`inserisciPausaDichiarata` in `_actions/_lib/viaggio-timbra`) → il calcolo ore la sottrae con la logica pausa esistente. Se la pausa è timbrata regolarmente, **nessun avviso**. La pausa è avviabile anche **da app senza QR** (scheda cantiere → "Avvia pausa pranzo", `pausaPranzoMia`).
- **Stima viaggio (km + tempo) — provider per-tenant**: l'astrazione `RoutingProvider` (`apps/web/app/_lib/routing`) ha due famiglie: **free** (OSRM demo / OpenRouteService con `ORS_API_KEY`, gratis, **senza traffico**) e **google** (Google Routes API `computeRoutes` + `TRAFFIC_AWARE`, **traffico reale**, a pagamento). La **chiave Google è UNICA di piattaforma** (`GOOGLE_MAPS_API_KEY`, env — **non** per-tenant, **mai** nel DB). Il **super admin** sceglie per-tenant se usarla dal tab **"Viaggio"** di `/admin/tenants/[id]` (`tenant_modules.config.routing_provider` ∈ `free|google`, default `free`; action `aggiornaRoutingProviderTenant`). La route `/api/routing/stima` legge la scelta (`leggiRoutingProvider`), costruisce il provider e fa fail-soft (se google scelto ma chiave assente → free). Cache `routing_cache` per **profilo** (`driving-car` vs `driving-traffic`, non si mescolano) con **TTL 15 min** sul traffico. FPM → google; gli altri restano free (costo zero).
- **Scanner QR su iPhone-app-installata**: niente stream live (limite WebKit). Si usa **scatto-foto** (`<input capture>` + jsQR) o la fotocamera nativa sul poster. **Android usa BarcodeDetector live — non toccare.**
- **Super admin**: `/admin/kantiere` (panoramica + timbrature cross-tenant con GPS/origine/chi/viaggio) e `/admin/accessi` (login/logout, tabella `auth_events`). Moduli/app_mode: `kantiere`/`full` richiedono il modulo attivo (guard server); spegnere il modulo riporta a `kommessa` in cascata.

#### Kontabilità + auto-approvazione + viaggio-da-app (in prod dal 26/06/2026, push `9d971d6`)

- **Auto-approvazione rapportini** (tutti i tenant kantiere): le **timbrature sono la sostanza**, il rapportino è **forma**. Una giornata si auto-compila dalle timbrature e si **auto-approva** quando è **chiusa** (ingressi = uscite) ed **entro soglia** (config `anomalia_turno_ore_max`, default **10h**, pause escluse); **aperta o oltre soglia** → resta **"da verificare"** (bozza), gestita solo da office/admin. Si ri-valuta a ogni timbratura (riaprire un turno la riporta in bozza). Disattivabile per tenant (`auto_approva_rapportini`). Logica pura `esitoAutoApprovazione` (testata), wiring in `ricomputaRapportinoAuto` (congelata solo se `approvato_da` valorizzato dall'ufficio). Correzione anomalia "pausa pranzo dimenticata" (office: `aggiungiPausaGiornata` → coppia-pausa → se rientra in soglia auto-approva). Anteprima soglia del dialog letta dal config (non hardcoded).
- **Viaggio di ritorno anche da APP** (non solo QR): chiusura turno self (scheda cantiere) e capo (wizard per-membro) aprono lo stesso dialog del QR (sede/km/autista/mezzo + pausa) e **tracciano** la tratta `timbratura_viaggio` `direzione='ritorno'`. Uscite in-app `origine='cronometro'` (QR resta `'qr'`). Helper viaggio/pausa condivisi in `_actions/_lib/viaggio-timbra` (`ViaggioSchema`, `validaViaggio`, `inserisciViaggioRow`, `inserisciPausaDichiarata`, `inizioSeEleggibilePausa`, `coppiaPausaCentrata`) — il viaggio si **valida sempre PRIMA** di scrivere pausa/uscita (niente righe orfane). `<LiveRefresh>` auto-aggiorna i dati live ogni 60s (office presenze/cantiere/dashboard, mobile cruscotto/cantiere).
- **Kontabilità (spese di cantiere)** — sotto-modulo dentro Kantiere, flag `kontabilita_attiva` (default on). Il tecnico fotografa lo scontrino dalla PWA → **AI vision** (`OPENAI_MODEL_VISION` = `gpt-5.4-mini`, `reasoning_effort: 'low'`) estrae i campi → revisione → salva, agganciata al cantiere del turno (helper condiviso `mioTurnoAttivo`). Tabella `spese` (migration `20260625120000`, **foto su R2** via `r2_key`/`r2_thumb_key`, NON `file_refs`; RLS: tecnico le proprie, office/admin tutto il tenant). Office `/office/kantiere/kontabilita`: tabella spese + Analisi costi + Costo cantiere + **Ricevute** (browser R2 con zip via `archiver@7`). Upload office (immagine/PDF) via `creaSpesaOffice` (service-role, gated ruolo). Cleanup R2 best-effort se l'insert DB fallisce. Super admin `/admin/kantiere/kontabilita` (cross-tenant). PDF: solo archiviazione, niente AI.

> Dettaglio operativo, milestone e TODO vivono nella memoria (`MEMORY.md` → `kantiere-overview`, `project-branch-kontabilita-wip`, checkpoint 24–25/06).

#### Presenze e ore — UI alleggerita + dettaglio origine/viaggio (29-30/06/2026)

La tab office **"Presenze e ore"** (`/office/kantiere/rapportini`) è stata semplificata e arricchita (solo UI/lettura, motore auto-approvazione invariato):

- **Niente più Approva/Respingi/selezione-bulk a schermo** (l'auto-approvazione resta sotto, nascosta): storico **per giorno** + blocco **"In corso oggi"** (sfondino verde, colonne allineate, timeline inline `GiornataFlow`). Esito per giornata: 🟢 Regolare / 🔴 anomalia con motivo (giorno aperto / oltre soglia) / ☕ pausa non timbrata (giornate lunghe). **Modifica + Cronologia su OGNI giornata** → correzione retroattiva tracciata (`commessa_versioni`-style `rapportino_versioni`, azione `modifica_ufficio`). Filtro "Solo anomalie".
- **`rapportino` ≠ PDF**: nel codice è il **record-giornata** (con stato approvazione), ed è il nome di questa pagina. Non esiste un PDF "rapportino"; il prospetto ore È questa tabella + export CSV + Ore e costi.
- **Ore in formato `H:MM`** (es. 7:30, non 7.5/2,6) in **tutte** le tabelle/KPI Kantiere (office desktop + mobile). Il viaggio mostra sempre **km + tempo H:MM** (da `timbratura_viaggio.distanza_km`).
- **Origine + viaggio nel dettaglio espanso** (office desktop + cruscotto mobile): ogni timbratura/pausa mostra l'**origine** (`origine` = `qr`/`cronometro` = "Timbrata"; `manuale` = "Inserita a mano · da {chi} · agg. {quando}" da `created_at`+`creato_da`), e il **viaggio** come tratte (sede→cantiere / cantiere→sede al ritorno, km, H:MM, autista/passeggero). Componente condiviso `office/kantiere/_components/timbrature-riepilogo.tsx` (`TimbratureRiepilogo` con `OrigineLine`, `GiornataFlow`).
- **Cruscotto mobile office** (`/mobile/kantiere/cruscotto`, gated admin/office) = **dashboard navigabile per giorni** (`?giorno=YYYY-MM-DD`, no futuro): consultabile lo **storico** di un giorno passato; "Presenze del giorno" per-persona espandibili con origine+viaggio.
- **Anomalie** tolta dalla **sidebar** office (pagina ancora raggiungibile dalla dashboard — non del tutto ridondante: ha festivo/weekend/straordinari). Soglia promemoria pausa **configurabile, default 5h**. Icona card viaggio scheda cantiere: aereo → **macchina** (`Car`).

#### Funzioni per-tenant (feature-flag) — super admin (29/06/2026, migration `20260629120000`)

`tenants.features jsonb` (NON segreto, `grant select (features) to anon, authenticated`) per **mostrare/nascondere funzioni office per-tenant** dal super admin. Tab **"Funzioni"** in `/admin/tenants/[id]` (Predefinito/Mostra/Nascondi). Default per-funzione derivato dall'app_mode (mondo commesse = `app_mode ≠ kantiere`). Reader **difensivo** `_lib/tenant-features.ts` (+ registry client-safe `_lib/tenant-features-registry.ts`) → finché la colonna non c'è, si usano i default. Oggi gestisce **Voci catalogo** e **Preset di lavoro** (nascoste ai tenant solo-Kantiere, anche via route `notFound()`). Per aggiungerne: 1 voce nel registry + `tenantFeatureEnabled(key, kommessaWorld)` al gate. Migration **applicata** al cloud il 29/06.

#### PWA — landing role-based e fluidità (01/07/2026)

- **Landing mobile role-based nel MIDDLEWARE, non nel render.** `/mobile` → `/mobile/kantiere/cruscotto` (admin/office) o `/cantieri` (tecnici) è un **redirect HTTP** in `middleware.ts` (`resolveMobileLanding` in `packages/api/src/server.ts`), scoped al solo `/mobile`, fail-soft. ⚠️ NON rimettere il `redirect()` dentro `mobile/page.tsx` (resta lì solo come fallback): un `redirect()` in un Server Component sotto `<Suspense>` innesca il **bug Next.js #63121 → React #310 transitorio** (schermata "Errore critico" all'avvio a freddo, visibile SOLO sui tenant kantiere perché solo loro rediregono). Vedi memoria `project-pwa-chunk-reload`.
- **Fluidità PWA**: ogni rotta mobile `force-dynamic` deve avere un `loading.tsx` skeleton (helper `apps/web/app/mobile/_components/skeletons.tsx`) → al tap tab compare subito lo skeleton invece di restare fermi. Transizione pagina in `apps/web/app/mobile/template.tsx` (`animate-page-in`, fill-mode **`backwards`** per non lasciare transform residui che romperebbero elementi `position:fixed`). Mai `Date.now()`/`new Date()` in `useState(initializer)` o direttamente nel render di un client component SSRato (mismatch di hydration): seed deterministico da una prop, poi tempo reale in `useEffect`.

#### Turno manuale (no QR) + multi-cantiere + pattern UI mobile (lug 2026)

**Funzioni** (gated kantiere → Bertaiola-safe): **avvio turno senza QR** (scegli un cantiere qualsiasi), **cambia cantiere** live (chiude A/apre B → ore dai timestamp reali + km A→B alla destinazione via provider tenant, tratta manuale `durata=0`), **picker cantiere** riusabile (`mobile/kantiere/_components/cantiere-picker.tsx`), **"Abitazione privata"** a fine turno (0 km/0 tempo), card turno prop **`compatto`** (CTA orizzontali 33/33/33, usata sul cruscotto office), **"Cantieri di oggi"** in tab Ore (mini-tabella), **"Modifica giornata"** con ore **editabili** (input tap-and-type + −/+ 15min). Azioni in `_actions/kantiere-timbra.ts` (`avviaTurnoMio`, `cambiaCantiereMio`, `elencoCantieriTurno`).

**Conteggio ore (regola ferrea)**: `ricomputaRapportinoAuto` **ri-deriva SEMPRE le righe dalle timbrature** (cancella + ricostruisce). Quindi lo split ore/cantiere "regge" solo se fatto di **segmenti timbrati reali** → è ciò che produce lo **switch live**. Uno split retroattivo ("cosa hai fatto oggi") dovrà **sintetizzare segmenti additivi** tra ingresso e uscita, non scrivere `rapportino_righe` (verrebbero sovrascritte).

**Ricerca cantieri = a TOKEN cross-campo** (usata sia nel picker sia nella tab Cantieri): `q.trim().toLowerCase().split(/\s+/)` e **ogni token** deve comparire in `[nome, codice_commessa, codice, cliente_nome, indirizzo, categoria].join(' ')` → "fincantieri monf" trova "Fincantieri … Monfalcone" anche con le parole in campi diversi. Non usare più il match single-field.

**Gotcha UI mobile (dialog/dropdown/foglio) — imparati risolvendo bug reali** (verificati riproducendo in Chrome headless):
- **Overflow orizzontale "form gigante"**: un `DialogContent` `display:grid` ha grid item con `min-width:auto` (= min-content); un titolo `truncate` (nowrap) allarga il *track* della griglia → tutto sborda. Fix: `min-w-0` sul grid item (+ eventualmente `grid-cols-[minmax(0,1fr)]`), `overflow-x-hidden`, `min-w-0` su tutta la catena, testi troncati.
- **Scroll che non ingaggia / dialog che cresce**: a `flex-1 overflow-y-auto` serve un antenato ad **altezza definita** e **`min-h-0`** sul figlio flex. Struttura header (`shrink-0`) · body (`min-h-0 flex-1 overflow-y-auto`) · footer (`shrink-0`).
- **Dialog che sborda su/sotto**: con `viewport-fit=cover`, `100dvh` include status bar e home-indicator → il `max-h` deve **sottrarre `env(safe-area-inset-top/bottom)`**.
- **Zoom iOS all'apertura**: input con font < 16px → WebKit zooma la pagina. Globals già forza 16px sui form field; per input custom usare `text-base`.
- **Elemento nascosto sotto la bottom-nav**: un `fixed` dentro la shell resta intrappolato nello stacking context → **`createPortal` su body + z alto** (pattern `Portal`, `mobile/_components/portal.tsx`).
- **Tastiera che copre i tasti**: aggancia alla **`visualViewport`** (spaziatore bianco = altezza tastiera, oppure restringi il foglio).
- **Dropdown dentro un dialog Radix**: usare un **overlay assoluto in-flow** (NON un Portal: Radix lo tratterebbe come "fuori" → chiude il dialog / ruba il focus).

Working language for the app UI is **Italian**. Preserve it.

### Infrastruttura produzione

| Servizio | Dettaglio |
|---|---|
| **Vercel** | team `solvasolutions`, progetto `bertaiolaimpianti`. Deploy automatico da `main`. URL: `https://bertaiolaimpianti.vercel.app` |
| **Supabase** | progetto `BertaiolaImpianti_GestioneCommesse`, ref `vuhqioixvgaadyxnerfg`, region **West EU (Ireland)**. Dashboard: `https://supabase.com/dashboard/project/vuhqioixvgaadyxnerfg` |
| **Nextcloud** | Hetzner Storage Share managed, già acquistato e configurato dal cliente. `basePath` e credenziali in `apps/web/.env.local` sotto `STORAGE_*`. |
| **Cloudflare R2** | Bucket staging per upload media. Credenziali `R2_*` in `.env.local`. I file vengono inviati prima su R2 poi sincronizzati su Nextcloud. |

**Credenziali**: tutte in `apps/web/.env.local` (gitignored). **Mai citare password in chiaro in prompt/transcript/commit.**

> **Segreti su `tenants` (hardening, migration `20260627010000`)**: le colonne `storage_config` (credenziali Nextcloud) e `r2_config` (secret key R2) sono **segreti** e NON sono leggibili dal client `authenticated`/`anon` (privilegi di colonna: SELECT di tabella revocato, ri-concesso solo sulle colonne non sensibili). Vanno lette **esclusivamente via service role** (`createServiceSupabase`, scoping esplicito `.eq('id', tenantId)`) — già così in tutto il codice. **Mai** passare questi due campi a un componente client per i tenant. ⚠️ Aggiungendo una **nuova colonna NON segreta** a `tenants`, concederla: `grant select (col) on public.tenants to anon, authenticated;` (le colonne segrete NON si concedono). La chiave Google Maps non sta qui (è env globale): vedi sopra.

**Migrazioni DB**: scrivere solo il file SQL in `supabase/migrations/` — l'apply al DB cloud lo esegue l'umano con `supabase db push` o `psql`.

**Deploy**: solo `git push origin main`. La GitHub integration Vercel fa tutto. Non usare `vercel deploy --prod` manualmente (raddoppia la build sul piano Hobby).

Working language for all documents is **Italian**. Preserve it when editing; do not translate existing content unless asked.

> **Product name**: `Kommessa` (rebrand definitivo da `impiantiXplus`, maggio 2026). Pacchetti workspace: `@kommessa/api`, `@kommessa/ui`, `@kommessa/integrations`, `@kommessa/web`.

## Repository layout (purpose-ordered, not alphabetical)

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

## Load-bearing architectural decisions (do not silently contradict)

These decisions evolved across versions — the current state is **v3** (commit `5000547`: "v3: abbandono Freshdesk + PWA tecnici al posto di Expo"). When editing any document, keep these aligned:

| Decision | Status |
|---|---|
| **Product name** | **Kommessa** (definitivo dal maggio 2026, rebrand da `impiantiXplus`). Legacy alternatives in `03_BRAND/` sono solo contesto storico. |
| **Freshdesk** | **Abandoned** post go-live. One-time API migration script, then native ticketing in the new app. Do not describe it as "integrated". |
| **Mobile tecnici** | **PWA** (Next.js + Service Worker + Web App Manifest). **Not** Expo, **not** React Native, **not** native iOS/Android. No App Store / Play Store. |
| **Storage cloud** | ✅ **Nextcloud confirmed** (Hetzner Storage Share managed). Decisione chiusa: il cliente Bertaiola ha già acquistato e configurato Nextcloud, il file browser mobile vede i file reali. Mantenere comunque l'astrazione `StorageProvider` nel codice per supportare in futuro altri tenant con provider diversi. |
| **Backend** | Supabase Pro, region **Frankfurt EU** (GDPR). Postgres + Auth + Realtime + Edge Functions. |
| **Web** | Next.js 14 on Vercel. Monorepo with shared codebase across web office / PWA tecnici / portale cliente. |
| **Multitenant** | From day 1. Bertaiola is the **pilot tenant** of a SaaS product (working name **impiantiXplus**). |
| **Hosting** | 100% EU. GDPR compliance is a hard requirement. |
| **Pricing reference** | Pacchetto B ≈ €20.020 + IVA year 1; ≈ €3.920/year recurring. Update `documentazione_generale/06_PREVENTIVO/Preventivo_Base.md` if numbers change anywhere else. |

## Cross-document consistency

These files cite each other and must stay in sync — when changing one, check the others:

- Scope/decisions: `README.md` ↔ `documentazione_generale/01_KICKOFF/Documento_Zero.md` ↔ `documentazione_generale/01_KICKOFF/Report_Riunione.md` ↔ `documentazione_generale/01_KICKOFF/Flusso_Operativo.md`
- Tech choices: `documentazione_generale/02_ARCHITETTURA/Stack_Tecnico.md` ↔ `documentazione_generale/02_ARCHITETTURA/Architettura_Soluzione.md` ↔ `documentazione_generale/07_PRESENTAZIONI/Bertaiola_Tecnica.pptx`
- Costs: `documentazione_generale/02_ARCHITETTURA/Stima_Costi_Infrastruttura.md` ↔ `documentazione_generale/06_PREVENTIVO/Preventivo_Base.md`
- High-level pitch: both PPTs in `documentazione_generale/07_PRESENTAZIONI/` reflect the choices above and need to be regenerated when those choices change (see open-items list at the bottom of `README.md`).

## Document conventions

- Versioned headers (`**Versione**: 1.0`, `**Stato**: …`) at the top of each `.md` — bump them when making substantive changes.
- Pricing or third-party-claim text is wrapped in `<span class="cite">…</span>` to flag it as needing a citation/source — preserve these spans.
- Tables are used heavily for decisions and trade-offs; keep that format rather than converting to prose.
- `.pptx` files are binary artifacts generated from the markdown — editing them by hand is out of scope; regenerate from source when content drifts.
- The word "**cantiere/cantieri**" (with the "e") is the working domain ("construction site/job site") and must NOT be confused with the obsolete product name "Cantiera". Do not rename `cantiere` occurrences.
