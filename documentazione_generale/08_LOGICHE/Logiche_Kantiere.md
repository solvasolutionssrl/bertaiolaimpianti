# Logiche operative — Kantiere (presenze, viaggi, sedi, ore)

**Versione**: 1.6
**Stato**: Attivo (in produzione)
**Ultimo aggiornamento**: 15/09/2026
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

### 1.1 Dati puri e quote derivate (dal 15/09/2026)

Ogni riga della giornata (`rapportino_righe`) conserva i **minuti puri** per cantiere: `minuti_lavoro` e `minuti_viaggio`, come registrati (10 ore di lavoro restano 10 ore, mai «8 + 2» scritte a mano). Le quote si **derivano** dall'orario ordinario giornaliero del tenant (`soglia_ore_ordinarie`, default 8 h) con la funzione pura `quoteGiornata` (`@kommessa/api/kantiere-quote`):

| Quota | Regola | Colonne |
|---|---|---|
| **Ordinarie** | lavoro e viaggio fino all'orario ordinario; il lavoro consuma l'orario per primo, riga per riga, poi il viaggio | `ore_ordinarie` (parte lavoro) + `ore_viaggio_ordinarie` |
| **Straordinarie** | lavoro oltre l'orario ordinario | `ore_straordinarie` |
| **Viaggio eccedente** | viaggio oltre l'orario ordinario | `ore_viaggio_eccedenti` |

`ore_viaggio` resta il viaggio totale; `rapportini.orario_ordinario_min` registra l'orario usato per la giornata. Esempi con 8 h: 7:00 di lavoro + 2:00 di viaggio → 8:00 ordinarie (7:00 + 1:00 di viaggio) e 1:00 di viaggio eccedente; 10:00 di lavoro + 1:00 di viaggio → 8:00 ordinarie, 2:00 straordinarie, 1:00 di viaggio eccedente.

- **Scrittore unico**: `scriviRigheGiornata` / `aggiornaRigheGiornata` (`_actions/_lib/righe-giornata.ts`). Ricalcolo dalle timbrature, correzione del tecnico e correzioni dell'ufficio passano tutti di lì. Prima le righe le scrivevano cinque funzioni con regole diverse.
- **Sabato e festivi** si registrano allo stesso modo; le maggiorazioni vengono dalle regole di Ore e costi.
- **Giornate precedenti** (`quote_ore_dal` nel config; FPM e DEMOC: 15/09/2026): restano com'erano, anche se ricalcolate. Senza quote di viaggio (`ore_viaggio_ordinarie` e `ore_viaggio_eccedenti` a null) tutto il viaggio vale come eccedente. Per un tenant nuovo la chiave non c'è e la regola vale da subito.
- **Il viaggio dentro l'orario non è lavoro**: dalle timbrature (`minutiDaTimbrature`) il tempo di una tratta usa prima il buco fra i due segmenti; se non basta si toglie dal segmento di arrivo (trasferimento, andata) o da quello di partenza (ritorno). Andata prima del primo ingresso e ritorno dopo l'ultima uscita non tolgono lavoro.
- **Letture**: report, Ore e costi, costo cantiere, Presenze e ore, schede dipendente e cantiere, dashboard, CSV e API leggono le quote con `quoteDaRiga` / `sommaQuote` / `quoteOre`. Il costo applica la tariffa ordinaria a lavoro e viaggio entro l'orario e la maggiorazione del viaggio solo al viaggio eccedente.

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
4. **Registra giornata** (giornata dichiarata la sera): partenza, rientro, tratte fra cantieri, guida e mezzo nello stesso modulo → vedi **§7.6**.

**Dettagli:**

- I km della stima sono **definitivi**: il tecnico non li corregge a mano (può correggere solo il **tempo**, con giustificazione se scosta dalla stima).
- Il flag **autista** sulla tratta distingue chi **guidava** (rilevante per i rimborsi km) dal passeggero.
- Il tempo di viaggio si registra separato dal lavoro (`minuti_viaggio`) e rientra nelle ore ordinarie fino all'orario ordinario (§1.1). Display sempre in `H:MM`.
- Chi lavora **dalla sede sul progetto** fa partire e arrivare le tratte alla sede: **§3.2**.

### 3.1 Trasferimenti cantiere → cantiere (km + tempo)

