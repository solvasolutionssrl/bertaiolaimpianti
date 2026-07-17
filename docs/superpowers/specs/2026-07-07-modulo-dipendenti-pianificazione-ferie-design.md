# Modulo Dipendenti — Pianificazione settimanale + Ferie e permessi

**Versione**: 1.0
**Stato**: approvato (brainstorming) — in implementazione
**Data**: 07/07/2026
**Branch**: `feat/dipendenti-pianificazione` (NON pushare in produzione finché il cliente non conferma il pagamento)
**Tenant target**: FPM Impianti (`FPMIMP`, `app_mode=kantiere`). Bertaiola (`BER`) intatta: modulo spento.

---

## 1. Obiettivo

Nuovo **modulo `dipendenti`** (attivabile per-tenant dal super admin, come `kantiere`) che rende la lista dipendenti sempre più centrale e ci appende sopra due funzioni:

1. **Pianificazione settimanale** — calendario "in avanti": chi va dove, che giorno, con che orario, con che mezzi. Include eventi di gruppo (formazioni) e rilevamento conflitti. Notifiche ai dipendenti alla pubblicazione.
2. **Ferie e permessi** — richiesta (desktop + mobile), approvazione per gruppi, confluenza nella pianificazione come indisponibilità.

Ordine di lavoro: **prima Pianificazione, poi Ferie/permessi**.

> Nota strategica salvata a memoria: la pagina/scheda **Dipendenti** (oggi in `/office/kantiere/dipendenti`, gated `kantiere`) diventerà l'anagrafica globale del personale e in futuro sarà disponibile anche nel mondo commesse (Bertaiola). Per ora resta dov'è; il nuovo modulo `dipendenti` porta le funzioni nuove.

## 2. Vincoli globali (verbatim, valgono per ogni task)

- **Bertaiola-safe e FPM-safe**: ogni tabella nuova + modulo spento su Bertaiola = zero impatto. Feature gated dal modulo `dipendenti`.
- **Deploy**: solo `git push origin main` (qui NON si pusha: lavoro su branch, niente prod). Mai `vercel deploy --prod`.
- **Migrazioni**: scrivere solo il file SQL in `supabase/migrations/`; additivo, idempotente. In questa fase le applico al **DB di produzione** (con cautela, gated) via MCP `apply_migration` perché i dati verranno usati.
- **Nuove colonne NON segrete su `tenants`**: `grant select (col) to anon, authenticated` (non serve qui: non tocchiamo `tenants`).
- **Lingua UI**: italiano. Copy: mai "col", mai trattino lungo "—" nei testi UI.
- **Date/ora**: sempre `Europe/Rome` via helper (`romeDay`, `romeDayBoundsUtc`, `@kommessa/api/rome-time`); formatter UI con `timeZone` esplicito. Mai `Date.now()`/`new Date()` in `useState(initializer)` o nel render SSRato di un client component.
- **Mobile**: riusare i pattern collaudati — `Portal` (modali fuori dalla bottom-nav), foglio full-screen header(`shrink-0`)/body(`min-h-0 flex-1 overflow-y-auto`)/footer(`shrink-0`), `TimeField` per il time-picker iOS, `max-h` che sottrae `env(safe-area-inset-*)`, `text-base` anti-zoom iOS.
- **Boundary Server→Client**: mai passare icone Lucide (funzioni) come prop da server component; le icone si scelgono nel client.

## 3. Architettura del modulo

### 3.1 Registrazione modulo
- `packages/api/src/modules.ts`: aggiungere `'dipendenti'` a `ModuleCode`, `MODULE_CODES`, `OPTIONAL_MODULE_CODES`.
- `apps/web/app/admin/_actions/tenants.ts`: allargare `TENANT_MODULE_SCHEMA.moduleCode` e la firma di `aggiornaModuloTenant` a `z.enum(['kantiere','dipendenti'])`. Nessuna cascata app_mode per `dipendenti` (non tocca la shell mobile).
- `apps/web/app/admin/tenants/[id]/page.tsx` + `_components/tab-moduli.tsx`: toggle "Dipendenti — Pianificazione e permessi". Quando attivo, due sotto-flag (config del modulo): `pianificazione_attiva`, `ferie_attiva` (default `true`).
- Reader config: `apps/web/app/_lib/dipendenti-config.ts` → `leggiConfigDipendenti(supabase, tenantId)` (service o server) che legge `tenant_modules.config` del modulo `dipendenti` con default difensivi.

### 3.2 Namespace route + gating
- Nuova area **`/office/personale/`** con `layout.tsx` che fa: `requireTenantContext`, `role ∈ {admin,office}`, `tenantHasModule('dipendenti')` → altrimenti `redirect('/office')`.
  - `/office/personale/pianificazione`
  - `/office/personale/permessi` (fase 2)
  - `/office/personale/gruppi` (fase 2)
