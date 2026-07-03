# Popolamento cantieri FPM — Implementation Plan

> **For agentic workers:** implementare task-by-task. Step con checkbox (`- [ ]`).

**Goal:** popolare i 190 cantieri/commesse attivi di FPM in `public.cantieri` (mondo kantiere), preservando i codici commessa del cliente e senza rompere i turni aperti su Monfalcone; poi geocodificare gli indirizzi.

**Architecture:** migration additiva su `cantieri` (4 colonne) → sorgente JSON committata generata dall'Excel → script Node idempotente (dry-run default, target esplicito) che inserisce/aggiorna via service-role, con guard update-in-place per Monfalcone → geocoding Google che arricchisce il JSON e i lat/lng → wiring UI per mostrare/cercare il codice loro + badge "da verificare".

**Tech Stack:** Supabase Postgres (SQL migration), Node `.mjs` (fetch REST, service-role), Python/openpyxl (solo per generare il JSON, già fatto), Next.js/React (wiring UI office/mobile kantiere).

## Global Constraints

- **Bertaiola-safe / FPM-safe**: tutto gated `kantiere`; nessuna colonna esistente modificata in modo distruttivo; Bertaiola (mondo commesse) mai toccata.
- **Migration = solo file SQL**; l'apply al DB (locale o cloud) lo fa l'umano (`supabase db push` / `db reset`).
- **Nessun `git push`** finché non richiesto (deploy = push su main).
- **Segreti**: `GOOGLE_MAPS_API_KEY` e service-role solo da `apps/web/.env.local` (gitignored); mai in commit/stdout.
- **Codice cliente sacro**: `codice_commessa` verbatim, mai riformattato, visibile e cercabile; codice interno `CAN-xxx` nascosto.
- **Guard Monfalcone**: la riga esistente (QR attivo, turni possibili) si **aggiorna per `id`**, mai delete+reinsert, mai duplicata.

---

## File Structure

- `supabase/migrations/20260703000000_cantieri_fpm_fields.sql` — **Create**. 4 colonne + unique index.
- `scripts/data/cantieri-fpm.json` — **Create (fatto)**. 190 record normalizzati dall'Excel.
- `scripts/import-cantieri-fpm.mjs` — **Create**. Import idempotente, dry-run default, target `local|prod` esplicito, guard Monfalcone.
- `scripts/geocode-cantieri-fpm.mjs` — **Create**. Fase 2: legge il JSON, chiama Google Geocoding, riscrive lat/lng nel JSON; opzionale patch DB.
- UI wiring (Task 5) — **Modify** superfici cantiere per mostrare/cercare `codice_commessa` + badge `indirizzo_da_verificare`. File esatti individuati in Task 5.

---

## Task 1: Migration additiva

**Files:** Create `supabase/migrations/20260703000000_cantieri_fpm_fields.sql`

- [ ] **Step 1: scrivere la migration** (4 colonne nullable + unique partial index su `(tenant_id, codice_commessa)`; `indirizzo_da_verificare boolean not null default false`; commenti colonna).
- [ ] **Step 2: verifica statica** — la migration è additiva, `if not exists` ovunque, nessun `not null` senza default, nessun drop. Bertaiola non impattata.
- [ ] **Step 3: apply (umano)** — `supabase db push` (cloud) oppure `supabase db reset` (locale). *Non eseguito dall'agente.*

## Task 2: Sorgente JSON (FATTO)

**Files:** `scripts/data/cantieri-fpm.json` (190 record).

Mapping: A→`codice_commessa` (verbatim), B→`nome`, C→`cliente_nome`, D→`indirizzo` (null se "Non disponibile"), F→`categoria`, E→`affidabilita_nota`, G→`verifica`; derivati `da_verificare`+`motivo_verifica` (flag se NON esplicitamente OK con indirizzo reale → 83/190 flaggati); `indirizzo_lat/lng/normalizzato` = null (riempiti in fase 2).

- [x] Generato e verificato: 190 record, 190 codici unici, 181 con indirizzo, Monfalcone (25098) presente.

## Task 3: Script import — fase 1 (dati, senza coordinate)

**Files:** Create `scripts/import-cantieri-fpm.mjs`

