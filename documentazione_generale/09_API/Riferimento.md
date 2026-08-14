# Riferimento — API Kommessa

**Contratto**: 2 · **Base**: `https://www.kommessa.it/api/v1`

> Usa **questo** dominio, non `bertaiolaimpianti.vercel.app`: stesso deployment, ma
> quello è il nome tecnico del progetto e se un giorno viene rinominato si rompono
> insieme tutti i client installati.

---

## La convenzione sui nomi

**I campi che iniziano con `external` contengono dati del GESTIONALE. Senza prefisso sono
dati di Kommessa.** Il prefisso sta sempre in testa.

Vale per identificativi, codici e riferimenti — non per gli attributi descrittivi
(`nome`, `categoria`, `attiva`), altrimenti ce l'avrebbero tutti e smetterebbe di dire
qualcosa.

| | |
|---|---|
| `codiceCommessa` | il nostro, progressivo (`CAN-00190`) |
| `externalCodiceCommessa` | quello del gestionale (`26084`) |
| `matricola` | la nostra (`00019`) |
| `externalCodiceDipendente` | quella del gestionale |

> **Perché esiste questa regola.** Fino al contratto 1 `codice` significava il *nostro* in
> uscita da `/cantieri` e il *loro* in entrata su `/letture`. Un client che rileggeva e
> riscriveva li invertiva senza che niente desse errore, e le ore finivano sulla commessa
> di un altro. `/info` la dichiara a runtime in `convenzioneNomi`.

---

## Autenticazione

Header `Authorization: Bearer kmsa_…` su ogni chiamata.

Il token si crea dal pannello super admin (`/admin/token-app`) con permesso
**`integrazione`**. Vale per **un solo cliente**, che non si passa mai come parametro: sta
dentro il token. Si revoca in un istante e da quel momento ogni chiamata risponde 401. In
database è salvato solo come impronta: se lo perdi non si recupera, se ne fa un altro.

## Formato delle risposte

Ogni elenco:

```json
{
  "contratto": 2,
  "dati": [ … ],
  "paginazione": { "prossimo": "eyJ0Ijoi…", "altriRisultati": true }
}
```

Ogni errore:

```json
{ "errore": { "codice": "modulo_spento", "messaggio": "…" } }
```

`codice` è per il programma, `messaggio` per l'umano che legge i log.

| Codice | Cosa fare |
|---|---|
| `token_non_valido` (401) | fermarsi: token sbagliato, revocato o senza permesso |
| `modulo_spento` (403) | fermarsi: non è un guasto, l'ufficio ha spento l'integrazione |
| `sistema_non_configurato` (409) | fermarsi: manca il sistema di destinazione |
| `cursore_non_valido` (400) | ripartire senza cursore |
| `lotto_troppo_grande` (413) | spezzare in più chiamate |
| `*_fallita` (503) | temporaneo: ritentare più tardi |

## Parametri comuni a tutti gli elenchi

| Parametro | Cosa fa |
|---|---|
| `limite` | quanti record (default 200, massimo 1000) |
| `cursore` | riprende da dove si era arrivati. Opaco: si rimanda e basta |
| `modificatoDopo` | solo i record toccati dopo questo istante (ISO 8601) |
| `dal` / `al` | filtro sul giorno di competenza (`YYYY-MM-DD`) |

**Il giro tipico.** La prima volta senza parametri, seguendo `paginazione.prossimo` finché
non è `null`. Poi si tiene da parte il `modificatoAl` più alto visto, e al giro successivo
si riparte con `?modificatoDopo=<quello>`: scendono solo le novità.

> Il cursore contiene `(istante, id)`, non solo l'istante. Con il solo istante, dieci
> record modificati nello stesso centesimo di secondo a cavallo di due pagine verrebbero
> in parte persi e in parte ripetuti.

---

## `GET /info`

Il primo colpo di telefono: per chi lavoro, cosa posso chiedere, posso portare fuori
qualcosa. **Interrogalo a ogni avvio e non cablare le risposte** — è ciò che permette di
cambiare una regola senza rimettere mano ai client già installati.

```json
{
  "contratto": 2, "prodotto": "Kommessa",
  "tenantId": "…", "sistema": "ergo",
  "modalita": "simulazione", "collaudoEsterni": ["26087"],
  "risorse": {
    "lettura": ["ore","spese","viaggi","cantieri","dipendenti"],
    "scrittura": ["scritture","letture","esecuzioni"]
  },
  "paginazione": { "limiteDefault": 200, "limiteMax": 1000 },
  "regole": { "kmSoloAutista": true },
  "convenzioneNomi": { "prefissoEsterno": "external", "regola": "…" },
  "vocabolari": { … }
}
```

