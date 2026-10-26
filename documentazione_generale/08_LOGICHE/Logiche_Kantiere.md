# Logiche operative — Kantiere (presenze, viaggi, sedi, ore)

**Versione**: 2.1
**Stato**: Attivo (in produzione)
**Ultimo aggiornamento**: 26/10/2026
**Ambito**: modulo **Kantiere** (tenant con `app_mode=kantiere`, es. FPM Impianti). NON tocca il mondo commesse (Bertaiola).

> **Dal 26/10/2026 questo file è LA fonte per il mondo presenze.** Le 577 righe
> che stavano in `CLAUDE.md` sono state portate qui e fuse con quelle che
> c'erano: CLAUDE.md viene caricato **intero** a ogni conversazione, e una
> sessione sul mondo commesse non ha motivo di portarsi dietro le regole delle
> timbrature. In CLAUDE.md resta un blocco corto con il gating e il rimando a
> questo documento.
>
> **A cosa serve.** Non è un manuale d'uso: è il registro delle **regole e
> delle scelte operative** già implementate (arrotondamenti, soglie, quando si
> caricano i km, come si collegano sedi e cantieri, quali impostazioni gestisce
> l'ufficio, come sono fatte le superfici). Serve come base per una futura
> sezione **Help** nell'office e come contesto per un **agente AI interno**.
>
> **Va mantenuto aggiornato**: ogni volta che cambia una logica importante
> (nuova soglia, nuovo settaggio, nuova regola di calcolo), aggiornare la
> sezione corrispondente e alzare la versione in testa.
>
> **Cosa NON sta qui**: la timbratrice **Timbro** ha
> `Logiche_Integrazione_Timbro.md`; l'**export paghe** ha
> `Logiche_Export_Paghe.md`; la **pianificazione** ha
> `Logiche_Pianificazione.md`.

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
- **Letture**: report, Ore e costi, costo cantiere, Presenze e ore, schede dipendente e cantiere, dashboard, CSV e API leggono le quote con `quoteDaRiga` / `sommaQuote` / `quoteOre`. Il costo applica la tariffa ordinaria a lavoro e viaggio entro l'orario e la maggiorazione del viaggio (`pctViaggio`) **solo** al viaggio eccedente.
- ⚠️ **Chi legge non usa mai `ore_ordinarie` da solo**: è la sola parte *lavoro*. Si passa da `quoteDaRiga` / `quoteOre`, o si conta meno di quello che c'è. Elenco delle colonne in `COLONNE_QUOTE`.
- **API v1 `/ore`**: i campi di sempre restano invariati, e si aggiungono `lavoro`, `viaggioOrdinario`, `viaggioEccedente`.
- Con il passaggio al dato puro sono state **tolte** `salvaMioRapportino`, `inviaMioRapportino`, `registraOreManuali`, `calcolaOreGiornata` e `minutiViaggioPerTarget`: erano le cinque strade che scrivevano le ore ognuna a modo suo.
- Migration `20260914160000` (✅ applicata).

### 1.2 Tre bocche, uno scrittore: badge, QR e app

Richiesta di Luca: chiunque apre la giornata con un metodo (badge al terminale,
QR in cantiere, app) e la chiude con un altro. «Una sola tipologia di scrittura,
triggerata da n metodi».

- ⭐⭐ **`timbrature` ha UNO scrittore**: `_actions/_lib/timbrature-scrivi.ts`
  (`scriviTimbrature`). Prima erano **quattordici `insert`** sparsi (QR, app,
  capo, ufficio, divisione di fine turno, pausa dichiarata, chiusura
  automatica, scatola, cambio cantiere): ogni regola nuova andava ricordata in
  quattordici posti. Lo scrittore inserisce, restituisce gli id, e **se fra le
  righe c'è una fine turno** (uscita non di pausa) chiama
  `specchiaChiusuraNelRegistro` (`_lib/presenza-registro.ts`): se la presenza
  della persona è aperta nel registro (badge o presenza dall'app), scrive
  l'uscita anche lì, alla stessa ora, con `dispositivo` e `origine`.
  ⚠️ Il **ricalcolo** della giornata non sta nello scrittore: chi scrive sa
  quando ricalcolare. ⚠️ **Nuovi punti che scrivono timbrature passano di qui**,
  o l'invariante si perde di nuovo.
- ⭐ **La lettura della giornata (`statoGiornataTimbro`) sa di più**: (1) un
  turno dell'app si **innesta** nella sequenza del registro quando è aperto
  **oppure** quando dopo di lui c'è un tocco senza direzione (il badge) da
  leggere — ma non un turno chiuso dall'app seguito da una presenza dichiarata,
  che farebbe due ingressi di fila; (2) con tutto chiuso, la parte di presenza
  **fuori dall'arco del turno** (prima di partire, dopo il rientro) è una
  **scatola da ripartire**, non «da verificare»: pause e strade fra i cantieri
  stanno dentro l'arco; (3) una presenza ancora aperta dopo l'ultima uscita è
  una presenza **nuova** (in sede), non un badge di uscita mancante. Tutto
  puro, 27 test.
- **Le bocche si vedono, ovunque**: `boccaDelTimbro` / `titoloPassaggi` in
  `timbri-terminale.tsx` (badge → impronta, app → telefono, PC → monitor, a
  mano → matita; pillola «11:49 in · badge», «14:50 out · app»). In «Presenze e
  ore» il blocco si intitola dalla bocca («Badge al terminale», «Presenza
  segnata dall'app») e le timbrature sui cantieri hanno il loro (`OrigineLine`:
  «Timbrata · QR / app / badge / dal capo squadra», «Inserita a mano»). Il
  **cruscotto** sul telefono legge anche il registro: chi ha solo passato il
  badge è una persona del giorno («Presenza · dalle 12:26 · in sede»).
- **Dal telefono si chiude anche una presenza aperta col badge**
  (`PresenzaSedeCard`): «Col badge. Puoi chiudere da qui o al terminale». Chi
  poi passa lo stesso il badge fa un secondo gesto che il registro mostra
  all'ufficio.
- Banchi: `bocche-incrociate.mjs` (badge → app; badge → turno → app, con lo
  specchio e la scatola residua), `avvio.mjs`, `cruscotto-registro.mjs`,
  `palette-tasti.mjs`. `timbro.mjs` e `timbro-chiudere.mjs` **si seminano da
  soli** (Marco Rinaldi, DEMOC) e si ripuliscono.

---

## 2. Fine turno: arrotondamenti e tolleranza

| Regola | Valore default | Impostazione | Comportamento |
|---|---|---|---|
| **Tolleranza chiusura** | **5 min** | `tolleranza_chiusura_min` | Nello split "cosa hai fatto oggi" e nella "registra giornata": se i minuti assegnati ai cantieri si discostano dal totale di **≤ tolleranza**, si salva lo stesso e **l'ultimo cantiere assorbe il piccolo resto**. Così i minuti dispari (turno che finisce alle X:03) non bloccano l'utente. |
| **Arrotondamento viaggio** | **5 min** | `arrotondamento_viaggio_min` | Ogni tragitto **> 0** conta almeno uno step (≥ 5 min); un tragitto **= 0** resta 0. Vale sui turni **futuri**. |
| **Arrotondamento ore lavoro** | **0 = nessuno** | `arrotondamento_ore_min` | Scelta del cliente: si **raccoglie tutto al minuto** e si arrotonda **nel report a fine mese** sul dato aggregato, non sul singolo turno. |
| **Arrotondamento timbrature** (dal 23/10/2026) | **0 = al minuto** (FPM: **5**, dal 23/10/2026) | `arrotondamento_timbri_min` + `arrotondamento_timbri_dal` | Gli **orari** delle timbrature si arrotondano **al più vicino** (08:02 → 08:00, 08:03 → 08:05) in **tutti i calcoli** delle ore, per **tutte le bocche** (badge, QR, app, PC): scatola della giornata, tetto del «+», righe per cantiere, ciò che esce verso il gestionale. Il dato nel database resta **esatto**; a video si legge già arrotondato (`ora-mostrata`). La regola vale **dal giorno in cui l'ufficio cambia il valore** (la data la scrive il salvataggio): le giornate precedenti si calcolano come prima, anche con «Ricalcola». Decisione di Luca con FPM e il consulente del lavoro (nessun vincolo normativo). Logica pura in `@kommessa/api/arrotondamento-timbri`. |

> `arrotondaA(min, step)` è l'helper unico (step < 1 = arrotondamento disattivato).

### 2.1 Le timbrature si arrotondano nei calcoli, non nel database

Decisione di Luca con FPM e il consulente del lavoro (**nessun vincolo
normativo** sui 5 minuti). Chi timbra scrive l'orario **esatto**; a video si
legge ai 5 minuti (`ora-mostrata`, dal 22/10); e le **ore si calcolano sugli
orari arrotondati al più vicino**, per **tutte le bocche** (badge, QR, app, PC):
la scatola, il tetto del «+», le righe per cantiere e ciò che esce verso il
gestionale sono multipli del passo.

- **Un posto solo**: `@kommessa/api/arrotondamento-timbri` (`arrotondaMs`,
  `arrotondaTimbrature`, `arrotondaEventi`; regola `{ passoMin, dal }`), letto
  con `leggiRegolaTimbri` / `regolaTimbriDa` in `_lib/kantiere-config`.
  Si applica **dove le timbrature entrano in un calcolo**:
  `ricomputa-rapportino` (righe della giornata), `_lib/timbro/giornate.ts`
  (scatola e intervalli dal registro e dalle timbrature), le tre
  `calcolaSegmentiSplit` di `kantiere-timbra.ts` (chiusura con divisione,
  registra giornata, per un altro), `leggiMiaGiornata`, la pagina Presenze e
  ore (una volta sola, poi totali, timeline e dettaglio coincidono), il
  cruscotto e la scheda cantiere del telefono.
  ⚠️ **Un nuovo punto che legge `timbrature` per contare ore passa di qui**, o
  conta al minuto per conto suo.
- ⭐ **Il passato non si tocca**: `arrotondamento_timbri_dal` è il primo giorno
  a cui la regola si applica, e lo scrive il **salvataggio** quando l'ufficio
  cambia il valore (Impostazioni Kantiere → Orario e ore). Prima di quella data
  si calcola al minuto, anche premendo «Ricalcola». FPM: 5 min dal 23/10/2026
  (scritto via SQL); DEMOC uguale, così i banchi la esercitano (`timbro.mjs`
  aspetta 8:35 da badge 08:00 / 12:30 / 13:00 / 17:03).
- Nei dialog da scrivania la chiusura in anteprima usa gli **stessi estremi
  arrotondati del server**; l'ora digitata ha `step` al passo. Le righe
  sintetizzate dalla divisione di fine turno nascono già arrotondate (sono
  derivate, non timbri). ⚠️ Due timbri nello stesso slot danno un intervallo da
  zero, mai negativo (test).
- ⚠️⚠️ **A parità di minuto arrotondato conta l'ordine vero.** Pausa, ripresa e
  fine nello stesso slot cadono sullo stesso `ms`; il risolutore ordinava per
  `ms` e poi per `id` (un uuid), quindi la ripresa finiva dopo la fine e la
  presenza restava aperta: trovato dal banco `presenza-sede-mobile`, non dalla
  rilettura. Ora `EventoTimbro`, `TimbraturaAttribuita` e `TimbraturaMinuti`
  hanno `ordine?` (l'istante esatto, o un indice crescente) come spareggio, e
  **la finestra dei doppioni si misura sull'esatto**, altrimenti tre gesti a due
  minuti l'uno dall'altro diventavano un doppione solo. Chi arrotonda prima di
  passare gli eventi a un motore deve passare anche `ordine`.
- ⚠️ **La pausa dichiarata si allinea al passo** (`coppiaPausaAllineata`, usata
  da `coppiaPausaCentrata` nei due scrittori: fine turno con pausa dichiarata e
  «aggiungi pausa» dell'ufficio). Centrata al secondo, una pausa di 30 letta ai
  5 minuti ne valeva 35 (12:02:30 → 12:32:30 diventa 12:00 → 12:35). Ora
  l'inizio sta sul passo e la fine è inizio + minuti.
- Il passo della **display** (`PASSO_ORA_MOSTRATA_MIN`) resta 5 per tutti,
  indipendentemente dal passo di calcolo.

---

## 3. Chilometri: quando e come si caricano

I km si registrano su una **tratta di viaggio** (`timbratura_viaggio`), non sulle ore.

**Quando si caricano:**

1. **Viaggio andata / ritorno** con scelta della **sede** di partenza/arrivo → km e tempo dalla **stima del provider** (vedi §5).
2. **Trasferimenti cantiere → cantiere** (tra un cantiere e l'altro nella stessa giornata): vedi **§3.1** — sempre registrati.
3. ~~**Fine turno verso "Abitazione privata"**~~ — **ritirata il 26/10/2026**: vedi il riquadro qui sotto.
4. **Registra giornata** (giornata dichiarata la sera): partenza, rientro, tratte fra cantieri, guida e mezzo nello stesso modulo → vedi **§7.6**.

**Dettagli:**

- I km arrivano dalla **stima del provider** e restano il valore buono finché nessuno li tocca. **Dal 23/09/2026 si correggono a posteriori**, sia dall'ufficio sia dal tecnico dalla propria app: vedi **§3.3bis**. Fino a quella data erano definitivi e si correggeva solo il **tempo**.
- Il flag **autista** sulla tratta distingue chi **guidava** (rilevante per i rimborsi km) dal passeggero.
- Il tempo di viaggio si registra separato dal lavoro (`minuti_viaggio`) e rientra nelle ore ordinarie fino all'orario ordinario (§1.1). Display sempre in `H:MM`.
- Chi lavora **dalla sede sul progetto** fa partire e arrivare le tratte alla sede: **§3.2**.

> ⚠️⚠️ **«Abitazione privata» non esiste più come scelta (dal 26/10/2026).**
> Si conta come se si partisse e si rientrasse **sempre da una sede**. Non è
> una preferenza di interfaccia: è una **scelta aziendale che sta nel CCNL**,
> dichiarata valida anche per i clienti futuri.
>
> ⭐ Chi la vedesse mancare e volesse riaggiungerla sta toccando un fatto
> contrattuale, non una tendina. È stata tolta da tutte le superfici che la
> offrivano: «Inizia giornata» d'ufficio, fine turno (telefono e PC), foglio di
> partenza del telefono, estremi di «Registra giornata» da scrivania. Con essa
> sono spariti il sentinella `CASA_ID`, i rami che azzeravano la stima e le
> frasi «nessun km né tempo da registrare».
>
> ⚠️ **Non era parametrica**: stava scritta nel front-end in **cinque** punti.
> Se un domani la si volesse rendere configurabile, è da costruire da zero.
> ⚠️ Il valore `'casa'` **resta nei tipi** (`Estremo`, `Passaggio` in
> `@kommessa/api/kantiere-percorso`) e negli schemi delle azioni: serve a
> leggere le giornate vecchie, scritte quando la scelta esisteva. Non si
> produce più.
> ⚠️ Dove non c'è nessuna sede ammessa l'estremo **non si chiede**: non si
> ripiega su un valore che non ha una voce a schermo.

### 3.3bis Correggere km e tempo di una tratta, dopo (dal 23/09/2026)

Una tratta si può correggere **dopo**, quando ci si accorge che il numero non torna: km, tempo, o tutti e due. Lo fanno sia l'**ufficio** (Presenze e ore → «Correggi giornata» → «Correggi i viaggi») sia il **tecnico** dalla propria app (Le mie ore → «Modifica giornata» → «I viaggi»).

> ⚠️ **Ribalta una scelta esplicita.** La migration che ha introdotto i km (`20260624040000`) diceva che erano definitivi e che si correggeva solo il tempo. Da oggi non è più così, ma **solo a una condizione**: che resti distinguibile che cosa ha detto il provider e che cosa ha corretto una persona. Un km corretto che sembra un km misurato è un dato peggiore di un km sbagliato, perché nessuno sa più di chi fidarsi, e i km finiscono nei costi, nei rimborsi e nell'export verso il gestionale.

**Come è fatta** (migration `20260923090000`), ricalcando il modello che il tempo aveva già:

| Il tempo (da sempre) | I km (da oggi) |
|---|---|
| `durata_stimata_min` (provider) | `distanza_stimata_km` (provider) |
| `durata_confermata_min` (valore buono) | `distanza_km` (valore buono) |
| `giustificazione` | `km_giustificazione` |

- Il **valore buono resta in `distanza_km`**: tutti i lettori di oggi (costi, report, scheda cantiere, mezzi, API pubblica, export) continuano a leggere il numero giusto senza sapere niente di questa funzione.
- La stima si archivia **solo alla prima correzione**: una seconda non deve sovrascriverla, o si perde da dove si era partiti. Nessun backfill: `distanza_stimata_km` NULL significa «mai corretta», riempirla direbbe «corretta a un valore identico alla stima», che è falso.
- Il **motivo è obbligatorio**. Senza, la correzione è indistinguibile da un errore.
- I km si correggono **solo se si era autista**: è a lui che sono attribuiti (contarli anche ai passeggeri li moltiplicherebbe per le persone in macchina). Il **tempo** vale per tutti.

⚠️ **Si corregge la SORGENTE, non la riga derivata della giornata**, e non è una scelta di stile:

- i km su `rapportino_righe` non esistono, non è una sua colonna;
- il tempo, corretto lì, obbligherebbe a marcare la giornata come manuale, **congelando anche le ore di lavoro** rispetto alle timbrature future.

Correggendo `timbratura_viaggio` il valore sopravvive al ricalcolo **per costruzione** (è ciò da cui il ricalcolo parte) e non si congela niente. Il ricalcolo si rilancia **solo se cambia il tempo**: `distanza_km` non viene letta mai dal ricalcolo.

**Il tecnico** ha le stesse guardie che ha sulle ore: identità presa dalla sessione e mai dal client (ed è parte del filtro, non un controllo fatto dopo), finestra di 3 giorni, stop se l'ufficio ha già deciso la giornata a mano. La RLS gli permetteva già di scrivere le proprie righe di viaggio: nessuna migration in più.

### 3.1 Trasferimenti cantiere → cantiere (km + tempo)

Chi in una giornata lavora su **più cantieri** percorre dei tragitti **da un cantiere all'altro** (A → B). Questi tragitti vengono **sempre calcolati e registrati** (indirizzo A → indirizzo B, via provider del tenant, §5): **km + tempo stimato**, su una riga `timbratura_viaggio` con `da_cantiere_id` = cantiere di partenza, `cantiere_id` = cantiere di **destinazione** (i **km si caricano sulla destinazione B**), `timbratura_id` null, `direzione='andata'`.

Copre i **tre** flussi multi-cantiere: **cambio cantiere live**, **split "cosa hai fatto oggi"** a fine turno, **registra giornata** da zero. Le tratte si derivano dall'ordine dei cantieri con la funzione pura testata `trasferimentiDaSegmenti` (ogni cambio di cantiere = un tragitto) e le scrive `registraTrasferimentiCantiere`. Best-effort: se a un cantiere manca l'indirizzo (niente coordinate), quella tratta si salta senza bloccare.

**Sono viaggio, sempre** (dal 15/09/2026, scelta del cliente):

- **Km**: entrano nei totali del cantiere di destinazione e del mezzo, per tutti i tenant. L'interruttore `km_switch_attivo` («Conteggia i trasferimenti tra cantieri») è stato tolto e la chiave rimossa dal config.
- **Tempo**: `durata_confermata_min` = stima arrotondata al passo del viaggio. La tratta sta dentro l'orario, quindi il suo tempo si toglie dal lavoro: nel cambio cantiere live dal segmento di arrivo (§1.1); in «Registra giornata» diventa un buco fra l'uscita da A e l'ingresso in B, e le ore da assegnare ai cantieri sono (fine − inizio) − pausa − tratte (§7.6).
- Il super admin continua a vederle in `/admin/kantiere/timbrature` (sezione «Trasferimenti tra cantieri»).
- Il campo `timbratura_viaggio.da_cantiere_id` arriva con la migration `20260706000000`; il display (cruscotto e Presenze e ore, `ViaggioTratta.daCantiere`) scrive «cantiere A → cantiere B» invece di «Sede → cantiere».
- L'interruttore `km_switch_attivo` e il reader `leggiTrasferimentiAttivi` sono stati **tolti** con la migration `20260915090000`.

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

### 3.3 Chi lavora quasi sempre in sede (dal 22/09/2026)

Alcune persone in cantiere non ci vanno: stanno in ufficio o in officina. L'app chiedeva a tutti le stesse cose — quale cantiere, da dove parti, quanti chilometri — e a loro non servivano.

**Come si assegna.** Sulla **scheda dipendente** (Personale → Dipendenti), campo «Come lavora»: **Attività esterne** (predefinito, il comportamento di sempre) oppure **Prevalenza ufficio**. Si vede anche in elenco, colonna «Modalità app».

> ⚠️ **Non è un ruolo e non tocca i permessi.** Il ruolo (`users.role`) dice cosa a una persona è *permesso fare* e regge guard e RLS; questo dice *come l'app si comporta con lei*, ed è una proprietà del lavoro. Per questo sta su `dipendenti`, accanto a `a_turni` e al costo orario: due persone su trentaquattro non hanno nemmeno un account, e il loro lavoro esiste lo stesso. Farne un ruolo porterebbe subito all'esplosione combinatoria — «office che timbra», «tecnico che sta in sede», «caposquadra in ufficio».

**Cosa cambia sul telefono** per chi è in «Prevalenza ufficio»:

- **Inizia giornata in un passo**: si sceglie *su cosa* si lavora, non *da dove* si parte. Sotto c'è `daSede: true`, cioè il «lavoro dalla sede sul progetto» di §3.2: le ore restano del lavoro scelto, il luogo è la sede predefinita.
- **Chiusura in un tocco**: niente foglio del viaggio di ritorno.
- **Il viaggio è un flag al contrario**: non si chiede, si dichiara («Oggi ho fatto un viaggio») e apre il foglio di sempre.
- Il foglio compare da solo **solo quando c'è una domanda vera**: giornata lunga senza pausa timbrata.
- **«Registra giornata» gira allo stesso modo** (tab «Le mie ore di oggi», l'inserimento a mano di §7.6). È la stessa schermata, con gli stessi pezzi: scelta dei lavori, colori, ora di inizio, fine calcolata, pausa pranzo. Cambia solo da che parte sta il caso normale — il lavoro nasce **dalla sede**, e il flag sulla riga dice l'eccezione: **«Lavoro presso il cliente»** al posto di «Lavoro dalla sede sul progetto». Finché nessuna riga è spuntata la giornata è tutta in sede e il percorso non si chiede; spuntandone una compaiono partenza, rientro e tratte, identici a prima. Sotto non cambia niente: è sempre `daSede` per riga, ed è lo stesso salvataggio.
- «Scansiona QR» resta raggiungibile: capita di andare in cantiere anche a chi di solito non ci va.

Per chi è in «Attività esterne» **non cambia niente**: la stessa app di prima.

> ⚠️ **Una schermata sola, non due.** La variante di «Registra giornata» è una prop (`inUfficio`) sullo stesso componente, **spenta di default**: chi lavora fuori vede esattamente la schermata di prima. Un gemello copiato — sono 1100 righe — divergerebbe dall'originale alla prima correzione, e questa è la schermata che i tecnici toccano tutti i giorni. Banco: `scripts/banco-ui/registra-giornata-ufficio.mjs`.

> ⚠️ **La colonna si legge in modo tollerante.** `dipendenti.modalita_lavoro` arriva con la migration `20260922090000`, che si applica a mano, mentre il codice va online al push. Le letture stanno in una **query separata** (`_lib/dipendenti-modalita.ts`): se la colonna non c'è ancora, tutti risultano «esterno» invece di far cadere la pagina Dipendenti. Anche il salvataggio la scrive a parte e avvisa se non ha attaccato, così un campo che non esiste non porta giù con sé l'anagrafica.

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
~~3. l'abitazione privata a fine turno~~ — **ritirata il 26/10/2026** (§3): partenza e rientro sono **sempre** una sede, ovunque.

**Non** compaiono le sedi collegate ad **altri** cantieri. *Esempio: "Hotel Excelsior", collegato solo al cantiere Monfalcone, non appare nei cantieri non collegati.*

### Dove è applicata (UI + dati)

- **UI**: scansione QR (`/t/[token]`), fine turno/pausa in app (`turno-azioni-contesto`), wizard caposquadra (`gestione-squadra`), **Registra giornata** (filtra le sedi in base ai cantieri della giornata).
- **Dati (server)**: la regola è **rivalidata lato server** da `sedeAmmessaPerCantiere` in `validaViaggio` (anche per partenza e rientro di `registraGiornataDaZero`, e per le sue tratte via sede) → una sede non predefinita e non associata al cantiere viene **rifiutata** (`SEDE_NON_VALIDA`), anche se forzata da client.

### Gestione lato ufficio

- Pagina **Sedi** (office → Kantiere → Sedi): crea/modifica sede, imposta la **predefinita**, collega/scollega i cantieri (campo di ricerca con dropdown, non l'intera lista).
- **Scheda cantiere** → card **"Sedi di partenza"** (tra "Chi c'è ora" e "Storico presenze"): mostra la sede **predefinita** (sempre, sola lettura), poi le **sedi collegate** a quel cantiere (rimovibili) e due azioni: *Usa una sede esistente* (ricerca) o *Crea nuova sede* (auto-collegata). È il posto dove si gestiscono le sedi reali del cantiere.
- L'**indirizzo** della sede usa l'autocomplete geocoding (Google per i tenant su provider `google`, altrimenti Photon/Nominatim) e salva **lat/lng** per il calcolo dei tragitti.
- Il **collegamento ai cantieri** si fa con una tendina di ricerca (`sedi/_components/cantieri-collegati-select.tsx`), non con l'intero elenco a pastiglie: con 754 cantieri una lista di chip non è usabile.

> **Nota (legacy)**: la colonna `cantieri.sede_partenza` (testo, con lat/lng) è un vecchio campo **non usato** dal calcolo viaggio (che si basa su `sedi` + `cantiere_sede`). Il controllo è stato **rimosso dall'anagrafica** della scheda cantiere per non confondere; la colonna resta nel DB ma è inerte.

---

## 5. Stima viaggio: provider per-tenant

- Astrazione `RoutingProvider`: famiglia **free** (OSRM/OpenRouteService, gratis, **senza traffico**) o **google** (Google Routes API, **traffico reale**, a pagamento).
- Nella famiglia free, con `ORS_API_KEY`, si prova OpenRouteService e **se non risponde si ripiega su OSRM** (dal 24/10/2026): ORS rifiuta un punto a più di 350 m da una strada che conosce, e un cantiere in mezzo ai campi restava «Senza stima».
- La scelta è **per-tenant**, dal super admin (tab **"Viaggio"** di `/admin/tenants/[id]`): `tenant_modules.config.routing_provider` ∈ `free | google` (default `free`).
- La **chiave Google è unica di piattaforma** (`GOOGLE_MAPS_API_KEY`, in env — **mai** nel DB, **mai** per-tenant). Se il tenant è su `google` ma la chiave manca → fallback automatico a free.
- Lo **stesso toggle** vale anche per l'**autocomplete indirizzi** delle sedi/cantieri, così indirizzi, tempo e km di un tenant restano coerenti.
- FPM è su **google**; gli altri restano **free** (costo zero).
- Il provider `google` chiama `computeRoutes` della Routes API con `TRAFFIC_AWARE` (il traffico è il motivo per cui si paga); la scelta la salva `aggiornaRoutingProviderTenant`.
- La route `/api/routing/stima` legge la scelta (`leggiRoutingProvider`), costruisce il provider e fa **fail-soft**. Cache condivisa dalle superfici in `_lib/routing/stima-cache.ts`. Cache `routing_cache` **per profilo** (`driving-car` e `driving-traffic` non si mescolano) con **TTL 15 min** sul traffico.
- `AddressAutocomplete` salva **lat/lng** accanto al testo: senza coordinate non c'è stima.

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
| `fase_obbligatoria` | off (**FPM: on** dal 23/10/2026) | Dove un cantiere ha fasi attive, la riga deve indicarne una (§12.6). Dal 26/10: con **una sola** fase si prende quella senza chiedere, con **più di una** la scelta è obbligatoria. |

### Pause
| Chiave | Default | Effetto |
|---|---|---|
| `soglia_pausa_pranzo_ore` | 5 h | Oltre questa durata, chiudendo senza pausa timbrata, l'app chiede la pausa pranzo. Costante `SOGLIA_PAUSA_PRANZO_ORE` = **solo il predefinito**, lettore `leggiSogliaPausaPranzoOre`. |
| `soglia_auto_spegnimento_pausa_ore` | 1,5 h | Una pausa rimasta aperta oltre la soglia si chiude e il turno riprende; la pausa registrata è pari alla soglia. |

**Come si sceglie la durata (dal 23/09/2026).** Ovunque si chieda la pausa si vedono le stesse cose: le durate rapide **30 / 45 / 60**, più un **campo libero** per qualunque altra durata. Il valore scritto a mano viene portato al **multiplo di cinque** più vicino, e lo si dice a chi ha scritto — ma solo quando il numero è davvero cambiato, perché avvisare sempre è rumore. Una pausa si ricorda a memoria a fine giornata: il minuto esatto è una precisione finta.

Le cinque superfici che la chiedono (QR, fine turno da app e capo, Registra giornata, Modifica giornata del tecnico, Correggi giornata dell'ufficio) usano **lo stesso componente**, `_components/scelta-pausa-pranzo.tsx`, sopra il modulo puro `@kommessa/api/kantiere-pausa` (durate, passo, limiti, arrotondamento). Prima erano cinque elenchi scritti a mano, e uno offriva anche 90 minuti: cambiare le durate si fa in un posto solo.

> ⚠️ Il vincolo vero non stava nella pagina. Due schemi di `kantiere-timbra.ts` dichiaravano `pausaPranzoMin` come **elenco chiuso** (`z.union` di 30, 45, 60): un campo libero sarebbe stato rifiutato dal **server**. Ora tutti e quattro gli schemi accettano un intero fra `PAUSA_MINIMA_MIN` e `PAUSA_MASSIMA_MIN`, presi dal modulo. Prima di cambiare una scelta a schermo, cercare sempre dove quel valore viene validato.
>
> «Nessuna» (zero) resta una risposta valida e distinta in «Registra giornata»: non aver fatto pausa è un fatto, non un dato mancante.

**La pausa si avvia anche senza QR**, dalla scheda cantiere dell'app: azione `pausaPranzoMia`. Il QR è il modo corretto di timbrarla, non l'unico possibile — chi è in cantiere senza il cartello non deve restare senza pausa.

### Viaggi e chilometri
| Chiave | Default | Effetto |
|---|---|---|
| `km_solo_autista` | on | Su una tratta condivisa i km contano solo per chi guida. Si applica ai km trasmessi al gestionale (API). |
| `sede_partenza_default` | vuoto | Indirizzo proposto come sede di partenza ai cantieri nuovi. Sede predefinita e sedi collegate si gestiscono nella pagina Sedi (§4). |
| `routing_provider` | free | Provider di stima e geocoding (§5), scelto dal super admin. |

La pagina riporta anche le regole fisse: andata e ritorno fuori dall'orario, tratte fra cantieri come viaggio (§3.1), lavoro dalla sede (§3.2), partenza e rientro **sempre una sede**, di default la predefinita (§3: l'abitazione privata è stata ritirata il 26/10/2026).

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

### Promemoria e notifiche
| Chiave | Default | Effetto |
|---|---|---|
| `promemoria_ore` | 18:00 / 08:00 | Orari della finestra della **sera** (giornata di oggi) e della **mattina** (ieri e prima) in cui parte l'avviso `ore_da_inserire`. Pagina: Impostazioni Kantiere → Approvazione giornate. |

L'avviso sta in `@kommessa/api/avvisi`, quindi la persona lo può spegnere dal
proprio profilo; lo manda `/api/cron/promemoria-ore` ogni quarto d'ora dentro la
finestra. ⚠️ Il dedupe è su `utente | giorno | finestra` nelle ultime 20 ore: un
**sollecito a mano** dell'ufficio usa la finestra `ufficio` apposta, o
spegnerebbe il promemoria automatico di quella persona.

⭐ **Dal 26/10/2026 `ore_da_inserire` ha tre mittenti e resta un avviso solo**
(un interruttore solo nel profilo): la **fine giornata dichiarata** al terminale
Timbro — finestra `fine_turno`, entro due minuti dal gesto, dove c'è
l'integrazione (`Logiche_Integrazione_Timbro.md` §10.5) — il cron della
sera/mattina e il sollecito dell'ufficio. ⚠️ La finestra della **sera salta chi
ha già ricevuto `fine_turno`** quel giorno: la stessa frase due volte in
mezz'ora insegna a non leggere l'avviso. La **mattina non lo salta**, perché il
giorno dopo è la seconda occasione vera.

**Tolte il 15/09/2026**: `km_switch_attivo` (i trasferimenti contano sempre, §3.1) e `anomalie_ore_max` (mai letta: la pagina Anomalie usa `anomalia_turno_ore_max`). La migration `20260915090000` le rimuove dal config e il salvataggio della pagina le toglie comunque.

> **Per aggiungerne una**: campo in `ImpostazioniKantiere` + `impostazioniDaConfig`,
> schema e merge di `salvaImpostazioniKantiere`, UI con descrizione oggettiva.
> I reader parziali (`leggiImpostazioniTurno`, `leggiArrotondamenti`, …) passano
> tutti da `impostazioniDaConfig`: non si legge `tenant_modules.config` a mano.
>
> ⭐ **Una regola «nel codice» diventa un'impostazione solo quando una riga di
> codice la legge.** Il tab **Regole** del super admin censisce tutte le
> regolette del mondo presenze con scritto **chi ha la chiave** (ufficio /
> super admin / scheda persona / nel codice).

---

## 7. Auto-approvazione rapportini

- Una giornata si **auto-compila** dalle timbrature e si **auto-approva** quando è **chiusa** (ingressi = uscite) **ed entro soglia** (`anomalia_turno_ore_max`, pause escluse).
- Giornata **aperta** o **oltre soglia** → resta **"da verificare"** (bozza), in carico a **office/admin**.
- Si **ri-valuta a ogni timbratura** (riaprire un turno riporta la giornata in bozza).
- Congelata solo se l'ufficio l'ha già toccata (`approvato_da` valorizzato).
- Logica pura testata: `esitoAutoApprovazione`; wiring in `ricomputaRapportinoAuto`.
- ⚠️ **Pausa-aware**: una giornata ferma **in pausa** (ultimo evento = uscita di pausa) non si auto-approva con le sole ore del mattino. `ricomputaRapportinoAuto` calcola `inPausa`, e per farlo la query delle timbrature **deve includere la colonna `pausa`**.
- Correzione dell'anomalia «pausa pranzo dimenticata»: l'ufficio usa `aggiungiPausaGiornata` → coppia-pausa → se la giornata rientra in soglia si auto-approva. L'anteprima della soglia nel dialog legge il config, non un numero scritto a mano.

### 7.0 Kontabilità (spese di cantiere)

Sotto-modulo dentro Kantiere, flag `kontabilita_attiva` (default on). Il tecnico
fotografa lo scontrino dalla PWA → **AI vision** (`OPENAI_MODEL_VISION`, oggi
`gpt-5.4-mini`, `reasoning_effort: 'low'`) estrae i campi → revisione → salva, agganciata al
cantiere del turno (helper condiviso `mioTurnoAttivo`).

- Tabella `spese` (migration `20260625120000`): foto **su R2** via `r2_key` /
  `r2_thumb_key`, **non** `file_refs`. RLS: il tecnico le proprie, office e
  admin tutto il cliente. Cleanup R2 best-effort se l'insert nel database
  fallisce.
- Ufficio `/office/kantiere/kontabilita`: tabella spese + Analisi costi + Costo
  cantiere + **Ricevute** (browser R2, zip con `archiver@7`). Upload
  dall'ufficio (immagine o PDF) via `creaSpesaOffice` (service-role, gated per
  ruolo). Super admin: `/admin/kantiere/kontabilita`, cross-tenant.
- I **PDF** si archiviano soltanto: niente AI.
- ⚠️ Spenta la Kontabilità, la voce sparisce **e** la pagina fa `notFound()`:
  il gating sta nel layout, non solo nel menu.

### 7.0bis Il viaggio di ritorno anche da app (non solo QR)

Chiusura turno self (scheda cantiere) e wizard del capo squadra aprono **lo
stesso dialog del QR** (sede, km, autista, mezzo, pausa) e **tracciano** la
tratta `timbratura_viaggio` con `direzione='ritorno'`. Le uscite in-app hanno
`origine='cronometro'` (il QR resta `'qr'`).

Helper condivisi in `_actions/_lib/viaggio-timbra`: `ViaggioSchema`,
`validaViaggio`, `inserisciViaggioRow`, `inserisciPausaDichiarata`,
`inizioSeEleggibilePausa`, `coppiaPausaCentrata`.
⚠️ **Il viaggio si valida SEMPRE prima** di scrivere pausa o uscita: altrimenti
restano righe orfane. `inserisciPausaDichiarata` restituisce l'esito e chi chiude
il turno **si ferma** se la pausa non entra.

`<LiveRefresh>` aggiorna i dati vivi ogni 60 s (ufficio: presenze, cantiere,
dashboard; telefono: cruscotto, cantiere) e ha la prop `compatto` (solo l'ora).

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
quattro punti. Ora stanno su `metodi_pagamento` (migration
`20260901090000`), uno per cliente, e si gestiscono da **Impostazioni →
Pagamenti** (admin/ufficio, con registro).

> ⚠️ **Il `codice` non si tocca mai.** È il testo dentro
> `spese.metodo_pagamento`: cambiarlo scollegherebbe le spese già registrate e
> quelle già uscite verso il gestionale. Si rinomina **solo** `nome`, e la
> conferma a schermo lo dice.

- **Rinominare** e **aggiungere**: sempre con conferma.
- **Ritirare** non cancella: sparisce dalle scelte nuove, le spese vecchie
  restano leggibili col loro nome. Almeno uno deve restare in uso.
- **L'AI vede l'elenco del cliente**: il prompt e il glossario si costruiscono
  dai suoi metodi, e un codice che l'AI si inventa viene scartato.
- Lettore difensivo `leggiMetodiPagamento` (`_lib/metodi-pagamento.ts`): se la
  tabella manca o il cliente è nuovo, tornano i tre di sempre — nessuna tendina
  resta vuota.
- ⚠️ **Lo schema zod non è più un elenco chiuso**: le azioni validano con
  `metodoAmmesso`, che interroga i metodi di quel cliente. Un `z.enum` qui
  rifiuterebbe un metodo che l'ufficio ha appena creato.

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

⚠️ **Lo snapshot fotografa anche le tratte** (id, km, minuti), dal 23/09/2026.
Prima confrontava lavoro, viaggio, stato e righe, tutti presi da
`rapportino_righe`: i km e i minuti delle tratte stanno però su
`timbratura_viaggio`, che in quel confronto non compariva. Correggere i **soli
km** risultava quindi «non è cambiato niente» e la versione veniva **scartata in
silenzio**: la correzione restava, la sua storia no. Gli snapshot scritti prima
di quella data non hanno le tratte: in quel caso non si può sapere se siano
cambiate e **non si dice**, esattamente come già si fa per le righe. L'azione
`modifica_viaggio` è entrata nel vocabolario chiuso del CHECK con la stessa
migration.

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
| Partenza e rientro | Agli estremi, **di default la sede predefinita**; si può scegliere una sede del cantiere (§4). **Mai l'abitazione privata** (tolta da Registra giornata il 15/09/2026, da tutta l'app il 26/10/2026, §3). Chi non tocca il rientro se lo trova uguale alla partenza. Se tutti i cantieri sono «Lavoro dalla sede sul progetto», partenza e rientro **non si chiedono**. |
| Chi guidava | Per **ogni tratta con strada** (sede → cantiere, cantiere → cantiere, cantiere → sede), con un'etichetta compatta che si apre: «Ero passeggero» / «Guidavo io» e il mezzo. Dove non c'è strada (stessa sede, tutto il giorno in sede) **non si chiede**. Una tratta non toccata prende l'ultima scelta, ma cambiare una tratta non cambia quelle prima, che tengono quello che mostravano; si propone l'ultimo mezzo guidato, c'è anche «Mezzo non in elenco» (15/09/2026). |
| Tratte fra cantieri | Le costruisce il sistema, **dirette**, con km e tempo stimati. Toccandole compaiono **due scelte affiancate**: «Diretta» e «Passando da» la sede predefinita (o un'altra sede ammessa per entrambi i cantieri), più tenue finché non si sceglie. «Passando da casa» non si propone più (15/09/2026). Dallo stesso menu si **corregge il tempo** della tratta, come per partenza e rientro, con un motivo se si scosta dalla stima (15/09/2026). |
| Obbligatori | Tempo della tratta se la stima non c'è, motivo se il tempo è diverso dalla stima, chi guidava e il mezzo su ogni tratta con strada. Quello che manca lo chiede il foglio «Il viaggio» quando si preme «Registra giornata». |
| Passeggero | Se su una tratta si è indicato «Ero passeggero» compare la conferma «Hai viaggiato da passeggero?» (§7.4); «No, guidavo io» riapre chi guidava su quella tratta. |

**Tempo di viaggio e ore**

- **Si indica solo l'inizio del lavoro** (15/09/2026): la fine si calcola, inizio + ore dei
  cantieri + pausa + tratte fra cantieri, e la pagina mostra il conto. Prima inizio e
  fine andavano fatti quadrare con le ore dei cantieri. La pausa pranzo è arancione
  nei tasti e nella barra, come nel resto dell'app. La card «La giornata» ha altezza
  fissa (il conto occupa sempre due righe): con + e − le card sotto non si spostano.
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
| Passando da casa | nessuna riga (non più proposta dal 15/09/2026, e dal 26/10/2026 l'abitazione privata non esiste più in nessuna superficie; il server accetta ancora il valore per le app non aggiornate e per le giornate vecchie) |

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

**Dove sta nel codice**: `terminaTurnoMio` → `terminaConSplit` (additivo, con
la guardia della giornata pulita e il viaggio di ritorno sull'ultima uscita);
UI in `ViaggioRitornoDialog` (sezione split, `MinutiStepper` al passo
configurato, foglio per aggiungere cantieri) e `RegistraGiornataDialog` per il
caso senza timbrature. Banco `scripts/banco-ui/registra-giornata.mjs`
(`BANCO_SALVA=1` scrive sul cliente dimostrativo: ripulire dopo).

Il netto giornata = `(chiusura − inizio) − pausa`; in Registra giornata le ore da assegnare tolgono anche le tratte fra cantieri. La pausa dichiarata è una **coppia di timbrature centrata** nel turno (così il calcolo ore la sottrae con la logica pausa esistente).

### PWA — sezione "Non hai timbrato?" (tab Ore)

Quando la giornata è senza timbrature, la tab Ore offre **Registra giornata**, dal 14/09/2026 l'unico inserimento a mano del tecnico:

- **Registra giornata** — dichiari **inizio e pausa** e le ore di **uno o più cantieri** (la fine si calcola). Il server **sintetizza le timbrature reali** (`registraGiornataDaZero` → `calcolaSegmentiSplit`) e il rapportino si ricalcola da quelle. Vincolo: **solo oggi** e **giornata vuota**, con `registra_giornata_attivo` on. UI: card **"La giornata"** dominante (orari + pausa a chip), poi **il percorso** in verticale (partenza con guida e mezzo, una **card per cantiere** col **colore abbinato** al proprio segmento, le tratte fra cantieri, rientro) e la **barra dei tempi** in fondo, sempre visibile anche col foglio «Il viaggio» aperto: ore assegnate/nette, esito, viaggio, orari di partenza e rientro (§7.6).
- ~~**Ore su un cantiere, con viaggio**~~ — **tolta il 14/09/2026** (scelta del cliente): il viaggio ora sta in Registra giornata. L'azione server `registraOreManuali` è stata eliminata il 15/09/2026; le tratte che aveva scritto contano ancora nel ricalcolo (`tratteGiornata` in `ricomputa-rapportino.ts`).

**Giorni passati e giornate già parziali**: dall'app non si dichiarano più da zero. Si correggono con «Modifica giornata» nello storico (dove ammesso) o dall'ufficio in Presenze e ore.

---

## 10. Quando un cantiere si chiude (dal 19/09/2026)

Un lavoro finito **non si cancella mai**: restano le ore, le spese, le foto, i
QR, lo storico. Cambia solo cosa se ne può fare.

**La regola, in una riga**: `chiuso` vuol dire fuori dai giri. Sparisce da ogni
punto di **scelta** e dalla ricerca, resta nella lista grande dei cantieri con
l'interruttore «Mostra anche i chiusi», è grigio dove compare, e **non accetta
più scritture nuove**.

### Il divieto lo dice il server, non l'elenco

Fino al 19/09/2026 la difesa stava solo nei filtri di alcune liste, cioè da
nessuna parte: **ogni** punto di scrittura verificava il tenant e mai lo stato,
quindi bastava un id per registrare ore, spese o timbrature su un lavoro finito.
Con le commesse chiuse in arrivo dal gestionale (centinaia in una notte) sarebbe
diventato il caso normale.

Oggi esiste un guardiano solo: `cantiereScrivibile` / `cantieriScrivibili` in
`apps/web/app/_actions/_lib/lavoro-aperto.ts`, sopra il modulo puro
`@kommessa/api/stato-lavoro` (testato). **Chi aggiunge un flusso domani passa di
lì e eredita la regola.** È agganciato a: timbratura QR, avvio turno, cambio
cantiere, split di fine turno, Registra giornata, opzioni di partenza, spese da
app, spese da ufficio, riassegnazione spesa, «Registra ore» dell'ufficio,
pianificazione.

**Due punti restano fuori di proposito**, e non è una svista: assegnare una
**squadra** a un cantiere e collegargli una **sede** continuano a verificare solo
il tenant. Non scrivono ore, spese o presenze: sono anagrafica, e impedirle su un
lavoro finito darebbe fastidio senza proteggere niente.

### Chi può forzare, e chi no

| Chi | Cosa succede |
|---|---|
| **Tecnico da app** (QR, turno, spese) | Divieto secco. Nessuna forzatura: chi è in cantiere non deve poter decidere questo. Se la registrazione va fatta lo stesso, la fa l'ufficio. |
| **Ufficio da computer** (registra ore, spese, riassegnazione) | Può **sempre** scrivere. Il cantiere chiuso resta scegliibile, marcato «· chiuso» e in fondo all'elenco; al salvataggio si chiede conferma e si passa `forzato: true`. |
| **Pianificazione** | Divieto secco anche per l'ufficio: programmare lavoro **futuro** su un cantiere chiuso non ha senso. Se il lavoro riparte, si riapre il cantiere. |

Il caso che giustifica la forzatura è reale: «ha lavorato ieri su una commessa
chiusa stanotte». A saperlo è l'ufficio, non chi timbra.

### Un turno già aperto si chiude sempre

Il guardiano si mette sull'**apertura** di qualcosa di nuovo, **mai sulla
chiusura**. Chi ha un turno aperto su un cantiere che nel frattempo è stato
chiuso lo termina normalmente, pausa e ripresa comprese: lasciare a metà una
giornata vera sarebbe il danno peggiore.

### Il QR di un cantiere chiuso

Il cartello resta appeso anche quando il lavoro finisce. Chi lo scansiona vede
una **pagina comune a tutti i clienti** («Cantiere chiuso, qui non si timbra
più, dillo all'ufficio»), servita da `apps/web/app/t/[token]/page.tsx` insieme
alle altre schermate del QR. Meglio dirlo lì, in chiaro, che far fallire la
timbratura dopo, con la persona che ha il telefono in mano e non capisce.

### Dove i chiusi restano visibili, di proposito

Non tutto è un punto di scelta. Restano **completi di chiusi** i filtri e i
prospetti di sola consultazione: analisi spese, costo cantiere, ore e costi,
filtro cantiere in Kontabilità. Una spesa di sei mesi fa sta su un lavoro che
intanto è finito, e l'ufficio deve poterla filtrare e leggerne il nome.

### ⚠️ Nel mondo commesse la regola è OPPOSTA (dal 19/09/2026)

Questo file parla di Kantiere, ma il punto va detto qui perché è qui che si
presume la simmetria, e la simmetria non c'è.

Su una **commessa** `completata` o `archiviata` **si aggiunge sempre**: foto,
video, documenti, attività, riunioni, tag, tecnici, fasi, tipologie. Il server
**non rifiuta mai**. L'interfaccia chiede una conferma, una sola per aggiunta
(`apps/web/app/_components/conferma-commessa-chiusa.tsx`).

Il divieto lato server **è stato provato e ritirato in giornata**: le foto
arrivano anche dal Comando iOS e dalle API, dove un popup non esiste, quindi
bloccare rompeva quelle strade in silenzio (per un'ora le commesse chiuse di
Bertaiola hanno rifiutato gli upload con un 409, e dal telefono risultavano
introvabili). Da lì la regola: **si vieta solo dove chi scrive può rispondere a
una domanda.**

Quindi `commessaImputabile()` dice **com'è messa** la commessa, non cosa è
permesso: serve alla UI per decidere se chiedere conferma. Solo
`cantiereImputabile()` è un divieto.

Invariata la visibilità: archiviata fuori dal telefono, completata visibile
ovunque, riga grigia nella lista dell'ufficio.

## 11. File chiave nel codice (per manutenzione / AI)

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
| Sottocantieri: vocabolario (puro + testato) | `packages/api/src/sottocantieri.ts` (`chiaveCantiere`, `radiceChiave`, `luogoDaValore`, `etichettaLuogo`, `fasiScegibili`) |
| Sottocantieri: nomi per le scritte | `apps/web/app/_lib/sottocantieri-nomi.ts` (`nomiSottocantieri`, `etichettaConFase`) |
| Sottocantieri: guardia di scrittura | `apps/web/app/_actions/_lib/lavoro-aperto.ts` (`sottocantieriScrivibili`) |
| Sottocantieri: scrittore unico delle timbrature (eredità della fase) | `apps/web/app/_actions/_lib/timbrature-scrivi.ts` |
| Sottocantieri: API | `apps/web/app/api/v1/_lib/sottocantieri.ts`, rotte `cantieri`, `ore`, `spese`, `letture` |
| `packages/api/src/fasi-gestionale.ts` + `_lib/integrazione/promuovi.ts` | Promozione delle fasi dal gestionale (crea, aggiorna, collega; mai chiude) |
| Scrittore unico di `timbrature` | `apps/web/app/_actions/_lib/timbrature-scrivi.ts` (`scriviTimbrature`) + `_lib/presenza-registro.ts` (lo specchio della chiusura) |
| Arrotondamento nei calcoli (puro + testato) | `packages/api/src/arrotondamento-timbri.ts` (`arrotondaMs`, `arrotondaTimbrature`, `arrotondaEventi`) |
| Pausa pranzo: durate e limiti (puro + testato) | `packages/api/src/kantiere-pausa.ts` (`PAUSA_PREDEFINITA_MIN` = 30) + `_components/scelta-pausa-pranzo.tsx` |
| Cronologia della giornata (puro + testato) | `packages/api/src/kantiere-cronologia.ts` |
| Stato della giornata timbrata (puro + testato) | `packages/api/src/timbro-giornata.ts` (`statoGiornataTimbro`, `riempiScatola`), `timbri-sequenza.ts`, `timbro-passo.ts` |
| La giornata come **catena** per il dettaglio d'ufficio (puro + testato) | `packages/api/src/giornata-catena.ts` → `office/kantiere/_components/catena-giornata.tsx` |
| Verso dove cade una card trascinata (puro + testato) | `packages/api/src/trascina-riordino.ts` (`latoRilascioRiordino`) |
| Mezzi, «Auto personale» compresa (puro + testato) | `packages/api/src/mezzi.ts` (`etichettaMezzo`, `ordinaMezzi`, `eAutoPersonale`) |
| «La mia giornata» da scrivania | `apps/web/app/office/_lib/mia-giornata.ts` (`leggiMiaGiornata`), `office/_components/mia-giornata.tsx` (hook `useMiaGiornata`), `office/kantiere/_components/compila-giornata-dialog.tsx` |
| Giornata dell'ufficio sul telefono | `apps/web/app/mobile/kantiere/_lib/giornata-ufficio.ts` (`caricaGiornataUfficio`) |
| I tecnici da computer | `apps/web/app/office/mio/**` (guscio ufficio con barra ridotta, azioni self), `office/layout.tsx` (presidio: un tecnico Kantiere entra solo lì), `resolveOfficeLanding` e `casaPerRuolo(ruolo, { telefono })` per l'atterraggio |

## 12. Sottocantieri (fasi) — dal 23/10/2026

Un cantiere può essere composto da più **sottocantieri**, che FPM chiama anche **fasi**
(per FPM arriveranno dal gestionale; l'ufficio li può anche scrivere a mano). Migration
`20261023150000_sottocantieri.sql`. Decisioni di Luca, 23/10/2026:

| Decisione | Scelta |
|---|---|
| Le ore registrate su una fase | restano **attribuite alla fase** (colonna su timbrature e righe ore, una riga per fase, codice verso il gestionale) |
| Chi crea le fasi | l'**ufficio**, dalla scheda cantiere; oppure il gestionale |
| Il cantiere padre, se ha fasi | resta **sempre scegibile**: nessun blocco a chi non conosce la fase, l'ufficio corregge dopo |
| Il codice della fase | **testo** (può essere `25098.01`), unico dentro il cantiere |

### 12.1 Il modello

- Tabella `sottocantieri`: `cantiere_id`, `nome`, `descrizione`, `codice` (testo, unico
  nel cantiere), `stato` (`attivo` / `chiuso`), `origine_gestionale_al` (chi nasce dal
  gestionale non si rinomina a mano). Stessa RLS dei cantieri.
- Colonna **facoltativa** `sottocantiere_id` su `timbrature`, `rapportino_righe`, `spese` e
  `pianificazione_blocchi`. Vuota = «il cantiere intero»: nessuna riga esistente cambia.
- ⭐ **La fase deve essere del cantiere della riga, e lo garantisce il database**: chiave
  esterna **composta** `(sottocantiere_id, cantiere_id) → sottocantieri (id, cantiere_id)`,
  `on delete set null (sottocantiere_id)` (Postgres 15+). Niente trigger. Con la fase vuota
  la chiave non controlla nulla.

### 12.2 Le ore: la fase entra nella chiave, il viaggio no

Tutti i motori raggruppano per una chiave testuale. Dal 23/10 la chiave di un cantiere è
`cantiere:<id>` **oppure** `cantiere:<id>/<fase>` (`@kommessa/api/sottocantieri`):

- le **righe** nascono per fase (`scriviRigheGiornata`, `ricomputaRapportinoAuto`): due fasi
  dello stesso cantiere nello stesso giorno sono due righe; il totale per cantiere si somma;
- lo **split** di fine turno e la **scatola** della giornata timbrata portano la fase negli
  eventi che sintetizzano; nella scatola due segmenti consecutivi si fondono solo se hanno
  stesso cantiere **e** stessa fase (fra due fasi dello stesso cantiere la strada vale zero);
- il **viaggio resta per cantiere**: una tratta nomina il cantiere, non la fase. In
  `minutiDaTimbrature` i minuti di una tratta si attaccano alla **prima riga di quel
  cantiere** (confronto sulla **radice** della chiave), mai a una riga vuota; e il cambio
  fra due cantieri si riconosce anche se le righe sono per fase. Testato.
- ⭐ **La fase, una volta aperta, vale fino alla fine del turno.** Chi scrive una pausa, una
  ripresa o una fine turno (QR, app, capo squadra, ufficio) non conosce la fase
  dell'ingresso: lo scrittore unico `scriviTimbrature` la **eredita** dall'ultima timbratura
  di oggi della stessa persona sullo stesso cantiere. Senza, un ingresso con fase e
  un'uscita senza avrebbero due chiavi diverse e il ricalcolo non li appaierebbe. Chi passa
  `sottocantiere_id` esplicito (anche `null`) decide da sé.
- Il cambio cantiere dal vivo accetta anche **stesso cantiere, fase diversa**: nessuna tratta.
- Nella ripartizione di una giornata timbrata con un turno aperto dall'app, la fase del primo
  segmento è quella dell'ingresso esistente: la decide il server, non il telefono.
- ⚠️ `conFase()` in `kantiere-split.ts` e `timbro-giornata.ts` **non emette il campo se la
  fase è nulla**: gli eventi senza fase restano identici a prima, byte per byte (sette test
  `toEqual` lo pretendono).
- Nomi per le scritte «Cantiere › Fase»: `_lib/sottocantieri-nomi.ts`.

### 12.3 La guardia

`sottocantieriScrivibili`: ogni fase scelta deve esistere, essere del suo cantiere e non
chiusa (`SOTTOCANTIERE_NON_VALIDO` / `SOTTOCANTIERE_CHIUSO`). Come per i cantieri, una
fase chiusa **non blocca la chiusura di una giornata già lavorata** (`forzato`).

### 12.4 Verso il gestionale

- `GET /cantieri` annida le fasi nel padre (`sottocantieri[]`, chiuse comprese, ordinate per
  codice naturale e nome; ⚠️ `modificatoAl` del padre **non** cambia quando cambiano le fasi); `GET /ore`
  e `GET /spese` espongono `sottocantiere { id, nome, codice, externalId } | null`;
  `GET /viaggi` **non cambia** (il viaggio è per cantiere).
- `POST /letture` accetta l'entità `sottocantiere` (`externalCantiereId` obbligatorio,
  `externalCodiceFase`, `descrizione`): **solo area di sosta**.
- La **promozione** delle fasi dall'area di sosta è in §12.5; dal 23/10 sera esiste.

> ⚠️⚠️ **`GET /api/v1/ore` è ordinata DAVVERO dal 22/10/2026**: chiave
> `(rapportino_id, id)`, entrambe di **primo livello**, lette con `daCursore`.
> Prima ordinava per `id` e il cursore filtrava su una colonna dell'**embed**,
> che PostgREST **non** usa per ordinare i padri: misurato, **21 righe su 358**
> paginando a 5. Il cursore è opaco per l'agente, che lo rimanda e basta — ma
> una pagina che «funziona» su un campione piccolo e perde il 94% delle righe su
> uno grande non dà nessun segnale. Chi aggiunge una risorsa paginata ordini su
> colonne della tabella padre.

### 12.5 Le fasi dal gestionale: la promozione (dal 23/10/2026 sera)

Logica pura in `@kommessa/api/fasi-gestionale` (`pianificaFasiDalGestionale`), wiring in
`_lib/integrazione/promuovi.ts` (`promuoviFasiDalGestionale`), che gira **dopo i cantieri**
nello stesso giro di chiusura della lettura (`POST /esecuzioni {chiudi}`), e a comando dal
tasto **«Promuovi le fasi ora»** nel tab Integrazione del super admin (compare quando il
deposito ha fasi). L'esito finisce in `integrazione_esecuzioni.dettaglio.promozione`
(`fasiCreate`, `fasiAggiornate`, `fasiCollegate`, `fasiSenzaPadre`, `fasiErrori`) e nel
semaforo di `/admin/integrazioni`.

La chiave che ERGO manda è `commessa.fase` (per esempio `25151.2`), senza
descrizione: ERGO manda solo le commesse aperte con due o più fasi, e sulla
commessa con una fase sola la fase la mette l'agente.

Per ogni riga in sosta con `entita = sottocantiere`:

| Caso | Cosa si fa |
|---|---|
| il padre (`externalCantiereId`) **non è collegato** a un nostro cantiere | la fase **resta in sosta** e viene contata (`senzaPadre`). Qui **non si crea mai un cantiere** |
| fase già mappata | si aggiorna solo se nome o codice sono cambiati |
| fase non mappata ma **esiste sul cantiere con lo stesso codice** (scritta a mano prima) | si **collega** e si marca `origine_gestionale_al`: niente doppione |
| altrimenti | si **crea** (`nome`, `codice = externalCodiceFase`, `origine_gestionale_al`) e si scrive la mappatura `sottocantiere ↔ externalId` |

Il padre si cerca prima nelle mappature dei cantieri, poi per `codice_commessa` (rete di
riserva, non sovrascrive mai una mappatura). Idempotente: rilanciata non cambia nulla
(provato sul tenant demo: 2 create → 0 → 1 aggiornata dopo un cambio di nome).

⚠️ **Una fase che non arriva più NON si chiude e NON si cancella.** Per ERGO può voler dire
commessa chiusa, fase rimasta sola (allora non la manda), o lettura fallita quella notte.
Chiudere una fase per un silenzio farebbe sparire una scelta dalle tendine e manderebbe
le ore sul cantiere intero. Se un giorno il gestionale manda `attiva: false`, si deciderà.

#### Il contratto con ERGO (personalizzazione del cliente FPM)

- Ogni notte alle 03:00, dopo le commesse: `POST /letture` con `entita: "sottocantiere"`,
  `externalId = "<commessa>.<fase>"` (es. `25151.2`; il numero riparte da 1 in ogni
  commessa e può avere buchi), `externalCodiceFase` uguale, `externalCantiereId` = la
  commessa, `nome` (ERGO ha un solo testo: niente `descrizione`), `attiva: true`, `dati`.
- Arrivano **solo le commesse aperte con due o più fasi** (il 23/10: 65 commesse, 426
  fasi). Commesse con una fase sola o nessuna: niente, e lì la fase la mette l'agente
  (decisione di Luca). Commesse chiuse: niente.
- Su `/ore` e `/spese` l'agente legge `sottocantiere.externalId` **identico** a quello
  mandato; `sottocantiere: null` = riga sul cantiere intero. Una riga per fase per giorno
  va bene: su ERGO sono scritture separate. Sui viaggi non serve niente (la bolla km prende
  la fase solo se la commessa ne ha una sola). Nelle scritture ok `externalRiferimento`
  porta anche `lotId`, la fase usata su ERGO.
- Finché `externalId` è `null` l'agente scrive sul cantiere intero: **non blocca**, perché
  una riga saltata non viene riletta e le ore andrebbero perse.
- Errori **permanenti** su `POST /scritture` (esito errore): «La fase X non esiste sulla
  commessa Y in ERGO», «La fase X appartiene alla commessa Z, non alla Y della riga». Si
  risolvono scegliendo di nuovo la fase in Kommessa: la modifica cambia `modificatoAl` e
  l'agente rilegge la riga al giro dopo.

### 12.6 La scelta obbligatoria (impostazione `fase_obbligatoria`)

Impostazioni Kantiere → **Turni** → «Scelta della fase obbligatoria» (predefinito spento;
**FPM acceso dal 23/10/2026**). Accesa, una riga di ore su un cantiere che ha fasi attive
deve indicarne una: la guardia è nel server (`faseRichiesta` in `lavoro-aperto.ts`, codice
`FASE_RICHIESTA`, messaggio `MESSAGGIO_FASE_RICHIESTA` in `@kommessa/api/sottocantieri`),
chiamata dove già si controllano le fasi: avvio turno, cambio cantiere, divisione a fine
turno, registra giornata, scatola, registra ore dall'ufficio. ⚠️ Il **primo segmento** di
una chiusura o di una scatola che continua un turno già aperto eredita la fase
dell'ingresso e **non** passa dalla guardia: altrimenti un turno aperto prima che le fasi
esistessero non si potrebbe più chiudere. Le righe già registrate senza fase restano
valide, e il gestionale non le blocca.

**Dal 26/10/2026 la regola ha due metà** (`decidiFase`, pura, in
`@kommessa/api/sottocantieri`):

| Fasi attive del cantiere | Cosa succede |
|---|---|
| nessuna | non si chiede niente |
| **una sola** | si **prende quella** senza chiedere, e lo si **dice** a schermo |
| **più di una** | la scelta è **obbligatoria** |

⭐ Una domanda con una risposta sola non è una domanda: è un tocco in più che
qualcuno dimenticherà. Ma la scelta fatta al posto di qualcuno si **dichiara**,
o nessuno può correggerla.

⚠️ **L'automatismo vale solo dove il cliente pretende la fase**
(`fase_obbligatoria`). Senza quel flag, riempire da soli una colonna che finora
restava vuota cambierebbe in silenzio ciò che esce verso il gestionale, e
l'invariante è che nessuna riga esistente cambi.

⚠️ **Spese e pianificazione non chiamavano `faseRichiesta` affatto** (solo
`sottocantieriScrivibili`, che valida una fase *se c'è* ma non ne pretende una):
uno scontrino su un cantiere a più fasi finiva sul cantiere intero **in
silenzio**. Nelle spese la validazione girava perfino **dentro** un
`if (sottocantiereId)`. Chiuso il 26/10.

⚠️ **Il messaggio nomina il cantiere**, e per arrivarci ha dovuto attraversare un
confine che lo buttava via: **tutti e 7 i chiamanti** di `faseRichiesta` facevano
`return { error: fr.error }` scartando `fr.motivo`, e 6 client su 7
ricostruivano il testo dal solo codice. Un messaggio migliore sul server non
serve a niente finché l'azione lo scarta.

⚠️ **Il verbo cambia col contesto**: su uno scontrino non si è «lavorato» e su
una pianificazione non si è ancora lavorato. Tre costanti:
`MESSAGGIO_FASE_RICHIESTA`, `_SPESA`, `_PIANIFICAZIONE`. Prima la frase era
copiata in **10 file** e il vocabolario che la conteneva non lo importava
nessuno.

⭐ **Dove la guardia NON c'è, di proposito**: la **duplicazione** di un blocco di
pianificazione. Lì la fase non la sceglie nessuno, si ricopia da una riga già
scritta: pretenderla impedirebbe di duplicare blocchi creati prima che la regola
esistesse, e non c'è nessuna schermata in cui rispondere.

---

## 13. Le superfici dell'ufficio

### 13.1 La tab «Presenze e ore»

`/office/kantiere/rapportini`. Storico **per giorno** + blocco **«In corso
oggi»** (sfondo verde, colonne allineate, timeline inline `GiornataFlow`).
Esito per giornata: 🟢 Regolare · 🔴 anomalia col motivo (giornata aperta /
oltre soglia) · ☕ pausa non timbrata. **Modifica e Cronologia su OGNI
giornata** → correzione retroattiva tracciata (`rapportino_versioni`, azione
`modifica_ufficio`). Filtro «Solo anomalie».

- **Niente Approva / Respingi / selezione multipla a schermo**:
  l'auto-approvazione (§7) resta sotto, nascosta.
- **`rapportino` ≠ PDF**: nel codice è il **record-giornata** (con stato di
  approvazione), ed è il nome di questa pagina. Non esiste nessun PDF
  «rapportino»: il prospetto ore **è** questa tabella, più l'export CSV e
  «Ore e costi».
- **Dettaglio espanso**: dal 26/10/2026 la giornata di una persona si legge
  come **una catena cronologica** — passaggi del registro, segmenti di lavoro,
  pause e tratte in un ordine solo. Prima erano tre blocchi impilati e, dentro
  il secondo, le pause in una lista **dopo** tutti i segmenti: una pausa delle
  12:30 si leggeva sotto un segmento che cominciava alle 13:00.
  ⚠️⚠️ **Una tratta non porta un orario**: ha direzione, sede, cantiere, km e
  minuti. La sua posizione nel tempo va **derivata** (l'andata chiude sul primo
  ingresso, il ritorno parte dall'ultima uscita, un trasferimento sta nel buco
  fra due segmenti) — ed è la ragione per cui prima i viaggi finivano in fondo
  in un blocco a parte. Motore puro: `@kommessa/api/giornata-catena`.
  ⚠️ Una tratta che non si riesce ad ancorare **non si butta**: finisce in coda
  dichiarata. Perderla vuol dire perdere chilometri da rimborsare.
- **Ogni riga dice la sua origine** (`OrigineLine`: `qr`/`cronometro` →
  «Timbrata», `manuale` → «Inserita a mano · da {chi} · agg. {quando}», da
  `creato_da` e `created_at`) e la sua **bocca** (§1.2).
  Componente condiviso fra ufficio e cruscotto:
  `office/kantiere/_components/timbrature-riepilogo.tsx` (`TimbratureRiepilogo`,
  `OrigineLine`, `GiornataFlow`).
- ⚠️ **Il tempo di chi ha solo passato il badge**: le ore della colonna vengono
  dalle timbrature **sui cantieri**; chi ha solo timbrato al terminale non ne ha
  nessuna, e la riga diceva `0:00` a una persona presente da tre ore. Ora, a
  ore non ancora attribuite, scorre il **tempo di presenza** (`H:MM h`), in tono
  spento: viva se l'intervallo è aperto, **ferma sul netto** se è chiuso, e zero
  solo quando è davvero zero.
- **Sollecito**: sulle giornate timbrate da completare l'ufficio può chiedere
  alla persona di registrare le ore (conferma, poi l'avviso). Riusa
  `ore_da_inserire` con finestra `ufficio` (§6). ⚠️ Se non parte **si dice
  perché** (nessun accesso all'app, avviso disattivato).
- **Cruscotto mobile dell'ufficio** (`/mobile/kantiere/cruscotto`, gated
  admin/office): dashboard navigabile **per giorni** (`?giorno=YYYY-MM-DD`, mai
  il futuro), con le presenze del giorno espandibili (origine + viaggio).
- **Anomalie** non sta più nella barra laterale (la pagina resta raggiungibile
  dalla dashboard: ha festivi, fine settimana, straordinari).

### 13.2 «La mia giornata» da scrivania e «Compila giornata»

Chi gestisce le presenze da PC spesso timbra anche per sé, e doveva prendere il
telefono. L'header dell'ufficio ha una **pillola** con lo stato della giornata e
le scorciatoie, più un dialog da scrivania che fa quello che il telefono fa in
«Registra giornata» e nella scatola timbrata.

- **Lettura unica** `office/_lib/mia-giornata.ts` (`leggiMiaGiornata`): il turno
  aperto e **da dove è partito** (app, QR, terminale, ufficio), la giornata
  timbrata al terminale, i minuti già attribuiti, cantieri vivi, sedi, mezzi,
  impostazioni. Chi non ha una scheda dipendente non vede niente (Bertaiola
  invariata). Slot `headerExtra` in `OfficeShell` → `OfficeShellClient` →
  `office/layout.tsx`.
- **La pillola** (`office/_components/mia-giornata.tsx`): «Nessun turno» · «In
  turno · cantiere · HH:MM» (pallino che pulsa) · «In pausa» · «Timbrato · X da
  ripartire» · «In sede · badge HH:MM». Il menu offre Inizia giornata, Pausa
  pranzo, Riprendi, Chiudi il turno, Registra giornata, Inserisci le commesse.
  ⚠️ In pausa «Chiudi» è spento: la regola del server (`RIPRENDI_PRIMA`) si vede
  **prima** di sbatterci.
- **Un dialog, quattro modi**
  (`office/kantiere/_components/compila-giornata-dialog.tsx`): `registra` (la
  mia giornata di oggi), `registra_altro` (l'ufficio per un'altra persona, un
  giorno qualsiasi — `registraGiornataPerDipendente`, `modalita='ufficio'`,
  stesso scrittore `scriviGiornataRipartita`), `scatola` (la giornata timbrata,
  mia o di un altro), `chiusura` (chiudo adesso il turno, dividendo fra cantieri
  solo se la giornata è pulita).
  **Sinistra 2/3 si compila, destra 1/3 «Come verrà scritta»**: orari veri di
  ogni cantiere, pause, tratte, totali — con **gli stessi motori puri del
  server** (`calcolaSegmentiSplit`, `riempiScatola`), quindi l'anteprima è la
  verità, non una stima. ⚠️ La chiusura secca (una riga sola) non passa dal
  calcolo della divisione: un turno di un minuto si chiude lo stesso.
- **Dove si scrive l'ora di fine**:

  | modo | inizio | fine |
  |---|---|---|
  | Registra giornata (mia / per un altro) | editabile | **calcolata** da ore + pausa + tratte |
  | Scatola timbrata | dal badge | dal badge |
  | Chiusura turno | dall'ingresso | **editabile** (dal 26/10/2026) |

  ⚠️ In chiusura era inchiodata ad «adesso»: chi si dimenticava di chiudere e lo
  faceva la sera si vedeva scritta la giornata **fino alle 22**. Lì non c'è
  nessuna uscita timbrata da rispettare — è proprio il caso in cui manca —
  quindi l'ora si scrive; un orario prima dell'ingresso torna ad «adesso».
  ⚠️ In «Registra giornata» la fine resta **calcolata**: è la scelta del
  15/09/2026, due orari da far quadrare con le ore sotto «facevano casino».
- **«In sede» / «In cantiere» sempre a vista**, sul telefono e da scrivania, col
  default dalla scheda della persona (§3.3), passato come `invertito` al dialog.
  ⚠️ Il badge **non** inverte il flag: dice che la persona era in sede **agli estremi**, non dove ha lavorato
  in mezzo. ⚠️ Con un turno aperto dall'app l'andata non si richiede: l'ha
  scritta l'avvio del turno.
- In «Presenze e ore» il tasto principale è **«Compila giornata»** (chi e
  quando, poi il dialog grande); «Registra ore» resta la scorciatoia per le sole
  ore nude. ⚠️ `ripartisci-timbro-dialog.tsx` è stato **tolto**: era la seconda
  verità.
- ⚠️ `sede_lavoro_id` sta sull'ingresso di **apertura**: la ripresa dopo la
  pausa non lo ripete. Chi deduce «in sede» da un ingresso qualunque sbaglia
  dopo la prima pausa (trovato dal banco).
- ⚠️ `next.config.mjs` ha `removeConsole` (tiene solo `error` e `warn`): un
  `console.log` per capire cosa fa un layout **non stampa niente**, nemmeno in
  sviluppo.
- **Le card dei blocchi si trascinano** (sinistra e anteprima, stesso ordine).
  ⭐ La **linea di rilascio** dice da che parte finirà la card: scendendo
  **sotto** la riga puntata, salendo **sopra** — la direzione sta in
  `@kommessa/api/trascina-riordino`, pura, perché è la cosa che si inverte senza
  accorgersene. La card presa **si alza e segue il dito** (solo nella colonna di
  sinistra: alzando anche l'anteprima il trascinamento della **pausa** smette di
  funzionare, causa non ancora trovata). Dopo il rilascio la card si accende un
  attimo.
  ⚠️ Dove il rilascio non avverrebbe la linea **non si accende**: `spostaRiga`
  rifiuta una destinazione bloccata, e `spostaPausa` taglia al penultimo blocco
  (una pausa dopo l'ultimo starebbe a fine giornata). Prima quel taglio era
  muto: si trascinava la pausa in fondo e non succedeva niente.
- **Gli estremi del viaggio non sono blocchi di lavoro**: «↗ Si parte da» sta
  **sopra** l'elenco e «↙ Si rientra a» **sotto**, su una riga sola, col
  tratteggio sky delle tratte e un **punto** al posto della barra colorata
  (pieno si parte, vuoto si rientra). La giornata si legge dall'alto in basso.
- ⚠️ Le tinte dei blocchi devono **distinguersi**: tre toni su sei erano blu e i
  fondi stavano al 4-6% (cioè bianco). Qui il colore non decora: è l'identità
  della riga mentre la si trascina.
- Banchi: `giornata-scrivania.mjs`, `registra-giornata-desktop.mjs`,
  `presenza-sede.mjs`. ⚠️ Vogliono una **scheda dipendente in modalità ufficio**
  sull'account ufficio di DEMOC.

### 13.3 «Le mie ore» per chi sta in ufficio

Chi ha ruolo ufficio e timbra anche per sé trovava le proprie cose in tre posti
(pillola nell'header, pannelli «da sistemare» mischiati con gli altri, riga nella
tabella senza segno). Ora «Presenze e ore» ha **due zone con un titolo**: la card
**«Le mie ore»** in cima (solo per chi ha una scheda dipendente: stato di oggi
con i tasti, e le mie giornate da completare) e sotto **«Dipendenti»**. Le mie
righe restano nella tabella, marcate «tu», perché totali ed export non cambiano.
Chi non ha una scheda dipendente vede la pagina come prima.

- ⭐ La pillola è un **hook**, `useMiaGiornata`: restituisce `stato`, `corpo` (i
  tasti) e `dialoghi`. Card e pillola sono la **stessa logica e gli stessi
  dialog**, non una copia. ⚠️ I dialoghi vanno montati **fuori** dal menu che si
  smonta: nel menu stanno i tasti, non lo stato.
- ⚠️ Nella card il blocco «Oggi» parla di oggi (`timbroOggi`); la pillola mostra
  la giornata **più vecchia** da ripartire: due promemoria diversi per due posti
  diversi.

### 13.4 «Inizia giornata» anche su Cruscotto e Ore

Per un utente ufficio che timbra anche lui «Inizia giornata» stava solo nella tab
Cantieri, che non è la sua tab. Ora la stessa card sta **in cima al Cruscotto e
alla tab Ore**, e resta anche in Cantieri. Per i **tecnici non cambia niente**
(scelta di Luca).

- Lettura unica `mobile/kantiere/_lib/giornata-ufficio.ts`
  (`caricaGiornataUfficio`): torna `null` per i tecnici, per chi non ha una
  scheda dipendente e per chi lavora in modalità «esterno» (quelli hanno già la
  card del turno e «Inizia turno» in Cantieri). `HomeUfficio` ha la prop
  `compatto`.
- ⚠️ Dove c'è questa card, la card del turno di quelle pagine **non si mostra**:
  due «Fine turno» sulla stessa pagina chiuderebbero in due modi diversi.

---

## 14. I tecnici da computer: `/office/mio`

Un tecnico del mondo presenze che entra da PC vedeva la PWA del telefono
allargata. Luca: «una versione desktop semplice con layout riadattato, non il
mobile allargato». Ora entra nel guscio dell'ufficio (`OfficeShell`) con una
barra ridotta: **Oggi** · Il mio lavoro (Cantieri, Le mie ore, Le mie spese se
c'è Kontabilità, La mia settimana se la pianificazione è attiva) · Altro (Avvisi,
Profilo). Pagine sotto `apps/web/app/office/mio/`.

- ⭐ **Niente di nuovo nel motore**: la card «Le mie ore» e i dialog da scrivania
  (`compila-giornata-dialog` nei soli modi `registra` e `scatola`, senza
  `dipendenteId`) sono riusati; le azioni sono quelle *self*
  (`segnaPresenzaInSede`, `avviaTurnoMio`, `ripartisciGiornataTimbro`,
  `registraGiornataDaZero`), **mai** quelle «per un altro» dell'ufficio.
- ⚠️ **Il presidio è il layout, più il middleware per l'atterraggio**:
  `office/layout.tsx` lascia entrare un tecnico del mondo presenze SOLO in
  `/office/mio/**` e `/office/notifiche`, ogni altra `/office/...` rimbalza a
  `/office/mio` (via `x-percorso`); nel mondo commesse il tecnico resta su
  `/mobile`. `resolveOfficeLanding` (in `packages/api/src/server.ts`) legge anche
  il ruolo. Cancello password e
  impersonazione intatti. Tutte le query filtrano per la **scheda dipendente**
  della persona, mai per cliente.
- ⚠️ Dal PC non si attivano le push: su `/office` non c'è service worker, e il
  profilo rimanda all'app installata.
- **Aperto**: «Inizia giornata» dalla scheda cantiere porta a Oggi senza
  preselezionare il cantiere; il login da PC fa due salti (`/office` →
  `/office/mio`); le spese dal PC non hanno anteprima prima dell'invio.
  Banco `desktop-tecnico.mjs` (15 controlli).

---

## 15. «Auto personale» fra i mezzi (dal 24/10/2026)

Migration `20261024090000`. Chi va in cantiere con la propria auto lo può
dichiarare, e i chilometri restano tracciati per il rimborso.

- ⭐ **Non è un valore speciale: è una riga vera in `mezzi`**, una per cliente,
  con la colonna `personale` e la targa segnaposto `AUTO PERSONALE`. Così
  compare da sé in tutte e sei le tendine dei mezzi e
  `timbratura_viaggio.mezzo_id` la cita come qualunque altro mezzo: i km per
  persona si contano con le query di sempre, senza codice nuovo. L'alternativa
  (un valore sentinella da riconoscere ovunque) voleva sei modifiche e sei
  occasioni di sbagliare.
- ⚠️ **Non si rinomina e non si cancella**: `aggiornaMezzo` lascia passare solo
  l'interruttore, `eliminaMezzo` rifiuta. Indice unico parziale: una sola per
  cliente. Nei conteggi del **parco mezzi non entra** (non è un mezzo
  dell'azienda).
- A schermo si legge «Auto personale» e sta in fondo all'elenco:
  `@kommessa/api/mezzi` (`etichettaMezzo`, `etichettaMezzoEstesa`, `ordinaMezzi`,
  `eAutoPersonale`). La targa segnaposto è il riconoscimento di riserva, quindi
  le query che non leggono la colonna funzionano lo stesso.
- ⚠️ **Resta aperto**: la **tariffa** del rimborso al chilometro. Oggi i km ci
  sono (per persona e per tratta), ma nessuno li moltiplica per un importo.

---

## 16. Anagrafica: la data di nascita (dal 21/10/2026)

Migration `20261021090000`. La timbratrice **Timbro** fa gli auguri quando la
persona passa il badge: le serve leggere l'anagrafica del personale.

`dipendenti.data_nascita date`, nullable, esposta da `GET /api/v1/dipendenti`
come `dataNascita` (`AAAA-MM-GG`). Si compila in **Personale → Dipendenti** e si
vede nella colonna **Nascita** dell'elenco, che serve anche a vedere **chi
manca**.

- ⚠️ **È la prima colonna anagrafica di legge** su `dipendenti`: finora la
  tabella teneva solo ciò che serve ad attribuire ore e costi (niente codice
  fiscale, niente indirizzo, niente documenti). L'aggiunta è voluta e ha uno
  scopo dichiarato; chi ne aggiungerà altre sappia che **la linea è stata
  attraversata qui di proposito**, non per abitudine.
- ⚠️ **In aggiornamento si scrive solo se arriva** (`...(x !== undefined ? …)`),
  come già fa `costo_orario`: **la scheda della singola persona chiama la stessa
  azione senza quel campo**, e uno `?? null` cancellerebbe la data a ogni
  salvataggio da lì. Verificato cercando i chiamanti **prima** di scrivere.
- ⚠️ **La data si formatta spezzando la stringa, non con `new Date()`**:
  `new Date('1985-03-14')` è mezzanotte UTC e in un fuso a ovest diventa il 13.
  Qui non c'è nessun istante da convertire, solo tre numeri da riordinare.
- La colonna si chiama `data_nascita` e non `compleanno`: il compleanno è l'uso,
  la data è il fatto, e un nome che descrive l'uso invecchia male.
- ⚠️ Su `dipendenti` i privilegi sono di **tabella**: la colonna nasce leggibile
  da ogni utente autenticato del cliente. Per una data di nascita fra colleghi è
  una scelta accettata — **ma resta aperto** lo stesso rilievo sul
  `costo_orario`, che con quella RLS ogni tecnico può leggere.

---

## 17. Dettagli dell'app del tecnico

- **Avvio turno senza QR** (si sceglie un cantiere qualsiasi), **cambio cantiere
  live** (chiude A / apre B: ore dai timestamp reali, km A→B alla destinazione
  via provider del cliente, §3.1), **picker cantiere** riusabile
  (`mobile/kantiere/_components/cantiere-picker.tsx`), card turno con prop
  **`compatto`** (azioni orizzontali 33/33/33, usata sul cruscotto
  dell'ufficio), **«Cantieri di oggi»** in tab Ore, **«Modifica giornata»** con
  ore editabili (scrittura diretta + −/+ al passo). Azioni in
  `_actions/kantiere-timbra.ts` (`avviaTurnoMio`, `cambiaCantiereMio`,
  `elencoCantieriTurno`).
- **La ricerca dei cantieri è a TOKEN, cross-campo** (picker e tab Cantieri):
  `q.trim().toLowerCase().split(/\s+/)` e **ogni token** deve comparire in
  `[nome, codice_commessa, codice, cliente_nome, indirizzo, categoria].join(' ')`
  → «fincantieri monf» trova «Fincantieri … Monfalcone» anche con le parole in
  campi diversi. ⚠️ Non usare più il match su un campo solo.
- **La presenza in sede senza cantiere** (`segnaPresenzaInSede`): chi inizia «in
  sede» senza un progetto **non sceglie il cantiere**: la presenza va nel
  **registro** (`timbri_grezzi`, sorgente `app`, dispositivo `pc`), come un
  badge, e la giornata diventa una scatola da riempire alla fine con lo stesso
  flusso del terminale. ⭐ **Niente in `timbrature` finché non si attribuisce**:
  il gestionale vuole le ore per commessa, e così non può uscire niente di non
  attribuito. ⚠️ Il registro si legge **sempre**, con o senza Timbro: il
  collegamento decide cosa entra, non chi legge. ⚠️ Dopo un'uscita il registro
  non sa se è pausa o fine: la pillola dice «da ripartire» e offre «Riprendi».
  I due fogli di avvio hanno in fondo «Inizia senza cantiere»
  (`presenza-sede.tsx`), e la card `PresenzaSedeCard` nella home mostra pausa,
  ripresa, fine e «Inserisci le commesse». ⚠️ La card agisce **solo** su una
  presenza segnata dall'app o dal PC: col badge si chiude al terminale, o il
  registro si ritrova un'uscita in più. Banco `presenza-sede-mobile.mjs`.
- **Scanner QR su iPhone con la PWA installata**: niente stream live (limite
  WebKit). Si usa lo **scatto-foto** (`<input capture>` + decodifica) o la
  fotocamera nativa sul poster. ⚠️ **Android usa `BarcodeDetector` live: non
  toccare.**

---

## 18. Interfaccia

Le trappole di dialog, tendine, fogli e tasti **non stanno qui**: valgono per
tutta l'app (la tendina dentro un dialog ha morso anche il mondo commesse) e
stanno in `CLAUDE.md` → **Interfaccia**, che si carica a ogni conversazione.
Qui resta solo quello che è specifico delle presenze, dove serve.

---

## 19. Super admin: dove si guarda il mondo presenze

- **`/admin/kantiere`** — panoramica cross-cliente e **timbrature di tutti i
  clienti** con GPS, origine, chi ha timbrato, il viaggio e la sezione
  «Trasferimenti tra cantieri». `/admin/kantiere/kontabilita` fa lo stesso per
  le spese.
- **`/admin/accessi`** — accessi e uscite (tabella `auth_events`). Non è una
  cosa del mondo presenze, ma è lì che si guarda quando un tecnico dice «non
  riesco a entrare».
- **Tab Timbro** di `/admin/tenants/[id]` — stato del collegamento, token, data
  di partenza, webhook, abbinamento persone, giornate recenti
  (→ `Logiche_Integrazione_Timbro.md`).
- **Tab Viaggio** — il provider di stima **e** la configurazione Kantiere del
  cliente in **sola lettura**: si dà assistenza senza impersonare.
- **Tab Regole** — il censimento di tutte le regolette del mondo presenze con
  scritto **chi ha la chiave**: ufficio, super admin, scheda della persona, o
  nessuno perché sta nel codice. ⭐ Una regola «nel codice» diventa
  un'impostazione solo quando una riga di codice la legge.
- ⚠️ **`app_mode` e i moduli si tengono per mano**: `kantiere` e `full`
  pretendono il modulo attivo (guardia lato server), e **spegnere il modulo
  riporta il cliente a `kommessa` in cascata** — `getAppModeCached` ripiega da
  sé. Non esiste un cliente in modalità presenze senza il modulo presenze.

---

*Questo è **il** documento del mondo presenze. Chi cambia una logica la riflette
qui; in `CLAUDE.md` resta solo il blocco corto con il gating e il rimando.*

*Manuali vicini, che qui non si ripetono:
`Logiche_Integrazione_Timbro.md` (la timbratrice),
`Logiche_Export_Paghe.md` (il file per il consulente del lavoro),
`Logiche_Pianificazione.md` (settimana, ferie e permessi),
`Logiche_Upload_Media.md` (foto e allegati).*
