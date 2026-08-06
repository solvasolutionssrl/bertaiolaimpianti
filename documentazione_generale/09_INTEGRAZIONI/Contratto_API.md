# Contratto API per gli agenti di sincronizzazione

**Versione**: 1 (`contratto: 1`) · **Aggiornato**: 06/08/2026

Documento per chi scrive un **agente**: il programma che gira dentro la rete del cliente,
parla col suo gestionale e si sincronizza con Kommessa.

Base: **`https://www.kommessa.it/api/integrazione/v1`**

> Usa **questo** dominio, non `bertaiolaimpianti.vercel.app`. Sono lo stesso deployment —
> l'applicazione è multi-cliente e il cliente lo determina il token, non l'indirizzo — ma
> `bertaiolaimpianti.vercel.app` è il nome tecnico del progetto Vercel, nato dal cliente
> pilota. Se un domani il progetto viene rinominato, quell'indirizzo smette di funzionare e
> tutti gli agenti installati si rompono insieme. `www.kommessa.it` è il dominio del
> prodotto e resta stabile.

---

## Autenticazione

Header `Authorization: Bearer kmsa_…` su ogni chiamata. Il token:

- si crea dal pannello super admin, con permesso (**scope**) `integrazione`;
- vale per **un solo cliente** — il cliente non si passa mai come parametro, è nel token;
- si revoca in un istante (telefono/VM smarriti), e da quel momento ogni chiamata dà 401;
- in database è salvato solo come hash: se lo perdi non si recupera, se ne fa un altro.

Il token apre **solo** queste rotte. Non dà accesso a foto, commesse o al resto dell'app.

## Errori

Formato costante, per tutte le rotte:

```json
{ "errore": { "codice": "modulo_spento", "messaggio": "Il modulo di integrazione non è attivo…" } }
```

`codice` è per il programma, `messaggio` per l'umano che legge i log dell'agente.

| Codice | Cosa fare |
|---|---|
| `token_non_valido` (401) | fermarsi e avvisare: token sbagliato, revocato o senza permesso |
| `modulo_spento` (403) | fermarsi: non è un bug, l'ufficio ha spento l'integrazione |
| `sistema_non_configurato` (409) | fermarsi: manca `config.sistema` lato Kommessa |
| `lotto_troppo_grande` (413) | spezzare in più chiamate |
| `giro_gia_chiuso` (409) | ignorare: era già stato chiuso |
| `*_fallita` / `*_non_leggibile` (503) | problema temporaneo: ritentare più tardi |

---

## 1. `GET /configurazione`

Primo colpo di telefono. Chiedila **a ogni avvio**, non cablarne le risposte: è ciò che
permette di cambiare le regole senza rimettere mano agli agenti già installati.

```json
{
  "contratto": 1,
  "sistema": "ergo",
  "riferimentiRichiesti": {
    "minimi":      { "ore": ["dipendente","commessa"], "km": ["commessa"], "spesa": ["commessa"] },
    "aggiuntivi":  { "km": ["cliente"], "spesa": ["cliente"] }
  },
  "maxDescrizione": 100,
  "vocabolari": {
    "tipi": ["ore","km","spesa"],
    "causaliOre": ["ordinario","straordinario","viaggio","sabato","notturno","trasferta","formazione","permesso","malattia"],
    "categorieSpesa": ["ristorante","albergo","carburante","altro"],
    "ruoliViaggio": ["autista","passeggero"],
    "entitaLettura": ["commessa","cliente","dipendente"]
  }
}
```

> I vocabolari sono **chiusi**. Se incontri un valore che non c'è, stai parlando con una
> versione di Kommessa più nuova della tua: **fermati e segnala**, non inventare una
> traduzione. Un valore tradotto a caso finisce sul gestionale e non si cancella.

## 2. `POST /lavori`

```jsonc
{ "limite": 50 }   // opzionale, default 50, massimo 200
```

Prende il prossimo lotto **e lo mette in carico** (`in_corso`) nello stesso colpo.

> **Perché POST e non GET**, anche se sembra una lettura: per specifica HTTP la GET è
> idempotente, quindi client, proxy e bilanciatori la **ritentano da soli** dopo un timeout.
> Il server prende in carico 50 righe, la risposta si perde, il client ritenta, il server ne
> prende altre 50 — e le prime 50 restano orfane in `in_corso`. Con la POST il buco è chiuso
> per costruzione, per tutti gli agenti presenti e futuri.