Chi in una giornata lavora su **più cantieri** percorre dei tragitti **da un cantiere all'altro** (A → B). Questi tragitti vengono **sempre calcolati e registrati** (indirizzo A → indirizzo B, via provider del tenant, §5): **km + tempo stimato**, su una riga `timbratura_viaggio` con `da_cantiere_id` = cantiere di partenza, `cantiere_id` = cantiere di **destinazione** (i **km si caricano sulla destinazione B**), `timbratura_id` null, `direzione='andata'`.

Copre i **tre** flussi multi-cantiere: **cambio cantiere live**, **split "cosa hai fatto oggi"** a fine turno, **registra giornata** da zero. Le tratte si derivano dall'ordine dei cantieri con la funzione pura testata `trasferimentiDaSegmenti` (ogni cambio di cantiere = un tragitto). Best-effort: se a un cantiere manca l'indirizzo (niente coordinate), quella tratta si salta senza bloccare.

**Sono viaggio, sempre** (dal 15/09/2026, scelta del cliente):

- **Km**: entrano nei totali del cantiere di destinazione e del mezzo, per tutti i tenant. L'interruttore `km_switch_attivo` («Conteggia i trasferimenti tra cantieri») è stato tolto e la chiave rimossa dal config.
- **Tempo**: `durata_confermata_min` = stima arrotondata al passo del viaggio. La tratta sta dentro l'orario, quindi il suo tempo si toglie dal lavoro: nel cambio cantiere live dal segmento di arrivo (§1.1); in «Registra giornata» diventa un buco fra l'uscita da A e l'ingresso in B, e le ore da assegnare ai cantieri sono (fine − inizio) − pausa − tratte (§7.6).
- Il super admin continua a vederle in `/admin/kantiere/timbrature` (sezione «Trasferimenti tra cantieri»).

### 3.2 Lavoro dalla sede sul progetto (dal 15/09/2026)

Non sempre si lavora fisicamente in cantiere: si può lavorare per un cantiere dalla sede, ad esempio al computer. Di default l'app considera la presenza fisica in cantiere; il flag **«Lavoro dalla sede sul progetto»** cambia solo il **luogo**:

- le **ore** restano del cantiere;
- le **tratte** partono e arrivano alla **sede predefinita** (`sedi.is_default`), non all'indirizzo del cantiere;
- nella stessa sede non c'è strada: nessuna tratta e nessun km (partenza o rientro dalla sede predefinita, passaggio fra due cantieri seguiti dalla sede);
- andare **fisicamente** dalla sede a un cantiere è una tratta normale, sede → cantiere.

| Dove | Come |
|---|---|
| Avvio turno da app | Flag nel foglio «Da dove parti?»: l'andata si stima fino alla sede predefinita (`/api/routing/stima` con `{ daSedeId, aSedeId }`). |
| Cambio cantiere | Flag nel foglio: la tratta va dal luogo precedente (sede o cantiere) a quello nuovo. |
| Fine turno | Il ritorno si stima dalla sede in cui si è lavorato; la ripartizione a fine turno eredita la sede e non crea tratte. |
| Registra giornata | Flag per cantiere: tratte, stime e barra usano la sede. |
| Dati | `timbrature.sede_lavoro_id` sulle timbrature del segmento (null = in cantiere). La cronologia mostra «Lavoro dalla sede …», la card del turno «dalla sede …». |

Serve una sede predefinita attiva: senza, l'azione risponde `SEDE_PREDEFINITA_MANCANTE`.

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
3. l'**abitazione privata** a fine turno (opzione sintetica, 0 km / 0 tempo). Non in «Registra giornata», dove partenza e rientro sono sempre una sede (§7.6).

**Non** compaiono le sedi collegate ad **altri** cantieri. *Esempio: "Hotel Excelsior", collegato solo al cantiere Monfalcone, non appare nei cantieri non collegati.*

### Dove è applicata (UI + dati)

- **UI**: scansione QR (`/t/[token]`), fine turno/pausa in app (`turno-azioni-contesto`), wizard caposquadra (`gestione-squadra`), **Registra giornata** (filtra le sedi in base ai cantieri della giornata).
- **Dati (server)**: la regola è **rivalidata lato server** da `sedeAmmessaPerCantiere` in `validaViaggio` (anche per partenza e rientro di `registraGiornataDaZero`, e per le sue tratte via sede) → una sede non predefinita e non associata al cantiere viene **rifiutata** (`SEDE_NON_VALIDA`), anche se forzata da client.

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

