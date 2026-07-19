# Logiche — Pianificazione settimanale (modulo Dipendenti)

**Versione**: 1.1
**Stato**: registro operativo vivo (aggiornare man mano)
**Data**: 19/07/2026
**Ambito**: `/office/personale/pianificazione` · gated modulo `dipendenti` + sotto-flag `pianificazione_attiva` (FPM attivo, Bertaiola nascosta)

Registro di come funziona la Pianificazione e delle scelte prese, a supporto del manuale utente. Vedi anche `Dipendenti_Possibili_Aggiunte.md` (backlog) e la spec `docs/superpowers/specs/2026-07-19-pianificazione-multigiorno-export-ferie-design.md`.

## 1. Modello e vocabolario

- **Griglia** = tabella **righe dipendenti × 7 giorni** (Lun→Dom). Prima colonna e header dei giorni "sticky".
- **Blocco** = **squadra** (uno o più dipendenti) + mezzi su un **cantiere / evento / formazione** per **un giorno** e una **fascia** (giornata 08–17, mattina 08–12, pomeriggio 13–17, oppure orario custom). Un blocco compare come **chip su ogni riga dei suoi membri**.
- **Stato blocco**: `bozza` (modificabile, invisibile ai tecnici) → **Pubblica settimana** → `pubblicato` (visibile in `/mobile/pianificazione`, notifica in-app + push). L'export è **slegato** dalla pubblicazione.
- **Gruppi lavoro** (reparti, es. Officina/Cantiere/Manutenzione) = `gruppi_approvazione` + `gruppo_membri` (1 dipendente = 1 gruppo). Sono la **"categoria"** usata da filtro ed export.
- **Assenze** = ferie/permessi **approvati** (`permesso_richieste`), proiettati per giorno. Bloccano l'assegnazione (regola sotto).

> **Regola ferrea (semantica squadra vs persona)**:
> - **Intera squadra** (tutti i membri + mezzi): il dialog **"Ripeti su più giorni"** (si sta creando/duplicando l'assegnazione della squadra) e lo **spostamento** (long-press → l'intero blocco cambia giorno). Coerente con "Copia precedente".
> - **Solo la persona**: il **resize** in griglia (trascinare il bordo destro di un chip su una riga) estende **solo quel dipendente** sui giorni successivi (blocchi mono-persona, senza i mezzi della squadra). Il chip vive sulla riga di una persona → il resize riguarda lei.

> **Regola ferrea (ferie = HARD)**: chi ha ferie/permesso **approvato** che si sovrappone a giorno/orario **non è assegnabile**. Vale in creazione/modifica **e** in ripeti/sposta (server-side, `assenzeInConflitto`). I conflitti "soft" (persona/mezzo già occupato) invece **non bloccano**: avvisano ("Salva comunque") o compaiono come **ring rosso**.

## 2. Multi-giorno — "Ripeti su più giorni"

Nel dialog di **creazione** (non in modifica) c'è la sezione **"Ripeti su più giorni"**: 7 chip-giorno, con il giorno principale sempre incluso. Si spuntano i giorni desiderati (consecutivi = "da–a"; sparsi = Lun+Mer+Ven). Al salvataggio il **blocco intero** viene clonato su ogni giorno come **bozza** (stessa fascia/orari anche se custom).

- Chi è in ferie in un giorno scelto → quel giorno è **saltato**, con riepilogo finale ("Creato su 4 giorni; saltato Gio 24: Mario in ferie").
- Conflitti soft su qualche giorno → il dialog li elenca e offre **"Salva comunque"**.
- Action: `creaBlocchiRicorrenti` (max 31 giorni).

## 3. Griglia — resize e drag

