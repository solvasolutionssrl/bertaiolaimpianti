# Tassonomia voci / fasi commessa
**Versione**: 1.0 (estratto dai PDF cliente, da validare con Bertaiola)
**Fonte**: `documentazione_generale/00_input_cliente/Bertaiola_Update_20251114 (2).pdf` (pag. 3 — "Elenco Opzioni" — 38 voci) e relativo update 28/11/2025.
**Riferimenti correlati**: `Flusso_Operativo.md` (passo 5 — selezione tipologia impianto).

---

## 1. Logica generale

In fase di creazione commessa il sistema costruisce uno **scaffold** di cartelle e fasi che è la combinazione di:

- **Voci di default** (Sezione A) → sempre attive su ogni commessa, indipendenti dal tipo di lavoro. Generano automaticamente le cartelle/sezioni corrispondenti nello scaffold.
- **Voci selezionabili** (Sezione B) → il **capo le sceglie sul telefono** durante il sopralluogo o subito dopo, in base al tipo di intervento concordato col cliente. Solo quelle scelte diventano cartelle/sezioni nella commessa.

L'esempio "caldaia" del PDF (pag. 4) mostra come l'unione delle due liste produce il piano di lavoro concreto: 8 fasi selezionate (di cui alcune sempre presenti tipo `Preventivo` e `Ordine materiali`, altre specifiche del lavoro come `Impianto gas interno`, `Compilazione DICO`).

---

## 2. Sezione A — Voci sempre attive (default)

Queste voci sono parte della spina dorsale di ogni commessa. **Non sono opzionali**: il capo non le seleziona, esistono sempre.

> ⚠️ **Importante — separazione dati app vs file**: i **dati strutturati** (anagrafica cliente, contatti, indirizzo, telefoni, email, ticket, assegnazioni responsabile, log tracciatura) **vivono nel database Supabase**, non nelle cartelle. Le cartelle sul cloud contengono **solo "file veri"** — PDF, foto, video, schemi, documenti firmati. Niente file `.txt` con anagrafica, niente esportazioni "di servizio".

| # | Voce | Dove vive | Note |
|---|---|---|---|
| 1 | **Cliente / Cantiere** | DB | Record `clienti` + record `commesse`. La cartella associata viene creata in automatico (vedi §2.1) |
| 2 | **Ticket** | DB | Tabella `ticket` collegata alla commessa. Post-migrazione Freshdesk → ticketing nativo |
| 3 | **Responsabile** | DB | Relazione `commesse.responsabile_id` + assegnazione tecnici |
| 4 | **Preventivo** | Cartella `Preventivi/` + DB (metadata) | PDF firmato; editor preventivo opzionale in Sprint 4 |
| 5 | **Cartella cantiere** | Cartella radice (vedi §2.1) | Sync automatico ai 5 PC ufficio |
| 6 | **Ordine materiali cantiere** | Cartella `Materiali/` + DB (lista materiali) | DDT in entrata, ordini fornitori |
| 7 | **POS + Documenti** | Cartella `Documenti/POS/` | Piano Operativo Sicurezza |
| 8 | **Tracciatura cantiere** | DB | Log attività, stato avanzamento, cronologia eventi (no file, solo timeline in app) |
| 9 | **Cartellone** | Cartella `Documenti/Cartellone/` | Cartello cantiere obbligatorio |
| 10 | **Fornitura cassette** | Cartella `Documenti/Cassette_DPI/` + DB | Cassette pronto soccorso / DPI |
| 26 | **Foto (cantiere)** | Cartella `Foto/` (sotto: `Sopralluogo/`, `In corso/`, `Finali/`) | Sorgente principale: PWA tecnico |

### 2.1. Naming della cartella radice

Il nome della cartella **non** è un codice tecnico tipo `BER-26-001`, ma una stringa **leggibile da umano**, generata automaticamente al momento della creazione:

```
<NomeCliente>_<YYYY-MM-DD>_<DescrizioneAI>
```

Esempi:
```
Rossi_2026-05-10_SistemazioneBagno
ComuneCastagnole_2026-05-12_InstallazioneCaldaiaCondominio
ImpresaXYZ_2026-05-14_ImpiantoSolareCompleto
```

- **`<NomeCliente>`**: cognome (persona fisica) o ragione sociale (azienda), normalizzato (no spazi, niente accenti, CamelCase).
- **`<YYYY-MM-DD>`**: data di apertura commessa.
- **`<DescrizioneAI>`**: descrizione breve generata da **Claude Haiku** sulla base del contesto del sopralluogo (voci selezionate dal capo + note testuali + indirizzo + foto eventualmente con caption AI). 1–4 parole CamelCase, max ~30 caratteri.

