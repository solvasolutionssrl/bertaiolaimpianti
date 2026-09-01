# Logiche operative — Kantiere (presenze, viaggi, sedi, ore)

**Versione**: 1.2
**Stato**: Attivo (in produzione)
**Ultimo aggiornamento**: 07/07/2026
**Ambito**: modulo **Kantiere** (tenant con `app_mode=kantiere`, es. FPM Impianti). NON tocca il mondo commesse (Bertaiola).

> **A cosa serve questo file.** Non è un manuale d'uso: è il registro delle **regole e delle scelte operative** già implementate (arrotondamenti, soglie, quando si caricano i km, come si collegano sedi e cantieri, quali impostazioni gestisce l'ufficio). Serve come base per una futura sezione **Help** nell'office e come contesto per un **agente AI interno**.
>
> **Va mantenuto aggiornato**: ogni volta che cambia una logica importante (nuova soglia, nuovo settaggio, nuova regola di calcolo), aggiornare la sezione corrispondente e alzare la versione in testa.

---

## 1. Principio di fondo: le timbrature sono la verità

Il conteggio ore **non** si fida di ciò che l'utente scrive: si **ri-deriva sempre dalle timbrature**.

- Ogni giornata è ricalcolata da `ricomputaRapportinoAuto`, che **cancella e ricostruisce** le righe ore dalle timbrature (`minutiPerCommessa`).
- Le ore per cantiere si ottengono appaiando **ingresso → uscita** per quel cantiere.
- La **pausa** è un semplice **buco (gap)** tra un'uscita e l'ingresso successivo: non c'è un "campo pausa" che incide sul totale, conta solo il tempo effettivamente aperto.
- Conseguenza pratica: lo split multi-cantiere "regge" solo se è fatto di **segmenti timbrati reali** (per questo lo split di fine turno sintetizza segmenti, non scrive direttamente le righe ore).

Il **rapportino** è quindi la **forma** (record-giornata con stato di approvazione), le **timbrature** sono la **sostanza**.

---

## 2. Fine turno: arrotondamenti e tolleranza

| Regola | Valore default | Impostazione | Comportamento |
|---|---|---|---|
| **Tolleranza chiusura** | **5 min** | `tolleranza_chiusura_min` | Nello split "cosa hai fatto oggi" e nella "registra giornata": se i minuti assegnati ai cantieri si discostano dal totale di **≤ tolleranza**, si salva lo stesso e **l'ultimo cantiere assorbe il piccolo resto**. Così i minuti dispari (turno che finisce alle X:03) non bloccano l'utente. |
| **Arrotondamento viaggio** | **5 min** | `arrotondamento_viaggio_min` | Ogni tragitto **> 0** conta almeno uno step (≥ 5 min); un tragitto **= 0** resta 0. Vale sui turni **futuri**. |
| **Arrotondamento ore lavoro** | **0 = nessuno** | `arrotondamento_ore_min` | Scelta del cliente: si **raccoglie tutto al minuto** e si arrotonda **nel report a fine mese** sul dato aggregato, non sul singolo turno. |

> `arrotondaA(min, step)` è l'helper unico (step < 1 = arrotondamento disattivato).

---

## 3. Chilometri: quando e come si caricano

I km si registrano su una **tratta di viaggio** (`timbratura_viaggio`), non sulle ore.

**Quando si caricano:**

