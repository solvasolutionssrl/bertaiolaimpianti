# API pubblica di Kommessa

**Contratto**: 2 · **Base**: `https://www.kommessa.it/api/v1` · **Aggiornato**: 13/08/2026

Questa è **l'API del prodotto**, non l'adattamento per un cliente. Espone le risorse di
Kommessa — ore, spese, viaggi, cantieri, dipendenti — a chiunque abbia un token: oggi un
agente che parla con un gestionale, domani un portale, un'app di terze parti, un altro
nostro servizio.

## I documenti

| File | A chi serve |
|---|---|
| **[Riferimento.md](Riferimento.md)** | a chi scrive un client: rotte, campi, esempi |
| **[Principi.md](Principi.md)** | a chi aggiunge o modifica una risorsa domani |
| **[Collegare_un_gestionale.md](Collegare_un_gestionale.md)** | a chi deve collegare un nuovo cliente |
| **[Anagrafiche.md](Anagrafiche.md)** | come si abbinano commesse, dipendenti e categorie — e chi decide |
| **[Scheda_API_Kommessa_v1.pdf](Scheda_API_Kommessa_v1.pdf)** | una pagina sola, tutti i campi |

## L'idea in due minuti

Kommessa **espone i dati completi e non decide cosa farne.**

Fino a poco fa era il contrario: Kommessa preparava una lista di operazioni già filtrate —
solo le ore approvate, solo i km dell'autista — e qualcun altro le eseguiva. Sembrava
disaccoppiato, non lo era: quei filtri sono politiche giuste per un cliente e arbitrarie
per il successivo, e ogni campo in più richiedeva di cambiare il codice di Kommessa.

Adesso ogni risorsa arriva **intera**, con il suo stato in chiaro. Chi la consuma sa cosa
farne, perché conosce il sistema di destinazione — che è esattamente la conoscenza che noi
non abbiamo e non vogliamo avere.

```
   rete del cliente (privata)                     internet
 ┌──────────────────────────────┐
 │   Gestionale (ERGO, …)       │
 │        ▲          │          │
 │  legge │          │ scrive   │
 │        │          ▼          │
 │       AGENTE                 │
 └────────────┬─────────────────┘
              │  HTTPS 443, sempre in uscita, token Bearer
              ▼
        API Kommessa /api/v1
```

Il collegamento lo fa una macchina **dentro la rete del cliente**, perché il suo gestionale
non è raggiungibile da fuori. Parla solo in uscita, come un browser: non c'è nessuna porta
da aprire nel firewall di nessuno.

## Le tre cose da sapere subito

**1. Il cliente sta nel token, non nell'indirizzo.** Nessuna chiamata prende un
identificativo di tenant. Se lo prendesse, un token rubato basterebbe a leggere i dati di
un altro cliente cambiando un numero nell'URL.

**2. Ogni record dice cosa è già uscito.** Il campo `esportazioni` elenca dove e quando quel
record è già finito su un sistema esterno. Serve perché molti gestionali non lasciano
rileggere quello che hanno ricevuto, e alcuni non lasciano cancellare: «l'ho già mandato?»
è la domanda più importante che ci sia, e non può avere come unica risposta il giornale
locale di una macchina che può morire.

**3. `inviabile` è una sicura, non un permesso.** In modalità `simulazione` vale `false` su
tutto: si può provare l'intera catena senza che una riga finisca davvero nel gestionale del
cliente. Si toglie una volta sola, quando il cliente ha visto.

## Stato

- ✅ Sei risorse in lettura, registro delle scritture, diario dei giri
- ✅ Paginazione a cursore e lettura incrementale su tutte
- ✅ Modalità simulazione attiva su FPM
- ⏳ Prima scrittura vera su un gestionale: mai provata end-to-end
- ⏳ Allarme automatico quando un collegamento resta silenzioso