**Workflow della generazione del nome**:
1. Capo conclude i passi 4-5 del flusso (foto/note + selezione voci).
2. Edge Function chiama Claude Haiku con un prompt strutturato che include voci selezionate + note + indirizzo.
3. Risposta proposta → mostrata al capo nella PWA come campo **editabile** prima del "Conferma e crea commessa".
4. Capo può accettare o riscrivere a mano.
5. Sistema sanitizza (no spazi/accenti/`/`/`\`), verifica unicità nel tenant (in caso di collisione appende `_2`, `_3`).
6. Solo allora si crea la cartella sul cloud.

> Il **codice commessa interno** (`BER-26-001`, vedi §6 — decisioni confermate) resta come **identificatore tecnico** nel DB e nei riferimenti incrociati (preventivi, fatture, ticket), ma **non** è il nome della cartella. La cartella ha il nome leggibile.

### 2.2. Sottocartelle scaffold

Tutte le sottocartelle hanno **nomi friendly**, niente prefissi numerici. Ogni commessa nasce con questa struttura template:

```
Rossi_2026-05-10_SistemazioneBagno/
├── Preventivi/                        ← (4)
├── Schemi/                            ← disegni tecnici, planimetrie
├── Foto/                              ← (26)
│   ├── Sopralluogo/
│   ├── In corso/
│   └── Finali/
├── Documenti/
│   ├── POS/                           ← (7)
│   ├── Cartellone/                    ← (9)
│   ├── DICO/                          ← (22-25 — vedi §3)
│   ├── Cassette_DPI/                  ← (10)
│   └── Certificazioni/
├── Materiali/                         ← (6) — DDT, ordini fornitori
└── Chiusura/                          ← documenti di consegna finale
```

**Vincolo dichiarato dal cliente**: zero personalizzazione del template scaffold per evitare derive nel tempo. Le voci di Sezione B selezionate possono aggiungere **sottocartelle dedicate** (es. se selezionato "17 Impianto solare", appare `Foto/In corso/Solare/`), ma la struttura radice resta identica per tutte le commesse del tenant.

---

## 3. Sezione B — Voci selezionabili dal capo (per tipo di lavoro)

Queste sono le **fasi tecniche** vere e proprie. Il capo, durante la creazione della commessa, spunta quelle pertinenti. Solo le voci spuntate generano sottocartelle/checklist/fasi operative nella commessa.

### 🔧 Impiantistica (macro-lavori)
| # | Voce | Tipo lavoro tipico |
|---|---|---|
| 11 | Colonne sanitario | Civile / ristrutturazione |
| 12 | Colonne riscaldamento | Civile / ristrutturazione |
| 13 | Impianto sanitario | Bagni, cucine |
| 14 | Impianto condizionamento | Climatizzazione |
| 15 | Impianto gas interno | Caldaia, fornelli |
| 16 | Impianto aspirazione centralizzata | Premium residenziale |
| 17 | Impianto solare | Solare termico |
| 18 | Pannelli solari | Fotovoltaico (separato da 17) |
| 19 | Ordine C.T., bagni e apparecchiature | Centrale termica + sanitari |

### 🪛 Ventilazione & Collaudi
| # | Voce | Quando si attiva |
|---|---|---|
| 20 | Fori ventilazione | Caldaie / locali tecnici |
| 21 | Collaudo tenuta | Quasi sempre presente sui gas |

### 📦 Documentazione tecnica / Allegati
| # | Voce | Quando si attiva |
|---|---|---|
| 22 | Disegni DICO | Lavori soggetti a dichiarazione di conformità |
| 23 | Compilazione DICO | Quasi sempre nei termoidraulici |
| 24 | Agg. 26/24 | ⚠️ Voce dell'elenco originale Bertaiola — **definizione esatta da chiarire** (probabilmente modulistica interna o allegato regionale). La conserviamo nel catalogo per non perderne traccia; il nome verrà aggiornato quando il cliente fornirà la spiegazione |
| 25 | Agg. 26/24.4 | ⚠️ Idem — sotto-versione di (24). Da chiarire e rinominare |

### 🧱 Tubazioni & Idraulica
| # | Voce | Quando si attiva |
|---|---|---|
| 27 | Tubazioni passaggi esterni | Allacci da contatore o allacci esterni |
| 28 | Piatto doccia + vasca | Bagni |
| 29 | Collettori riscaldamento | Pavimento radiante |

### 🧰 Montaggi
| # | Voce | Quando si attiva |
|---|---|---|
| 30 | Posa impianto pavimento | Riscaldamento a pavimento |
| 31 | Montaggio bagni | Sanitari, accessori |
| 32 | Montaggio centrale | Centrale termica |

### 🔌 Impianti elettrici / Allacci tecnici
| # | Voce | Quando si attiva |
|---|---|---|
| 33 | Contatore SAT | Allaccio gas |
| 34 | CIRCE - CURIT | Catasto regionale impianti termici (Lombardia/Piemonte) |
| 35 | Allacci obbligatori | Acqua, gas, energia |

### 🆘 Supporto tecnico
| # | Voce | Quando si attiva |
|---|---|---|
| 36 | Assistenza per collaudi | Presenza tecnico in collaudo cliente/ente |
| 37 | Adesivi info cliente | Etichette su impianti consegnati |

### ⚡ Alimentazione
| # | Voce | Quando si attiva |
|---|---|---|
| 38 | Alimentazione (220 / 380 / ecc.) | Specifica tensione richiesta dal lavoro |

---

## 4. Esempio guida — commessa "Caldaia" (dal PDF, pag. 4)

Selezione del capo per una caldaia tipica:

```
┌──────────────────────────────────────────────────────┐
│  COMMESSA  BER-26-NNN — Rossi · via Roma 12          │
├──────────────────────────────────────────────────────┤
│  Sezione A (sempre attive — automatiche)             │
│   ✔ Cliente / Cantiere                               │
│   ✔ Ticket (vuoto, attivabile)                       │
│   ✔ Responsabile: Mario Bianchi                      │
│   ✔ Preventivo                                       │
│   ✔ Cartella cantiere (struttura template)           │
│   ✔ Ordine materiali cantiere                        │
│   ✔ POS + Documenti                                  │
│   ✔ Tracciatura cantiere                             │
│   ✔ Cartellone                                       │
│   ✔ Fornitura cassette                               │
│   ✔ Foto (cantiere)                                  │
│                                                      │
│  Sezione B (selezionate dal capo per CALDAIA)        │
│   ✔ Impianto gas interno          (15)               │
│   ✔ Impianto sanitario            (13)               │
│   ✔ Impianto condizionamento      (14, se previsto)  │
│   ✔ Collaudo tenuta               (21)               │
│   ✔ Compilazione DICO             (23)               │
│   ✔ Disegni DICO                  (22)               │
│   ✔ Contatore SAT                 (33)               │
│   ✔ Alimentazione 220V            (38)               │
│                                                      │
│  Non attivate (esempi di voci NON pertinenti):       │
│   ✗ Pannelli solari               (18)               │
│   ✗ Impianto aspirazione          (16)               │
│   ✗ Montaggio bagni               (31)               │
│   ✗ Posa impianto pavimento       (30)               │
└──────────────────────────────────────────────────────┘
```

Il PDF cliente mostra solo 8 fasi selezionate, qui ne ho aggiunte un paio (`22 Disegni DICO`, `33 Contatore SAT`, `38 Alimentazione`) per mostrare come si compone tipicamente una caldaia reale — **da validare con Bertaiola**.

---

## 5. Implicazioni implementative

### Modello dati (Supabase)

```sql
-- Anagrafica clienti (vive solo qui, MAI in cartella)
clienti
  id (uuid)
  tenant_id (uuid)
  ragione_sociale (text)        -- o nome+cognome se persona fisica
  tipo (enum: persona_fisica | azienda)
  indirizzo, citta, cap, provincia (text)
  telefoni (text[]), email (text[])
  note (text)
  created_at, updated_at

-- Commesse
commesse
  id (uuid)
  tenant_id (uuid)
  cliente_id (uuid → clienti)
  codice_interno (text)          -- es. BER-26-001 (identificatore tecnico)
  nome_cartella (text)           -- es. Rossi_2026-05-10_SistemazioneBagno
  cloud_folder_path (text)       -- path completo sul provider storage
  responsabile_id (uuid → users)
  stato (enum: aperta | in_corso | completata | archiviata)
  data_apertura (date)
  descrizione_ai_proposta (text) -- output Claude Haiku, conservato per audit
  descrizione_ai_finale (text)   -- versione editata dal capo (può coincidere)
  preset_id (uuid → preset, nullable)
  created_at, updated_at

-- Catalogo voci (seed iniziale, condiviso multitenant)
voci_catalogo
  id (smallint primary key, da PDF: 1..38)
  nome (text)
  categoria (enum)
  default (boolean)              -- true = Sezione A
  cartella_template (text)       -- path relativo (es. "Foto/Sopralluogo"), NULL se non genera cartella
  ordine_visualizzazione (smallint)

-- Selezione voci per ogni commessa
commessa_voci
  commessa_id (uuid)
  voce_id (smallint)
  selezionata (boolean)          -- Sezione B: scelta capo; A: sempre true
  stato (enum: da_iniziare | in_corso | completata | bloccata)
  note (text)
  PRIMARY KEY (commessa_id, voce_id)

-- Preset di lavoro (creabili dal tenant; nessuno preconfigurato)
preset
  id (uuid)
  tenant_id (uuid)
  nome (text)                    -- es. "Caldaia", "Bagno completo"
  descrizione (text)
  voci_default (smallint[])      -- elenco voci pre-selezionate
  created_by (uuid → users)
  created_at
```

### Generazione cartella

Edge Function Supabase `crea_commessa(...)` che:
1. Inserisce/aggiorna record `clienti` (autocomplete se esistente).
2. Inserisce record `commesse` con `codice_interno` generato (`BER-<AA>-<NNN>`).
3. Chiama **Claude Haiku** con prompt strutturato (voci selezionate, note sopralluogo, indirizzo) → ottiene `descrizione_ai_proposta`.
4. Restituisce al client la proposta del nome cartella per conferma/edit del capo.
5. Una volta confermato il nome, sanitizza, verifica unicità per tenant, e:
   - inserisce N righe in `commessa_voci` (tutte le default + quelle selezionate dal capo);
   - chiama API storage cloud con la lista di path da creare derivata da `voci_catalogo.cartella_template` filtrata sulle voci attive;
   - aggiorna `commesse.cloud_folder_path` con il path effettivo.
6. Restituisce al client (PWA) URL della cartella e codice commessa.

### UI selezione voci (PWA capo)

In fase 5 del flusso operativo (selezione voci/fasi), il capo vede **una checklist raggruppata per categoria** delle 27 voci selezionabili (38 totali − 11 default).

- All'avvio Bertaiola **non ha preset** preconfigurati. La checklist parte vuota (Sezione A pre-spuntata, Sezione B tutta da decidere).
- Il capo può **salvare la combinazione corrente come preset** dando un nome ("Caldaia", "Bagno completo", "Solare termico"…). Il preset diventa disponibile per le prossime commesse.
- I preset salvati appaiono in un dropdown "Parti da preset…" che precompila la checklist. Il capo può comunque aggiungere/togliere voci dopo il preset.
- I preset sono **per-tenant** (Bertaiola non vede quelli di un eventuale futuro tenant Pinco).
- CRUD preset disponibile in "Impostazioni → Preset di lavoro".

---

## 6. Decisioni confermate dal cliente (sessione 2026-05-10)

- ✅ **Split A/B**: confermato come proposto in §2 e §3.
- ✅ **Codifica commessa**: non esiste un formato preesistente → la definiamo noi. **Proposta**: `BER-<AA>-<NNN>` (es. `BER-26-001`). `BER` = slug tenant Bertaiola, `<AA>` = ultime 2 cifre dell'anno di apertura, `<NNN>` = progressivo annuale resettato a gennaio. Generabile lato Edge Function al `crea_commessa()`. Per altri tenant futuri: `<slug-tenant>-<AA>-<NNN>`.
- ✅ **Preset di lavoro**: non esistono preset preconfigurati lato azienda. Il prodotto deve permettere al tenant di **crearsi e salvarsi i propri preset** (CRUD lato impostazioni tenant). All'avvio Bertaiola partirà senza preset; man mano che ne crea ("Caldaia", "Bagno completo", ecc.), questi diventano scorciatoie disponibili al capo durante la creazione commessa.

## 7. Decisioni aggiuntive (sessione 2026-05-10)

- ✅ **Naming cartelle scaffold**: niente prefissi numerici, nomi friendly (`Preventivi`, `Schemi`, `Foto`, `Documenti`, `Materiali`, `Chiusura`).
- ✅ **Naming cartella radice**: `<NomeCliente>_<YYYY-MM-DD>_<DescrizioneAI>`, con descrizione generata da Claude Haiku ed editabile dal capo prima della conferma.
- ✅ **Anagrafica e dati strutturati**: solo nel DB Supabase, mai duplicati in cartella (no file `anagrafica.txt`, no esportazioni "di servizio").
- ✅ **Voci 24/25 (Agg. 26/24, 26/24.4)**: si conservano nel catalogo come voci storiche del cliente (Bertaiola le ha citate ma non ne ha ancora dato il significato preciso). Il nome verrà rifinito quando il cliente lo chiarirà; non bloccano lo sviluppo.

## 8. Open questions ancora aperte

- [ ] **Voci con sotto-fasi**: alcune voci (es. "13 Impianto sanitario") in pratica sono macro-fasi che contengono più step (rough-in, finiture, collaudo). Va modellato un livello aggiuntivo `voce → sotto-fasi`?
- [ ] **Ordine cronologico**: tracciatura cantiere (8) richiede di sapere in che ordine si fanno le fasi. Va inferito dal capo a mano o c'è un ordine canonico per tipo di lavoro?
- [ ] **Definizione "Agg. 26/24" e "Agg. 26/24.4"** (non bloccante): da chiarire con Bertaiola al prossimo contatto e poi rinominare nel catalogo.
