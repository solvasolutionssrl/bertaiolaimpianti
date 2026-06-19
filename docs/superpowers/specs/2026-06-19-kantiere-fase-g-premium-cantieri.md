# Design — Kantiere Fase G · Premium desktop + entità Cantieri

**Versione**: 1.0
**Stato**: Approvato (richiesta utente 19/06/2026)
**Dipende da**: A→F (modulo Kantiere completo). Tutto gated dal modulo → Bertaiola non impattata.

---

## 1. Obiettivo

Due filoni:
1. **Premium desktop UI/UX** dell'area office Kantiere: la voce "Kantiere" in sidebar diventa **macro-sezione espandibile** con le funzioni principali come sotto-voci; pagine **a tutta larghezza** (no `max-w-6xl`, sfrutta il container shell `max-w-screen-2xl`); contenuti arricchiti (KPI, badge di stato, **conteggio scansioni**, accesso rapido, rapportini più completi), layout **denso "meno iPad"** (tabelle desktop al posto di card grandi e arrotondate). Una **Panoramica** e una **Impostazioni** Kantiere.
2. **Entità `Cantieri`** (nuova): un cantiere è un sito fisico, **non necessariamente** legato a una commessa. Pagina di **gestione cantieri** con numerazione, indirizzo, **sede di partenza di default** (per futuro calcolo km), persone/squadre, e **QR del cantiere** generabili/visibili lì. Il legame cantiere↔commessa è **opzionale** in entrambi i versi.

---

## 2. Architettura dato: target polimorfico della timbratura (la decisione portante)

Oggi QR/timbrature/rapportino_righe puntano a `commessa_id`. Per scollegare i cantieri dalle commesse senza rompere il flusso esistente, si introduce un **target polimorfico**: la timbratura ha per bersaglio **una commessa XOR un cantiere**.

Migration additiva (G2):
- Nuova tabella **`cantieri`**.
- `cantiere_qr`: aggiungi `cantiere_id uuid null` (FK cantieri), rendi `commessa_id` **nullable**, CHECK `num_nonnulls(commessa_id, cantiere_id) = 1`. Partial-unique "un QR attivo per cantiere" come quello per commessa.
- `timbrature`: aggiungi `cantiere_id uuid null`, `commessa_id` nullable, stesso CHECK.
- `rapportino_righe`: aggiungi `cantiere_id uuid null`, `commessa_id` nullable, stesso CHECK.

Helper puro `targetTimbratura(row)` → `{ tipo:'commessa'|'cantiere', id } | null` + label resolver lato app (titolo commessa o nome cantiere). Tutta la logica E/F (timbra, precompila, report, anomalie) viene generalizzata a "target" (G3).

> Dati esistenti: nessuna timbratura reale in prod (FPM 0 commesse). La migration è quindi sicura; le righe vecchie (se ce ne fossero) restano valide con `commessa_id` valorizzato.

---

## 3. Entità `cantieri` (G2)

Tabella `cantieri`:
```
id              uuid pk
tenant_id       uuid not null → tenants
codice          text not null            -- CAN-001 (per-tenant, app-side, unique)
nome            text not null
indirizzo       text
indirizzo_lat   numeric(9,6)             -- predisposizione futura
indirizzo_lng   numeric(9,6)
sede_partenza         text               -- base di partenza default (per km futuri)
sede_partenza_lat     numeric(9,6)
sede_partenza_lng     numeric(9,6)
commessa_id     uuid null → commesse     -- legame OPZIONALE
stato           text not null default 'attivo' check (attivo|sospeso|chiuso)
note            text
created_at, updated_at  timestamptz
unique (tenant_id, codice)
```
- Numerazione **CAN-NNN** app-side (mirror di `prossimoCodiceDipendente`; unique constraint come backstop anti-race).
- **Squadra per-cantiere**: tabella `cantiere_squadra` (mirror di `commessa_squadra`: `cantiere_id, dipendente_id, tenant_id, ruolo_commessa→ruolo (capo|membro), capo_dipendente_id`). Permette "persone/squadre" sul cantiere indipendentemente dalle commesse.
- RLS come le altre tabelle Kantiere (read tenant; write owner/admin/office; platform-admin read). `cantiere_squadra` write office/admin.

---

## 4. UI/UX desktop (G1 + G2)

### 4.1 Sidebar macro-sezione
`office-shell-client.tsx` `buildNav()`: "Kantiere" diventa item con `children` (la sidebar UI le supporta già, collassabili):
- **Panoramica** (`/office/kantiere`) — landing.
- **Cantieri** (`/office/kantiere/cantieri`) — NEW (G2).
- **QR code** (`/office/kantiere/qr`) — registro globale QR (commessa + cantiere).
- **Dipendenti** (`/office/kantiere/dipendenti`).
- **Ore / Rapportini** (`/office/kantiere/rapportini`).
- **Report** (`/office/kantiere/report`).
- **Anomalie** (`/office/kantiere/anomalie`).
- **Impostazioni** (`/office/kantiere/impostazioni`) — NEW.

