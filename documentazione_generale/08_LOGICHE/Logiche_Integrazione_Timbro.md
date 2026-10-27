# Logiche — Integrazione con la timbratrice Timbro

**Versione**: 2.7
**Stato**: **attiva in produzione su FPM dal 26/10/2026** (stato `attivo`, le fasi del turno arrivano)
**Decisione di forma**: contenitore **virtuale** (§4) — `timbrature` nasce solo all'attribuzione
**Data**: 21–26/10/2026
**Cliente**: FPM Impianti (`FPMIMP`, mondo presenze). Bertaiola non è toccata.

---

## 0. Lo stato, in chiaro

| | |
|---|---|
| ✅ **Contratto con Timbro** | chiuso e in produzione dal loro lato |
| ✅ **`timbri_grezzi`** | registro e parcheggio (migration `20261021120000`, + `genere`/`dispositivo` dalla `20261022090000`) |
| ✅ **`@kommessa/api/timbri-sequenza`** | da eventi a direzioni. 21 asserzioni |
| ✅ **`@kommessa/api/timbro-giornata`** | lo stato della giornata e il riempimento della scatola. 22 asserzioni, 2 mutazioni viste fallire |
| ✅ **L'import** | `_lib/timbro/import.ts`: riconciliazione a cursore ogni 2 minuti (pg_cron `timbro-import`) + webhook `/api/webhooks/timbro` |
| ✅ **Il terzo momento** | `ripartisciGiornataTimbro` in `_actions/kantiere-timbra.ts`, sullo **stesso scrittore** di «Registra giornata» (`scriviGiornataRipartita`) |
| ✅ **Telefono** | la card «Inserisci le commesse sulle quali hai lavorato oggi» nella tab Ore, il banner nella home, lo stesso dialog di «Registra giornata» in modalità scatola |
| ✅ **Ufficio** | «Presenze e ore»: pannello «giornate timbrate da sistemare», righe per chi ha timbrato e non ripartito, passaggi al terminale nel dettaglio, dialog da scrivania |
| ✅ **Super admin** | tab **Timbro** per cliente (stato, token, data di partenza, webhook, abbinamento persone, giornate recenti), semaforo in `/admin/integrazioni`, tab **Regole** |
| ✅ **Promemoria** | avviso `ore_da_inserire` **alla fine giornata dichiarata** (§10.5, entro 2 minuti dal gesto), più la sera e la mattina dopo (pg_cron `promemoria-ore`), orari per cliente |
| ✅ **Lo specchio verso Timbro** | `_lib/timbro/invia.ts`: scrive solo con stato **`attivo`**, chiave con scope `punches:write` |
| ✅ **In produzione** | **FPM `attivo` dal 26/10/2026**, `dal = 2026-10-26`. Verificato sul database: giro ogni 2 minuti con esito `ok`, cursore che avanza, **40 passaggi** letti dal 21/10 |
| ✅ **Fasi del turno** | «Evento con fasi del turno» acceso su FPM: **15 passaggi su 40 portano `passo`** — `pause_start`/`pause_end` con `passo_origine` `person` (l'ha toccato la persona) e `inferred`, `turno_era_aperto` su 16 |

> ⚠️ **Oggi per chi timbra non cambia niente finché il collegamento è spento.** Acceso in «osservazione» legge e mostra all'ufficio; solo «attivo» chiede qualcosa ai tecnici.

---

## 1. Il disegno, in una frase

I timbri — da terminale o da app — formano il **contenitore** della giornata (8:27 → pausa → 18:00). Poi il tecnico, dal telefono, **riempie la scatola**: tante ore sulla commessa Pippo, tante su Pluto, fino a coprire il contenitore.

⭐ **Il motore per riempire la scatola esiste già e gira in produzione**: `calcolaSegmentiSplit` (`@kommessa/api/kantiere-split`) prende i segmenti timbrati e li fa dividere fra più cantieri, con una tolleranza sui minuti dispari. Non si costruisce un calcolo nuovo — si aggiunge **una bocca nuova all'orologio**.

⭐ E «la pausa la si intuisce» era già vero: la pausa in Kommessa **è** il buco fra un'uscita e l'ingresso successivo (`minutiPerCommessa`), e il flag `pausa` non incide sul conteggio. Dai timbri la giornata esce giusta senza scrivere una riga di calcolo.

---

## 2. Il contratto: Timbro espone **eventi**, non direzioni

`GET /api/v1/punches` di Timbro espone ogni timbratura come **evento**: il tocco del badge con l'ora. Ogni riga porta `kind`:

| `kind` | significato |
|---|---|
| `badge_tap` | badge avvicinato al terminale a `occurred_at`. **Misurato.** La direzione è da dedurre |
| `entry` | inserita a mano o da un altro sistema. La direzione è **dichiarata** da chi l'ha inserita |

`direction` resta nel payload per compatibilità, ma la loro documentazione la dichiara **dedotta da Timbro, non misurata da nessun dispositivo**. ⚠️ **Noi la ignoriamo per le `badge_tap`.**

> ⭐ **Perché la direzione la deduce chi legge, e non chi misura.** Con due bocche sullo stesso orologio — si apre dall'app e si chiude al terminale — **nessuno dei due sistemi vede la sequenza intera**, quindi nessuno dei due può dedurre la direzione da solo. Il terminale in automatico timbra l'opposto dell'ultima direzione *che conosce*: se il turno si è aperto dall'app, alla sera segnerebbe **un'entrata invece dell'uscita**, e la giornata sarebbe rotta.
>
> ⭐ E questa scelta ha chiuso da sé un problema grosso: **non serve più che i nostri timbri arrivino a Timbro.** Non c'è nessuna direzione da tenere allineata, quindi niente chiamate in uscita, niente token di un'API esterna da custodire, niente coda con ritenta. Kommessa legge e basta. ⚠️ Era una complicazione vera: in tutto questo repo **non esiste un solo `fetch` verso un host esterno** (a parte OpenAI), e quella sarebbe stata la prima.

Altri campi che usiamo: `time_source` (`ntp` | `server` | `unknown` | `manual` | `api`), `updated_since` con un `updated_at` vero mosso da un trigger a ogni modifica, `employee_external_id` (il nostro `dipendenti.id`), `status` (`valid` | `voided`), `time_missing=true` per contare quelli senza orario.

Autenticazione: Bearer, un token per azienda, scope `punches:read` + `employees:read` + `employees:write`. **Senza `punches:write`.**

---

## 3. `timbri_grezzi`: registro e parcheggio

⭐ **Perché una tabella a parte e non una colonna su `timbrature`.** `timbrature` ha un vincolo che regge tutto il mondo delle ore: `num_nonnulls(commessa_id, cantiere_id) = 1` — ogni timbro dice anche **dove**. Un tocco di badge non lo sa: il luogo lo dirà la persona dopo. Quindi la tabella fa due mestieri insieme — **registro** di ciò che è arrivato e **parcheggio** di ciò che non è ancora attribuibile — e `timbrature` **non si tocca**.

Cosa scioglie, concretamente:

- ⭐ **Un timbro annullato da Timbro è un cambio di `stato`**, non la cancellazione di una riga di `timbrature` che potrebbe essere già finita in un rapportino. Era il problema più difficile del disegno precedente.
- ⭐ **L'idempotenza la impone il database**: `unique (tenant_id, sorgente, esterno_id)`. Rileggere lo stesso evento non lo duplica. Su `timbrature` un vincolo così **non esiste** (l'unica difesa è applicativa, `eventoRecenteUguale`, 25 secondi).
- ⭐ **I badge non ancora assegnati** restano qui con `dipendente_id` nullo e si riattaccano quando l'assegnazione arriva (indice parziale su `badge`).
- ⭐ **I timbri senza orario** restano qui in sospeso e non entrano in nessun calcolo.
- ⭐ Risponde a **«cosa è arrivato ieri»**, che per il super admin è metà dell'osservabilità.

