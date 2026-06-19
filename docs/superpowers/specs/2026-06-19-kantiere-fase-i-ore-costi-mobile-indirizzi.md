# Design — Kantiere Fase I · Ore & costi · PWA per-modalità · Indirizzi geocoding

**Versione**: 1.0
**Stato**: Approvato (utente, 19/06/2026)
**Dipende da**: Kantiere A→H (modulo completo, in prod, gated). Tutto additivo e gated → **Bertaiola non impattata**.

---

## 0. Premessa di sicurezza (prod)

Bertaiola Impianti è in produzione. Ogni modifica qui è **additiva** e **gated dal modulo `kantiere`** o da un nuovo flag `tenants.app_mode` il cui **default replica il comportamento attuale**. Vincolo ferreo: l'esperienza mobile e office di Bertaiola resta **identica byte-per-byte**.

Tre sotto-progetti indipendenti (A/B/C); ognuno compila e funziona da solo; si implementano in parallelo su directory disgiunte.

---

## A — Ore, regole di maggiorazione & costi (office + schema)

### Schema (migration `20260623000000_kantiere_regole_costi.sql`, additiva)
- `dipendenti.costo_orario numeric(8,2) null` — tariffa oraria opzionale.
- `public.kantiere_regole_ore`:
  - `id uuid pk`, `tenant_id uuid not null → tenants`, `nome text not null`,
  - `tipo text not null check (tipo in ('soglia_giornaliera','soglia_settimanale','notturno','festivo','weekend','maggiorazione_straordinario','maggiorazione_viaggio'))`,
  - `attiva boolean not null default true`,
  - `params jsonb not null default '{}'` — per `soglia_*`: `{ ore: number }`; per `notturno`: `{ da: "HH:MM", a: "HH:MM" }`; altri: `{}`,
  - `maggiorazione_pct numeric(5,2) not null default 0` — es. 25.00 = +25%,
  - `priorita int not null default 100`,
  - `created_at, updated_at timestamptz`.
- `public.kantiere_regola_ambito`:
  - `id uuid pk`, `regola_id uuid not null → kantiere_regole_ore on delete cascade`,
  - `tenant_id uuid not null → tenants`,
  - `tipo_target text not null check (tipo_target in ('tenant','dipendente','cantiere'))`,
  - `target_id uuid null` (null ⇔ tipo_target='tenant'),
  - `unique (regola_id, tipo_target, target_id)`.
- RLS: read tenant; write owner/admin/office; platform-admin read (come le altre tabelle Kantiere). `tg_set_updated_at` su regole.
- Seed di default per-tenant: lo crea l'app alla prima apertura della pagina Regole se il tenant non ha regole (azione `assicuraRegoleDefault`). Default indicativi (tutti editabili): soglia_giornaliera 8h; maggiorazione_straordinario +25%; maggiorazione_viaggio +15%; notturno 22:00–06:00 +30%; festivo +50%; weekend +50%. **NB**: l'utente fornirà in seguito la tabella reale FPM → i default servono solo a popolare.

### Libreria pura `packages/api/src/kantiere-costi.ts` (+ test Vitest `kantiere-costi.test.ts`)
- Tipi `RegolaOre`, `RegolaAmbito`, `RigaCosto`.
- `risolviRegoleEffettive({ dipendenteId, cantiereId, regole, ambiti })` → regole applicabili, deduplicate per dimensione con priorità `dipendente > cantiere > tenant`.
- `calcolaCostoGiornata({ righe, regoleEffettive, costoOrario, data })` → `{ ore_ordinarie, ore_straordinarie, ore_viaggio, ore_weekend, ore_festivo, costo_totale }`. Costo = Σ ore_categoria × costoOrario × (1 + maggiorazione_pct/100). Se `costoOrario` null → `costo_totale = null` (mostra solo ore).
- `aggregaCosti(righeCosto, per)` → aggregato per dipendente/cantiere/periodo (estende `aggregaOre`).
- `festivitaItaliane(anno)` → set date festività nazionali IT (Capodanno, Epifania, 25 Apr, 1 Mag, 2 Giu, 15 Ago, 1 Nov, 8 Dic, 25–26 Dic, Pasqua/Pasquetta calcolate). Weekend = sab/dom da `data`.
- **Calcola davvero ora**: ordinarie/straord/viaggio + %, weekend/festivo a livello-giorno, soglia_settimanale in aggregazione. **Predisposto** (regola salvata, classificazione automatica futura): `notturno` (richiede split orario degli intervalli grezzi) → onesto in UI come "predisposto".

### UI office
- Nuova voce sidebar **"Ore e costi"** dentro la sezione KANTIERE (`office-shell-client.tsx` → `buildNav`), tra Rapportini e Report.
- Pagina `/office/kantiere/ore-costi` con tab interne: **Regole** (CRUD denso + ambito a chip), **Tariffe** (costo_orario inline su dipendenti), **Costi** (aggregati ore pesate + € per dipendente/cantiere/periodo, export CSV `;`+BOM, decimali IT).
- Azioni server `office/_actions/kantiere-regole.ts` (`creaRegola`, `aggiornaRegola`, `eliminaRegola`, `impostaAmbiti`, `assicuraRegoleDefault`) e `aggiornaCostoOrarioDipendente`. Gating admin/office + `tenantHasModule('kantiere')`.

---

## B — PWA per-modalità (mobile) + super admin