I vocabolari sono **chiusi**: se compare un valore che non c'è, stai parlando con una
versione più nuova di Kommessa. Fermati e segnala, non inventare una traduzione — finisce
su un sistema dove magari non si cancella.

---

## `GET /ore`

Le ore lavorate, **una riga per giornata e per cantiere**.

```jsonc
{
  "id": "uuid", "risorsa": "ore", "data": "2026-08-03",
  "dipendente": {
    "id": "uuid", "nome": "Mario", "cognome": "Rossi",
    "nomeCompleto": "Rossi Mario", "mansione": "Elettricista",
    "matricola": "00019", "inForza": true, "externalId": "4"
  },
  "commessa": {
    "id": "uuid", "entita": "cantiere",
    "externalId": "26087", "externalClienteId": "70796"
  },
  "ore":    { "ordinarie": 8, "straordinarie": 1.5, "viaggio": 0.5, "totale": 10 },
  "minuti": { "ordinarie": 480, "straordinarie": 90, "viaggio": 30 },
  "durataLeggibile": "10:00",
  "note": "montaggio quadro",
  "giornata": {
    "id": "uuid", "stato": "approvato", "approvata": true,
    "approvataAl": "…", "inviataAl": "…", "note": null
  },
  "modificatoAl": "2026-08-03T17:20:11Z",
  "inviabile": false,
  "esportazioni": []
}
```

**Le tre quote non si sommano mai.** Su quasi ogni gestionale ordinarie, straordinarie e
viaggio sono causali diverse. Chi le vuole insieme le somma; chi ha sommato non può più
separarle.

**Arrivano anche le giornate non approvate**, con `giornata.stato` in chiaro. Decidere se
mandarle è una politica, e le politiche stanno da chi conosce il sistema di destinazione.

## `GET /spese`

```jsonc
{
  "id": "uuid", "risorsa": "spese", "data": "2026-08-03",
  "categoria": "hotel", "categoriaCanonica": "albergo",
  "fornitore": "Hotel Centrale", "partitaIva": "…",
  "indirizzoEsercente": "…", "numeroDocumento": "…",
  "importo": { "totale": 45, "iva": 4.09, "imponibile": 40.91, "valuta": "EUR" },
  "metodoPagamento": "carta", "rimborsabile": true, "numeroPersone": 2,
  "dipendente": { … }, "commessa": { … },
  "stato": "confermata", "confermata": true,
  "analisi": { "conclusaAl": "…", "errore": null },
  "haFoto": true, "posizione": { "lat": 45.4, "lng": 10.9 },
  "registratoAl": "…", "modificatoAl": "…",
  "inviabile": false, "esportazioni": []
}
```

`categoria` è la nostra, fine (`hotel`, `bar`, `trasporti`…); `categoriaCanonica` è
l'accorpamento contabile. Scegli il livello di dettaglio che il tuo sistema regge, invece
di doverlo ricostruire.

Arrivano anche le **bozze** — spese ancora in revisione o in analisi automatica. Una
bozza può essere **incompleta**: se l'analisi della foto è fallita, `importo.totale`,
`data` e `fornitore` sono `null` e `analisi.errore` dice perché. Scrivere una riga così su
un gestionale contabile non ha senso: **controlla `confermata` prima di portarla fuori.**
Non lo decidiamo noi al posto tuo — `inviabile` risponde a un'altra domanda, cioè se la
sicura di collaudo ti autorizza, non se il record è pronto.

## `GET /viaggi`

```jsonc
{
  "id": "uuid", "risorsa": "viaggi", "data": "2026-08-03", "direzione": "andata",
  "dipendente": { … },
  "ruolo": "autista",
  "partenza": { "tipo": "sede", "id": "uuid", "nome": "Sede Verona", "indirizzo": "…" },
  "arrivo":   { "id": "uuid", "nome": "Fincantieri Monfalcone", "codiceCommessa": "CAN-00042",
                "externalId": "26087" },
  "commessa": { … },
  "km": 50, "kmTratta": 50,
  "tempo": { "stimatoMin": 62, "confermatoMin": 60, "confermatoLeggibile": "1:00" },
  "mezzo": { "id": "uuid", "targa": "AB123CD", "modello": "Ducato" },
  "giustificazione": null, "timbraturaId": "uuid",
  "registratoAl": "…", "modificatoAl": "…",
  "inviabile": false, "esportazioni": []
}
```