⚠️ La colonna `sorgente` ammette `timbro | app | qr` **dal primo giorno**, perché un domani anche le bocche esistenti passeranno da qui e lo schema non dovrà cambiare. Oggi scrive solo l'import: **le cinque bocche esistenti si spostano in un giro autorizzato a parte, non mentre trentacinque persone timbrano.**

Presidi, provati e non dedotti: RLS accesa, **nessuna policy di scrittura** (scrive solo la service role), un utente autenticato legge solo i propri, `anon` non ha nemmeno il privilegio di lettura, e l'idempotenza verificata con due inserimenti dello stesso evento → una riga.

---

## 4. Quando un timbro grezzo diventa una timbratura — **il contenitore virtuale**

Tre strade sono state considerate. La terza è quella scelta, e la ragione è un fatto misurato.

| | |
|---|---|
| **(A)** `timbrature` nasce solo all'attribuzione | pulito, ma «le ore non esistono finché non compili» sembrava far sparire il lavoro di una persona |
| **(B)** `timbrature` nasce subito sulla **sede**, lo split la sposta | le ore ci sono sempre. ⚠️ **Scartata**, vedi sotto |
| **(C) ← scelta** | il **contenitore è il registro**: `timbri_grezzi` tiene la giornata, e `timbrature` nasce **solo** quando la scatola è piena, già attribuita ai cantieri veri |

> ⚠️⚠️ **Perché (B) è stata scartata, ed è il punto più importante di questo documento.**
>
> Se i timbri diventano subito `timbrature` sulla sede, la catena non si ferma da noi: timbro → rapportino → auto-approvato se sta sotto soglia → **l'agente ERGO legge `/api/v1/ore` e scrive su ERGO le ore attribuite alla sede**, prima che il tecnico abbia ripartito niente. ERGO per FPM è in scrittura vera dal 19/09 ed è **append-only**: quello che esce non torna indietro.
>
> E non basta lasciare la giornata in `bozza`: **`/api/v1/ore` NON filtra per stato.** Restituisce anche le giornate non approvate, con lo stato in chiaro, e il commento nel codice è esplicito — decidere se portare fuori una giornata non approvata **è dell'agente**. Cioè quella decisione vive dentro ERGO, fuori dal nostro controllo. `inviabile()` guarda la modalità e il collegamento del cantiere, non lo stato del rapportino.
>
> ⭐ **Quindi nessuno stato nostro può fermare l'export: l'unico presidio sicuro è che le ore non esistano ancora.** Un'impossibilità strutturale batte una regola — con (B) più una regola di auto-approvazione, basterebbe che un domani qualcuno cambiasse quella regola e la fuga si riaprirebbe **in silenzio**.

Cosa risolve (C), punto per punto:

- **Le ore non sono invisibili**: si leggono dal registro, nell'app del tecnico («la tua giornata: 8:27 → 18:00, 8h30 da ripartire») e nella vista nuova dell'ufficio. Quello che **non** sono è *esportabili*, finché nessuno ha detto dove.
- **Nulla può uscire per sbaglio**: non ci sono ore da esportare, quindi non c'è niente da filtrare.
- **`timbrature` contiene solo lavoro attribuito**, che è ciò che quella tabella ha sempre significato.
- **Il tecnico smemorato ha una via d'uscita, e umana**: l'ufficio può compilargli la giornata con `registraOrePerDipendente`, che esiste già. È giusto che sia una persona: **solo una persona sa su quale casa si è lavorato.**

⚠️ Il prezzo, dichiarato: finché la scatola non è piena la giornata **non esiste** in `rapportini`, quindi la pagina «Presenze e ore» dell'ufficio non la mostra. Serve la vista nuova (§7), che è comunque in elenco.

## 5. La regola della sequenza (`@kommessa/api/timbri-sequenza`)

Tre regole, tutte con un test che le difende e una mutazione vista fallire.