### Flag
- `tenants.app_mode text not null default 'kommessa' check (app_mode in ('kommessa','kantiere','full'))` (migration `20260623010000_tenants_app_mode.sql`).
  - `kommessa` = comportamento **attuale** (shell `gestione`/`campo` per ruolo). **Default → Bertaiola identica.**
  - `kantiere` = PWA **solo Kantiere** (focus di oggi). FPM.
  - `full` = layout combinato (kommessa + kantiere), ripensato, tutte le funzioni — baseline funzionale, iterabile.

### Super admin
- In `admin/tenants/[id]/_components/tab-moduli.tsx`: selettore "Esperienza mobile" (Completa `full` / Kommessa `kommessa` / Solo Kantiere `kantiere`), visibile sempre, ma `kantiere`/`full` consigliati solo con modulo Kantiere attivo. Scrive `tenants.app_mode` via nuova azione `aggiornaAppModeTenant` in `admin/_actions/tenants.ts` (+ audit, come `aggiornaModuloTenant`).

### Mobile shell
- `packages/api/src/types/permissions.ts`: estendere `MobileShell = 'gestione' | 'campo' | 'kantiere' | 'full'`. Nuovo helper `risolviMobileShell({ appMode, role })`:
  - `kommessa` → `getMobileShell(role)` (gestione/campo) — INVARIATO.
  - `kantiere` → `'kantiere'`.
  - `full` → `getMobileShell(role)` ma con voci Kantiere iniettate (vedi sotto).
- `apps/web/app/mobile/layout.tsx`: legge `tenants.app_mode` (via tenant cache) e passa shell risolto a `BottomNavShell`.
- `bottom-nav-shell.tsx`: nuovo set tab per `shell==='kantiere'`: **Cantieri · Scansiona (FAB primario, `QrCode`, come il vocale) · Ore · Profilo** (+ home `/mobile/kantiere`). Per `full`: shell corrente + slot Kantiere (Scansiona o entry "Kantiere").

### Nuove route `/mobile/kantiere/`
- `layout.tsx` — guard: `guardMobile()` + `tenantHasModule('kantiere')` + (`app_mode in ('kantiere','full')`), altrimenti `redirect('/mobile')`.
- `page.tsx` — home/oggi Kantiere (mio stato timbratura, cantieri recenti, link rapidi).
- `scansiona/page.tsx` — scanner QR (riusa flusso `/t` + `kantiere-timbra`), grande e "a prova di cantiere".
- `cantieri/page.tsx` (+ `[id]` sola lettura) — lista cantieri assegnati.
- `ore/page.tsx` — sposto qui `/mobile/ore`; vecchio path redirect retrocompatibile.
- **Niente** commesse/foto/file/voice-intake in shell `kantiere`.

### Bertaiola-safe
- `app_mode` default `kommessa` → `mobile/layout.tsx` invariato per Bertaiola; shell `gestione`/`campo` **non modificati**. Le nuove route gated. Zero diff sul percorso Bertaiola.

---

## C — Completamento indirizzi (geocoding)

- Route `POST /api/geocode/autocomplete` (auth tenant via `requireTenantContext`, body `{ query }` Zod, debounce lato client). Provider **Photon** (`https://photon.komoot.io/api?q=...&lang=it&limit=6`) → fallback **Nominatim** (`https://nominatim.openstreetmap.org/search?format=jsonp...`) con header `User-Agent: Kommessa/1.0 (geocoding)` per policy OSM. Ritorna `{ suggestions: { label, lat, lng }[] }`. Fail-soft (lista vuota).
- Componente `apps/web/app/_components/address-autocomplete.tsx` (client): input + dropdown debounced (modello `tag-editor.tsx`), `value`, `onChange(label)`, `onSelect({label,lat,lng})`, gestione tastiera (↑↓/Enter/Esc), blur-timeout.
- Wiring **cantieri office** (`cantieri-client.tsx` create + `cantiere-detail-client.tsx` edit): campi `indirizzo` e `sede_partenza` usano il componente; salvano testo **+ lat/lng** nelle 4 colonne esistenti. Azione `office/_actions/cantieri.ts` estesa con i 4 campi lat/lng (cast `as never` se i tipi generati non li hanno).
- Predispone calcolo tragitto futuro (OSRM, fuori scope).

---

## Integrazione & verifica (cross-fase)
- A/B/C su directory disgiunte → implementabili in parallelo.
- Punti di contatto da verificare a fine lavoro:
  - sidebar office (`buildNav`) — solo A aggiunge "Ore e costi".
  - `tab-moduli.tsx` / `admin/_actions/tenants.ts` — solo B.
  - `cantieri-client.tsx` / `_actions/cantieri.ts` — solo C.
  - `permissions.ts` — solo B; `office-shell-client` non toccato da B.
- Migration applicate via Supabase MCP (autorizzato), con verifica RLS/CHECK e Bertaiola-safe (default `kommessa`, tabelle nuove vuote per Bertaiola).
- Gate finale: `pnpm typecheck` + `pnpm build` + Vitest verdi; review integrazione + **diff-check Bertaiola** (nessuna modifica a percorsi non-gated).

## Fuori scope (YAGNI)
Calcolo km/tragitto reale, mappa interattiva, geofencing, classificazione automatica notturno da intervalli grezzi, `.xlsx`, permessi granulari, UX-rethink profondo di `full` (baseline funzionale ora).