- Ogni server action guarda ruolo + `tenantHasModule('dipendenti')` + eventuale sub-flag.
- **Nav office**: passare `hasDipendenti` da `office/layout.tsx` → `OfficeShellClient` → `buildNav`. Aggiungere una sezione **"Personale"** (o voci dentro "Azienda") con "Pianificazione", "Permessi", "Gruppi" gated da `hasDipendenti`. Compare solo se il modulo è attivo (FPM); su Bertaiola no.
- **Mobile**: voce "Richiedi permesso" nell'area personale (`/mobile/profilo`) e pagina "La mia settimana" (`/mobile/pianificazione`), gate `tenantHasModule('dipendenti')`.

## 4. Fase 1 — Pianificazione settimanale

### 4.1 Modello dati (migration additiva, gated dal modulo)

`pianificazione_blocchi` — un blocco pianificato (una squadra su un cantiere in un giorno/fascia, oppure un evento di gruppo):
- `id` uuid PK · `tenant_id` uuid NOT NULL FK tenants cascade
- `data` date NOT NULL
- `tipo` text NOT NULL CHECK in ('cantiere','evento')
- `cantiere_id` uuid FK cantieri ON DELETE CASCADE (nullable; obbligatorio se tipo='cantiere')
- `titolo` text (nullable; per evento, es. "Formazione antincendio")
- `luogo` text (nullable; per evento)
- `fascia` text NOT NULL CHECK in ('giornata','mattina','pomeriggio','custom')
- `ora_inizio` time NOT NULL · `ora_fine` time NOT NULL (SEMPRE risolti dai preset → conflitti = overlap uniforme)
- `note` text
- `stato` text NOT NULL default 'bozza' CHECK in ('bozza','pubblicato')
- `pubblicato_at` timestamptz · `pubblicato_da` uuid FK users
- `created_by` uuid FK users · `created_at` · `updated_at` (trigger)
- CHECK coerenza target: `(tipo='cantiere' AND cantiere_id IS NOT NULL) OR (tipo='evento' AND titolo IS NOT NULL)`
- Indici: `(tenant_id, data)`, `(cantiere_id)`.

`pianificazione_membri` — le persone del blocco:
- `blocco_id` uuid FK pianificazione_blocchi ON DELETE CASCADE
- `dipendente_id` uuid FK dipendenti ON DELETE CASCADE
- `tenant_id` uuid NOT NULL (denormalizzato per RLS)
- PK (blocco_id, dipendente_id). Indice `(dipendente_id)`.

`pianificazione_blocco_mezzi` — i mezzi del blocco:
- `blocco_id` uuid FK cascade · `mezzo_id` uuid FK mezzi cascade · `tenant_id` uuid NOT NULL
- PK (blocco_id, mezzo_id).

RLS (pattern `cantieri`): `enable row level security`; `_tenant_read` SELECT `tenant_id = current_tenant_id()`; `_office_write` FOR ALL per `owner/admin/office`; `_platform_admin_read` SELECT `is_platform_admin()`. Per le due tabelle-figlie (membri/mezzi) lo scoping usa `tenant_id` denormalizzato (semplice e coerente con le policy office).

Preset fasce (default risolti; poi eventualmente da config tenant): giornata 08:00–17:00, mattina 08:00–12:00, pomeriggio 13:00–17:00, custom = orari espliciti.

### 4.2 Logica pura + test — `packages/api/src/pianificazione.ts` (+ `.test.ts`)
- `ORARI_FASCIA: Record<Fascia,{inizio,fine}>` e `risolviFascia(fascia, custom?)` → `{inizio,fine}` (`'HH:MM'`).
- `minutiDa(hhmm)` → minuti dal midnight.
- `intervalliSovrapposti(a,b)` → boolean (half-open).
- `rilevaConflittiDipendente(voci: {dipendenteId, data, inizio, fine, refId}[])` → coppie in conflitto (stesso dipendente, stessa data, overlap). Copre blocchi + eventi + (fase 2) assenze proiettate come voci.
- `rilevaConflittiMezzo(voci: {mezzoId, data, inizio, fine, refId}[])` → coppie mezzo doppio-prenotato.
Test: presets, overlap edge (touching non-overlap), stesso giorno diversi dipendenti no conflitto, mezzo doppio, custom.