**Arrivano anche i passeggeri** (`ruolo: "passeggero"`): servono a sapere chi c'era su
quale mezzo.

> ⚠️ **`km` e `kmTratta` sono due numeri diversi.** `kmTratta` è quanto è lunga la tratta:
> un fatto, sempre presente. **`km` è quanto conta per questo cliente**, ed è una decisione
> di Kommessa — come `inviabile`.
>
> Con la regola normale (`regole.kmSoloAutista` in `GET /info`, attiva per impostazione
> predefinita) sui passeggeri **`km` arriva `null`**: i chilometri sono del mezzo, quindi di
> chi guida, e attribuirli a tutti i presenti li conterebbe una volta per testa — un
> viaggio con tre persone a bordo farebbe risultare al cantiere il triplo dei chilometri
> veri. Il **tempo** invece resta di tutti: sono ore in cui nessuno poteva fare altro.
>
> Usa `km`. `kmTratta` serve per i controlli, non per pagare.

La `partenza` può essere una **sede** o un **altro cantiere** (spostamenti nella stessa
giornata): `tipo` dice quale. I km si imputano sempre alla **destinazione**.

`tempo.confermatoMin = 0` significa tratta registrata ma non pagata.

## `GET /cantieri`

```jsonc
{
  "id": "uuid", "risorsa": "cantieri",
  "codiceCommessa": "CAN-00190", "externalCodiceCommessa": "26084",
  "nome": "…", "clienteNome": "…", "categoria": "…", "stato": "…",
  "indirizzo": { "testo": "…", "lat": 45.4, "lng": 10.9, "daVerificare": false },
  "sedePartenza": "…", "note": null,
  "externalId": "26084", "externalClienteId": "70796", "collegato": true,
  "registratoAl": "…", "modificatoAl": "…"
}
```

> ⚠️ **Due codici, e il prefisso è lì apposta.** `codiceCommessa` è il NOSTRO
> (`CAN-00190`), `externalCodiceCommessa` è quello del gestionale (`26084`). Scambiarli
> scrive nella numerazione sbagliata, e non dà nessun segnale finché i conti non tornano.

## `GET /dipendenti`

```jsonc
{
  "id": "uuid", "risorsa": "dipendenti",
  "nome": "Mario", "cognome": "Rossi", "nomeCompleto": "Rossi Mario",
  "mansione": "Elettricista", "matricola": "00019",
  "inForza": true, "aTurni": false, "costoOrario": 24.5,
  "note": null, "haAccessoApp": true,
  "externalId": "4", "collegato": true,
  "registratoAl": "…", "modificatoAl": "…"
}
```

Arrivano anche i **non più in forza** (`inForza: false`): le loro ore storiche esistono e
vanno attribuite a qualcuno.

`costoOrario` c'è perché questa API espone i dati completi, ma è sensibile: chi emette un
token sappia che lo sta concedendo.

---

## `POST /scritture` — l'ACK

Annuncia cosa è finito sul sistema esterno. **Da chiamare sempre**, anche in caso di
errore.

```jsonc
{ "scritture": [
  { "risorsa": "ore", "risorsaId": "uuid", "variante": "straordinario",
    "esito": "ok",
    "scrittoAl": "2026-08-11T09:14:22Z",
    "externalRiferimento": { "docId": 737, "serie": 4 } },
  { "risorsa": "spese", "risorsaId": "uuid",
    "esito": "errore", "errore": "Articolo non trovato" }
] }
```

Risposta: `{ "contratto": 2, "registrate": 2, "scartate": [] }`

- **`variante`** distingue più scritture nate dallo stesso record: una riga di ore produce
  ordinarie, straordinarie e viaggio, che sul gestionale sono registrazioni separate.
  Vuota se non serve.
- **`scrittoAl`** è quando è finito *davvero* sul gestionale, non quando lo stai
  annunciando. Se ometti, vale adesso. Lo scarto fra i due tempi è ciò che ci dice quanto
  ritardo sta accumulando il collegamento.
- **`externalRiferimento`**: qualunque identificativo il sistema restituisca. È l'unica
  traccia, se lì non si rilegge.
- **Riannunciare la stessa scrittura è innocuo**: la chiave è
  `(risorsa, risorsaId, variante)` e non crea doppioni. Un agente che riparte dopo un
  guasto può ripetere gli annunci senza pensarci.

