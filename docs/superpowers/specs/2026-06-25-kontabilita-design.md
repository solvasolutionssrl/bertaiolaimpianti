# Kontabilità — Design (spese di cantiere)

**Versione**: 1.0
**Stato**: approvata (bivi confermati) — pronta per il piano di Fase 1
**Branch**: `feat/kontabilita` (lavoro privato, **niente push pubblico finché non si testa**)
**Modulo**: dentro **Kantiere** (`tenantHasModule('kantiere')` + `app_mode ∈ {kantiere, full}`). **Bertaiola (kommessa) non la vede mai** → ogni intervento è Bertaiola-safe.

---

## Obiettivo

Raccogliere le spese che i tecnici fanno sul cantiere (scontrini/ricevute). Il tecnico fotografa lo scontrino dalla PWA, un modello vision OpenAI estrae i campi, l'utente conferma, e la spesa viene salvata e **agganciata in automatico al cantiere** dove sta lavorando (turno attivo o pausa pranzo). L'office vede tutte le spese per cantiere, con analisi dei costi e aggregato manodopera+spese per cantiere.

Visivamente Kontabilità è un **pacchetto a sé**: voce di primo livello nella sidebar office, sezione dedicata nel super admin, tab dedicata nella bottom nav PWA. A livello di gating resta **dentro** il modulo Kantiere.

## Decisioni confermate (bivi)

| Tema | Decisione |
|---|---|
| Rimborso dipendente | **Solo flag `rimborsabile`**, nessun workflow di approvazione ora (estendibile in Fase 3). |
| Bottom nav tecnico | **`Spese` sostituisce `Attività`**; le notifiche passano su una **campanella nell'header** PWA. |
| Conferma AI | **Revisione prima del salvataggio**: campi precompilati, l'utente conferma/corregge. `stato='bozza'` finché non conferma. |
| Estrazione minima | **`importo_totale` + `data_scontrino` (data/ora) sono obbligatori**. Se l'AI non li ricava entrambi → **errore "Ricevuta non leggibile, riprova"** e si richiede una nuova scansione (niente form di revisione). |
| Categorie | **6**: Hotel, Ristorante, Bar, Trasporti, Carburante, Varie (con colori). |
| Storage R2 | Ordinato per tenant: `tenants/{slug}/kantiere/spese/{anno}/{mese}/{spesaId}/{file}`. **R2-only** (no sync Nextcloud). |
| Modello AI | `OPENAI_MODEL_VISION` (override env/per-tenant), chiamato con **`reasoning_effort: 'low'`** e **senza `temperature`** (reasoning model). Default puntabile su un GPT-5 mini. |
| Bottom nav capo | **Tab unica "Squadra"** che unisce gestione squadra + le ore del capo → libera lo slot per `Spese`. |
| Deploy | **Nessun push su main** finché non testato. |

## Attori e permessi

- **Tecnico / capo**: vedono e creano solo **le proprie** spese (`/mobile/kantiere/spese`).
- **Office / admin (tenant)**: vedono **tutte** le spese del tenant in `/office/kantiere/kontabilita`, possono modificare categoria, riassegnare cantiere, eliminare, esportare.
- **Super admin (piattaforma)**: panoramica cross-tenant in `/admin/kantiere/kontabilita` + config per-tenant.

---

## Architettura

### Modulo / gating
- Riusa il gate Kantiere esistente (`apps/web/app/office/kantiere/layout.tsx`, `apps/web/app/mobile/kantiere/layout.tsx`).
- Flag di config `kontabilita_attiva` in `tenant_modules.config` (default **true** per tenant kantiere). Lettura via helper analogo a `leggiArrotondamenti()` in `apps/web/app/_lib/kantiere-config.ts`.

### Schema dati — migration `supabase/migrations/<ts>_kontabilita_spese.sql`

Tabella `spese`:

| Campo | Tipo | Note |
|---|---|---|
| `id` | uuid PK default gen_random_uuid() | |
| `tenant_id` | uuid NOT NULL FK tenants(id) | RLS scope |
| `dipendente_id` | uuid NOT NULL FK dipendenti(id) | chi ha caricato |
| `cantiere_id` | uuid NULL FK cantieri(id) | aggancio automatico; null = "da assegnare" |
| `commessa_id` | uuid NULL FK commesse(id) | derivato da `cantieri.commessa_id` se presente |
| `categoria` | text NOT NULL CHECK in (hotel, ristorante, bar, trasporti, carburante, varie) | default `varie` |
| `ragione_sociale` | text NULL | esercente |
| `importo_totale` | numeric(12,2) NOT NULL | lordo |
| `importo_iva` | numeric(12,2) NULL | IVA inclusa |
| `imponibile` | numeric(12,2) NULL | derivato server-side (totale − iva) quando entrambi presenti |
| `valuta` | text NOT NULL default 'EUR' | |
| `partita_iva` | text NULL | esercente (extra AI) |
| `metodo_pagamento` | text NULL CHECK in (contanti, carta, altro) | extra AI, opzionale |
| `numero_documento` | text NULL | extra AI, opzionale |
| `indirizzo_esercente` | text NULL | extra AI, opzionale |
| `data_scontrino` | timestamptz NULL | data/ora documento (dall'AI) |
| `data_caricamento` | timestamptz NOT NULL default now() | = created_at logico |
| `file_ref_id` | uuid NULL FK file_refs(id) | la foto della ricevuta |
| `stato` | text NOT NULL CHECK in (bozza, confermata) default 'bozza' | |
| `rimborsabile` | boolean NOT NULL default true | flag (no workflow) |
| `ai_raw` | jsonb NULL | output grezzo modello per audit |
| `ai_confidence` | jsonb NULL | confidenza per-campo (per evidenziare i campi incerti) |
| `note` | text NULL | libero |
| `geo_lat` | numeric(9,6) NULL | GPS allo scatto |
| `geo_lng` | numeric(9,6) NULL | GPS allo scatto |
| `created_at` | timestamptz NOT NULL default now() | |
| `updated_at` | timestamptz NOT NULL default now() | trigger auto-update (pattern esistente) |

Indici: `(tenant_id, cantiere_id, data_scontrino)`, `(tenant_id, dipendente_id, data_scontrino)`, `(tenant_id, categoria)`.

RLS: pattern dei moduli kantiere. Lettura/scrittura limitata al `tenant_id` del chiamante; il tecnico vede solo `dipendente_id` proprio (sub-policy), office/admin tutto il tenant. Super admin via service role.

### Storage foto (R2)
- Riuso `file_refs` + R2 provider (`packages/integrations/src/storage/r2.ts`) + thumbnail (`apps/web/app/_lib/thumbnails.ts`).
- Nuovo percorso upload dedicato (la route media commessa pretende `commessaId XOR bozzaId`): `apps/web/app/api/kantiere/spese/upload/...` (init + complete) **oppure** una single-shot server action che riceve il blob piccolo e fa il PUT — vedi nota implementativa sotto.
- Chiave R2: `tenants/{slug}/kantiere/spese/{YYYY}/{MM}/{spesaId}/{filename}`.
- **R2-only**: niente sync Nextcloud (spese = artefatti contabili, non deliverable di commessa). `file_refs.status` resta gestito ma la sync è saltata (tenant kantiere non ha la cartella commessa).

> Nota implementativa: gli scontrini sono immagini piccole (< 5 MB). Si può usare il percorso presigned PUT esistente (init→PUT→complete) per coerenza con thumbnail/`waitUntil`, evitando il vincolo `commessaId` con una variante `scope: 'spesa'`. Il piano sceglierà la via meno invasiva sul route esistente.

### Estrazione AI — `apps/web/app/api/kantiere/spese/extract/route.ts`
- Input: `file_ref_id` (foto già su R2) → il server scarica un signed GET, converte in base64, chiama `chatCompletion()` (helper esistente `apps/web/app/_lib/openai.ts`) in modalità vision:
  ```
  messages: [{ role:'user', content: [
    { type:'text', text: <prompt estrazione scontrino IT> },
    { type:'image_url', image_url: { url: 'data:image/jpeg;base64,...' } }
  ]}]
  response_format: 'json_object'
  ```
- Modello: `OPENAI_MODEL_VISION` (override env/per-tenant), chiamato con **`reasoning_effort: 'low'`** e **senza `temperature`** (i reasoning model GPT-5 non l'accettano). Richiede di estendere `chatCompletion()` in `apps/web/app/_lib/openai.ts` con il passaggio opzionale di `reasoning_effort`.
- Output validato con Zod (pattern di `/api/voice/extract`, `.catch(undefined)` per degradare per-campo):
  - `ragione_sociale`, `categoria` (enum, fallback `varie`), `importo_totale`, `importo_iva`, `data_scontrino` (ISO), + extra: `partita_iva`, `metodo_pagamento`, `numero_documento`, `indirizzo_esercente`, `valuta`.
  - Parsing numeri all'italiana (virgola decimale → punto) lato server prima della validazione.
- **Soglia minima**: se dopo l'estrazione mancano **`importo_totale`** o **`data_scontrino`**, la route ritorna `{ ok:false, code:'RICEVUTA_NON_LEGGIBILE' }`; la PWA mostra "Ricevuta non leggibile, riprova" e ripropone la scansione (la foto già caricata su R2 viene marcata orfana / ripulita).
- Ritorna i campi + `ai_confidence` (se il modello la fornisce o euristica: campo mancante = bassa).
- **Mai auto-commit**: l'estrazione popola il form di revisione; il salvataggio è un'azione separata.

### Aggancio automatico al cantiere
- Al salvataggio (conferma), server action chiama `mioTurnoAttivo()` (`apps/web/app/mobile/kantiere/_lib/turno-attivo.ts`):
  - turno aperto (`lavoro` **o** `pausa`) → `cantiere_id` = quel cantiere; `commessa_id` da `cantieri.commessa_id`.
  - nessun turno attivo → `cantiere_id = null`. **Fallback**: se nel giorno di `data_scontrino` il dipendente ha timbrature su **un solo** cantiere, lo si propone come default (modificabile).
- L'aggancio è calcolato **al momento del salvataggio** (upload-time), come da requisito.

---

## Superfici UI

### PWA tecnico — `/mobile/kantiere/spese`
- Lista delle proprie spese: thumbnail, importo, categoria (badge colorato), cantiere, data, stato.
- **Nuova ricevuta**: "Scatta foto" (`<input capture="environment">`, coerente con scelta iOS dello scanner) o "Allega".
- Flusso: scatto → upload R2 (+thumbnail) → loading "Analizzo la ricevuta…" → `/extract` → **form revisione** precompilato (importo/IVA/categoria/esercente/data, campi incerti evidenziati) → "Salva" → aggancio cantiere → conferma.
- Bottom nav (`apps/web/app/mobile/_components/bottom-nav-shell.tsx`): tecnico = Cantieri, Ore, Scansiona(FAB), **Spese**, Profilo. Le notifiche ("Attività") si spostano su una **campanella nell'header** PWA.
  - **Capo**: la voce "Squadra" diventa una **tab unica che unisce gestione squadra + le ore del capo** (in `/mobile/kantiere/gestione-squadra`, con una sezione/sotto-tab "Le mie ore"), liberando lo slot per `Spese`. Capo = Cantieri, Squadra(+ore), Scansiona(FAB), **Spese**, Profilo.

### Office tenant — `/office/kantiere/kontabilita` (voce di primo livello in sidebar)
Sidebar: `apps/web/app/office/_components/office-shell-client.tsx` → aggiungere voce "Kontabilità" (icona `ReceiptText`) come pacchetto a sé (non dentro l'accordion Kantiere, per dare lo "stacco" visivo richiesto), comunque gated dal modulo.

Tre sotto-sezioni (tab):
1. **Spese** — tabella raggruppabile per cantiere. Colonne: cantiere, chi, importo, IVA, categoria (badge colorato), data scontrino, data caricamento, thumbnail. Click riga → ricevuta a schermo intero + edit (categoria, riassegna cantiere, note, elimina). Filtri: cantiere, dipendente, categoria, periodo. **Export CSV**.
2. **Analisi dei costi** — KPI (spesa totale periodo, IVA totale, n° ricevute, scontrino medio); grafici Recharts: spesa per categoria (donut coi colori), per cantiere (barre), per dipendente, trend mensile (linea). Filtri periodo/cantiere.
3. **Costo cantiere** — vista read-only che **somma manodopera + spese** per cantiere. La manodopera (ore × costo) si **legge** dalla logica esistente (rapportini / ore-costi), **non si sposta né duplica**. Output: per cantiere → costo manodopera + totale spese (per categoria) = costo complessivo.

### Super admin — `/admin/kantiere/kontabilita`
Nuova voce nel gruppo "Kantiere" di `apps/web/app/admin/_components/admin-shell-client.tsx`. Panoramica cross-tenant (totale spese per tenant, % spese con cantiere assegnato, n° ricevute, anomalie tipo importo mancante / senza foto) + config per-tenant (flag attivazione, eventuale set categorie/valuta in futuro). Service role, pattern di `/admin/kantiere`.

## Categorie (con colore)

| Categoria | Colore |
|---|---|
| Hotel | indaco |
| Ristorante | ambra |
| Bar | rosa |
| Trasporti (pedaggi, parcheggi, taxi) | azzurro |
| Carburante | verde |
| Varie | grigio |

Definite come costante condivisa (label + classi colore badge) riusata da PWA, office e admin.

---

## Fasi (ognuna con piano e implementazione separati)

- **Fase 1 (MVP)** — questo design: migration `spese` + config flag; upload R2 ricevuta + thumbnail; `/extract` vision; PWA `/mobile/kantiere/spese` (cattura → revisione → salva → aggancio cantiere); office `Kontabilità → Spese` (lista, filtri, edit, export CSV). Bottom nav tecnico aggiornata + campanella header.
- **Fase 2** — `Analisi dei costi` (Recharts) + `Costo cantiere` (manodopera+spese).
- **Fase 3** — super admin Kontabilità cross-tenant; eventuale workflow rimborso (approva/rifiuta/rimborsata); export Nextcloud; categorie configurabili.

## Rischi / vincoli

- **Produzione**: tutto gated da kantiere → Bertaiola intatta. Lavoro su `feat/kontabilita`, **nessun push su main** finché non testato col cliente FPM.
- **Migration**: solo file SQL in `supabase/migrations/`; l'apply al cloud lo fa l'umano.
- **AI sui soldi**: revisione obbligatoria prima del salvataggio; soglia minima (totale + data) o errore + ri-scansione; `ai_raw` salvato per audit; importi parsati con cura (virgola IT).
- **Copy italiano**: niente "col", niente trattino lungo. Display nomi via `titoloCase()` lato PWA.

## Definizione di "fatto" (Fase 1)

- Un tecnico FPM fotografa uno scontrino dalla PWA, vede i campi estratti, conferma, e la spesa risulta agganciata al cantiere del suo turno attivo.
- L'office FPM vede la spesa in Kontabilità → Spese con foto, importo, IVA, categoria, chi, cantiere, date; può filtrare ed esportare CSV.
- Bertaiola: nessuna voce/route/comportamento nuovo visibile. Build + typecheck verdi, test api verdi.