⭐ **Si ricalcola la giornata, non si appende.** La funzione prende **tutti** gli eventi del giorno e li risolve da zero. È l'unico modo che regge quando un evento arriva fuori ordine — e capita: un giro di riconciliazione porta roba di mezz'ora prima, una correzione porta roba di ieri. ⚠️ **Un evento che arriva in ritardo *in mezzo* ribalta la direzione di tutto quello che viene dopo**: appendere vorrebbe dire che l'ordine di arrivo decide la direzione. È anche l'atteggiamento di `ricomputaRapportinoAuto`, che le ore le **ri-deriva sempre**.

⭐ **Fra due tocchi ravvicinati vince l'orologio fisso, non il telefono.** Finestra di **1 minuto** (`FINESTRA_DOPPIONE_MIN`; era 2, stretta il 22/10 perché un'uscita e un rientro a 91 secondi di distanza sono due fatti). ⚠️ Il dedupe che Kommessa ha oggi copre **25 secondi**, pensato per il doppio tocco su un bottone: non basta a coprire il ritardo con cui un evento esterno arriva. Traduzione da `time_source`: `ntp`/`server` → `fisso`; l'app → `telefono`.

⚠️ **Due direzioni dichiarate e opposte non si fondono mai**, nemmeno a un secondo di distanza: sono due fatti, e fonderli ne cancellerebbe uno.

⚠️ **Una dichiarazione che contraddice la sequenza non si sovrascrive, si segnala** (`incoerente: true`). Una direzione dichiarata è un fatto misurato, non un'opinione; ma la giornata non torna e chi legge deve dirlo invece di far finta. Lo stesso vale per il numero dispari di timbri: `aperta: true`, e la giornata va in «da verificare» **invece di indovinare un orario**.

---

## 6. I vincoli del nostro lato, verificati sul codice

| cosa | valore | conseguenza |
|---|---|---|
| `timbrature.tipo` | CHECK `ingresso|uscita`, **NOT NULL** | la direzione si decide **alla scrittura**: non esiste una timbratura senza direzione |
| `timbrature.origine` | CHECK `qr|cronometro|manuale|capo` | ⚠️ **nessun valore per un terminale esterno**: serve una migration che allarghi il CHECK |
| `timbrature.modalita` | CHECK su 8 valori, oppure NULL | ⚠️ idem. E **ogni insert di timbratura DEVE scrivere `modalita`** |
| `timbrature_target_chk` | `num_nonnulls(commessa_id, cantiere_id) = 1` | il motivo per cui esiste `timbri_grezzi` |
| identificativo esterno su `timbrature` | **non esiste**, nessun vincolo unico | l'idempotenza vive su `timbri_grezzi` |
| stato «annullata» su `timbrature` | **non esiste** | un annullamento si riflette sul registro, non cancellando |
| correzioni d'ufficio | **additive**: si scrivono altre timbrature. L'unico DELETE fisico è la sostituzione della coppia pausa | |
| `giornataPulita` (split offerto) | esattamente **1** timbro nel giorno | ⚠️ con un terminale di mezzo non si è mai in questo caso |
| `registraGiornataDaZero` | esattamente **0** timbri nel giorno | ⚠️ idem, dall'altro verso |
| congelamento | `bozza` → ricalcolata · `approvato` con `approvato_da` **nullo** → ricalcolata · tutto il resto → **congelata** | un timbro tardivo su una giornata chiusa a mano non entra |
| «giornata con timbri ma senza ripartizione» | **nessun indicatore esistente** | va scritta una query nuova |

> ⚠️⚠️ **Le due porte per riempire la scatola sono entrambe chiuse dalle loro guardie.** Lo split vuole un solo timbro, «Registra giornata» ne vuole zero. Con il terminale di mezzo non si è né nell'uno né nell'altro caso: **il terzo momento va costruito**, non riciclato.

---

## 7. Com'è fatto (22/10/2026)

### 7.1 Il collegamento: `integrazione_timbro`