- **Resize (estendi la persona)**: passando sopra un chip appare una **maniglia sul bordo destro**. Trascinandola a destra sui giorni successivi si evidenzia **solo la riga di quella persona** e al rilascio viene creato un blocco **mono-persona** su quei giorni (bozza, stesso cantiere/fascia, senza i mezzi della squadra). È **solo additivo** (non cancella nulla; per togliere un giorno si elimina il chip). Se la persona è già su un blocco equivalente quel giorno → **saltato** (ridimensionare più volte non duplica). Action: `ripetiBlocco` con `soloDipendenteId`.
- **Sposta (drag & drop)**: **tieni premuto ~0,7s** sul chip per armare la modalità sposta (compare un "ghost" che segue il cursore e le celle bersaglio si evidenziano), poi trascina su un **altro giorno** → l'**intero blocco** (squadra) si sposta lì (cambia solo la data; membri/mezzi invariati). Un **click semplice** resta "apri modifica". Action: `spostaBlocco`.
- **Segnale visivo**: durante lo **spostamento** si evidenziano **tutte le celle del blocco** (ogni membro → si muove la squadra); durante il **resize** solo la **riga della persona** estesa.
- Implementazione: hook `useGridDrag` a **pointer events puri** (nessuna libreria). Il long-press evita spostamenti accidentali; un micro-movimento prima dello scadere annulla (era uno scroll).
- Lo **stato** del blocco spostato resta invariato (coerente con la modifica normale); i cloni del resize nascono in **bozza**.

## 4. Export PDF (sempre disponibile)

Bottone **"Esporta PDF ▾"** (dropdown). Genera fisicamente il download di uno o più PDF, indipendentemente dalla pubblicazione:

- **Esporta tutti** → un unico PDF con tutti i dipendenti → `sett_NN_YYYY_completa_pianificazione.pdf`.
- **Esporta per categoria** → un PDF per ogni gruppo lavoro (download multiplo) → `sett_NN_YYYY_{gruppo}_pianificazione.pdf` (+ "Senza gruppo" se qualcuno non è in un gruppo, così nessuno sparisce).
- **Singolo gruppo** → un PDF di quel gruppo.
- Se il **filtro gruppi** è attivo, in cima compare **"Esporta {gruppi filtrati}"** (auto-scope).

**Formato**: A4 **verticale**, layout **per-dipendente** (righe dipendenti × giorni). Header con **logo/nome del tenant reale** (fallback tipografico se il logo non carica), "Settimana NN · YYYY" e range date. Le celle mostrano **nome cantiere + id commessa** piccolo + fascia; le assenze in tinta rosa; i blocchi in bozza sono marcati. Giorni mostrati = Lun–Ven + weekend solo se pieni. `NN` = **numero settimana ISO-8601**.

Motore: `esportaPianificazionePDF` (jsPDF **vettoriale**, importato dinamicamente → fuori dal bundle iniziale). Nessuna dipendenza nuova.

## 5. Vista "Solo ferie"

Toggle **"Pianificazione | Solo ferie"** in alto. In "Solo ferie" la griglia nasconde i blocchi e il "+" e mostra **solo le assenze** (chi è fuori e quando), limitando le righe ai dipendenti con almeno un'assenza nella settimana. È **esportabile** con lo stesso dropdown → `sett_NN_YYYY_{categoria}_ferie.pdf`.

## 6. "Salva bozza" (rassicurazione)

Ogni modifica si **auto-salva** subito come bozza. Una **pill di stato** ("Salvato · hh:mm", lampeggia in verde dopo ogni azione) e il bottone **"Salva bozza"** lo confermano. È solo rassicurazione (nessuna perdita dati possibile), tenuto **distinto da "Pubblica"**.

## 7. Sicurezza, compatibilità, audit

- **Zero migrazioni DB**: tutto app-layer (crea/sposta/clona blocchi, leggi assenze, PDF client-side).
- **Gating**: azioni protette da `guard()` (admin/office + modulo `dipendenti` + `pianificazione_attiva`), tutte scoped per `tenant_id`. Bertaiola non ha il modulo → UI nascosta e azioni rifiutate.
- **Dual-addon (commesse + dipendenti insieme, in futuro)**: le funzioni lavorano sulle astrazioni generiche blocco/assenza/gruppo, senza nuovo coupling ad `app_mode` o al mondo kantiere; l'export legge nome tenant e label target dai campi generici. Integrabili senza modifiche.
- **Audit**: ogni mutazione nuova è tracciata (`pianificazione.blocco.ripeti`, `pianificazione.blocco.sposta`) via `auditTenant`.
- **Logica pura testata** (`@kommessa/api/pianificazione`): `settimanaISO`, `slugPianificazione` (+ le funzioni preesistenti). 30 test.