Tutte in `tenant_modules.config` (per-tenant), pagina **Impostazioni → Kantiere**. Lettura e predefiniti in un solo punto, `impostazioniDaConfig` (`_lib/kantiere-config.ts`): pagina, azioni e calcoli usano gli stessi valori, anche per le chiavi mai salvate. Le modifiche che toccano ore, approvazioni e km chiedono conferma e valgono per le giornate registrate o ricalcolate dopo il salvataggio. Ogni salvataggio è tracciato in `/admin/audit` (prima/dopo); il super admin vede i valori in sola lettura nel tab Viaggio di `/admin/tenants/[id]`.

### Orario e ore
| Chiave | Default | Effetto |
|---|---|---|
| `soglia_ore_ordinarie` | 8 h | **Orario ordinario giornaliero**: classifica lavoro e viaggio in ordinarie, straordinarie e viaggio eccedente (§1.1). La pagina mostra un esempio calcolato con la stessa funzione. |
| `quote_ore_dal` | assente | Giorno da cui il viaggio entra nell'orario ordinario; le giornate precedenti restano come registrate. Non si modifica dalla pagina (FPM e DEMOC: 15/09/2026). |
| `arrotondamento_viaggio_min` | 5 | Passo del tempo di viaggio (§2). |
| `arrotondamento_ore_min` | 0 | Passo delle ore di lavoro, 0 = al minuto (§2). |

### Turni
| Chiave | Default | Effetto |
|---|---|---|
| `avvio_turno_libero` | on | **on**: turno avviabile dall'app su ogni cantiere. **off**: solo i cantieri con QR attivo. |
| `split_fine_turno_attivo` | on | Ripartizione delle ore su più cantieri alla chiusura (giornata con un solo ingresso). |
| `registra_giornata_attivo` | on | Registra giornata senza timbrature (§7.6). |
| `tolleranza_chiusura_min` | 5 | Scarto ammesso fra ore assegnate e ore da assegnare (§2). |
| `passo_minuti_stepper` | 15 | Passo dei tasti + e − degli stepper ore. |

### Pause
| Chiave | Default | Effetto |
|---|---|---|
| `soglia_pausa_pranzo_ore` | 5 h | Oltre questa durata, chiudendo senza pausa timbrata, l'app chiede la pausa pranzo (30/45/60 min). |
| `soglia_auto_spegnimento_pausa_ore` | 1,5 h | Una pausa rimasta aperta oltre la soglia si chiude e il turno riprende; la pausa registrata è pari alla soglia. |

### Viaggi e chilometri
| Chiave | Default | Effetto |
|---|---|---|
| `km_solo_autista` | on | Su una tratta condivisa i km contano solo per chi guida. Si applica ai km trasmessi al gestionale (API). |
| `sede_partenza_default` | vuoto | Indirizzo proposto come sede di partenza ai cantieri nuovi. Sede predefinita e sedi collegate si gestiscono nella pagina Sedi (§4). |
| `routing_provider` | free | Provider di stima e geocoding (§5), scelto dal super admin. |

La pagina riporta anche le regole fisse: andata e ritorno fuori dall'orario, tratte fra cantieri come viaggio (§3.1), lavoro dalla sede (§3.2), partenza e rientro (in Registra giornata sempre una sede, di default la predefinita; l'abitazione privata, senza viaggio, solo avviando o chiudendo il turno dall'app).

### Approvazione giornate e anomalie
| Chiave | Default | Effetto |
|---|---|---|
| `auto_approva_rapportini` | on | Approva le giornate **chiuse** ed **entro soglia** (§7), anche quelle scritte a mano (§7.1). |
| `anomalia_turno_ore_max` | 10 h | **Soglia di verifica**: oltre questa durata (pause escluse) la giornata resta da verificare. Accetta i decimali (prima 10,5 veniva letto 11). Usata anche dalla pagina Anomalie e dall'avviso in dashboard (§7.2). |
| `anomalie` | tutti on | Controlli della pagina Anomalie: giornate incomplete, oltre soglia, straordinari, festivi, fine settimana, dipendenti senza giornate, giornate corrette dal dipendente. |