Una riga per cliente, **solo service role** (RLS accesa, nessuna policy, `revoke all` da `anon` e `authenticated`): `stato` (`spento` · `osservazione` · `attivo`), `token`, `url_base`, `dal` (data di partenza, sull'ora del passaggio), `webhook_id`/`webhook_secret`, `cursore_updated_at`, l'ultimo giro e l'ultimo timbro. Si governa dal tab **Timbro** di `/admin/tenants/[id]`. Il token si **prova prima di salvarlo** e non si rilegge mai: il tab dice solo «salvato».

### 7.2 L'import

`importaTimbri(cfg, avvio)`: `GET /punches?updated_since=<cursore − 60 s>&from=<dal>`, pagine da 500, upsert su `(tenant, sorgente, esterno_id)`. Traduzioni: `badge_tap` → `tipo NULL` (da dedurre), `entry` → direzione dichiarata; `ntp`/`server` → orologio `fisso`; `voided` → `stato annullato`; `employee_external_id` deve essere l'`id` di un **nostro** dipendente, altrimenti la riga resta orfana con il badge. Il cursore avanza **solo** se il giro è andato a buon fine. Diario in `integrazione_esecuzioni` con `sistema = 'timbro'` (⚠️ le query di salute di ERGO ora filtrano `sistema <> 'timbro'`). Un giro a vuoto ogni due minuti non si scrive nel diario; un errore sì, sempre.

Il **webhook** (`POST /api/webhooks/timbro?t=<tenantId>`, firma `X-Timbro-Signature` HMAC-SHA256 a tempo costante, 5 minuti di finestra) **non scrive niente da solo**: fa partire la stessa riconciliazione. Un solo percorso di scrittura.

### 7.3 Lo stato della giornata (`statoGiornataTimbro`)

| stato | quando | chi lo vede |
|---|---|---|
| `nessun_timbro` | nessun passaggio al terminale | — |
| `presenza_aperta` | ingresso senza uscita | tecnico («sei dentro»), ufficio se è un giorno passato |
| `da_ripartire` | timbri chiusi e niente di attribuito | tecnico (card), ufficio (pannello), promemoria |
| `da_chiudere` | turno aperto dall'app e un timbro dopo: **il timbro lo chiude**, il primo cantiere è obbligato | idem |
| `coperta` | presenza ≤ ore attribuite + viaggio + 15 min | nessuno: niente da fare |
| `da_verificare` | direzione dichiarata incoerente, uscita mancante con l'app chiusa, minuti di presenza non attribuiti | ufficio |

⭐ **«Si apre dall'app e si chiude al terminale»** funziona innestando l'avvio del turno nella sequenza dei timbri come direzione dichiarata, **solo se** a quell'ora i timbri dicono «fuori». Se un badge aveva già aperto la presenza (badge in sede, poi avvio turno in cantiere), l'avvio è un'attribuzione, non una contraddizione.

⭐ **Ore attribuite oltre la presenza non sono una scatola vuota**: una stima di strada più lunga del buco vero non va al tecnico, la giudica la soglia di verifica delle giornate.

### 7.4 Riempire la scatola (`riempiScatola`)

Il contenitore è una **lista di intervalli** (i timbri), non un solo `[ingresso, uscita]`: la pausa timbrata alle 12:31 resta alle 12:31. Il lavoro si versa negli intervalli in ordine; un cambio di cantiere è un'uscita e un ingresso sull'orologio vero; la strada fra cantieri è un buco; **andata e ritorno dalla sede stanno DENTRO il contenitore** quando l'estremo è un passaggio fisico (si era in sede). Una pausa non timbrata, dichiarata, si scava al centro dell'intervallo più lungo. L'ultimo cantiere assorbe il resto, come nello split di fine turno.

Le righe scritte in `timbrature` hanno `origine = 'timbro'`, `modalita = 'timbratrice'` (CHECK allargati dalla migration `20261022090000`); la cronologia le chiama «Dai timbri del terminale», l'ufficio legge «Timbrata · terminale».

**Collaudato sul tenant demo** (`scripts/banco-ui/timbro.mjs`, `timbro-chiudere.mjs`): quattro timbri 08:27 · 12:30 · 13:30 · 18:00 → quattro timbrature con quegli orari esatti, pausa dove timbrata, giornata auto-approvata a 8:33; turno dall'app alle 09:00 + stessi timbri → l'ingresso dell'app resta, uscita finale alle 17:25 (18:00 meno 35 minuti di rientro), tratta di ritorno legata, 445 + 35 = 480 minuti.

### 7.5 Il default «in sede»

Con l'ingresso fisico il flag di ogni cantiere gira come per chi lavora in ufficio: il lavoro nasce **dalla sede** e la spunta dice «uscito in cantiere». Spuntandola il sistema calcola strada e tempo dalla sede predefinita (dove sta il terminale) e li mette dentro la presenza. Dall'ufficio lo stesso, senza «chi guidava» (passeggero).

### 7.6 bis La presenza in sede senza cantiere, e la scrivania (22/10, pomeriggio)

Il registro non è solo del terminale. Chi inizia la giornata **«in sede» senza un progetto** — da PC con «Inizia giornata» — non sceglie un cantiere: la presenza si segna in `timbri_grezzi` con `sorgente='app'` e `dispositivo='pc'`, come un badge, e la giornata diventa una scatola da riempire alla fine. Niente entra in `timbrature` finché non si attribuisce: il gestionale vuole le ore per commessa, e così non può uscire niente di non attribuito. ⚠️ Un'impostazione «cantiere di sede scelto al posto tuo» è stata costruita e **tolta lo stesso giorno** (revert): la scelta è stata non rispondere al posto della persona, ma rimandare la domanda a fine giornata.

Da qui tre regole: il registro **si legge sempre**, con o senza Timbro (il collegamento decide cosa entra, non chi legge); le righe scritte dalla ripartizione dicono da dove vengono (`timbro/timbratrice` se c'è almeno un badge, altrimenti `cronometro/app`); dopo un'uscita il registro non sa se è pausa o fine, quindi la giornata è «da ripartire» e si offre «Riprendi».

**La scrivania**: nell'header dell'ufficio la pillola «La mia giornata» (stato del turno e da dove è partito, pausa, ripresa, chiusura, avvio, registrazione, scatola) e il dialog **«Compila giornata»** (2/3 si compila, 1/3 «come verrà scritta», con gli stessi motori puri del server), in quattro modi: la mia giornata, quella di un altro (`registraGiornataPerDipendente`, `modalita='ufficio'`), la scatola, la chiusura. Banchi: `giornata-scrivania.mjs`, `presenza-sede.mjs`.

**Il telefono** fa lo stesso: i due fogli di avvio («Inizia giornata» di chi lavora in sede, «Inizia turno» di chi sta in cantiere) hanno in fondo **«Inizia senza cantiere»** (`dispositivo='telefono'`), e la card della presenza nella home offre pausa, ripresa, fine e «Inserisci le commesse». ⚠️ La card agisce solo su una presenza segnata dall'app o dal PC: una presenza aperta con il **badge** si chiude al terminale, altrimenti al passaggio successivo il registro troverebbe un'uscita in più e la sequenza riaprirebbe la presenza. Banco: `presenza-sede-mobile.mjs`.

### 7.6 ter Tre bocche che si mischiano, e uno scrittore solo (22/10, pomeriggio)

Chiunque apre la giornata con un metodo e la chiude con un altro: badge la mattina e «Fine giornata» dall'app la sera; badge in sede, QR in cantiere, chiusura dall'app; turno dall'app e badge in uscita. Le regole che lo rendono vero:

1. **`timbrature` ha uno scrittore solo** (`scriviTimbrature`). Quando scrive una fine turno e nel registro la presenza della persona è aperta, scrive l'uscita anche nel registro, alla stessa ora, con scritto da dove viene (`dispositivo`, `origine`). Lo specchio vale per ogni bocca che chiude un turno: app, QR, capo squadra, ufficio, scrivania. Non per le pause, non per gli ingressi.
2. **La lettura innesta l'avvio dall'app** nella sequenza del registro quando il turno è aperto, oppure quando dopo c'è un badge da leggere (anche a turno già ripartito: il badge delle 18 resta un'uscita). Non innesta un turno chiuso dall'app seguito da una presenza dichiarata: sarebbero due ingressi di fila.
3. **Ciò che resta fuori dall'arco del turno è una scatola.** Badge alle 8, in cantiere 10→17 col pranzo dentro, chiusura dall'app alle 18: da ripartire restano 8→10 e 17→18. Pause e strade fra i cantieri stanno dentro l'arco e non si chiedono; la strada agli estremi è già viaggio.
4. **Una presenza aperta dopo l'ultima uscita è una presenza nuova**, non un badge mancante.
5. **Le bocche si vedono**: impronta per il badge, telefono per l'app, monitor per il PC, matita per le righe messe a mano su Timbro; il titolo del blocco dice la bocca; le timbrature sui cantieri dicono QR, app, badge, capo squadra o a mano.

⚠️ Chi passa il badge in uscita **dopo** aver chiuso dall'app fa un secondo gesto: il registro lo mostra all'ufficio come presenza riaperta. Non si deduplica oltre il minuto: sarebbe indovinare.

### 7.6 Il promemoria

`/api/cron/promemoria-ore` ogni quarto d'ora: per i clienti con Timbro **attivo** e il modulo Kantiere, nella finestra della **sera** (giornata di oggi) o della **mattina** (ieri e prima, fino a 7 giorni), avvisa chi è `da_ripartire`/`da_chiudere`. Orari in `tenant_modules.config.promemoria_ore` (Impostazioni Kantiere → Approvazione giornate; predefiniti 18:00 e 08:00). Mittente unico `avvisa()`, avviso `ore_da_inserire`; un avviso per giornata per finestra.

⚠️ **Le push arrivano solo a chi ha attivato le notifiche su quel telefono.** Al 21/10 c'era **una** sottoscrizione su quattro clienti. Per questo nella PWA c'è ora il foglio «Attiva le notifiche su questo telefono» (`mobile/_components/attiva-notifiche-sheet.tsx`, che dal 22/10 sera ha sostituito la riga sottile `attiva-notifiche-banner.tsx`). Su iPhone serve l'app **aggiunta alla schermata Home** (iOS ≥ 16.4); su Samsung le notifiche dei siti possono essere spente dalle impostazioni di sistema dell'app browser.

---

## 7.9 Matrice delle bocche (24/10/2026)

Ogni riga è una combinazione «come si apre · come si fa pausa · come si chiude»,
con lo stato che `statoGiornataTimbro` deve dare, cosa nasce in `timbrature`,
cosa resta nel registro (`timbri_grezzi`) e cosa vedono tecnico e ufficio.
Tutte le righe sono provate dai test puri `packages/api/src/bocche.test.ts`
(numerazione uguale) e dai banchi `timbro`, `timbro-chiudere`,
`bocche-incrociate`, `presenza-sede-mobile`, `cruscotto-registro`.

Vocabolario: **badge** = tocco al terminale senza direzione; **app in sede** =
presenza dichiarata dall'app o dal PC senza cantiere (nel registro); **QR /
app / PC** = timbratura attribuita a un cantiere (in `timbrature`);
**specchio** = l'uscita che lo scrittore unico scrive nel registro quando una
fine turno chiude una presenza aperta.

| # | Apertura | Pausa | Chiusura | Stato | Ore (`timbrature`) | Registro | Tecnico vede | Ufficio vede |
|---|---|---|---|---|---|---|---|---|
| 1 | badge | — | badge | `da_ripartire`, scatola = un intervallo | nascono alla ripartizione (`origine timbro`) | 2 tocchi | «Inserisci le commesse» in tab Ore | pannello «giornate timbrate da sistemare» |
| 2 | badge | badge out/in | badge | `da_ripartire`, due intervalli, pausa dov'è stata timbrata | idem, la pausa resta alle ore dei tocchi | 4 tocchi | idem | idem |
| 3 | QR / app Inizia turno | QR / app | QR / app / PC | `nessun_timbro`: il registro non c'entra | ingresso/uscita (e pausa) attribuiti | niente | card del turno, ore in tab Ore | Presenze e ore, timeline |
| 4 | app o PC «presenza in sede» | — | app / PC | `da_ripartire` (come il badge) | alla ripartizione (`origine cronometro`, modalità app/pc) | 2 righe `sorgente app` | card presenza in sede → «Inserisci le commesse» | pannello da sistemare, bocca «app»/«PC» |
| 5 | badge | — | (manca) | `presenza_aperta` | — | 1 tocco | «Presenza · dalle 8:00» | «in corso» |
| 6 | app Inizia turno | — | **badge** | `da_chiudere`: il badge chiude il turno, primo cantiere obbligato | ingresso dell'app + ripartizione | 1 tocco (il turno si innesta come ingresso dichiarato) | «Inserisci le commesse», primo cantiere fisso | pannello da sistemare |
| 7 | badge in sede | — | turno dall'app in cantiere chiuso dall'app | `da_ripartire` solo per la parte in sede PRIMA del turno | turno attribuito; specchio dell'uscita nel registro | tocco + specchio | «Inserisci le commesse» per l'ora in sede | riga del turno + scatola residua |
| 8 | badge in sede, poi QR in cantiere | — | QR fuori, poi badge | `da_ripartire`: le due code (prima e dopo il turno) | turno dal QR | 2 tocchi | idem | idem |
| 9 | badge con pausa a badge, turno app nel pomeriggio | badge | app (specchio) | `da_ripartire`: la mattina è la scatola | turno attribuito | 3 tocchi + specchio | idem | idem |
| 10 | turno app chiuso la mattina, poi badge in sede | — | badge | `da_ripartire`: il pomeriggio in sede è una scatola | turno + ripartizione | 2 tocchi dopo il turno | idem | idem |
| 11 | app, poi badge della sera, giornata già ripartita | — | badge | `coperta`: il badge resta un'uscita | turno ripartito | 1 tocco | niente da fare | regolare |
| 12 | badge, turno app, cambio cantiere dal vivo | — | badge | `coperta` | uscita A + ingresso B nello stesso minuto, strada A→B registrata | 2 tocchi | niente da fare | due righe |
| 13 | badge, turno app | **dichiarata a fine turno** (30/45/60) o aggiunta dall'ufficio | badge | `coperta`: la coppia pausa non è un innesto | coppia pausa `origine manuale`, allineata al passo | 2 tocchi | niente da fare | pausa in timeline, cronologia |
| 14 | badge | — | app (turno chiuso) **senza** badge serale e senza specchio possibile | `da_verificare` «manca il timbro di uscita» | turno attribuito | 1 tocco | — | anomalia da verificare |
| 15 | turno app chiuso, poi presenza nuova aperta dall'app in sede | — | (aperta) | `presenza_aperta` | turno attribuito | 1 riga app | card presenza in sede | in corso |
| 16 | QR / app con **fase** | QR / app | QR / app / PC | — | ingresso con `sottocantiere_id`; pausa, ripresa e fine **ereditano** la fase nello scrittore unico | — | «Cantiere › Fase» | «Cantiere › Fase» |

### Sorprese trovate e cosa si è fatto

- ⚠️ **Riga 10 non tornava**: un turno chiuso dall'app seguito da due badge in
  sede leggeva il primo badge come un'uscita e il secondo come un ingresso, e
  la giornata restava «presenza aperta». Ora un turno chiuso che si innesta
  porta con sé anche la sua fine (direzione dichiarata), **ma solo se dopo di
  lui ci sono almeno due tocchi**: con un tocco solo la lettura resta quella
  della riga 11 (il badge è l'uscita della stessa giornata, strada compresa).
  È un'ambiguità vera: un solo badge dopo un turno chiuso può essere un rientro
  in sede; il badge della sera la scioglie da solo al ricalcolo.
- ⚠️ **Il QR e il wizard del capo non proponevano la fase**: su FPM (fase
  obbligatoria) un ingresso da QR nasceva sul cantiere intero. Ora il foglio
  del QR (`t/[token]`) e «Gestione squadra» chiedono la fase all'ingresso
  (`SceltaFase`), l'azione `timbra` e `timbraMembro` accettano
  `sottocantiereId` con le guardie `sottocantieriScrivibili` e
  `faseRichiesta`; pausa, ripresa e fine la ereditano.
- Riga 17 dei test: se un'uscita NON eredita la fase dell'ingresso, le chiavi
  divergono e il segmento sparisce dal conto. È il motivo per cui l'eredità
  sta nello scrittore unico e non nei quattordici chiamanti.
- ⚠️ **Chiusura automatica notturna**: non esiste una chiusura notturna dei
  turni; esiste solo l'auto-spegnimento della pausa dimenticata
  (`auto_chiusa=true`, ripresa a `inizioPausa + soglia`). Un turno lasciato
  aperto resta aperto (riga 5/14) e lo vede l'ufficio.

## 8. Rischi e presidi

⚠️⚠️ **Una data di partenza è obbligatoria.** Su Timbro c'erano 15 timbrature di collaudo (installazione del 1, 2, 5 ottobre e prove dei badge il 21). Erano orfane: appena i badge vengono assegnati **si attaccano a delle persone**. Catena completa del danno: timbro di collaudo → timbratura → rapportino → auto-approvato → l'agente ERGO legge le nostre ore e **le scrive su ERGO**, che è append-only. ⭐ Luca ha fatto annullare quelle 15 da Timbro — **un presidio nei dati batte un presidio nel codice** — ma la data di partenza resta come seconda rete.

⚠️⚠️ **Il token di Timbro NON va in `tenant_modules.config`** — verificato il 21/10, non dedotto. Su quella tabella la policy è `tenant_id = current_tenant_id()` e `authenticated` ha il privilegio di `SELECT`: **ogni utente del cliente** — a FPM sono trenta persone — potrebbe leggersi quel campo con una chiamata diretta dal browser. Metterci un token di un'API esterna vuol dire regalarlo all'azienda intera.

⭐ Il posto giusto è quello già usato per le credenziali di Nextcloud e R2: una colonna su `tenants` **non concessa** in lettura ad `anon`/`authenticated` (privilegi **per colonna**, migration `20260627010000`) e raggiungibile solo dal service role. ⚠️ E lì vale la nota di manutenzione di quella migration: una colonna nuova non segreta va concessa a mano, una segreta **non si concede e basta**.

⚠️ **Un solo `sistema` per tenant.** `tenant_modules.config.sistema` è un valore solo e FPM ha già `ergo`: le mappature di Timbro finirebbero archiviate sotto quel nome, e le query di salute (`admin/_lib/integrazione/foto.ts`) filtrano **solo per `tenant_id`, non per `sistema`** — con due integrazioni i contatori si sommerebbero. ⭐ Il posto giusto per `sistema` è **il token**, che è emesso per integratore e quindi sa già chi chiama.

⚠️ **Timbro ≠ ore per commessa.** Un badge dice *quando* e *dove c'è il lettore*: risponde a «quante ore ha lavorato Mario», non a «quante ore su quella casa». L'attribuzione la mette una persona, ed è tutto il senso della scatola da riempire.

## 10. Le fasi del turno (26/10/2026)

Timbro dichiara in che punto del turno si trova una persona. Contratto
**additivo**: autenticazione, cursore, HMAC e `external_id` invariati. Finché
FPM resta in «Solo evento» i campi arrivano `null` e non cambia niente.
Fonte: `03_NOTE/14_per-kommessa-fasi-del-turno.md` nel repo di Timbro (casi
limite nel 13).

### 10.1 Cosa arriva

Su ogni passaggio: `step` (`start` · `pause_start` · `pause_end` · `end` ·
`null`), `step_source` (`person` · `inferred` · `api` · `office` · `null`),
`shift_was_open`, `previous_punch_id`, `previous_occurred_at`. Si salvano in
`timbri_grezzi` come `passo`, `passo_origine`, `turno_era_aperto`,
`precedente_esterno_id`, `precedente_at` (migration `20261026090000`).

⚠️ **Nessun vincolo sui valori**: l'elenco delle fasi è di Timbro, non nostro.
Un valore nuovo deve poter entrare e farsi leggere come «non la riconosco»
(`@kommessa/api/timbro-passo`), non far fallire l'import di tutta la giornata.

### 10.2 Come si legge

⚠️ **`direction` non si guarda mai.** Con una fase è determinata dalla fase;
senza, è una deduzione del terminale. Lo dice Timbro stesso.

⚠️ **`inferred` è un'ipotesi, non un fatto.** Il terminale la ricava
dall'ultimo stato che *lui* conosce: se la persona ha aperto il turno dalla
nostra app e non gliel'abbiamo ancora detto, è sbagliata. `leggiPasso`
confronta con la nostra sequenza e, quando si contraddicono, **lo dichiara**
(`contraddice: true`) invece di scegliere. Si segue la fase solo se
`dichiarata` (person/office) o `nostra` (api).

⚠️ Un `step_source` sconosciuto **non** si promuove a «dichiarata».

A schermo (`TimbriTerminale`) si scrive solo ciò che è dichiarato: un'ipotesi
scritta come un fatto farebbe credere a una pausa che nessuno ha indicato.

### 10.3 Come si scrive (`_lib/timbro/invia.ts`)

⚠️⚠️ **Non tutte le righe.** Lo scrittore unico produce anche righe
*derivate*: divisione di fine turno, «Registra giornata», scatola, cambio
cantiere scrivono più righe in un colpo. Mandarle direbbe al terminale che il
turno si è aperto e chiuso cinque volte, e il suo `inferred` peggiorerebbe
**per colpa nostra**. Si manda il **lotto da una riga sola** (un gesto vero) e
la **fine turno** di un lotto qualsiasi. Regola in `daSpecchiare`, pura.

⚠️⚠️ **Il cambio cantiere non manda NIENTE** (deciso con Timbro il 26/10). Un
gesto vero, ma la persona sta ancora lavorando: mandare la sola uscita sarebbe
**peggio** del silenzio, perché per Timbro il turno risulterebbe chiuso e il
badge di fine giornata diventerebbe uno `start` dedotto — sbagliato, e con una
fiducia apparente. Scartate anche le alternative: una pausa finta sarebbe una
bugia salvata come dichiarata, e un valore nuovo tipo `move` costerebbe schema,
vincolo, firmware e documentazione.
⭐ Il riconoscimento guarda **la sequenza, non gli orari** («c'è un ingresso
dopo?»): regge anche se i due istanti non coincidono, mentre «stesso istante»
dipenderebbe da come il chiamante arrotonda.

⚠️ Non blocca mai: `waitUntil` dentro l'helper, nessuna sollevazione.
⚠️ Idempotente sull'id della nostra riga. Un 401/403 (scope `punches:write`
mancante) si dice una volta e si smette.
⚠️ Mai le righe con `origine: 'timbro'`: si rimanderebbe ciò che si è letto.

### 10.4 Il rischio chiuso per primo

Le timbrature che scriviamo tornano in `GET /punches` con `source: "api"`, e
`genereDa()` le avrebbe importate come passaggi veri: **la giornata di chi
timbra dall'app sarebbe raddoppiata**. Ora si saltano (contate in
`esito.nostri`). ⚠️ Il salto sta **dopo** l'avanzamento di `maxUpdated`: se il
cursore non le superasse, ogni giro ripartirebbe da prima.