### 4.3 Server actions — `apps/web/app/office/_actions/pianificazione.ts`
Tutte guardate: `role ∈ {admin,office}` + `tenantHasModule('dipendenti')` + `pianificazione_attiva`.
- `creaBlocco(input)` — tipo cantiere|evento, `data`, `fascia`(+custom), `cantiereId?`/`titolo?`/`luogo?`, `dipendentiIds[]`, `mezziIds[]`, `note?`. Risolve orari, valida conflitti (ritorna `warnings[]` per persone già occupate / mezzi doppi; HARD block per assenza approvata fase 2), inserisce blocco+membri+mezzi in transazione logica (insert sequenziali con cleanup best-effort). Audit `auditTenant`.
- `aggiornaBlocco(bloccoId, patch)` — modifica orari/fascia/cantiere/membri/mezzi/note; ri-valida.
- `eliminaBlocco(bloccoId)`.
- `pubblicaSettimana({ lunediISO })` — porta `bozza→pubblicato` tutti i blocchi con `data` nel range [lun, dom]; per ogni dipendente coinvolto con `user_id`: insert `notifiche` (tipo `pianificazione_pubblicata`) + push (`inviaPushAUtente`, best-effort). Ritorna conteggio pubblicati + notificati.
- `copiaSettimanaPrecedente({ lunediISO })` — clona i blocchi della settimana precedente come `bozza` nella settimana target (membri+mezzi inclusi), skip duplicati.
- Reader per la pagina: `caricaSettimana(lunediISO)` → blocchi+membri+mezzi del range, join cantieri/mezzi/dipendenti.

### 4.4 Notifiche
- Migration: insert in `notification_event_types` di `pianificazione_pubblicata` (label "Pianificazione pubblicata", default in_app+push on, non critical).
- Payload deep-link → `/mobile/pianificazione`.

### 4.5 UI office — griglia settimanale
`/office/personale/pianificazione/page.tsx` (server: carica settimana da `?lun=YYYY-MM-DD`, default lunedì corrente) + client `pianificazione-client.tsx`:
- Header: navigazione settimana (‹ oggi ›), range date, contatore bozze, bottoni **"Copia settimana precedente"** e **"Pubblica settimana"** (con conferma che mostra quante persone verranno avvisate).
- **Vista primaria SETTIMANA**: righe = dipendenti attivi (a_turni prima), colonne = 7 giorni (lun→dom, festivi tenui). Ogni cella mostra i blocchi del giorno per quella persona come chip (nome cantiere / titolo evento + icona fascia + pallino colore-cantiere). Celle vuote cliccabili → assegna. Conflitti = chip in rosso con tooltip.
- **Vista secondaria GIORNO** (toggle): righe = cantieri, colonne = dipendenti (come richiesto dal cliente) per un singolo giorno; utile per "chi c'è oggi dove".
- **Dialog assegnazione** (nuovo blocco): scegli tipo (cantiere/evento), giorno, fascia (preset giornata/mattina/pomeriggio + custom con `TimeField`), cantiere (picker ricerca a token riusato) o titolo+luogo, **multi-select dipendenti**, **multi-select mezzi**, note. Mostra avvisi di conflitto inline prima di salvare.
- Filtri: cerca dipendente, "solo a_turni". Legenda colori. Stato bozza/pubblicato visibile (badge/opacità).
- Densità professionale office (riferimento scheda cantiere): compatto, elegante, accenti ink/ambra/emerald.

### 4.6 Mobile — "La mia settimana"
`/mobile/pianificazione/page.tsx` (gate modulo): il dipendente loggato vede i propri blocchi **pubblicati** della settimana (giorno per giorno: cantiere/evento, orario, mezzi, colleghi). Deep-link dalle notifiche. Sola lettura in fase 1.

## 5. Fase 2 — Ferie e permessi

### 5.1 Permesso di approvazione (non un ruolo nuovo)
Estendere il sistema permessi granulari:
- `packages/api/src/types/permissions.ts`: aggiungere area `permessi` con livelli `['none','approva']` (label "Permessi"). Default: admin `approva`, office `none`, tecnico `none`, cliente `none`.
- Migration `role_default_permissions()` (create or replace) allineata + mirror TS `getRoleDefaultPermissions`.
- UI permessi (`office/impostazioni/utenti/permissions-sheet.tsx`) mostra la nuova area → il super/admin dà `approva` ai 3 utenti approvatori.

### 5.2 Gruppi di approvazione (migration)
`gruppi_approvazione` — `id`, `tenant_id`, `nome`, `approver_user_id` uuid FK users, `note`, timestamps. RLS office-write/tenant-read/platform-read.
`gruppo_membri` — `gruppo_id` FK cascade, `dipendente_id` FK cascade, `tenant_id`. PK (gruppo_id, dipendente_id) + **unique (tenant_id, dipendente_id)** (un dipendente in un solo gruppo). Fallback: dipendente senza gruppo → approvatore di default (config `approvatore_default_user_id` o tutti gli utenti con `permessi=approva`).
Pagina `/office/personale/gruppi`: CRUD gruppi, assegna approvatore, assegna membri (dropdown ricerca).

