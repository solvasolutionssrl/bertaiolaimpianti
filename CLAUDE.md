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
- **Pausa pranzo dichiarata in uscita**: se il turno è durato oltre una **soglia configurabile** senza pausa timbrata, il dialog di uscita mostra un avviso giallo che **ricorda che timbrare la pausa è il modo corretto** (la dichiarazione è un ripiego) + opzioni 30/45/60 min. La soglia è **per-tenant** (`tenant_modules.config.soglia_pausa_pranzo_ore`, default **5h**, gestita in Impostazioni Kantiere → Pause) ed è **identica per QR e tasto in-app** (self scheda cantiere + wizard capo). Costante `SOGLIA_PAUSA_PRANZO_ORE` = solo default; reader `leggiSogliaPausaPranzoOre`. Lato dati è una **coppia pausa** centrata (`origine='manuale'`, helper unico `coppiaPausaCentrata`/`inserisciPausaDichiarata` in `_actions/_lib/viaggio-timbra`) → il calcolo ore la sottrae con la logica pausa esistente. Se la pausa è timbrata regolarmente, **nessun avviso**. La pausa è avviabile anche **da app senza QR** (scheda cantiere → "Avvia pausa pranzo", `pausaPranzoMia`).
- **Stima viaggio (km + tempo) — provider per-tenant**: l'astrazione `RoutingProvider` (`apps/web/app/_lib/routing`) ha due famiglie: **free** (OSRM demo / OpenRouteService con `ORS_API_KEY`, gratis, **senza traffico**) e **google** (Google Routes API `computeRoutes` + `TRAFFIC_AWARE`, **traffico reale**, a pagamento). La **chiave Google è UNICA di piattaforma** (`GOOGLE_MAPS_API_KEY`, env — **non** per-tenant, **mai** nel DB). Il **super admin** sceglie per-tenant se usarla dal tab **"Viaggio"** di `/admin/tenants/[id]` (`tenant_modules.config.routing_provider` ∈ `free|google`, default `free`; action `aggiornaRoutingProviderTenant`). La route `/api/routing/stima` legge la scelta (`leggiRoutingProvider`), costruisce il provider e fa fail-soft (se google scelto ma chiave assente → free). Cache `routing_cache` per **profilo** (`driving-car` vs `driving-traffic`, non si mescolano) con **TTL 15 min** sul traffico. FPM → google; gli altri restano free (costo zero).
- **Autocomplete indirizzi (sedi/cantieri)**: `/api/geocode/autocomplete` usa lo **stesso toggle** del routing → **Google Geocoding** per i tenant su provider `google` (chiave `GOOGLE_MAPS_API_KEY`, env), altrimenti **Photon→Nominatim** (free), sempre fail-soft. Componente `AddressAutocomplete` (salva `lat/lng` accanto al testo).
- **Sedi ↔ cantieri (regola ferrea)**: per un cantiere si propongono SOLO la **sede predefinita** (`sedi.is_default`, sempre) + le **sedi associate** a quel cantiere (`cantiere_sede`) + **"Abitazione privata"** a fine turno (0 km/0 tempo; non in Registra giornata, dove partenza e rientro sono sempre una sede). MAI le sedi di altri cantieri. Applicata in tutte le UI (QR, app, capo, Registra giornata che **filtra le sedi per cantiere**) **e** ri-validata lato server da `sedeAmmessaPerCantiere` (`_actions/_lib/viaggio-timbra.ts`) in `validaViaggio(…, cantiereId)` (e in `registraGiornataDaZero` per le tratte passando da una sede). UI office **Sedi**: il collegamento cantieri usa un **dropdown di ricerca** (`sedi/_components/cantieri-collegati-select.tsx`), non l'intera lista di chip. → dettaglio in `documentazione_generale/08_LOGICHE/Logiche_Kantiere.md` (registro **regole/scelte operative** Kantiere: arrotondamenti, tolleranza, km, sedi, settings, auto-approvazione — **da tenere aggiornato**).
- **Scanner QR su iPhone-app-installata**: niente stream live (limite WebKit). Si usa **scatto-foto** (`<input capture>` + jsQR) o la fotocamera nativa sul poster. **Android usa BarcodeDetector live — non toccare.**
- **Super admin**: `/admin/kantiere` (panoramica + timbrature cross-tenant con GPS/origine/chi/viaggio) e `/admin/accessi` (login/logout, tabella `auth_events`). Moduli/app_mode: `kantiere`/`full` richiedono il modulo attivo (guard server); spegnere il modulo riporta a `kommessa` in cascata.