⚠️ Si salta per `source`, non confrontando gli id: oggi su FPM nessun'altra
integrazione scrive. Se un domani ne arriva una, qui va un confronto con i
nostri id.

### 10.5 Il promemoria che parte dal gesto

⭐ **Una fine giornata dichiarata è l'unico momento in cui la persona ha appena
detto di aver finito**, e quindi il momento giusto per chiederle su quali
commesse ha lavorato. Prima del 26/10/2026 il promemoria `ore_da_inserire`
arrivava solo **la sera alle 18:00** (cron) o a mano dall'ufficio: ore dopo, a
casa, quando la giornata non si ricorda più bene.

Ora `importaTimbri` raccoglie i passaggi con una fine giornata **dichiarata** e
`_lib/timbro/avvisa-fine.ts` manda il promemoria. Latenza: **due minuti** dal
cron dell'import, **qualche secondo** col webhook.

| Regola | Perché |
|---|---|
| Solo `end` con fiducia **`dichiarata`** (`person`/`office`) | ⚠️ Un `end` dedotto può essere il cambio cantiere di chi sta ancora lavorando: gli si chiederebbe di chiudere una giornata che non è finita. Un promemoria **sbagliato** è peggio di uno in ritardo — quello della sera arriva comunque. Predicato puro `dichiaraFineGiornata`, 6 asserzioni, **3 viste fallire** togliendo il controllo sulla fiducia |
| Niente per `api` | Sono le nostre: chi chiude dall'app è già nell'app, e l'import le salta a monte (§10.4) |
| Solo la giornata di **oggi** | ⚠️ Un terminale rimasto senza rete riversa i passaggi giorni dopo: avvisare alle 23 di una fine giornata di mercoledì è una notifica che non si può più capire. Ai giorni passati pensa la finestra della mattina |
| Solo se lo stato è `da_ripartire` o `da_chiudere` | Lo **stesso predicato** dei tre consumatori di `leggiGiornateTimbro`, così «da fare» vuol dire la stessa cosa in tutti i posti. Chi ha già ripartito le ore non viene disturbato |
| Finestra **`fine_turno`** | Il dedupe è `utente\|giorno\|finestra` su 20 ore: con lo stesso nome della sera, questo avrebbe **spento** il promemoria serale, o sarebbe stato ingoiato da uno mandato poco prima. Stesso motivo per cui il sollecito dell'ufficio usa `ufficio` |
| La **sera salta** chi ha già ricevuto `fine_turno` quel giorno | La stessa frase due volte in mezz'ora insegna a non leggere l'avviso. ⚠️ La **mattina no**: il giorno dopo è la seconda occasione vera, per chi non ha fatto quello che il primo promemoria chiedeva |
| Non è un avviso nuovo | Riusa `ore_da_inserire`, cioè **un interruttore solo** nel profilo. La domanda («vuoi che ti ricordi le ore?») è una: tre mittenti, un consenso |
| Non può far cadere l'import | ⚠️ `try/catch` attorno alla chiamata, **dopo** la scrittura (lo stato della giornata si legge dai timbri appena scritti). Un promemoria perso costa un'ora; un cursore non avanzato costa la riconciliazione |