**Interfaces / comportamento:**
- Args: `--target=local|prod` (obbligatorio), `--apply` (default = dry-run), `--yes-prod` (obbligatorio se `--target=prod --apply`).
- Env: prod da `apps/web/.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`); local da `http://127.0.0.1:54321` + `SUPABASE_LOCAL_SERVICE_ROLE_KEY`.
- Risolve tenant per `slug=FPMIMP`. Precheck: se la colonna `codice_commessa` non esiste → abort ("applica la migration").
- Genera `CAN-xxx` con la stessa logica di `prossimoCodiceCantiere` (`CAN-` + 5 cifre, max+1).
- Guard Monfalcone: la riga esistente senza `codice_commessa` con nome ~ /MONFALCONE|FINCANTIERI/i → mappata al codice 25098, **UPDATE per id**, mai insert.
- Per riga: esistente per `codice_commessa` → PATCH (nome, cliente, indirizzo, categoria, flag, lat/lng) **senza toccare `codice`/`id`/`commessa_id`/`stato`**; altrimenti INSERT con nuovo CAN-xxx.
- Idempotente (rerun = 0 insert, N update). Mai delete.

- [ ] **Step 1:** scrivere lo script con la logica sopra + output di piano (dry-run stampa: X insert, Y update, Monfalcone→id).
- [ ] **Step 2: dry-run** — `node scripts/import-cantieri-fpm.mjs --target=<t>`. Atteso: piano stampato, **0 scritture**, count coerente (≈189 insert + 1 update Monfalcone se il target contiene già FPM+Monfalcone).
- [ ] **Step 3: apply** — target confermato dall'utente. Atteso: insert/update eseguiti, Monfalcone stesso `id`, `codice_commessa` unici.
- [ ] **Step 4: verifica** — rerun dry-run → 0 insert (idempotenza); `count(*)` FPM cresciuto del previsto; spot-check 3 righe.

## Task 4: Geocoding — fase 2 (ULTIMO step)

**Files:** Create `scripts/geocode-cantieri-fpm.mjs`

**Comportamento:** legge `scripts/data/cantieri-fpm.json`, per ogni record con `indirizzo` e senza `indirizzo_lat`, chiama **Google Geocoding API** (`GOOGLE_MAPS_API_KEY` da env), scrive `indirizzo_lat/lng/normalizzato` nel JSON (reproducibile, committabile). Poi rerun di Task 3 (o `--patch-coords`) porta i lat/lng in DB. I 9 senza indirizzo restano null+flaggati.

- [ ] **Step 1 (reminder a Luca prima di partire):** in Google Cloud abilitare **Geocoding API** (+ **Places API** per l'autocomplete UI futuro), restringere la key, quota giornaliera.
- [ ] **Step 2:** scrivere lo script (rate-limit gentile, retry, log per riga, mai stampare la key).
- [ ] **Step 3: run** — `node scripts/geocode-cantieri-fpm.mjs`. Atteso: ~181 geocodificati, JSON aggiornato, log dei falliti.
- [ ] **Step 4:** portare i lat/lng in DB (rerun import) sul target confermato.

## Task 5: Wiring UI — codice loro visibile/cercabile + badge

**Files (Modify):** superfici cantiere office/mobile che oggi mostrano `codice` (CAN-xxx) → mostrare `codice_commessa` con fallback a `codice`; includere `codice_commessa` e `cliente_nome` nella ricerca cantieri; badge ambra se `indirizzo_da_verificare`. Punti noti: `office/kantiere/cantieri/**` (lista + dettaglio + stampa), eventuale picker cantiere mobile. Elenco esatto da confermare leggendo i componenti prima di editare.

- [ ] **Step 1:** censire i punti che leggono `cantiere.codice`/`nome` per lista/ricerca (grep mirato).
- [ ] **Step 2:** mostrare `codice_commessa ?? codice`; aggiungere `codice_commessa`+`cliente_nome` ai campi di ricerca.
- [ ] **Step 3:** badge "Da verificare" (ambra) dove `indirizzo_da_verificare`.
- [ ] **Step 4:** `pnpm --filter @kommessa/web typecheck` verde; controllo che Bertaiola (no kantiere) non veda nulla di nuovo.

---

## Self-Review

- **Spec coverage:** migration §3 → T1; JSON §5 → T2; import + guard Monfalcone §5 → T3; geocoding §6 → T4; UI display/search + badge §4/§7 → T5. ✓
- **Ordine sicuro:** T1 apply (umano) → T3 dry-run → T3 apply (conferma target) → T4 geocoding → T5 UI. Nessuno step scrive su DB senza target esplicito + conferma.
- **Rischio Monfalcone:** coperto da guard update-in-place + verifica "stesso id".
- **Out-of-scope:** Places Autocomplete per i 9 mancanti; contenitore-commessa 1:N; nuova modalità scelta cantiere lato tecnico.