```json
{
  "contratto": 1,
  "lavori": [
    {
      "id": "uuid",
      "tipo": "ore",
      "payload": { "…": "vedi sotto" },
      "idempotencyKey": "ore:rapportino_righe:<uuid>:straordinario",
      "tentativi": 0,
      "origine": { "tipo": "rapportino_righe", "id": "uuid" }
    }
  ]
}
```

`tentativi` alto = ci abbiamo già provato più volte. Conviene rallentare invece di
martellare un gestionale che sta rifiutando.

> **Attenzione**: chiamare `/lavori` prende in carico le righe. Se poi l'agente muore senza
> mandare l'esito, quelle restano `in_corso` e non ricompaiono da sole. È voluto: preferiamo
> una riga ferma da sbloccare a mano che una scritta due volte sul gestionale.

### I payload

Tutti hanno `data` (giorno di competenza, `YYYY-MM-DD`, **mai** un orario), `descrizione`
e `rif`.

```jsonc
{ "tipo": "ore", "data": "2026-08-03", "durataMin": 450, "causale": "straordinario",
  "descrizione": "Straordinario · 7:30 · Rossi Mario · Fincantieri Monfalcone",
  "rif": { "dipendente": "4", "commessa": "26087" } }

{ "tipo": "km", "data": "2026-08-03", "km": 50, "ruolo": "autista",
  "descrizione": "Viaggio 03/08/2026 · Rossi Mario (autista) · Sede Verona → Fincantieri Monfalcone · 50 km",
  "rif": { "commessa": "26087", "cliente": "70796" } }

{ "tipo": "spesa", "data": "2026-08-03", "categoria": "albergo", "importoEur": 45.00,
  "descrizione": "Pernottamento 03/08/2026 · Hotel Centrale · Rossi Mario · Fincantieri Monfalcone",
  "rif": { "commessa": "26087", "cliente": "70796" } }
```

**`rif`** contiene già gli identificativi **del gestionale**, non i nostri: usali così come
sono. Se una mappatura manca, l'operazione non viene nemmeno accodata.

**`rif.commessa`** è l'unità di lavoro su cui si imputano ore e costi. Si chiama così perché
è neutra: da noi può essere un cantiere o una commessa a seconda del cliente, ma tu ricevi
un identificativo già risolto e non devi conoscere la differenza.

**`descrizione`** è un testo **già composto e già entro il limite**: passalo tal quale. Su
molti gestionali è l'unico posto dove entra il contesto (su ERGO il documento di trasporto
non ha un campo dipendente, quindi persona e ruolo stanno lì dentro). Il formato è
convenzionato — segmenti separati da ` · ` — perché in ufficio si capisca a colpo d'occhio
a chi si riferisce una riga. **Non riscriverlo e non ritagliarlo**: sarebbe tagliato due
volte.

**Ore**: solo la durata, mai l'orario di inizio e fine. Il cliente ha confermato che al
gestionale serve *quante* ore, non *quando*.

**Granularità**: una riga per commessa, non per giornata. Una giornata divisa su tre
cantieri produce tre operazioni. E ogni causale è un'operazione a sé — ordinarie,
straordinarie e viaggio non vanno sommate.

## 3. `POST /esiti`

```jsonc
{ "esiti": [
  { "id": "uuid", "stato": "inviato", "esitoEsterno": { "docId": 737, "serie": 4 } },
  { "id": "uuid", "stato": "errore",  "errore": "Articolo FPM0014 non trovato" }
] }
```

Risposta: `{ "contratto": 1, "applicati": 8, "ignorati": 2, "nonTrovati": [] }`

- `esitoEsterno`: **mandalo sempre**, con qualunque identificativo il gestionale
  restituisca. È l'unica traccia di cosa è stato scritto: lì non si può rileggere.
- `errore`: un messaggio che un impiegato possa capire. Niente stack trace.
- `ignorati` alto = stai ripetendo lavoro già chiuso. Una riga già `inviato` **non si
  riapre mai**: ripetere l'esito è innocuo, ma vale la pena capire perché succede.

## 4. `POST /letture`