Misurato sui dati veri il 26/10/2026: **35 dipendenti FPM su 37 hanno un
accesso** all'app (gli altri due non possono ricevere niente, ed è giusto che
non si finga il contrario) e **5 tecnici hanno il telefono registrato** su 8
dispositivi — gli altri lo leggono nella campanella, perché la riga in app si
scrive sempre e la preferenza governa solo ciò che interrompe.

### 10.5bis Una giornata «Regolare» che si leggeva «Da verificare» (27/10/2026)

Segnalato guardando la pagina: la card in cima a «Presenze e ore» diceva **Da
verificare** su una giornata che, due righe sotto, la tabella dava **Regolare**.
Due verdetti sulla stessa giornata — e quello sbagliato era il primo.

**La giornata vera**: badge al terminale la mattina (07:51:41), due passaggi
**dall'app** a mezzogiorno (12:22 uscita, 12:25 ingresso), pausa e fine a badge,
e le ore già tutte attribuite. Esito: `da_verificare`, motivo «Una direzione
dichiarata contraddice la sequenza dei timbri».

⭐ **La causa è l'arrotondamento che incontra un confronto stretto.**
`statoGiornataTimbro` innesta nella presenza l'ingresso di un turno aperto
altrove, ma **solo se la presenza non è già aperta**; il controllo guardava gli
eventi `< t.ms`, cioè **prima** dell'istante. Dal 23/10 le timbrature si
arrotondano al passo del cliente: il badge delle 07:51:41 e l'ingresso
attribuito delle 07:50 cadono **sullo stesso slot**, quindi il badge non
rientrava in «prima» e l'innesto avveniva lo stesso. Due ingressi di fila, e la
prima direzione **dichiarata** che arrivava dopo — l'uscita dell'app a
mezzogiorno — contraddiceva la sequenza.

