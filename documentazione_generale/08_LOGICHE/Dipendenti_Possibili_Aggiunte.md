# Modulo Dipendenti — Possibili aggiunte (backlog idee)

**Versione**: 1.0
**Stato**: backlog vivo (aggiornare man mano)
**Data**: 07/07/2026

Idee che maturano durante lo sviluppo del modulo Dipendenti (pianificazione + ferie/permessi). Da valutare col cliente, non impegnative.

## Analisi e reportistica
- **Pianificato vs consuntivo**: confronto tra la pianificazione settimanale e le timbrature reali (chi era previsto dove vs dove ha timbrato). Scostamenti ore/persone/cantiere. → la "parte di analisi" citata dal cliente, da fare dopo.
- Report/stampa PDF della settimana per cantiere (foglio da consegnare al capo cantiere).
- Cruscotto carico persone (chi è sotto/sovra-allocato nella settimana).

## Pianificazione
- **⭐ Filtro per gruppo/reparto** (Officina, Cantiere, Manutenzione, ecc.): la UI è **già predisposta** nella toolbar della pianificazione (select "gruppo" con badge "in arrivo"), ma **non ancora funzionale** perché i dipendenti non hanno ancora un campo `gruppo`. Da collegare quando arrivano i gruppi (probabile riuso dei `gruppi_approvazione` della fase Ferie o un campo/relazione `dipendente.gruppo` dedicato). Vedi `PianificazioneClient` (stato `gruppo`, costante `GRUPPI_PLACEHOLDER`).
- **Drag & drop** delle assegnazioni tra celle; vista mensile.
- **Settimana-tipo / template** ricorrenti; ripetizione di un blocco su più giorni.
- Notifiche mirate al singolo ritocco (oltre alla "Pubblica settimana").
- **Competenze/patenti mezzo**: chi può guidare cosa → conflitto se assegno un mezzo a chi non ha la patente.
- Fasce orarie preset configurabili per tenant (oggi hardcoded: giornata 08-17, mattina 08-12, pomeriggio 13-17).
- Meteo/ferie/festività come layer visivo sulla griglia.

## Ferie e permessi
- **Monte-ore ferie/ROL** (maturazione e residui) secondo CCNL, parametrico per contratto/livello/anzianità (esplicitamente FUORI dalla v1).
- Catalogo tipi permesso con metadati completi (unità, retribuito, tetto, giustificativo, incide-su-monte-ore) e attivazione per-tenant dei tipi opzionali.
- Upload del giustificativo (certificato medico, ecc.) sulla richiesta.
- Calendario assenze aziendale (chi è assente questa settimana) esportabile.

## Anagrafica dipendenti
- Estensione della scheda Dipendente al **mondo commesse** (Bertaiola): oggi l'anagrafica è gated `kantiere`; diventerà globale.
- Documenti del dipendente (contratto, scadenze visite mediche/patenti/idoneità).