1. **Viaggio andata / ritorno** con scelta della **sede** di partenza/arrivo → km e tempo dalla **stima del provider** (vedi §5).
2. **Trasferimenti cantiere → cantiere** (tra un cantiere e l'altro nella stessa giornata): vedi **§3.1** — sempre registrati.
3. **Fine turno verso "Abitazione privata"**: opzione sempre disponibile → **0 km, 0 tempo** (nessuna tratta di lavoro da rimborsare).

**Dettagli:**

- I km della stima sono **definitivi**: il tecnico non li corregge a mano (può correggere solo il **tempo**, con giustificazione se scosta dalla stima).
- Il flag **autista** sulla tratta distingue chi **guidava** (rilevante per i rimborsi km) dal passeggero.
- Il tempo di viaggio, ad oggi, **non** viene conteggiato nelle ore di lavoro: si tracciano **km + tempo** a parte (display sempre in `H:MM`).

### 3.1 Trasferimenti cantiere → cantiere (km + tempo)

Chi in una giornata lavora su **più cantieri** percorre dei tragitti **da un cantiere all'altro** (A → B). Questi tragitti vengono **sempre calcolati e registrati** (indirizzo A → indirizzo B, via provider del tenant, §5): **km + tempo stimato**, su una riga `timbratura_viaggio` con `da_cantiere_id` = cantiere di partenza, `cantiere_id` = cantiere di **destinazione** (i **km si caricano sulla destinazione B**), `timbratura_id` null, `direzione='andata'`.

Copre i **tre** flussi multi-cantiere: **cambio cantiere live**, **split "cosa hai fatto oggi"** a fine turno, **registra giornata** da zero. Le tratte si derivano dall'ordine dei cantieri con la funzione pura testata `trasferimentiDaSegmenti` (ogni cambio di cantiere = un tragitto). Best-effort: se a un cantiere manca l'indirizzo (niente coordinate), quella tratta si salta senza bloccare.

**Due livelli, distinti apposta:**

- **Registrazione — SEMPRE attiva** (anche a feature spenta): km + tempo salvati e **visibili al super admin** in `/admin/kantiere/timbrature` (sezione "Trasferimenti tra cantieri", cross-tenant, sempre mostrata). Il tempo è salvato in `durata_stimata_min`.
- **Conteggio — toggle per-tenant** `km_switch_attivo` ("Conteggia i trasferimenti tra cantieri" in Impostazioni Kantiere → Turni & calcoli), **default OFF (opt-in)**. Se **ON**, i km entrano anche nei **totali del cantiere di destinazione** lato tenant (report, scheda cantiere, cruscotto). Se **OFF**, le tratte restano registrate ma **non compaiono** nelle aggregazioni/liste del tenant (i numeri operativi del tenant non cambiano) — solo il super admin le vede.

**Il tempo NON entra (ancora) nelle ore pagate.** Sulle righe di trasferimento `durata_confermata_min = 0`: così il tempo è **registrato** ma **non** conteggiato nelle ore. ⚠️ **Da definire col cliente** (segnato nei promemoria): alla futura attivazione il **tempo di viaggio totale della giornata** aiuterà a completare la barra ore del tecnico (es. `8:00` + `0:45` di viaggio), ma **se e come** conti come lavoro dipende dal giorno (feriale/festivo) e dagli **straordinari**. Il punto di aggancio è `viaggioManualePerTarget` in `ricomputa-rapportino.ts` (commento `SEAM ATTIVAZIONE FUTURA`).

> **Stato per tenant**: **FPM Impianti → OFF** (registra ma non conteggia). Da attivare quando avremo definito la regola ore col cliente.

---

## 4. Sedi ↔ cantieri (regola chiave)

### Modello dati

| Tabella | Ruolo |
|---|---|
| `sedi` | Luoghi di partenza/arrivo del tenant: sede aziendale, depositi, **hotel**. Campo `is_default` = **sede predefinita** (una sola per tenant). Tipi: `sede_principale`, `sede_secondaria`, `hotel`, `altro`. Ogni sede ha `indirizzo` + `lat`/`lng`. |
| `cantiere_sede` | Associazione **N↔N**: quali sedi (oltre alla predefinita) sono disponibili per un dato cantiere. |

### Regola: cosa si propone in un cantiere

Per un cantiere, alla timbratura/fine turno si propongono **solo**:

1. la **sede predefinita** del tenant (`is_default` — proposta **sempre**, non serve collegarla);
2. le **sedi collegate a quel cantiere** (righe di `cantiere_sede`);
3. l'**abitazione privata** a fine turno (opzione sintetica, 0 km / 0 tempo).

**Non** compaiono le sedi collegate ad **altri** cantieri. *Esempio: "Hotel Excelsior", collegato solo al cantiere Monfalcone, non appare nei cantieri non collegati.*

### Dove è applicata (UI + dati)

- **UI**: scansione QR (`/t/[token]`), fine turno/pausa in app (`turno-azioni-contesto`), wizard caposquadra (`gestione-squadra`), **inserimento manuale ore** (il dialog filtra le sedi in base al cantiere scelto).
- **Dati (server)**: la regola è **rivalidata lato server** da `sedeAmmessaPerCantiere` in `validaViaggio` e in `registraOreManuali` → una sede non predefinita e non associata al cantiere viene **rifiutata** (`SEDE_NON_VALIDA`), anche se forzata da client.

### Gestione lato ufficio

- Pagina **Sedi** (office → Kantiere → Sedi): crea/modifica sede, imposta la **predefinita**, collega/scollega i cantieri (campo di ricerca con dropdown, non l'intera lista).
- **Scheda cantiere** → card **"Sedi di partenza"** (tra "Chi c'è ora" e "Storico presenze"): mostra la sede **predefinita** (sempre) + **Abitazione privata** (sempre, a fine turno) come voci di sola lettura, poi le **sedi collegate** a quel cantiere (rimovibili) e due azioni: *Usa una sede esistente* (ricerca) o *Crea nuova sede* (auto-collegata). È il posto dove si gestiscono le sedi reali del cantiere.
- L'**indirizzo** della sede usa l'autocomplete geocoding (Google per i tenant su provider `google`, altrimenti Photon/Nominatim) e salva **lat/lng** per il calcolo dei tragitti.

> **Nota (legacy)**: la colonna `cantieri.sede_partenza` (testo, con lat/lng) è un vecchio campo **non usato** dal calcolo viaggio (che si basa su `sedi` + `cantiere_sede`). Il controllo è stato **rimosso dall'anagrafica** della scheda cantiere per non confondere; la colonna resta nel DB ma è inerte.

---

## 5. Stima viaggio: provider per-tenant

- Astrazione `RoutingProvider`: famiglia **free** (OSRM/OpenRouteService, gratis, **senza traffico**) o **google** (Google Routes API, **traffico reale**, a pagamento).
- La scelta è **per-tenant**, dal super admin (tab **"Viaggio"** di `/admin/tenants/[id]`): `tenant_modules.config.routing_provider` ∈ `free | google` (default `free`).
- La **chiave Google è unica di piattaforma** (`GOOGLE_MAPS_API_KEY`, in env — **mai** nel DB, **mai** per-tenant). Se il tenant è su `google` ma la chiave manca → fallback automatico a free.
- Lo **stesso toggle** vale anche per l'**autocomplete indirizzi** delle sedi/cantieri, così indirizzi, tempo e km di un tenant restano coerenti.
- FPM è su **google**; gli altri restano **free** (costo zero).

---

## 6. Impostazioni gestite dall'ufficio

Tutte in `tenant_modules.config` (per-tenant). Le principali:

### Turni & calcoli
| Chiave | Default | Effetto |
|---|---|---|
| `tolleranza_chiusura_min` | 5 | Tolleranza sulla somma dello split (§2). |
| `split_fine_turno_attivo` | on | Abilita "cosa hai fatto oggi" (dividi le ore tra più cantieri a fine turno). |
| `avvio_turno_libero` | on | **on**: i tecnici vedono **tutti** i cantieri e possono iniziare un turno senza QR. **off**: solo i cantieri con QR attivo (sostituisce il vecchio "gate weekend"). |
| `km_switch_attivo` | off | **Conteggia i trasferimenti tra cantieri**: i km/tempo A→B sono **sempre registrati** (§3.1); se on entrano anche nei totali del cantiere di destinazione lato tenant. |
| `passo_minuti_stepper` | 15 | Passo dei tasti +/- di tutti gli stepper ore (split, modifica giornata, storico, registra giornata). |
| `registra_giornata_attivo` | on | Abilita la "registra giornata da zero" (giornata senza timbrature). |

### Approvazione presenze
| Chiave | Default | Effetto |
|---|---|---|
| `auto_approva_rapportini` | on | Auto-approva le giornate **chiuse** ed **entro soglia** (vedi §7). Vale anche per quelle scritte a mano (§7.1). |
| `anomalia_turno_ore_max` | 10 h | Oltre questa durata (pause escluse) la giornata è **anomalia** → resta da verificare. |
| `soglia_pausa_pranzo_ore` | 5 h | Oltre questo tempo senza pausa timbrata, in uscita compare il promemoria "timbrare la pausa è il modo corretto" + opzioni 30/45/60 min. |
| Auto-spegnimento pausa | 1 h 30 | Se la pausa resta aperta oltre la soglia, l'orologio riparte da solo (rete di sicurezza per l'app chiusa). |

### Viaggio
| Chiave | Default | Effetto |
|---|---|---|
| `routing_provider` | free | Provider stima viaggio + geocoding indirizzi (§5). |

### Kontabilità (spese)
| Chiave | Default | Effetto |
|---|---|---|
| `kontabilita_attiva` | on | Abilita le spese di cantiere (foto scontrino → AI vision → revisione → salva). |

---

## 7. Auto-approvazione rapportini

- Una giornata si **auto-compila** dalle timbrature e si **auto-approva** quando è **chiusa** (ingressi = uscite) **ed entro soglia** (`anomalia_turno_ore_max`, pause escluse).
- Giornata **aperta** o **oltre soglia** → resta **"da verificare"** (bozza), in carico a **office/admin**.
- Si **ri-valuta a ogni timbratura** (riaprire un turno riporta la giornata in bozza).
- Congelata solo se l'ufficio l'ha già toccata (`approvato_da` valorizzato).
- Logica pura testata: `esitoAutoApprovazione`; wiring in `ricomputaRapportinoAuto`.

### 7.1 Anche le giornate scritte A MANO si auto-approvano (dal 20/08/2026)

Una giornata **dichiarata a mano** — dall'ufficio, dal tecnico la sera, o con
«Registra giornata» — **si auto-approva come tutte le altre**, quindi è subito
pronta per uscire verso il gestionale.

**Perché serviva una regola a parte.** `esitoAutoApprovazione` parte dagli
**ingressi**: una giornata senza timbrature ha `ingressi = 0` e veniva scartata
per sempre come «nessun turno». Restava in bozza in eterno e non arrivava mai
al gestionale. Successo davvero: al 20/08 c'erano 3 giornate (27 ore) ferme così.

**La regola** (`esitoAutoApprovazioneManuale`, pura e testata) guarda le **ore
dichiarate** invece degli ingressi. Non approva in due casi:

| Caso | Perché |
|---|---|
| **0 ore** | Non c'è niente da approvare: la guarda l'ufficio. |
| **Turno timbrato ancora aperto** (o fermo in pausa) | Fisserebbe ore parziali. |

Oltre soglia resta «da verificare», come sempre.

> ⚠️ **`auto_compilato` resta `false`.** Il giudizio non lo tocca: se tornasse
> `true`, il ricalcolo successivo riprenderebbe la giornata e **cancellerebbe le
> ore scritte a mano**. È il motivo per cui `approvaSeManualeOk` è staccata dal
> percorso normale invece di essere un ramo dentro di esso.

Il giudizio è agganciato a **`marcaRapportinoManuale`**, cioè al momento esatto
in cui le ore a mano vengono salvate: vale così per tutte e cinque le strade che
le scrivono, e per quelle che verranno.

---

## 7.2 Avviso in dashboard: le giornate che il freno tiene ferme

La soglia (§7) è voluta, ma senza un richiamo le giornate sopra soglia
restano in bozza per sempre e **quelle ore non arrivano da nessuna parte**.

La dashboard Kantiere mostra un avviso ambra con **quante giornate**, **quante
ore** e **chi**, e porta dritto ai rapportini. Conta soltanto quelle che il
freno tiene ferme davvero:

| Escluso | Perché |
|---|---|
| Giornate di **oggi** | Un turno in corso non aspetta un controllo, aspetta di finire. |
| Giornate rimaste **aperte** (ingressi ≠ uscite) | È un altro problema, e ha la sua pagina. |

Senza questi due filtri su FPM l'avviso direbbe 71 giornate invece delle 65
vere. Helper `giornateOltreSoglia` in `_lib/kantiere-config.ts`, fail-soft: se
qualcosa non risponde l'avviso non compare, non rompe la dashboard.

**Come si scrivono le ore.** Quelle di una giornata restano `H:MM` (7:30): mezz'ora
conta. Un **totale** no — `705:19` per la somma di 65 giornate è illeggibile e quei
19 minuti non servono a decidere niente. Helper puro `formattaOreTotale`: sotto
un'ora `45 min`, sotto le 10 ore `7:30`, sopra `705 ore`. La soglia è dove il minuto
smette di essere informazione e diventa rumore.

**Dove valgono l'una e l'altra** (audit del 01/09, 20 punti riscrivevano lo
stesso formattatore a mano):

| Cosa | Come | Perché |
|---|---|---|
| Ore di una giornata, riga di tabella, timbratura | `formattaOreGiornata` → `7:30` | Mezz'ora conta |
| KPI, totali di colonna, grafici su un periodo, «ultimi 7 giorni» | `formattaOreTotale` → `705 ore` | È una somma |
| **CSV** | decimale con la virgola (`7,5`) | Il foglio di calcolo deve sommare |

Difetti trovati e chiusi: **Ore e costi** scriveva tutto in decimale (`7,5`),
la **scheda cantiere dell'app** anche («Ore oggi 7,5 h», «Ultimi 7 giorni»), e
il KPI «Ore settimana» della dashboard diceva `123:55`.

---

## 7.3 Metodi di pagamento (vale per TUTTI i clienti, non solo Kantiere)

Erano un elenco chiuso nel codice (`contanti` | `carta` | `altro`) ripetuto in
quattro punti. Ora stanno su `metodi_pagamento`, uno per cliente, e si
gestiscono da **Impostazioni → Pagamenti** (admin/ufficio, con registro).

> ⚠️ **Il `codice` non si tocca mai.** È il testo dentro
> `spese.metodo_pagamento`: cambiarlo scollegherebbe le spese già registrate e
> quelle già uscite verso il gestionale. Si rinomina **solo** `nome`, e la
> conferma a schermo lo dice.

- **Rinominare** e **aggiungere**: sempre con conferma.
- **Ritirare** non cancella: sparisce dalle scelte nuove, le spese vecchie
  restano leggibili col loro nome. Almeno uno deve restare in uso.
- **L'AI vede l'elenco del cliente**: il prompt e il glossario si costruiscono
  dai suoi metodi, e un codice che l'AI si inventa viene scartato.
- Lettore difensivo `leggiMetodiPagamento`: se la tabella manca o il cliente è
  nuovo, tornano i tre di sempre — nessuna tendina resta vuota.

---

## 7.4 «Hai viaggiato da passeggero?»

I km si contano **solo all'autista**. Chi conferma un viaggio senza spuntare
«sono io l'autista» si vede chiedere conferma; se risponde «guidavo io» torna al
modulo con la casella **evidenziata** e la vista che ci scorre sopra.

Vale in tutti e tre i punti: viaggio di ritorno, partenza, inserimento ore a
mano (lì basta che **una** tratta sia da passeggero). Pezzo unico
`_components/conferma-passeggero.tsx`.

> ⚠️ È un pannello **dentro** il foglio, non un secondo dialog: Radix
> tratterebbe un dialog annidato come un clic "fuori" e chiuderebbe quello
> sotto, buttando via quello che l'utente aveva già compilato.

---

## 8. Ordinario vs straordinario

- Il **tecnico** inserisce le **ore totali di lavoro** (un solo campo): non decide lui cosa è ordinario o straordinario.
- L'**ufficio** fa lo split ordinario/straordinario in fase di ricalcolo, applicando la **soglia** concordata.

---

## 9. Casi di registrazione della giornata

| Caso | Come | Vincolo |
|---|---|---|
| **Turno con QR** | Ingresso QR → uscita QR | Standard. |
| **Turno senza QR** | "Inizia turno" scegliendo un cantiere | Un solo turno aperto per volta. |
| **Cambio cantiere live** | "Cambia cantiere": chiude A, apre B | Ore dai timestamp reali; km A→B se `km_switch_attivo`. |
| **Split a fine turno** | "Cosa hai fatto oggi": dividi le ore tra più cantieri | Solo se la **giornata è pulita** (un solo ingresso). Somma = netto ± tolleranza. |
| **Registra giornata da zero** | Inizio/fine + pausa + cantieri/ore | Solo se **nessuna timbratura** oggi e `registra_giornata_attivo`. |
| **Inserimento manuale ore** | Ore + eventuale viaggio con sede/mezzo | Sede filtrata per cantiere (§4). |

Il netto giornata = `(chiusura − inizio) − pausa`. La pausa dichiarata è una **coppia di timbrature centrata** nel turno (così il calcolo ore la sottrae con la logica pausa esistente).

### PWA — sezione "Non hai timbrato?" (tab Ore)

Quando la giornata è senza timbrature, la tab Ore offre **due strumenti distinti** (non sono la stessa cosa lato dati — non vanno fusi alla leggera):

- **Registra giornata** (azione **primaria**) — dichiari **inizio / fine / pausa** e distribuisci le ore su **uno o più cantieri**. Il server **sintetizza le timbrature reali** (`registraGiornataDaZero` → `calcolaSegmentiSplit`) e il rapportino si ricalcola da quelle. Vincolo: **solo oggi** e **giornata vuota**, con `registra_giornata_attivo` on. UI: card **"La giornata"** dominante (orari + pausa a chip), una **card per cantiere** col **colore abbinato** al proprio segmento nella **barra panoramica** in fondo (sempre visibile: ore assegnate/nette, esito Completa/Restano/di troppo, riempimento per cantiere).
- **Ore su un cantiere, con viaggio** (azione **secondaria**) — aggiungi ore + **viaggio andata/ritorno** (sede/mezzo/km) a **un solo cantiere**; scrive direttamente `rapportino_righe` + `timbratura_viaggio` (`registraOreManuali`). Funziona anche su **giorni passati** o su una giornata già parziale.

**Quale usare**: se devi tracciare il **viaggio** o correggere un **giorno passato** → il secondo; se devi solo **dichiarare la giornata intera** (una o più commesse) → il primo.

---

## 10. File chiave nel codice (per manutenzione / AI)

| Area | File |
|---|---|
| Calcolo ore dalle timbrature | `packages/api/src/kantiere-ore.ts` (`minutiPerCommessa`, `statoTurno`) |
| Split multi-cantiere (puro + testato) | `packages/api/src/kantiere-split.ts` |
| Ricalcolo + auto-approvazione | `apps/web/app/_actions/kantiere-rapportino.ts` (`ricomputaRapportinoAuto`) |
| Timbrature (avvio/cambio/fine turno) | `apps/web/app/_actions/kantiere-timbra.ts` |
| Viaggio/pausa condivisi + validazione sede | `apps/web/app/_actions/_lib/viaggio-timbra.ts` (`validaViaggio`, `sedeAmmessaPerCantiere`) |
| Sedi (CRUD + associazioni) | `apps/web/app/office/_actions/kantiere-sedi.ts` |
| Lettura impostazioni | `apps/web/app/_lib/kantiere-config.ts` (`leggiImpostazioniTurno`, soglie, provider) |
| Stima viaggio + geocoding | `apps/web/app/_lib/routing/`, `apps/web/app/api/routing/stima`, `apps/web/app/api/geocode/autocomplete` |

---

*Modifiche a queste logiche vanno riflesse qui e nel `CLAUDE.md` (sezione Kantiere).*