⚠️ **Il ripescaggio dei doppioni non poteva salvarlo, ed è giusto così**: misura
la distanza sull'istante **esatto** (101 secondi, oltre la finestra di un
minuto) proprio per non fondere gesti diversi caduti nello stesso slot. Il
punto è che l'innesto non doveva avvenire.

**La correzione**: `<=` invece di `<` — la domanda è «la presenza è già aperta
**in questo momento**?», e un passaggio nello stesso istante la apre. Più
l'istante esatto che viaggia con l'evento innestato, così il confronto dei
doppioni non misuri distanze finte.

⚠️ **Il ramo simmetrico — la FINE del turno — è rimasto `<`, deliberatamente.**
Lì includere l'istante stesso cambia la risposta in tutti e due i versi (un
badge di uscita chiude, uno di ingresso riapre), e il caso non è ancora stato
osservato su una giornata vera. Quando capiterà si guarda quella e si scrive il
test su quella: muovere un ramo che nessuna misura descrive è il modo di
scambiare un difetto con un altro.

Riproduzione e regressione in `timbro-giornata.test.ts` con i **dati veri** di
quella giornata (3 asserzioni, **3 viste fallire** rimettendo `<`). Misurato:
su FPM **3 giornate su 16** hanno passaggi da tutte e due le bocche, tutte fra
il 23 e il 26/10 — cioè da quando l'integrazione è viva.

