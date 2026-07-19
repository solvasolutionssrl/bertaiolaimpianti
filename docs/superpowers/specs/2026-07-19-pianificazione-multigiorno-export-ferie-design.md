# Pianificazione settimanale — Multi-giorno, Export PDF, Vista ferie

**Data**: 19/07/2026
**Modulo**: Dipendenti → Pianificazione (`/office/personale/pianificazione`)
**Gating**: `dipendenti` + sotto-flag `pianificazione_attiva` → **FPM live, Bertaiola intatta**
**Migrazioni DB**: **nessuna** (tutto app-layer)

## Contesto (com'è oggi)

- Griglia office = `<table table-fixed>` **righe dipendenti × 7 giorni** (Lun→Dom), header sticky, zebra. Cella key `${dipId}|${dataISO}`.
- Un **blocco** (`pianificazione_blocchi`) = **squadra** (`pianificazione_membri`, N dipendenti) + mezzi (`pianificazione_blocco_mezzi`) su un **cantiere/evento/formazione** per **un giorno** + fascia (giornata/mattina/pomeriggio/custom). `stato` bozza|pubblicato.
- Un blocco appare come **chip su ogni riga membro** (stesso giorno). Il chip è un `<button>` che apre il dialog di modifica.
- Actions: `creaBlocco`/`aggiornaBlocco` (conflitti soft → `forza`, assenze ferie = blocco HARD), `eliminaBlocco`, `pubblicaSettimana`, `copiaSettimanaPrecedente`.
- Filtro **gruppo lavoro** (reparto, `gruppi_approvazione` + `gruppo_membri`, 1 dip = 1 gruppo) già reale, oggi **single-select**.
- `jspdf ^2.5.2` già in dipendenze. Nessun drag&drop nel repo. `tenants.nome`/`logo_url`/`brand_color` disponibili.

## Decisioni chiave (confermate col cliente)

1. **Semantica multi-giorno = INTERO BLOCCO (squadra)**. Ripeti/resize/sposta agiscono sul blocco intero (tutti i membri + mezzi + cantiere + fascia), non sul singolo. Coerente col modello dati e con `copiaSettimanaPrecedente`. Se il blocco è di 1 persona → equivale a "solo quella persona". La UI **evidenzia tutte le celle del blocco** quando lo si affianca/trascina, così è chiaro che riguarda più persone.
2. **PDF = layout per-dipendente** (righe dipendenti × giorni), verticale A4, header col nome/logo del tenant reale.
3. **Filtro gruppo multi-select** + **export auto-scoped** al filtro attivo.
4. **Zero migrazioni**: crea/sposta/clona blocchi, leggi assenze, PDF client-side.

## Feature

### A. Multi-giorno dal dialog ("Ripeti su")
- Nel dialog di **creazione** (non modifica): riga **"Ripeti su"** = 7 chip giorno della settimana corrente. Il giorno del blocco è sempre attivo (primario, non deselezionabile); gli altri si spuntano. Consecutivi = "da–a"; sparsi = Lun+Mer+Ven.
- Sia giornata intera sia orari custom: si **ripete la stessa fascia/orari** su ogni giorno scelto.
- Action **`creaBlocchiRicorrenti`**: per ogni data → assenze ferie = **skip + report**; conflitti soft → se non `forza` ritorna `conflitti` (dialog mostra "Salva comunque"), se `forza` crea comunque. Ritorna `{ ok, creati, saltati:[{data,motivo}] }`. Report a fine operazione ("Creato su 4 giorni; saltato Gio 24: Mario in ferie").

