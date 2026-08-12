# Collegare un cliente a un gestionale

**Aggiornato**: 12/08/2026

Fra un anno arriva un cliente con TeamSystem, o Zucchetti, o qualcosa di cui non abbiamo
mai sentito parlare. Questa è la procedura.

La domanda a cui rispondere è una sola: **quanto codice di Kommessa devo toccare?**
Risposta: **nessuno.**

---

## 1. Prima di dare una data: le cinque domande al fornitore

Le risposte cambiano il preventivo, non i dettagli.

1. **Esiste un'API?** Se l'unico accesso è il database, è un altro lavoro — più fragile e
   più rischioso, perché si scrive dentro le tabelle di un ERP scavalcando le sue regole.
2. **Si può rileggere quello che si scrive?** Se sì tutto diventa più semplice. Se no, vale
   la regola dura: si manda solo ciò che è definitivo, e le correzioni si fanno a mano.
3. **Si può cancellare o modificare?** Idem. E attenzione: «lo schema prevede una DELETE»
   non è un sì. Vale solo una chiamata riuscita.
4. **Esiste un ambiente di prova**, o si lavora solo in produzione?
5. **C'è un identificativo stabile** per commesse, clienti e dipendenti?

## 2. Lato Kommessa: tre passi

**Accendere il modulo.** Dal pannello super admin, per quel cliente, modulo `integrazione`
attivo con:

```json
{ "sistema": "teamsystem", "modalita": "simulazione", "collaudo_esterni": [] }
```

**`simulazione` è il valore con cui si parte, sempre.** Si legge tutto ma ogni record arriva
con `inviabile: false`: il client può provare l'intera catena — traduzione, paginazione,
ripresa dopo un guasto — senza che una riga finisca nel gestionale del cliente.

**Emettere il token.** `/admin/token-app`, permesso `integrazione`. Si vede una volta sola.
Un token di integrazione non ha una persona intestataria: chi chiama è una macchina, e
attribuirla a un dipendente metterebbe un dato falso nel registro delle azioni.

**Collegare le anagrafiche.** Il client fa una lettura in sola lettura e deposita le
anagrafiche del gestionale con `POST /letture`. Poi da `/office/integrazione` l'ufficio
abbina i propri cantieri a quelli del gestionale. **Questo passo si rivede a mano**: è
quello in cui si sbaglia, e sbagliarlo manda le ore sulla commessa di un altro.

## 3. La prova col cliente

Si mette **un solo identificativo** in `collaudo_esterni` — il cantiere di prova — e si
lascia tutto il resto in simulazione. Quel cantiere diventa `inviabile: true`, gli altri no.

Si scrive **una riga sola**, si guarda il gestionale insieme al cliente, e solo dopo si
passa a `modalita: "attiva"`. Le cose che non tornano indietro si provano una alla volta.

## 4. Cosa scrive chi costruisce il client

Tutto il gestionale-specifico. Legge le risorse da `/api/v1`, decide cosa gli serve,
traduce nel dialetto del suo ERP, scrive, e annuncia con `POST /scritture`.

Il documento da consegnargli è **[Riferimento.md](Riferimento.md)**: è autosufficiente, non
serve dargli accesso al nostro codice.

**Un consiglio da mettere nel contratto con chi lo scrive**: un giornale locale
append-only, scritto *prima* di chiamare il gestionale e aggiornato con la risposta. Al
riavvio rispedisce gli annunci mai confermati — e riannunciare è innocuo per costruzione.
Così l'unico caso che richiede un intervento umano diventa il disco morto.

## 5. Quando invece bisogna toccare Kommessa

Solo per **aggiungere**, mai per adattare:

| Situazione | Cosa si fa |
|---|---|
| Serve una risorsa che non esponiamo (mezzi, presenze…) | si aggiunge un endpoint seguendo [Principi.md](Principi.md) |
| Serve un attributo che non mandiamo | si aggiunge al record: è compatibile all'indietro |
| Il gestionale vuole i dati in un altro formato | **niente**: la conversione sta nel client |
| Il gestionale ha regole sue su cosa accettare | **niente**: sono politiche, stanno nel client |

> Se ti ritrovi a scrivere `if (sistema === '…')` dentro Kommessa, fermati. È la riga che,
> ripetuta dieci volte, trasforma il prodotto in dieci progetti su misura.

## 6. Il costo, onestamente

Si rifà ogni volta **il client**: leggere le risorse, tradurre, gestire gli errori del
gestionale. È il grosso, e non si può evitare — ogni ERP è diverso.

Non si rifà: l'API, la paginazione, la lettura incrementale, il registro delle scritture,
le anagrafiche e l'abbinamento, il diario, i token, le pagine d'ufficio e di piattaforma.
Che è esattamente la parte che costa di più a farla bene la prima volta.