### 10.6 Dove siamo, e cosa resta (26/10/2026)

✅ **Fatto e misurato sul database di produzione**: la chiave con
`punches:write` c'è, lo stato di FPM è **`attivo`** (quindi lo specchio scrive),
«Evento con fasi del turno» è acceso e i campi arrivano — su 40 passaggi letti
dal 21/10, **15 portano `passo`** e 16 `turno_era_aperto`. I valori veri visti
sono `pause_start` / `pause_end`, con `passo_origine` `person` sul gesto della
persona e `inferred` sulla deduzione del terminale: esattamente i due casi che
`leggiPasso` distingue, e nessuna origine fuori dal contratto.

⚠️ **`tipo` (la direzione) arriva `null` su tutti**, com'era inteso: Timbro
espone eventi (§2) e la direzione la decide la nostra sequenza. Chi un domani
vedesse un `tipo` valorizzato non lo prenda per un miglioramento: resta più
informata la sequenza, che conosce anche le timbrature della nostra app.

Resta da fare:

- **La prima timbratura vera dall'app di FPM**: è il gesto che prova lo
  specchio da capo a fondo (noi scriviamo su Timbro → la riga torna con
  `source: "api"` → l'import la salta e non raddoppia la giornata). Fino a quel
  momento lo specchio è provato solo sul tenant demo.
- **Usare la fase dichiarata dentro `statoGiornataTimbro`**: oggi la sequenza
  decide da sé e `faseDaSeguire` esiste senza chiamanti nel percorso di lettura.
  Con `passo_origine: 'person'` che ora arriva davvero, una pausa **dichiarata
  al terminale** potrebbe smettere di essere dedotta.
- **La prima FINE GIORNATA vera**: fino alle 14:30 del 26/10 il terminale ha
  registrato `pause_start` dichiarate (8), `pause_end` dedotte (8) e due
  `start`, ma **nessun `end`** — la funzione è accesa da mezzogiorno e nessuno
  ha ancora finito il turno. Il promemoria al gesto è quindi provato sul
  predicato, non ancora su una persona vera: la prima uscita di stasera lo dirà.
- ⚠️ **L'ipotesi del terminale può contraddirci e nessuno lo sta ancora
  guardando**: `leggiPasso` lo dichiara (`contraddice`), ma nessuna superficie
  lo mostra all'ufficio. Un `inferred` sbagliato — tipico di chi apre il turno
  dall'app prima che lo specchio arrivi a Timbro — oggi passa muto.