### Kontabilità (spese)
| Chiave | Default | Effetto |
|---|---|---|
| `kontabilita_attiva` | on | Abilita le spese di cantiere (foto scontrino → AI vision → revisione → salva). |

**Tolte il 15/09/2026**: `km_switch_attivo` (i trasferimenti contano sempre, §3.1) e `anomalie_ore_max` (mai letta: la pagina Anomalie usa `anomalia_turno_ore_max`). La migration `20260915090000` le rimuove dal config e il salvataggio della pagina le toglie comunque.

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

I km si contano **solo all'autista**. Chi conferma un viaggio senza indicare di
essere l'autista si vede chiedere conferma; se risponde «guidavo io» torna al
modulo con la casella **evidenziata** e la vista che ci scorre sopra.

Vale in tutti i punti: viaggio di ritorno, partenza e Registra giornata (se c'è
almeno un tragitto e «Guidavo io» è spento). Compare **sempre**, anche a chi viaggia di
solito da passeggero: scelta del cliente del 14/09/2026. Pezzo unico
`_components/conferma-passeggero.tsx`.

> ⚠️ È un pannello **dentro** il foglio, non un secondo dialog: Radix
> tratterebbe un dialog annidato come un clic "fuori" e chiuderebbe quello
> sotto, buttando via quello che l'utente aveva già compilato.

---

## 7.5 Cronologia della giornata (dal 14/09/2026)

Ogni giornata racconta la sua storia: cosa è successo, **come**, **chi**, **quando**.

**Ricostruita dai dati, non da un diario parallelo.** Le timbrature sono già gli
eventi, le versioni del rapportino sono già le modifiche. Un diario scritto a
parte sarebbe una seconda copia della verità: il giorno che una funzione si
dimentica di annotare, la storia avrebbe un buco invisibile. Modulo puro
`@kommessa/api/kantiere-cronologia`.

**Come nasce una timbratura — `timbrature.modalita`** (migration
`20260914090000`). `origine` non bastava: l'avvio turno da app scriveva
`manuale`, pausa e ripresa da app `qr`. La modalità si scrive nello **stesso
inserimento** della timbratura, quindi non può divergere.

| `modalita` | Etichetta | Scritta da |
|---|---|---|
| `qr` | Cartello QR | scansione |
| `app` | Dall'app | avvio senza QR, pausa, ripresa, fine turno, cambio cantiere |
| `capo` | Dal capo squadra | gestione squadra |
| `divisione_fine_turno` | Divisa a fine turno | split alla chiusura |
| `giornata_dichiarata` | Dichiarata a fine giornata | Registra giornata |
| `pausa_dichiarata` | Dichiarata alla chiusura | pausa dichiarata in uscita |
| `pausa_chiusa_sistema` | Chiusa in automatico | pausa rimasta aperta oltre soglia |
| `ufficio` | Inserita dall'ufficio | chiudi giornata, aggiungi pausa, timbratura manuale |

Righe precedenti al 14/09: `modalita` NULL, la cronologia la **deduce** e lo dice.
Un test verifica che ogni valore del codice sia ammesso dal CHECK del database:
altrimenti la persona non riuscirebbe a timbrare.

> ⚠️ Sulle righe vecchie di QR e app il ritardo fra orario e salvataggio **non**
> è un dato: quelle create ore o giorni dopo erano caricamenti in blocco (16/07,
> collaudo del 13/08). «Registrata alle» si mostra solo dove è vero.

**Modifiche con prima → dopo.** Chi modifica una giornata legge com'era prima di
toccarla (`leggiStatoGiornata`) e lo passa alla versione. Nuove azioni:
`pausa_ufficio`, `chiusura_ufficio`, `ricalcolo` (solo se sposta le ore di una
giornata **già approvata**: durante un turno le timbrature raccontano già tutto).
Le versioni che non cambiano niente — ore, stato, ore per cantiere — non si
scrivono più.

**Dove si vede**

| Dove | Cosa |
|---|---|
| Presenze e ore (ufficio) | tasto cronologia su ogni giornata → pannello laterale con la storia completa; modifiche dopo l'approvazione evidenziate |
| Elenco (ufficio) | bollino solo se serve: «In parte a mano», «Corretta dall'ufficio», «Modificata dopo l'approvazione» |
| Storico ore (tecnico) | **una riga sola**, e solo se l'ufficio ha cambiato le ore: «Corretta dall'ufficio il 14/09 · ore 8:00 → 7:30» |