`GET /scritture` rilegge il registro (`?risorsa=ore`, `modificatoDopo`, `cursore`).

## `POST /letture` — anagrafiche dal sistema esterno

Deposita quello che hai letto dal tuo gestionale, **in lingua canonica**.

```jsonc
{ "entita": "commessa",
  "record": [{
    "externalId": "26087",                     // obbligatorio — la tua chiave primaria
    "nome": "SOLVA SOLUTIONS - cantiere TEST", // obbligatorio
    "externalCodiceCommessa": "26087",  // se l'id fa da codice, ripetilo qui
    "externalClienteId": "70796",
    "clienteNome": "SOLVA SOLUTIONS S.R.L.",
    "categoria": "QUADRI",
    "indirizzo": "VIA CASELLE, 9, 37066 SOMMACAMPAGNA",
    "attiva": true,
    "dati": { "…": "risposta grezza, come allegato" }
  }] }
```

Massimo 1000 record. `entita` ∈ `commessa` | `cliente` | `dipendente`. Solo `externalId` e
`nome` sono obbligatori: **se il tuo gestionale non ha gli altri, ometti e basta.**

| Campo | Note |
|---|---|
| `externalCodiceCommessa` | codice leggibile della commessa **da voi** |
| `externalCodiceDipendente` | per `entita: "dipendente"` — vedi l'avvertenza sotto |
| `externalClienteId` | committente, se il vostro modello ce l'ha |
| `clienteNome` | mandalo se non depositi anche le anagrafiche cliente: senza, l'ufficio abbina alla cieca |
| `categoria` | gruppo / tipo di lavoro |
| `indirizzo` | **una riga sola, già composta** |
| `attiva` | `false` = chiusa / non più in forza |

**L'indirizzo lo componi tu.** Se il tuo gestionale lo tiene a pezzi (via / cap / comune),
ricomporli è compito del client: accettare la tua forma vorrebbe dire farci entrare in casa
il tuo dialetto, e il prossimo gestionale chiamerà quei pezzi in un altro modo ancora.

**Manda anche le chiuse** (`attiva: false`). Senza, non possiamo distinguere «chiusa» da
«sparita», e l'anagrafica perde per strada i lavori vecchi su cui ci sono ancora ore da
leggere.

> ⚠️ **`externalCodiceDipendente` non è la nostra matricola.** Le nostre sono `00001`,
> `00002`, `00019`, e un confronto morbido ignora gli zeri iniziali: su un caso reale
> avrebbe prodotto **33 accoppiamenti falsi su 35**, cioè ore sulla busta paga sbagliata.
> Il campo si confronta solo per uguaglianza esatta.

**La traduzione la fai tu.** Kommessa non prova a indovinare dove sia il nome nella
risposta del tuo gestionale: la lista delle chiavi da tentare si allungherebbe a ogni
cliente nuovo. Tu il gestionale lo conosci, noi no.

I dati atterrano in un'area di sosta e **non toccano** le tabelle di produzione: un
gestionale che risponde a metà non deve poter corrompere i cantieri veri.

## `POST /esecuzioni` — il diario

```jsonc
{ "azione": "apri", "direzione": "lettura", "avvio": "schedulato" }  // → { "id": "uuid" }
{ "azione": "chiudi", "id": "uuid", "esito": "parziale",
  "letti": 1094, "scritti": 0, "errori": 0, "messaggio": "…" }
```

Apri **prima** di lavorare: un giro aperto e mai chiuso è il segnale che il client è morto
a metà, ed è l'unico modo per accorgersene. `esito` ∈ `ok` | `parziale` | `errore`, e
`parziale` è il caso normale.

---

## Il giro tipico di un client

```
GET  /info                                    all'avvio
POST /esecuzioni  {apri, lettura}             → idGiro
GET  /ore?modificatoDopo=<ultimo>             seguendo il cursore
     → per ciascuno: se inviabile ed esportazioni non copre già quel che ti serve,
       traduci e scrivi sul tuo sistema
POST /scritture   {scritture:[…]}
POST /esecuzioni  {chiudi, idGiro, esito, conteggi}
```

## Cosa un token `integrazione` NON può fare

- non legge foto, documenti o allegati;
- non modifica nulla in Kommessa: le uniche scritture sono il registro, le anagrafiche in
  area di sosta e il diario;
- non vede altri clienti: il token ne apre uno solo.