```jsonc
{ "entita": "commessa",
  "record": [ {
    "externalId": "26087",              // obbligatorio — identificativo sul gestionale
    "nome": "FINCANTIERI SPA - MONFALCONE",  // obbligatorio — cio' che l'ufficio legge
    "codice": "26087",                  // codice leggibile; se l'id FA da codice, ripetilo
    "clienteExternalId": "70796",       // committente: i documenti km/spese lo pretendono
    "attiva": true,                     // false = chiusa / non piu' in forza
    "dati": { "…": "risposta grezza, come allegato" }
  } ] }
```

Max 1000 record per chiamata.

> **I campi sono in lingua canonica, e la traduzione la fai tu.** Kommessa non prova a
> indovinare dove sia il nome o il codice nella risposta del tuo gestionale: la lista delle
> chiavi da tentare si allungherebbe a ogni cliente nuovo, e sarebbe dialetto del tuo ERP
> dentro il nostro codice. Tu il gestionale lo conosci, noi no.
>
> - **`nome`** e **`externalId`** sono obbligatori: senza, il record viene scartato.
> - **`codice`**: se sul tuo gestionale l'identificativo funge anche da codice (è il caso di
>   ERGO, dove l'`objectId` è il numero che l'ufficio trascrive), **ripeti lì l'externalId**.
>   È il segnale più forte per l'abbinamento automatico.
> - **`clienteExternalId`**: l'`externalId` del cliente, non il suo nome. Serve perché molti
>   gestionali pretendono il committente sui documenti di km e spese, e questo è l'unico
>   punto in cui possiamo saperlo.
> - **`attiva`**: guida i default — un dipendente non più in forza nasce disattivato.
> - **`dati`**: la risposta grezza, come allegato. Non viene interpretata.

I dati atterrano in un'area di sosta e **non toccano** le tabelle vere: un gestionale che
risponde a metà non deve poter corrompere i cantieri di produzione.

## 5. `POST /esecuzioni`

Il diario. Apri **prima** di iniziare, chiudi alla fine.

```jsonc
{ "azione": "apri", "direzione": "scrittura", "avvio": "schedulato" }   // → { "id": "uuid" }
{ "azione": "chiudi", "id": "uuid", "esito": "parziale",
  "letti": 0, "scritti": 8, "errori": 2, "messaggio": "2 articoli non trovati" }
```

`esito` ∈ `ok` | `parziale` | `errore`. **`parziale` è il caso normale** (otto passate, due
in errore): non scegliere fra "tutto bene" e "disastro".

Aprire prima di lavorare non è formalità: un giro aperto e mai chiuso è il segnale che
l'agente è morto a metà, ed è l'unico modo per accorgersene.

---

## Il ciclo completo di un giro

```
GET  /configurazione                       (all'avvio)
POST /esecuzioni  {apri, scrittura}        → idGiro
POST /lavori      {limite: 50}         ← POST, non GET: vedi §2
     → per ciascuno: traduci e scrivi sul gestionale
POST /esiti       {esiti:[…]}
POST /esecuzioni  {chiudi, idGiro, esito, conteggi}
```

E per la lettura, lo stesso con `direzione: "lettura"` e `POST /letture` nel mezzo.

## Il giornale locale — pattern raccomandato per ogni agente

Il contratto accetta che, se l'agente muore **fra** la scrittura sul gestionale e
`POST /esiti`, la riga resti bloccata in `in_corso`. La priorità è giusta — meglio ferma che
scritta due volte — ma quel caso si può ridurre quasi a zero, e ogni agente dovrebbe farlo:

1. **prima** di chiamare il gestionale, scrivi l'intenzione su un giornale locale
   (append-only, con `fsync`);
2. aggiorna la riga del giornale con la risposta del gestionale;
3. al riavvio, rispedisci gli esiti mai confermati. Ripetere un esito è **innocuo** — finisce
   in `ignorati` — quindi il recupero non ha controindicazioni.

Così l'unico caso che richiede intervento umano diventa il disco morto.

Serve anche a una seconda cosa, altrettanto importante: siccome sul gestionale **non si
rilegge**, quel giornale è l'unico posto al mondo dove è scritto cosa è stato effettivamente
mandato, se la comunicazione col cloud si interrompe.

## Cosa non può fare un agente

Per costruzione, non per buona volontà:

- **non può mettere lavoro in coda**: potrebbe farsi scrivere qualunque cosa sul gestionale;
- **non può riaprire un'operazione già inviata**;
- **non può leggere niente di Kommessa** oltre a queste rotte: né commesse, né foto, né altri clienti;
- **non sa nulla degli altri clienti**: il token è legato a uno solo.
