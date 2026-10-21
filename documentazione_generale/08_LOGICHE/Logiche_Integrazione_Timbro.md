# Logiche — Integrazione con la timbratrice Timbro

**Versione**: 1.0
**Stato**: contratto chiuso · due pezzi costruiti · l'import non è ancora scritto
**Decisione di forma**: contenitore **virtuale** (§4) — `timbrature` nasce solo all'attribuzione
**Data**: 21/10/2026
**Cliente**: FPM Impianti (`FPMIMP`, mondo presenze). Bertaiola non è toccata.

---

## 0. Lo stato, in chiaro

| | |
|---|---|
| ✅ **Contratto con Timbro** | chiuso e in produzione dal loro lato |
| ✅ **`timbri_grezzi`** | tabella creata e applicata (migration `20261021120000`). **Vuota, e nessuno la legge o la scrive** |
| ✅ **`@kommessa/api/timbri-sequenza`** | da eventi a ingressi/uscite. 21 asserzioni, 4 mutazioni viste fallire. **Nessun chiamante** |
| ❌ **L'import** | non scritto |
| ❌ **Il momento in cui si riempie la scatola** | non scritto |
| ❌ **L'avviso al tecnico** | non scritto |

> ⚠️ **Oggi nulla cambia per chi timbra.** I due pezzi fatti sono inerti: una tabella vuota e una funzione pura senza chiamanti. FPM continua a timbrare da QR e app esattamente come prima.

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

⭐ **Fra due tocchi ravvicinati vince l'orologio fisso, non il telefono.** Finestra di 2 minuti (`FINESTRA_DOPPIONE_MIN`). ⚠️ Il dedupe che Kommessa ha oggi copre **25 secondi**, pensato per il doppio tocco su un bottone: non basta a coprire il ritardo con cui un evento esterno arriva. Traduzione da `time_source`: `ntp`/`server` → `fisso`; l'app → `telefono`.

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

## 7. Cosa resta da costruire

1. **L'import**: webhook (`punch.created`, `punch.voided`) per la prontezza, **più** un giro di riconciliazione con `updated_since` per la certezza — ripartendo dal massimo `updated_at` visto **meno 60 secondi**, con upsert sulla chiave unica. ⭐ Il webhook da solo non basta: se tace non sai se non è successo niente o se il tubo è rotto.
2. **La materializzazione all'attribuzione**: dal registro a `timbrature`, **solo** quando il tecnico (o l'ufficio) dice su quali cantieri. Servono i due valori nuovi nei CHECK di `origine` e `modalita`.
3. **Il terzo momento**: la superficie dove il tecnico riempie la scatola, su `calcolaSegmentiSplit`, con il contenitore che arriva dal registro.
4. **L'avviso** «metti i dettagli di oggi». ⚠️ Quattro passi obbligati, e il primo è il mittente: senza la voce in `AVVISI` (`@kommessa/api/avvisi`) l'avviso **non viene nemmeno registrato in app**.
5. **La vista per l'ufficio**: chi non ha riempito la scatola.
6. **L'osservabilità**: riusare `integrazione_esecuzioni` + `valutaCollegamento()` + `/admin/integrazioni`, che danno gratis il diario dei giri, l'allarme sul silenzio e la **modalità simulazione**.

⭐ **La simulazione è il regalo più grosso**: FPM timbra già da QR e app. Si può far girare l'import in simulazione per giorni — leggere, calcolare, **non scrivere** — e confrontare quello che Timbro dice con quello che l'app ha registrato sulle stesse persone negli stessi giorni. È una validazione contro un sistema vivo, prima di toccare niente.

---

## 8. Rischi e presidi

⚠️⚠️ **Una data di partenza è obbligatoria.** Su Timbro c'erano 15 timbrature di collaudo (installazione del 1, 2, 5 ottobre e prove dei badge il 21). Erano orfane: appena i badge vengono assegnati **si attaccano a delle persone**. Catena completa del danno: timbro di collaudo → timbratura → rapportino → auto-approvato → l'agente ERGO legge le nostre ore e **le scrive su ERGO**, che è append-only. ⭐ Luca ha fatto annullare quelle 15 da Timbro — **un presidio nei dati batte un presidio nel codice** — ma la data di partenza resta come seconda rete.

⚠️⚠️ **Il token di Timbro NON va in `tenant_modules.config`** — verificato il 21/10, non dedotto. Su quella tabella la policy è `tenant_id = current_tenant_id()` e `authenticated` ha il privilegio di `SELECT`: **ogni utente del cliente** — a FPM sono trenta persone — potrebbe leggersi quel campo con una chiamata diretta dal browser. Metterci un token di un'API esterna vuol dire regalarlo all'azienda intera.

⭐ Il posto giusto è quello già usato per le credenziali di Nextcloud e R2: una colonna su `tenants` **non concessa** in lettura ad `anon`/`authenticated` (privilegi **per colonna**, migration `20260627010000`) e raggiungibile solo dal service role. ⚠️ E lì vale la nota di manutenzione di quella migration: una colonna nuova non segreta va concessa a mano, una segreta **non si concede e basta**.

⚠️ **Un solo `sistema` per tenant.** `tenant_modules.config.sistema` è un valore solo e FPM ha già `ergo`: le mappature di Timbro finirebbero archiviate sotto quel nome, e le query di salute (`admin/_lib/integrazione/foto.ts`) filtrano **solo per `tenant_id`, non per `sistema`** — con due integrazioni i contatori si sommerebbero. ⭐ Il posto giusto per `sistema` è **il token**, che è emesso per integratore e quindi sa già chi chiama.

⚠️ **Timbro ≠ ore per commessa.** Un badge dice *quando* e *dove c'è il lettore*: risponde a «quante ore ha lavorato Mario», non a «quante ore su quella casa». L'attribuzione la mette una persona, ed è tutto il senso della scatola da riempire.