Al tecnico si mostra il minimo per scelta: gli interessa sapere se qualcuno gli
ha cambiato le ore, non la storia completa.

**Ore scritte a mano senza timbrature** (14/09/2026). Nessuna timbratura dice
quando è cominciato il lavoro, quindi il pannello mostrava solo il viaggio. Ora
c'è un pallino generico, **senza orario**: «5:00 di lavoro ordinario» (con lo
straordinario «9:30 di lavoro» e il dettaglio; i cantieri solo se più d'uno),
messo dopo l'andata e prima del ritorno. Si mostra solo se non c'è nessuna
timbratura di lavoro. La riga dell'elenco dice «Senza timbrature · 5:00 di
lavoro» invece di «Nessuna timbratura». Banco `scripts/banco-ui/cronologia-a-mano.mjs`.

---

## 7.6 Il percorso in «Registra giornata» (dal 14/09/2026)

Chi scrive la giornata la sera, senza aver timbrato, dichiara anche il **viaggio**
nello stesso posto. Prima «Registra giornata» non lo sapeva fare e i km passavano
solo dalla vecchia «Ore su un cantiere, con viaggio» (1.394 km in 18 giornate nel
pilota FPM).

**Regole (decise con il cliente)**

| Punto | Regola |
|---|---|
| Partenza e rientro | Agli estremi, **di default la sede predefinita**; si può scegliere una sede del cantiere (§4). In Registra giornata **non c'è l'abitazione privata** (15/09/2026). Chi non tocca il rientro se lo trova uguale alla partenza. Se tutti i cantieri sono «Lavoro dalla sede sul progetto», partenza e rientro **non si chiedono**. |
| Chi guidava | Per **ogni tratta con strada** (sede → cantiere, cantiere → cantiere, cantiere → sede), con un'etichetta compatta che si apre: «Ero passeggero» / «Guidavo io» e il mezzo. Dove non c'è strada (stessa sede, tutto il giorno in sede) **non si chiede**. Una tratta non toccata prende l'ultima scelta, ma cambiare una tratta non cambia quelle prima, che tengono quello che mostravano; si propone l'ultimo mezzo guidato, c'è anche «Mezzo non in elenco» (15/09/2026). |
| Tratte fra cantieri | Le costruisce il sistema, **dirette**, con km e tempo stimati. Toccandole si cambiano in «passando da una sede» (sedi ammesse per entrambi i cantieri) o «passando da casa» (nessun viaggio di lavoro). Dallo stesso menu si **corregge il tempo** della tratta, come per partenza e rientro, con un motivo se si scosta dalla stima (15/09/2026). |
| Obbligatori | Tempo della tratta se la stima non c'è, motivo se il tempo è diverso dalla stima, chi guidava e il mezzo su ogni tratta con strada. Quello che manca lo chiede il foglio «Il viaggio» quando si preme «Registra giornata». |
| Passeggero | Se su una tratta si è indicato «Ero passeggero» compare la conferma «Hai viaggiato da passeggero?» (§7.4); «No, guidavo io» riapre chi guidava su quella tratta. |

**Tempo di viaggio e ore**

- **Si indica solo l'inizio del lavoro** (15/09/2026): la fine si calcola, inizio + ore dei
  cantieri + pausa + tratte fra cantieri, e la pagina mostra il conto. Prima inizio e
  fine andavano fatti quadrare con le ore dei cantieri. La pausa pranzo è arancione
  nei tasti e nella barra, come nel resto dell'app.
- **Inizio e fine lavoro** sono l'orario in cantiere. **Andata e ritorno** stanno
  fuori: il loro tempo confermato va in `ore_viaggio`, come per le timbrature QR.
  La barra in basso mostra la giornata intera: partenza (= inizio − andata),
  lavoro con la pausa, rientro (= fine + ritorno).
