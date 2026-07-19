# Modulo Dipendenti — Possibili aggiunte (backlog idee)

**Versione**: 1.0
**Stato**: backlog vivo (aggiornare man mano)
**Data**: 07/07/2026

Idee che maturano durante lo sviluppo del modulo Dipendenti (pianificazione + ferie/permessi). Da valutare col cliente, non impegnative.

## Analisi e reportistica
- **Pianificato vs consuntivo**: confronto tra la pianificazione settimanale e le timbrature reali (chi era previsto dove vs dove ha timbrato). Scostamenti ore/persone/cantiere. → la "parte di analisi" citata dal cliente, da fare dopo.
- ✅ **Export PDF della settimana** — FATTO (19/07): dropdown "Esporta PDF" (tutti / per categoria / gruppo singolo / auto-scope sul filtro), A4 verticale **per-dipendente**, logo tenant, filename `sett_NN_YYYY_categoria_pianificazione`. Sempre disponibile (slegato da Pubblica). → dettaglio in `Logiche_Pianificazione.md`. *(Variante futura: foglio **per-cantiere** da consegnare al capo cantiere.)*
- Cruscotto carico persone (chi è sotto/sovra-allocato nella settimana).

## Pianificazione
- ✅ **Filtro per gruppo/reparto** — COLLEGATO (08/07), reso **multi-select** (19/07): la toolbar filtra per **gruppo lavoro reale** (via `gruppo_membri`) e pilota anche l'auto-scope dell'export. I gruppi sono gli stessi `gruppi_approvazione` (reparto = gruppo di approvazione), con `colore`.
- ✅ **Drag & drop** — FATTO (19/07): long-press ~0,7s per **spostare** un blocco su un altro giorno; maniglia di **resize** per estenderlo (clonarlo) sui giorni successivi. Semantica **intera squadra**. Hook `useGridDrag` a pointer events. *(Vista mensile ancora backlog.)*
- ✅ **Ripetizione di un blocco su più giorni** — FATTO (19/07): sezione "Ripeti su più giorni" nel dialog + resize in griglia (`creaBlocchiRicorrenti`/`ripetiBlocco`). *(Settimana-tipo / template ricorrenti ancora backlog.)*
- Notifiche mirate al singolo ritocco (oltre alla "Pubblica settimana").
- **Competenze/patenti mezzo**: chi può guidare cosa → conflitto se assegno un mezzo a chi non ha la patente.
- Fasce orarie preset configurabili per tenant (oggi hardcoded: giornata 08-17, mattina 08-12, pomeriggio 13-17).
- Meteo/ferie/festività come layer visivo sulla griglia.

## Ferie e permessi
- **Monte-ore ferie/ROL** (maturazione e residui) secondo CCNL, parametrico per contratto/livello/anzianità (esplicitamente FUORI dalla v1).
- Catalogo tipi permesso con metadati completi (unità, retribuito, tetto, giustificativo, incide-su-monte-ore) e attivazione per-tenant dei tipi opzionali.
- Upload del giustificativo (certificato medico, ecc.) sulla richiesta.
- ✅ **Calendario assenze aziendale** (chi è assente questa settimana) esportabile — FATTO (19/07): vista **"Solo ferie"** nella Pianificazione (toggle) + export PDF dedicato (`sett_NN_YYYY_..._ferie.pdf`). *(Vista mensile/annuale ancora backlog.)*

## Anagrafica dipendenti
- Estensione della scheda Dipendente al **mondo commesse** (Bertaiola): oggi l'anagrafica è gated `kantiere`; diventerà globale.
- Documenti del dipendente (contratto, scadenze visite mediche/patenti/idoneità).
