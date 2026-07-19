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

> **Regola ferrea (l'azione segue il blocco)**: allargare (resize) e spostare agiscono **sempre sull'intero blocco**.
> - Se il blocco è una **squadra** (più persone) → l'azione riguarda **tutta la squadra** (membri + mezzi).
> - Se il blocco è un **tecnico singolo** → riguarda **solo lui**.
> **Riconoscimento immediato squadra vs singolo** su ogni card: **squadra** = pill **piena colorata** (tinta del cantiere, testo bianco) con 👥 + numero, e accento sinistro un filo più marcato; **tecnico singolo** = icona persona **tenue**, senza colore. Scorrendo la griglia le pill colorate saltano all'occhio = squadre. (Il dialog "Ripeti su più giorni" è sempre a livello di squadra.)

> **Regola ferrea (ferie = HARD)**: chi ha ferie/permesso **approvato** che si sovrappone a giorno/orario **non è assegnabile**. Vale in creazione/modifica **e** in ripeti/sposta (server-side, `assenzeInConflitto`). I conflitti "soft" (persona/mezzo già occupato) invece **non bloccano**: avvisano ("Salva comunque") o compaiono come **ring rosso**.

## 2. Multi-giorno — "Ripeti su più giorni"

Nel dialog di **creazione** (non in modifica) c'è la sezione **"Ripeti su più giorni"**: 7 chip-giorno, con il giorno principale sempre incluso. Si spuntano i giorni desiderati (consecutivi = "da–a"; sparsi = Lun+Mer+Ven). Al salvataggio il **blocco intero** viene clonato su ogni giorno come **bozza** (stessa fascia/orari anche se custom).

- Chi è in ferie in un giorno scelto → quel giorno è **saltato**, con riepilogo finale ("Creato su 4 giorni; saltato Gio 24: Mario in ferie").
- Conflitti soft su qualche giorno → il dialog li elenca e offre **"Salva comunque"**.
- Action: `creaBlocchiRicorrenti` (max 31 giorni).

## 3. Griglia — resize e drag

- **Resize (estendi)**: passando sopra un chip appare una **maniglia sul bordo destro**. Trascinandola a destra sui giorni successivi si evidenziano le celle coperte (**tutte le righe dei membri** del blocco) e al rilascio l'**intero blocco** viene clonato su quei giorni (bozza). È **solo additivo** (non cancella nulla; per togliere un giorno si elimina il chip). Se la stessa squadra è già su un blocco equivalente quel giorno → **saltato** (ridimensionare più volte non duplica). Action: `ripetiBlocco`.
- **Sposta (drag & drop)**: **tieni premuto ~0,7s** sul chip per armare la modalità sposta (compare un "ghost" che segue il cursore e le celle bersaglio si evidenziano), poi trascina su un **altro giorno** → l'**intero blocco** si sposta lì (cambia solo la data; membri/mezzi invariati). Un **click semplice** resta "apri modifica". Action: `spostaBlocco`.
- **Anteprima a forma di card**: durante resize/sposta, in ogni cella bersaglio (tutte le righe dei membri) compare una **striscia** dello stesso colore/altezza del chip → sembra che la card si allunghi/si sposti. Niente riquadro pieno di cella. Mentre **trascini** la striscia è un'**anteprima "vuota"** — cornice **tratteggiata**, fondo e testo tenui, opacità bassa (chiaramente non ancora reale; l'opacità da sola non bastava perché il fondo della card è quasi bianco); al **rilascio** diventa **piena al 100%** (card "vera", accento solido) con una breve transizione, mentre si salva.
- **Feedback di salvataggio**: al rilascio l'anteprima **resta** mentre si salva e compare una pill **"Salvataggio in corso…"** (il salvataggio su cloud + refresh può richiedere qualche secondo); a fine → **"Salvato"** e la pill in header lampeggia. La validazione per-giorno del resize è parallelizzata per ridurre i tempi.
- **Conferme e riepiloghi** (quando il blocco è una **squadra**): lo **spostamento** chiede conferma con i nomi ("Spostare l'intera squadra: Mauro, Pippo, Pluto a Gio 24?"); il **resize** mostra un riepilogo ("Modifica effettuata per l'intera squadra: … su N giorni"). Per un **tecnico singolo** lo spostamento è fluido (senza conferma) e il resize conferma solo con la pill "Salvato".
- **Eliminazione di una card di squadra — scelta**: aprendo la card di **Mario** (una card sta sulla riga di una persona) e premendo **Elimina**, se il blocco è una squadra compare un dialog con due CTA: **"Elimina tutta la squadra"** (default, rosso) oppure **"Elimina solo {Mario}"** (toglie solo lui, la squadra resta) + Annulla. Per un tecnico singolo resta la conferma classica. Action per il singolo: `rimuoviMembroBlocco` (toglie la riga `pianificazione_membri`; se era l'ultimo membro elimina il blocco). La card conosce "Mario" perché all'apertura le passa la persona della riga (`contestoDipId`).
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

## 8. Header/toolbar (gerarchia) e tooltip

Con l'aumentare delle funzioni l'header è stato ordinato su due fasce coerenti:
- **Fascia 1 — contesto + azione primaria**: titolo + sottotitolo (range settimana · badge bozza · "Salvato"); a destra la **navigazione settimana** (`‹ Oggi ›`) e l'unico bottone **primario "Pubblica"**.
- **Fascia 2 — toolbar**: a **sinistra** i controlli di *vista* (Pianificazione | Solo ferie · Cerca · Gruppi · Solo a turni); a **destra** le *azioni* (`+ Nuovo blocco`, `Esporta PDF ▾`, e un menu **⋯** che raccoglie le azioni meno frequenti — Copia settimana precedente, Salva bozza).
- Un solo primario (Pubblica), il resto `outline`/menu → gerarchia chiara.

**Tooltip (`title`)**: presenti su tutti i controlli e i gesti (navigazione, azioni, filtri, "+" cella, card, maniglia di resize). I testi sono **centralizzati** in `apps/web/app/office/personale/pianificazione/_lib/tooltips.ts` (oggetto `TIP`), un unico posto per mantenerli.
> ⚠️ **Regola**: se si cambia il comportamento di un controllo/gesto, aggiornare il testo in `tooltips.ts` (non nei singoli componenti), così i suggerimenti restano coerenti col funzionamento reale.