- Le **tratte fra cantieri** stanno **dentro** l'orario dichiarato e sono
  **viaggio** (dal 15/09/2026, §3.1): la fine si calcola come inizio + ore +
  pausa + tratte, e fra l'uscita da un cantiere e l'ingresso nel
  successivo resta un buco pari alla tratta. `durata_confermata_min` = stima
  arrotondata, o il tempo corretto a mano dal menu della tratta (con motivo in
  `giustificazione` se si scosta dalla stima; passando da una sede il tempo corretto
  si divide fra le due righe in proporzione alle stime). Pagina e server calcolano le tratte con la stessa funzione pura
  (`viaggioFraCantieri`): il salvataggio aspetta le stime, la barra mostra le
  tratte con il tratteggio del viaggio e il totale del viaggio le comprende.
- Se la pausa cadrebbe sullo stesso cambio di una tratta, va dopo 30 minuti sul
  cantiere di arrivo (o prima della partenza, se l'arrivo è troppo corto): pausa e
  viaggio restano due buchi distinti e la pausa mostrata è quella dichiarata
  (`SCARTO_PAUSA_MIN` in `kantiere-split`, stessa regola nella barra).
- Per ogni cantiere si può indicare **«Lavoro dalla sede sul progetto»** (§3.2).

**Cosa si scrive** (`registraGiornataDaZero`, tutto validato **prima** di scrivere)

| Tratta | Riga `timbratura_viaggio` |
|---|---|
| Andata | legata alla **prima entrata** (sede, stima, tempo confermato, km, autista, mezzo) |
| Ritorno | legata all'**ultima uscita** |
| Diretta A → B | trasferimento (`da_cantiere_id` = A, `cantiere_id` = B), con chi guidava su quella tratta e il tempo corretto a mano, se c'è |
| Passando dalla sede | due righe legate al cambio di cantiere: A → sede sull'uscita da A, sede → B sull'ingresso in B; tempo confermato = stima arrotondata, o il tempo corretto diviso fra le due righe in proporzione alle stime |
| Passando da casa | nessuna riga |

Andata e ritorno entrano **insieme**: se l'inserimento fallisce si tolgono le
timbrature appena scritte (le tratte se ne vanno con loro) e la giornata non resta
a metà. Le tratte fra cantieri sono best-effort, come i trasferimenti.

Logica pura e testata in `@kommessa/api/kantiere-percorso` (tratte, confini fra
cantieri, dati mancanti, barra dei tempi). Le stime passano dalla cache condivisa
`stimaConCache`: con Google la stessa tratta non si paga due volte fra pagina e
salvataggio. `/api/routing/stima` accetta anche `{ daCantiereId, aCantiereId }` e
`{ daSedeId, aSedeId }`.

> Parco mezzi: i trasferimenti possono avere un mezzo e i loro km contano nei
> totali del mezzo (§3.1).

---

## 8. Ordinario, straordinario e viaggio

- Si registra il **dato puro**: minuti di lavoro e di viaggio. Né il tecnico né l'ufficio decidono a mano cosa è ordinario o straordinario: la correzione della giornata e «Registra ore» in ufficio chiedono solo **ore di lavoro** e **ore di viaggio**.
- Le quote (ordinarie, straordinarie, viaggio eccedente) si **derivano** dall'orario ordinario del tenant (§1.1).
- La soglia di verifica (`anomalia_turno_ore_max`, 10 h) è un'altra cosa: decide solo se la giornata si approva da sola (§7).

---

## 9. Casi di registrazione della giornata

| Caso | Come | Vincolo |
|---|---|---|
| **Turno con QR** | Ingresso QR → uscita QR | Standard. |
| **Turno senza QR** | "Inizia turno" scegliendo un cantiere | Un solo turno aperto per volta. |
| **Cambio cantiere live** | "Cambia cantiere": chiude A, apre B | Ore dai timestamp reali; la tratta A→B è viaggio e i km vanno a B (§3.1). Flag «Lavoro dalla sede» (§3.2). |
| **Split a fine turno** | "Cosa hai fatto oggi": dividi le ore tra più cantieri | Solo se la **giornata è pulita** (un solo ingresso). Somma = netto ± tolleranza. |
| **Registra giornata da zero** | Inizio + pausa + cantieri/ore + percorso; la fine si calcola (§7.6) | Solo se **nessuna timbratura** oggi e `registra_giornata_attivo`. |
| ~~Inserimento manuale ore~~ | Tolto dall'app il 14/09/2026: il viaggio si dichiara in Registra giornata (§7.6). | Le righe e le tratte già scritte restano valide. |

Il netto giornata = `(chiusura − inizio) − pausa`; in Registra giornata le ore da assegnare tolgono anche le tratte fra cantieri. La pausa dichiarata è una **coppia di timbrature centrata** nel turno (così il calcolo ore la sottrae con la logica pausa esistente).

### PWA — sezione "Non hai timbrato?" (tab Ore)

Quando la giornata è senza timbrature, la tab Ore offre **Registra giornata**, dal 14/09/2026 l'unico inserimento a mano del tecnico:

- **Registra giornata** — dichiari **inizio e pausa** e le ore di **uno o più cantieri** (la fine si calcola). Il server **sintetizza le timbrature reali** (`registraGiornataDaZero` → `calcolaSegmentiSplit`) e il rapportino si ricalcola da quelle. Vincolo: **solo oggi** e **giornata vuota**, con `registra_giornata_attivo` on. UI: card **"La giornata"** dominante (orari + pausa a chip), poi **il percorso** in verticale (partenza con guida e mezzo, una **card per cantiere** col **colore abbinato** al proprio segmento, le tratte fra cantieri, rientro) e la **barra dei tempi** in fondo, sempre visibile anche col foglio «Il viaggio» aperto: ore assegnate/nette, esito, viaggio, orari di partenza e rientro (§7.6).
- ~~**Ore su un cantiere, con viaggio**~~ — **tolta il 14/09/2026** (scelta del cliente): il viaggio ora sta in Registra giornata. L'azione server `registraOreManuali` è stata eliminata il 15/09/2026; le tratte che aveva scritto contano ancora nel ricalcolo (`tratteGiornata` in `ricomputa-rapportino.ts`).

**Giorni passati e giornate già parziali**: dall'app non si dichiarano più da zero. Si correggono con «Modifica giornata» nello storico (dove ammesso) o dall'ufficio in Presenze e ore.

---

## 10. File chiave nel codice (per manutenzione / AI)

| Area | File |
|---|---|
| Calcolo ore dalle timbrature | `packages/api/src/kantiere-ore.ts` (`minutiPerCommessa`, `statoTurno`, `arrotondaA`) |
| Minuti puri e quote (puro + testato) | `packages/api/src/kantiere-quote.ts` (`quoteGiornata`, `minutiDaTimbrature`, `quoteDaRiga`, `quoteOre`) |
| Scrittura delle righe di una giornata | `apps/web/app/_actions/_lib/righe-giornata.ts` (`scriviRigheGiornata`, `aggiornaRigheGiornata`) |
| Split multi-cantiere (puro + testato) | `packages/api/src/kantiere-split.ts` |
| Percorso di Registra giornata (puro + testato) | `packages/api/src/kantiere-percorso.ts` |
| Ricalcolo + auto-approvazione | `apps/web/app/_actions/_lib/ricomputa-rapportino.ts` (`ricomputaRapportinoAuto`, `tratteGiornata`) |
| Timbrature (avvio/cambio/fine turno) | `apps/web/app/_actions/kantiere-timbra.ts` |
| Viaggio/pausa condivisi + validazione sede | `apps/web/app/_actions/_lib/viaggio-timbra.ts` (`validaViaggio`, `sedeAmmessaPerCantiere`) |
| Sedi (CRUD + associazioni) | `apps/web/app/office/_actions/kantiere-sedi.ts` |
| Lettura impostazioni | `apps/web/app/_lib/kantiere-config.ts` (`impostazioniDaConfig`, `leggiImpostazioniKantiere`) |
| Pagina impostazioni | `apps/web/app/office/kantiere/impostazioni/_components/impostazioni-client.tsx`, azione `office/_actions/kantiere-impostazioni.ts` |
| Stima viaggio + geocoding | `apps/web/app/_lib/routing/` (cache condivisa `stima-cache.ts`), `apps/web/app/api/routing/stima`, `apps/web/app/api/geocode/autocomplete` |
| Registra giornata (UI) | `apps/web/app/mobile/kantiere/ore/_components/registra-giornata-dialog.tsx`, `percorso-giornata.tsx` |

---

*Modifiche a queste logiche vanno riflesse qui e nel `CLAUDE.md` (sezione Kantiere).*