### 5.3 Richieste (migration)
`permesso_richieste` — `id`, `tenant_id`, `dipendente_id` FK, `tipo` text (catalogo, sotto), `data_inizio` date, `data_fine` date, `ora_inizio` time null, `ora_fine` time null, `tutto_il_giorno` boolean, `motivo` text, `stato` text CHECK ('in_attesa','approvato','rifiutato','modifica_richiesta') default 'in_attesa', `approver_user_id` uuid, `deciso_da` uuid, `deciso_at` timestamptz, `decisione_nota` text, `created_at`. Indici `(tenant_id, stato)`, `(dipendente_id, data_inizio)`.
RLS: office/admin tenant-wide; il **richiedente** (tecnico) può inserire/leggere le proprie via `dipendente_del_utente()`; l'**approvatore** legge/aggiorna quelle del proprio gruppo (policy via join gruppo→approver = auth.uid()).

### 5.4 Catalogo tipi permesso
Da ricerca normativa (documento `documentazione_generale/08_LOGICHE/Permessi_Ferie_Normativa_IT.md`). Catalogo come costante TS `PERMESSO_TIPI` (`packages/api/src/permessi-tipi.ts`): codice, label, unità (giorni/ore), retribuito, serve_giustificativo. Default v1: ferie, ROL, ex-festività, permesso retribuito, permesso non retribuito, malattia, L.104, congedo parentale, lutto, matrimonio, donazione sangue, visita medica. Il `tipo` salvato è lo slug.

### 5.5 Azioni + UI
- `richiediPermesso` (mobile profilo + desktop): tipo, date/ore, motivo → crea `in_attesa`, notifica l'approvatore del gruppo.
- `decidiPermesso(id, esito, nota)`: approva/rifiuta/chiedi-modifica → notifica il richiedente.
- Desktop `/office/personale/permessi`: lista richieste (filtri stato/tipo/persona), card con dettaglio, azioni. Storico decisioni.
- Mobile `/mobile/profilo`: "Richiedi permesso" (foglio full-screen, `TimeField`, `Portal`), + "Le mie richieste" con stato.

### 5.6 Integrazione con la pianificazione
- Le richieste **approvate** si proiettano come voci di occupazione nel range → `rilevaConflittiDipendente` le include → assegnare una persona in ferie/permesso su un cantiere dà **conflitto hard** (blocco con avviso). In griglia settimanale la cella mostra un badge "Ferie/Permesso" per i giorni coperti.

## 6. Sicurezza / RLS (riepilogo)
- Tutte le tabelle nuove: RLS on, `tenant_read` (`current_tenant_id()`), `office_write` (owner/admin/office), `platform_admin_read`.
- `permesso_richieste`: aggiunge self-insert/self-read del richiedente (`dipendente_del_utente()`) e read/update dell'approvatore del gruppo.
- Notifiche cross-utente inserite via **service role** (l'attore non può inserire notifiche per altri sotto RLS) — pattern `notificaModificaTecnicoOffice`.

## 7. Operatività
- Branch `feat/dipendenti-pianificazione`. Commit locali per fase; **niente push**.
- Migrazioni applicate al DB prod via MCP (additive/idempotenti). Modulo `dipendenti` acceso **solo per FPM**; Bertaiola invariata.
- **Dev server locale** per la demo (`pnpm --filter @kommessa/web dev`).
- Guard build: `pnpm --filter @kommessa/web typecheck`; test pacchetto api `pnpm --filter @kommessa/api test`.

## 8. Possibili aggiunte (backlog → file `documentazione_generale/08_LOGICHE/Dipendenti_Possibili_Aggiunte.md`)
- **Analisi pianificato vs consuntivo** (timbrature reali vs pianificazione): scostamenti ore/persone/cantiere.
- Monte-ore ferie (maturazione/residui) secondo CCNL — v1 ne è fuori.
- Ricorrenze/ripetizioni di blocco; template settimana-tipo.
- Drag&drop delle assegnazioni; vista mensile.
- Notifiche mirate al singolo ritocco (non solo pubblicazione settimana).
- Export PDF/stampa della settimana per cantiere.
- Conflitto competenze/patenti mezzo (chi può guidare cosa).
- Estensione anagrafica Dipendenti al mondo commesse (Bertaiola).

## 9. Ordine di implementazione
1. **Fase 0**: modulo `dipendenti` (registry + admin toggle + gating + nav + config reader) + migration modulo/config.
2. **Fase 1**: pianificazione (migration tabelle, `pianificazione.ts` puro+test, actions, griglia office, notifiche, mobile "la mia settimana"). Applico migration a prod, accendo FPM, dev server, demo.
3. **Fase 2**: ferie/permessi (ricerca normativa già lanciata → doc, permission area, gruppi, richieste, UI desktop+mobile, integrazione conflitti).