La sub-nav orizzontale (`kantiere-subnav.tsx`) viene **rimossa** (ridondante con la sidebar nidificata); il `kantiere/layout.tsx` non la renderizza più. Il parent "Kantiere" punta a `/office/kantiere` (Panoramica).

### 4.2 Larghezza piena
Tutte le pagine `/office/kantiere/**`: da `mx-auto w-full max-w-6xl space-y-6 p-6` a **`w-full space-y-6`** (il container shell dà già `max-w-screen-2xl px-10 py-10`). Niente padding/max-width di pagina.

### 4.3 Panoramica (NEW)
KPI (`KpiCard`): dipendenti attivi · cantieri attivi · QR attivi · rapportini da approvare · timbrature oggi · ore settimana. Accessi rapidi (Genera QR, Nuovo cantiere, Coda rapportini). Attività recente (ultime timbrature / ultimi rapportini inviati). Denso, desktop.

### 4.4 QR code (arricchita)
Registro globale: una riga per QR (commessa **o** cantiere) con: target (titolo/nome), tipo (Commessa/Cantiere) badge, stato (attivo/assente/revocato), **n. scansioni** (count `timbrature` per target), ultima scansione, azioni rapide (Genera/Stampa/Rigenera). Tabella densa. Evita ridondanza col cantiere: qui registro globale, sul cantiere il QR contestuale.

### 4.5 Rapportini (più completi)
Tabella densa con: dipendente, data, stato badge, totali ord/straord/viaggio, **n. righe**, origine timbrature; dettaglio espanso mostra le righe per target + **timeline timbrature del giorno** (ingressi/uscite con orario). Filtri periodo/stato/dipendente in barra compatta. Azioni Approva/Respingi/Riapri.

### 4.6 Impostazioni (NEW)
Form: **soglia ore ordinarie/giorno** (scrive `tenant_modules.config.soglia_ore_ordinarie`), eventuali default (sede partenza aziendale di default per nuovi cantieri). Solo office/admin.

### 4.7 Cantieri (NEW, G2)
- **Lista** `/office/kantiere/cantieri`: tabella densa (codice, nome, indirizzo, stato badge, commessa collegata, n. persone, QR attivo?). Azione "Nuovo cantiere".
- **Dettaglio** `/office/kantiere/cantieri/[id]`: anagrafica editabile (nome, indirizzo, sede partenza, stato, link commessa opzionale, note); **squadra** del cantiere (capo + membri, da `dipendenti`); **QR** del cantiere (genera/stampa/rigenera, riuso del flusso D generalizzato al target cantiere). 

---

## 5. Wiring target (G3)
- `generaQrCommessa`/`rigenera` generalizzati: `generaQr({commessaId?|cantiereId})`. La stampa `/office/kantiere/qr/[id]/stampa` accetta anche cantieri (o nuova route `.../cantiere/[id]/stampa` — vedi G2 per non-ridondanza; sceglieremo il path che riusa i template).
- `/t/[token]` + `timbra`: risolvono il target; capo-check usa `commessa_squadra` **o** `cantiere_squadra`; la timbratura registra `commessa_id` **o** `cantiere_id`.
- `precompilaMioRapportino`: raggruppa per target (commessa/cantiere), righe col target giusto.
- `report`/`anomalie`/`export`: etichetta e raggruppa per target (label = titolo commessa o nome cantiere).

---

## 6. Step (gestiti internamente)
| Step | Contenuto | Schema |
|---|---|---|
| **G1** | Premium UI: sidebar nidificata, full-width, Panoramica, QR arricchita (scan count), Rapportini completi, Impostazioni | no |
| **G2** | Migration `cantieri`+`cantiere_squadra`+target polimorfico; numerazione CAN-NNN; pagine Cantieri (lista+dettaglio) + QR cantiere | sì |
| **G3** | Wiring target attraverso timbra/`/t`/rapportino/report/anomalie/export | no (usa G2) |

Ogni step: logica pura testata dove sensato; implementer **serializzati** sui file condivisi (sidebar, qr, layout); typecheck+build verdi; migration applicata dall'agent (utente ha autorizzato) con verifica; review integrazione finale.

## 7. Fuori scope G (YAGNI)
Calcolo km reale (solo predisposizione lat/lng), mappa, geofencing, vero `.xlsx`, permessi granulari, multi-sede aziendale strutturata.