#### Kontabilità + auto-approvazione + viaggio-da-app (in prod dal 26/06/2026, push `9d971d6`)

- **Auto-approvazione rapportini** (tutti i tenant kantiere): le **timbrature sono la sostanza**, il rapportino è **forma**. Una giornata si auto-compila dalle timbrature e si **auto-approva** quando è **chiusa** (ingressi = uscite) ed **entro soglia** (config `anomalia_turno_ore_max`, default **10h**, pause escluse); **aperta o oltre soglia** → resta **"da verificare"** (bozza), gestita solo da office/admin. Si ri-valuta a ogni timbratura (riaprire un turno la riporta in bozza). Disattivabile per tenant (`auto_approva_rapportini`). Logica pura `esitoAutoApprovazione` (testata), wiring in `ricomputaRapportinoAuto` (congelata solo se `approvato_da` valorizzato dall'ufficio). Correzione anomalia "pausa pranzo dimenticata" (office: `aggiungiPausaGiornata` → coppia-pausa → se rientra in soglia auto-approva). Anteprima soglia del dialog letta dal config (non hardcoded). **Dal 20/08/2026 vale anche per le giornate scritte A MANO** (`esitoAutoApprovazioneManuale`, pura+testata, agganciata a `marcaRapportinoManuale`): guarda le **ore dichiarate** invece degli ingressi, perché una giornata senza timbrature ha `ingressi=0` e veniva scartata per sempre come «nessun turno» — restava in bozza e non usciva mai verso il gestionale. Non approva se 0 ore o se un turno timbrato è ancora aperto. ⚠️ **`auto_compilato` resta `false`**: rimetterlo a `true` farebbe cancellare le ore a mano dal ricalcolo successivo.
- **Viaggio di ritorno anche da APP** (non solo QR): chiusura turno self (scheda cantiere) e capo (wizard per-membro) aprono lo stesso dialog del QR (sede/km/autista/mezzo + pausa) e **tracciano** la tratta `timbratura_viaggio` `direzione='ritorno'`. Uscite in-app `origine='cronometro'` (QR resta `'qr'`). Helper viaggio/pausa condivisi in `_actions/_lib/viaggio-timbra` (`ViaggioSchema`, `validaViaggio`, `inserisciViaggioRow`, `inserisciPausaDichiarata`, `inizioSeEleggibilePausa`, `coppiaPausaCentrata`) — il viaggio si **valida sempre PRIMA** di scrivere pausa/uscita (niente righe orfane). `<LiveRefresh>` auto-aggiorna i dati live ogni 60s (office presenze/cantiere/dashboard, mobile cruscotto/cantiere).
- **Kontabilità (spese di cantiere)** — sotto-modulo dentro Kantiere, flag `kontabilita_attiva` (default on). Il tecnico fotografa lo scontrino dalla PWA → **AI vision** (`OPENAI_MODEL_VISION` = `gpt-5.4-mini`, `reasoning_effort: 'low'`) estrae i campi → revisione → salva, agganciata al cantiere del turno (helper condiviso `mioTurnoAttivo`). Tabella `spese` (migration `20260625120000`, **foto su R2** via `r2_key`/`r2_thumb_key`, NON `file_refs`; RLS: tecnico le proprie, office/admin tutto il tenant). Office `/office/kantiere/kontabilita`: tabella spese + Analisi costi + Costo cantiere + **Ricevute** (browser R2 con zip via `archiver@7`). Upload office (immagine/PDF) via `creaSpesaOffice` (service-role, gated ruolo). Cleanup R2 best-effort se l'insert DB fallisce. Super admin `/admin/kantiere/kontabilita` (cross-tenant). PDF: solo archiviazione, niente AI.

> Dettaglio operativo, milestone e TODO vivono nella memoria (`MEMORY.md` → `kantiere-overview`, `project-branch-kontabilita-wip`, checkpoint 24–25/06).

#### Presenze e ore — UI alleggerita + dettaglio origine/viaggio (29-30/06/2026)

La tab office **"Presenze e ore"** (`/office/kantiere/rapportini`) è stata semplificata e arricchita (solo UI/lettura, motore auto-approvazione invariato):

- **Niente più Approva/Respingi/selezione-bulk a schermo** (l'auto-approvazione resta sotto, nascosta): storico **per giorno** + blocco **"In corso oggi"** (sfondino verde, colonne allineate, timeline inline `GiornataFlow`). Esito per giornata: 🟢 Regolare / 🔴 anomalia con motivo (giorno aperto / oltre soglia) / ☕ pausa non timbrata (giornate lunghe). **Modifica + Cronologia su OGNI giornata** → correzione retroattiva tracciata (`commessa_versioni`-style `rapportino_versioni`, azione `modifica_ufficio`). Filtro "Solo anomalie".
- **`rapportino` ≠ PDF**: nel codice è il **record-giornata** (con stato approvazione), ed è il nome di questa pagina. Non esiste un PDF "rapportino"; il prospetto ore È questa tabella + export CSV + Ore e costi.
- **Ore in formato `H:MM`** (es. 7:30, non 7.5/2,6) in **tutte** le tabelle/KPI Kantiere (office desktop + mobile). ⚠️ **Eccezione: i TOTALI.** Su una somma `H:MM` diventa illeggibile (`705:19` per 65 giornate non dice niente e quei minuti non li usa nessuno): coppia di helper puri: **`formattaOreGiornata`** (sempre `7:30`, per riga/giornata) e **`formattaOreTotale`** (`45 min` / `7:30` / `705 ore`, per KPI, totali di colonna, grafici di periodo). **Nel CSV resta il decimale con la virgola**, che il foglio di calcolo deve poter sommare. Audit 01/09: sistemati «Ore e costi» (scriveva `7,5`), scheda cantiere app, KPI «Ore settimana» (`123:55`), grafico «Ripartizione ore». Il viaggio mostra sempre **km + tempo H:MM** (da `timbratura_viaggio.distanza_km`).
- **Origine + viaggio nel dettaglio espanso** (office desktop + cruscotto mobile): ogni timbratura/pausa mostra l'**origine** (`origine` = `qr`/`cronometro` = "Timbrata"; `manuale` = "Inserita a mano · da {chi} · agg. {quando}" da `created_at`+`creato_da`), e il **viaggio** come tratte (sede→cantiere / cantiere→sede al ritorno, km, H:MM, autista/passeggero). Componente condiviso `office/kantiere/_components/timbrature-riepilogo.tsx` (`TimbratureRiepilogo` con `OrigineLine`, `GiornataFlow`).
- **Cruscotto mobile office** (`/mobile/kantiere/cruscotto`, gated admin/office) = **dashboard navigabile per giorni** (`?giorno=YYYY-MM-DD`, no futuro): consultabile lo **storico** di un giorno passato; "Presenze del giorno" per-persona espandibili con origine+viaggio.
- **Anomalie** tolta dalla **sidebar** office (pagina ancora raggiungibile dalla dashboard — non del tutto ridondante: ha festivo/weekend/straordinari). Soglia promemoria pausa **configurabile, default 5h**. Icona card viaggio scheda cantiere: aereo → **macchina** (`Car`).

#### Funzioni per-tenant (feature-flag) — super admin (29/06/2026, migration `20260629120000`)

`tenants.features jsonb` (NON segreto, `grant select (features) to anon, authenticated`) per **mostrare/nascondere funzioni office per-tenant** dal super admin. Tab **"Funzioni"** in `/admin/tenants/[id]` (Predefinito/Mostra/Nascondi). Default per-funzione derivato dall'app_mode (mondo commesse = `app_mode ≠ kantiere`). Reader **difensivo** `_lib/tenant-features.ts` (+ registry client-safe `_lib/tenant-features-registry.ts`) → finché la colonna non c'è, si usano i default. Oggi gestisce **Voci catalogo** e **Preset di lavoro** (nascoste ai tenant solo-Kantiere, anche via route `notFound()`). Per aggiungerne: 1 voce nel registry + `tenantFeatureEnabled(key, kommessaWorld)` al gate. Migration **applicata** al cloud il 29/06.

#### PWA — landing role-based e fluidità (01/07/2026)

- **Landing mobile role-based nel MIDDLEWARE, non nel render.** `/mobile` → `/mobile/kantiere/cruscotto` (admin/office) o `/cantieri` (tecnici) è un **redirect HTTP** in `middleware.ts` (`resolveMobileLanding` in `packages/api/src/server.ts`), scoped al solo `/mobile`, fail-soft. ⚠️ NON rimettere il `redirect()` dentro `mobile/page.tsx` (resta lì solo come fallback): un `redirect()` in un Server Component sotto `<Suspense>` innesca il **bug Next.js #63121 → React #310 transitorio** (schermata "Errore critico" all'avvio a freddo, visibile SOLO sui tenant kantiere perché solo loro rediregono). Vedi memoria `project-pwa-chunk-reload`.
- **Fluidità PWA**: ogni rotta mobile `force-dynamic` deve avere un `loading.tsx` skeleton (helper `apps/web/app/mobile/_components/skeletons.tsx`) → al tap tab compare subito lo skeleton invece di restare fermi. Transizione pagina in `apps/web/app/mobile/template.tsx` (`animate-page-in`, fill-mode **`backwards`** per non lasciare transform residui che romperebbero elementi `position:fixed`). Mai `Date.now()`/`new Date()` in `useState(initializer)` o direttamente nel render di un client component SSRato (mismatch di hydration): seed deterministico da una prop, poi tempo reale in `useEffect`.

#### Turno manuale (no QR) + multi-cantiere + pattern UI mobile (lug 2026)

**Funzioni** (gated kantiere → Bertaiola-safe): **avvio turno senza QR** (scegli un cantiere qualsiasi), **cambia cantiere** live (chiude A/apre B → ore dai timestamp reali + km A→B alla destinazione via provider tenant, tratta con km e tempo, dal 15/09 conta come viaggio), **picker cantiere** riusabile (`mobile/kantiere/_components/cantiere-picker.tsx`), **"Abitazione privata"** a fine turno (0 km/0 tempo), card turno prop **`compatto`** (CTA orizzontali 33/33/33, usata sul cruscotto office), **"Cantieri di oggi"** in tab Ore (mini-tabella), **"Modifica giornata"** con ore **editabili** (input tap-and-type + −/+ 15min). Azioni in `_actions/kantiere-timbra.ts` (`avviaTurnoMio`, `cambiaCantiereMio`, `elencoCantieriTurno`).

**Conteggio ore (regola ferrea)**: `ricomputaRapportinoAuto` **ri-deriva SEMPRE le righe dalle timbrature** (`minutiPerCommessa` appaia ingresso→uscita per cantiere; la pausa è un GAP fra un'uscita e l'ingresso successivo, il flag `pausa` non incide sul conteggio). Quindi lo split ore/cantiere "regge" solo se fatto di **segmenti timbrati reali** → è ciò che produce lo **switch live**.

**Split "cosa hai fatto oggi" a fine turno** (chi NON ha cambiato cantiere live): alla chiusura manuale, se la **giornata è pulita** (un solo evento = l'ingresso; `TurnoAzioniContesto.giornataPulita`), il dialog "Termina turno" offre *Solo qui / Più cantieri*. Dividendo, si **sintetizzano i segmenti timbrati** (NON `rapportino_righe`, che verrebbero sovrascritte) via **`calcolaSegmentiSplit`** (`@kommessa/api/kantiere-split`, **pura + unit-testata**: segmenti back-to-back dai timestamp, pausa come gap al confine più vicino al centro o straddle su cantiere unico, l'ultima riga assorbe il resto, primo ingresso = quello reale). Wiring in `terminaTurnoMio` → `terminaConSplit` (additivo, guardia giornata-pulita, mai delete distruttivo; viaggio di ritorno sull'ultima uscita). UI in `ViaggioRitornoDialog` (sezione split + `MinutiStepper` + foglio picker per aggiungere cantieri). Netto = `(chiusura − inizio) − pausa`, con `ts` di chiusura **snapshot** così UI e server usano lo stesso valore. **Tolleranza** (`tolleranza_chiusura_min`, default 5): se `|restano| ≤ tolleranza` si salva (l'ultima riga assorbe il resto) → i minuti dispari non bloccano.

**Caso 4 — registra giornata SENZA timbrature**: chi non ha mai timbrato dichiara inizio + pausa + cantieri/ore (la fine si calcola) → azione **`registraGiornataDaZero`** (guardia **giornata VUOTA**, gate `registra_giornata_attivo`) = ingresso(inizio) + `calcolaSegmentiSplit`. UI `RegistraGiornataDialog` in tab Ore.

**Impostazioni ufficio "Turni"** (`tenant_modules.config`, tab in Impostazioni Kantiere): `tolleranza_chiusura_min` (5), `split_fine_turno_attivo` (on), `avvio_turno_libero` (on — **sostituisce il gate weekend**: se off i tecnici vedono solo i cantieri con QR attivo), `passo_minuti_stepper` (15, i +/- degli stepper), `registra_giornata_attivo` (on — gate caso 4). **Lettura unica** di tutte le impostazioni Kantiere: `impostazioniDaConfig` / `leggiImpostazioniKantiere` (`_lib/kantiere-config.ts`); i reader parziali (`leggiImpostazioniTurno`, `leggiArrotondamenti`…) passano di lì. Per aggiungerne: campo in `ImpostazioniKantiere` + `impostazioniDaConfig`, schema e merge di `salvaImpostazioniKantiere`, UI con descrizione oggettiva.

**Km switch "A → B"**: `timbratura_viaggio.da_cantiere_id` (migration `20260706000000`) = cantiere di partenza dello switch; il display (cruscotto + rapportini office, `ViaggioTratta.daCantiere`) mostra "cantiere A → cantiere B" invece di "Sede → cantiere".

**Ricerca cantieri = a TOKEN cross-campo** (usata sia nel picker sia nella tab Cantieri): `q.trim().toLowerCase().split(/\s+/)` e **ogni token** deve comparire in `[nome, codice_commessa, codice, cliente_nome, indirizzo, categoria].join(' ')` → "fincantieri monf" trova "Fincantieri … Monfalcone" anche con le parole in campi diversi. Non usare più il match single-field.

**Gotcha UI mobile (dialog/dropdown/foglio) — imparati risolvendo bug reali** (verificati riproducendo in Chrome headless):
- **Overflow orizzontale "form gigante"**: un `DialogContent` `display:grid` ha grid item con `min-width:auto` (= min-content); un titolo `truncate` (nowrap) allarga il *track* della griglia → tutto sborda. Fix: `min-w-0` sul grid item (+ eventualmente `grid-cols-[minmax(0,1fr)]`), `overflow-x-hidden`, `min-w-0` su tutta la catena, testi troncati.
- **Scroll che non ingaggia / dialog che cresce**: a `flex-1 overflow-y-auto` serve un antenato ad **altezza definita** e **`min-h-0`** sul figlio flex. Struttura header (`shrink-0`) · body (`min-h-0 flex-1 overflow-y-auto`) · footer (`shrink-0`).
- **Dialog che sborda su/sotto**: con `viewport-fit=cover`, `100dvh` include status bar e home-indicator → il `max-h` deve **sottrarre `env(safe-area-inset-top/bottom)`**.
- **Zoom iOS all'apertura**: input con font < 16px → WebKit zooma la pagina. Globals già forza 16px sui form field; per input custom usare `text-base`.
- **Elemento nascosto sotto la bottom-nav**: un `fixed` dentro la shell resta intrappolato nello stacking context → **`createPortal` su body + z alto** (pattern `Portal`, `mobile/_components/portal.tsx`).
- **Tastiera che copre i tasti**: aggancia alla **`visualViewport`** (spaziatore bianco = altezza tastiera, oppure restringi il foglio).
- **Dropdown dentro un dialog Radix**: usare un **overlay assoluto in-flow** (NON un Portal: Radix lo tratterebbe come "fuori" → chiude il dialog / ruba il focus).
- **Tasti fissi in alto (campanella, «＋ Spesa»)**: 34px a `safe-area + 6px`, tocco da 44px con un'area invisibile `before:`. La fascia in alto a destra fino a 40px va lasciata libera: niente a destra sulla riga del titolo, «Aggiornato alle» sta sulla riga sotto (14/09/2026, prima la campanella copriva il testo su Cantieri, Ore, Spese). Banco `scripts/banco-ui/campanella.mjs`.

#### Audit Kantiere + correzioni payroll/sicurezza/log (06/07/2026)

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

#### Trasferimenti cantiere→cantiere (km + tempo)

Chi lavora su **più cantieri** in un giorno genera tragitti **A → B** (gated kantiere → Bertaiola-safe). Riga `timbratura_viaggio` con `timbratura_id` null, `da_cantiere_id`=A, `cantiere_id`=B (km sulla **destinazione**), `durata_stimata_min`=tempo. Copre switch live, split fine turno e Registra giornata (`registraTrasferimentiCantiere` + puro `trasferimentiDaSegmenti`); il super admin le vede in `/admin/kantiere/timbrature`.

**Dal 15/09/2026 sono viaggio, sempre**: km nei totali per tutti i tenant (toggle `km_switch_attivo` e `leggiTrasferimentiAttivi` **tolti**, chiave rimossa dal config con la migration `20260915090000`); `durata_confermata_min` = stima arrotondata (in Registra giornata correggibile a mano, con motivo in `giustificazione`); il tempo si toglie dal lavoro (buco fra i segmenti o erosione del segmento di arrivo, `minutiDaTimbrature`). → `Logiche_Kantiere.md` §3.1.

#### Metodi di pagamento, avviso soglia e conferma passeggero (01/09/2026)

- **Metodi di pagamento gestibili** (migration `20260901090000`, ✅ APPLICATA) — tabella `metodi_pagamento` per-tenant, UI in **Impostazioni → Pagamenti** (`/office/impostazioni/pagamenti`, admin/ufficio, con audit). **Non è gated da nessun modulo: vale per tutti i clienti.** ⚠️ **`codice` immutabile** (è il testo in `spese.metodo_pagamento`), si rinomina solo `nome` — sempre con conferma. Ritirare ≠ cancellare. L'**AI vede l'elenco del tenant** (`promptScontrino(metodi)` + glossario; un codice inventato viene scartato) e le action validano con `metodoAmmesso` (lo schema zod non è più un enum chiuso). Lettore difensivo `_lib/metodi-pagamento.ts` → se la tabella manca tornano i tre di sempre.
- **Avviso dashboard giornate oltre soglia** — la soglia resta 10h (scelta cliente); la dashboard Kantiere segnala quante giornate/ore/chi restano ferme. `giornateOltreSoglia` **esclude oggi e le giornate rimaste aperte** (senza quei filtri su FPM direbbe 71 invece di 65).
- **Conferma passeggero PWA** — chi conferma un viaggio senza spuntare «sono l'autista» deve confermarlo; se dice che guidava torna al modulo con la casella evidenziata. Pezzo unico `_components/conferma-passeggero.tsx`, usato da viaggio-ritorno, partenza e Registra giornata (la vecchia «ore a mano» è stata tolta il 14/09). ⚠️ È un **pannello dentro il foglio**, non un dialog annidato (Radix lo tratterebbe come clic "fuori" e chiuderebbe quello sotto).

#### Cronologia della giornata + tasti ufficio (14/09/2026)

- **Cronologia** (migration `20260914090000`, ✅ APPLICATA): `timbrature.modalita` (vocabolario chiuso, scritta nello stesso insert in tutti i 15 punti — `origine` non diceva come) + azioni versione `pausa_ufficio`/`chiusura_ufficio`/`ricalcolo`. Storia **ricostruita dai dati** (`@kommessa/api/kantiere-cronologia`, puro+testato), non da un diario. Ogni modifica passa `prima` (`leggiStatoGiornata`) e le versioni vuote non si scrivono. UI: pannello laterale in Presenze e ore + bollino; tecnico = una riga «Corretta dall'ufficio». Giornate scritte a mano senza timbrature: pallino generico «5:00 di lavoro ordinario» **senza orario** (fra andata e ritorno) e riga «Senza timbrature · 5:00 di lavoro». ⚠️ Nuovi punti che inseriscono timbrature **devono** scrivere `modalita` (valore del CHECK). → `Logiche_Kantiere.md` §7.5.
- **`scrollbar-gutter`**: i gusci office/admin non scorrono mai sulla pagina (scorre `<main>`). `html:has([data-app-shell])` → `auto`, riserva sul `<main>` dei gusci. Prima si perdevano 15px su ogni pagina e i `fixed right-0` si fermavano a 1425/1440.
- **Tasti ufficio**: azioni di pagina e di barra = `<Button size="sm">` (40px, testo 12px, nero; outline per le secondarie). **Mai** tasti fatti a mano con `bg-primary`: il cobalto è per link, badge e stato «selezionato» di filtri e schede. Censimento ripetibile: `BANCO_CDP=9334 node scripts/banco-ui/tasti.mjs`.

Working language for the app UI is **Italian**. Preserve it.

#### Viaggio dentro «Registra giornata» (14/09/2026)

- **Percorso**: partenza e rientro agli estremi, **chi guidava per ogni tratta con strada** (etichetta compatta, solo dove c'è strada), tratte fra cantieri costruite dal sistema (dirette con km/tempo, nel menu due scelte affiancate «Diretta» / «Passando da» la sede, tempo correggibile con motivo; «passando da casa» tolta). Premendo «Registra giornata» il foglio **«Il viaggio»** chiede solo i dati obbligatori mancanti; la **barra dei tempi** (lavoro + viaggio, partenza/rientro) resta visibile sotto. Conferma passeggero **sempre**.
- **Ore**: andata e ritorno = tempo di viaggio fuori dall'orario dichiarato (vanno in `ore_viaggio`); le tratte fra cantieri stanno dentro l'orario e dal 15/09 sono **viaggio**: la fine si calcola (inizio + ore + pausa + tratte), con un buco fra i cantieri (`viaggioFraCantieri`, stesso calcolo in pagina e server); se la pausa cadrebbe sullo stesso cambio di una tratta va 30 minuti dopo l'arrivo (`SCARTO_PAUSA_MIN`), così pausa e viaggio restano due buchi distinti. Andata legata alla prima entrata, ritorno all'ultima uscita, scritte **insieme** (se falliscono si tolgono le timbrature appena scritte). Tutto validato prima di scrivere.
- **Codice**: puro `@kommessa/api/kantiere-percorso` (+ test), UI `mobile/kantiere/ore/_components/registra-giornata-dialog.tsx` + `percorso-giornata.tsx`, `/api/routing/stima` anche cantiere → cantiere, cache condivisa `_lib/routing/stima-cache.ts`. Banco `scripts/banco-ui/registra-giornata.mjs` (`BANCO_SALVA=1` salva sul tenant demo: ripulire dopo). Regole in `Logiche_Kantiere.md` §7.6.
- **15/09/2026, prove da telefono**: partenza e rientro di default la sede predefinita, senza abitazione privata (tutto il giorno in sede = niente partenza e rientro); tempo correggibile su ogni tratta fra cantieri, con motivo; si indica solo l'ora di inizio (fine = inizio + ore + pausa + tratte, con il conto a vista), chi guidava per tratta, pausa pranzo arancione, card «La giornata» più bassa e ad altezza fissa (le card sotto non si spostano con + e −).
- **Tolta la vecchia «Ore su un cantiere, con viaggio»** (`manuale-dialog.tsx` e il suo banco): Registra giornata è l'unico inserimento a mano del tecnico. `registraOreManuali` è stata eliminata il 15/09/2026; le tratte storiche che aveva scritto contano ancora nel ricalcolo. Interfaccia di Registra giornata rimpicciolita del 10% circa su richiesta del cliente (a schermo era grandina).

#### Ore pure, quote derivate, lavoro dalla sede e impostazioni (15/09/2026)

- **Si registra il dato puro**: `rapportino_righe.minuti_lavoro` / `minuti_viaggio` per cantiere (migration `20260914160000`, ✅ APPLICATA). Le quote si **derivano** dall'orario ordinario del tenant (`soglia_ore_ordinarie`, 8 h): **ordinarie** = lavoro + viaggio fino all'orario; **straordinarie** = lavoro oltre; **viaggio eccedente** = viaggio oltre (`ore_viaggio_ordinarie` / `ore_viaggio_eccedenti`, `rapportini.orario_ordinario_min`). Puro e testato: `@kommessa/api/kantiere-quote` (`quoteGiornata`, `quoteDaRiga`, `sommaQuote`, `quoteOre`, `minutiDaTimbrature`, `COLONNE_QUOTE`).
- ⚠️ **Scrittore unico** delle righe: `scriviRigheGiornata` / `aggiornaRigheGiornata` (`_actions/_lib/righe-giornata.ts`). Nuovi punti che scrivono ore **devono** passare di lì; chi legge usa `quoteDaRiga`/`quoteOre`, mai `ore_ordinarie` da solo (è solo la parte lavoro). Tolti `salvaMioRapportino`, `inviaMioRapportino`, `registraOreManuali`, `calcolaOreGiornata`, `minutiViaggioPerTarget`.
- **Giornate vecchie intatte**: config `quote_ore_dal` (FPM, DEMOC = 2026-09-15); righe con quote di viaggio null = vecchie, tutto il viaggio conta eccedente. API v1 `/ore`: campi di sempre invariati + `lavoro`, `viaggioOrdinario`, `viaggioEccedente`. Costi: tariffa ordinaria su lavoro + viaggio entro l'orario, `pctViaggio` solo sull'eccedente.
- **«Lavoro dalla sede sul progetto»** (flag in avvio turno, cambio cantiere, Registra giornata per cantiere): ore del cantiere, tratte da/verso la **sede predefinita**; stessa sede = nessuna tratta. `timbrature.sede_lavoro_id`; `/api/routing/stima` accetta `{ daSedeId, aSedeId }`. → `Logiche_Kantiere.md` §3.2.
- **Impostazioni Kantiere riordinate** (Orario e ore · Turni · Pause · Viaggi e chilometri · Approvazione giornate · Anomalie · Kontabilità) con descrizioni oggettive ed esempio calcolato; tolta `anomalie_ore_max` (mai letta); soglia di verifica ora con i decimali. Fix: salvare dall'elenco Dipendenti azzerava `costo_orario`.

#### Audit generale: sicurezza, convivenza e pulizia (15/09/2026)

- **Segreti** (cron, webhook, backfill): `segretoValido` / `bearerValido` in `_lib/segreto.ts`, mai `===`. **`?next=`** dopo login e callback: `percorsoInterno` (`_lib/percorso-sicuro.ts`), mai un URL esterno. **Super admin** solo da `app_metadata.platform_admin`: nessuna eccezione per email.
- ⚠️ **Tetto di 1000 righe di PostgREST confermato** (chiesto 5000, restituite 1000, senza errore): una lettura che deve essere completa (totali, export, API) va paginata. API v1: `LIMITE_MAX = 999` perché si chiede `limite+1`.
- **Nuove funzioni SECURITY DEFINER**: `revoke execute ... from public, anon, authenticated` se non servono agli utenti (le funzioni nuove in `public` nascono eseguibili da tutti).
- **Convivenza dei mondi**: pagine commesse mobile con `soloMondoCommesse()` (`mobile/_lib/mondo.ts`), `/office/tickets` chiuso ai tenant solo Kantiere, Kontabilità spenta = niente voce e `notFound()` (layout), `getAppModeCached` torna a `kommessa` se manca il modulo Kantiere, ⌘K filtrata per mondo. `app_mode=full` su mobile: il tab Kantiere prende il posto di Notifiche, Profilo resta.
- **Scritture ore**: `scriviRigheGiornata` inserisce le righe nuove e poi cancella le vecchie (se l'insert fallisce la giornata resta com'era); `inserisciPausaDichiarata` restituisce l'esito e chi chiude il turno si ferma se la pausa non entra.
- **Upload**: l'annullamento vale solo per un caricamento `uploading`, dell'autore o dell'ufficio (prima un file già sincronizzato finiva fra gli upload morti e veniva cancellato). La pagina Storage non manda più la password al browser.
- Migration **`20260915180000_sicurezza_privilegi_utenti_tenant`** preparata e provata in transazione annullata, **da applicare con Luca**. Punti ancora aperti → memoria `project-audit-generale-2026-09-15`.

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