### B. Griglia — resize + drag (i pezzi UI)
- **Resize orizzontale**: maniglia sul bordo destro del chip (on-hover). Trascinando a destra sui giorni successivi → anteprima live delle celle coperte → al rilascio **clona** il blocco su quei giorni (bozza). **Solo additivo** (mai cancella; per togliere un giorno si elimina il chip). Action **`ripetiBlocco(id, date[])`**.
- **Drag sposta**: **long-press ~1s** sul corpo del chip arma la modalità sposta (chip sollevato, celle = drop target); trascinando su un altro **giorno** → il blocco (tutta la squadra) si **sposta** lì (cambia solo la data). Action **`spostaBlocco(id, nuovaData)`**. Il long-press evita spostamenti accidentali; un click semplice resta "apri modifica".
- **Segnale multi-persona**: afferrando/ridimensionando, si evidenziano **tutte le celle del blocco** (righe di ogni membro, stesso giorno).
- Ferie (HARD) rifiuta con toast; conflitti soft **non bloccano** il gesto (compaiono come ring rosso). Implementazione: hook `useGridDrag` a **pointer events puri**, nessuna nuova dipendenza, isolato, con auto-scroll ai bordi.

### C. Export PDF (dropdown), sempre disponibile (slegato da Pubblica)
- Bottone **"Esporta PDF ▾"** (neutro/ink). Voci:
  - **Esporta tutti** → 1 PDF (tutti) → `sett_NN_YYYY_completa_pianificazione.pdf`
  - **Esporta per categoria** → 1 PDF per gruppo (download multiplo) → `sett_NN_YYYY_{gruppo}_pianificazione.pdf`
  - divisore + voce per ogni singolo gruppo
  - se il **filtro** ha gruppi attivi → in cima **"Esporta {gruppi filtrati}"** (auto-scope).
- Filtro gruppo → **multi-select** (dropdown checkbox). `dipFiltrati`: `sel.length===0 || sel.includes(dipGruppo[d.id])`.
- Motore: **jsPDF vettoriale diretto** (`_lib/export-pdf.ts`, client). Layout per-dipendente A4 verticale: header (logo/nome tenant + "Settimana NN · YYYY" + range date), tabella `Dipendente | giorni`, cella = **nome cantiere + id commessa piccolo** + fascia; celle ferie/permesso in tinta rosa; chip bozza marcati; footer data+pagina. Multi-pagina per molti dipendenti. Logo via `logo_url` con **fallback tipografico** (nome tenant) se l'immagine non carica (CORS/timeout). `NN` = **settimana ISO** (`numeroSettimanaISO`).

### D. Vista "Solo ferie"
- Toggle segmentato **"Pianificazione | Solo ferie"**. In "Solo ferie": nascondi blocchi e "+"; mostra **solo assenze** (ferie/permessi già caricati) per i dipendenti che ne hanno almeno una quella settimana. Export → `sett_NN_YYYY_ferie_pianificazione.pdf` (stessa tabella, celle = tipo permesso + orario).

### E. "Salva bozza" (rassicurazione)
- Tutto si auto-salva a ogni modifica. Aggiungo **pill di stato** ("Bozza · salvato ✓ hh:mm", lampeggia dopo ogni modifica) + bottone **"Salva bozza"** che riconferma e aggiorna l'orario. Chiaramente separato da "Pubblica".

## Sicurezza & compatibilità Kommessa
- Tutto sotto `/office/personale/pianificazione` + relative action, gated come sopra → Bertaiola invariata.
- **Dual-addon**: le funzioni lavorano sulle astrazioni generiche blocco/assenza/gruppo; non aggiungono coupling a `app_mode`/mondo kantiere. PDF legge nome tenant e label target dai campi generici (`cantiereNome`/`titolo`). Logica pura nuova in `@kommessa/api` con unit test.
- Nuove action riusano `assenzeInConflitto` (HARD ferie), `messaggiConflitto` (soft), `inserisciFigli`, `auditTenant`. Ogni mutazione **audita**.

## Fasi
0. Logica pura (`numeroSettimanaISO`, slug filename) + test.
1. Multi-giorno dal dialog + `creaBlocchiRicorrenti`.
2. Export PDF + filtro multi-categoria.
3. Vista solo ferie + Salva bozza.
4. Griglia drag (resize + sposta) + `ripetiBlocco`/`spostaBlocco`.
5. Verifica robustezza + doc manuale + memoria.
