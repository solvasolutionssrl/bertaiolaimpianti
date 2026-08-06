# Aggiungere un cliente con un nuovo gestionale

**Aggiornato**: 06/08/2026

Il caso: fra un anno arriva un cliente che usa TeamSystem, o Zucchetti, o un gestionale di
cui non abbiamo mai sentito parlare. Questa è la procedura.

La domanda a cui questo documento risponde è una sola: **quanto codice di Kommessa devo
toccare?** Risposta: **nessuno**, se il gestionale rientra nei casi previsti.

---

## 1. Prima di promettere qualcosa: le cinque domande al fornitore

Da fare **prima** di dare una data al cliente. Le risposte cambiano il preventivo, non i
dettagli.

1. **Esiste un'API?** Se l'unico accesso è il database, è un altro lavoro (più fragile e
   più rischioso: si scrive dentro le tabelle di un ERP senza passare dalle sue regole).
2. **Si può rileggere quello che si scrive?** Se sì, tutto diventa più semplice: si può
   riconciliare e correggere. Se no (come ERGO), vale la regola dura: si manda solo
   l'approvato, e le correzioni si fanno a mano.
3. **Si può cancellare o modificare un record scritto?** Stessa cosa.
4. **Esiste un ambiente di prova**, o si lavora solo in produzione? Se solo produzione,
   serve una prova pilota concordata col cliente, davanti al suo schermo.
5. **C'è un identificativo stabile** per commesse, clienti e dipendenti? Serve per
   agganciare le anagrafiche senza fare match sui nomi, che è fragile.

Aggiungi: **come si scrivono ore, chilometri e spese**, e quali campi sono obbligatori.

## 2. Sul lato Kommessa: la procedura

**Passo 1 — accendere il modulo.** Dal pannello super admin, per quel cliente, modulo
`integrazione` attivo con:

```json
{ "sistema": "teamsystem", "sinc_manuale": true, "auto_push": false }
```

Se quel gestionale pretende riferimenti che il nostro minimo non prevede (per esempio il
cliente su un documento di trasferta), si dichiarano qui e basta:

```json
{ "requisiti": { "km": ["cliente"], "spesa": ["cliente"] }, "max_descrizione": 120 }
```

Kommessa li fa rispettare da sola: le operazioni senza quei collegamenti non partono, e
l'ufficio vede *quale* anagrafica manca.

**Passo 2 — emettere il token.** Pannello super admin, permesso `integrazione`. Si vede una
volta sola. Si consegna a chi installa l'agente.

**Passo 3 — collegare le anagrafiche.** Far girare l'agente in sola lettura, poi
riconciliare i cantieri/commesse con quelli del gestionale. **Questo passo va rivisto a
mano**: è quello in cui si sbaglia, e sbagliarlo significa mandare ore sulla commessa
sbagliata.

**Passo 4 — la prova col cliente.** Poche righe vere, col gestionale aperto sullo schermo
del cliente, per verificare che quello che scriviamo appaia dove deve. Solo dopo si alza il
volume.

## 3. Cosa si scrive, e dove

**Tutto il gestionale-specifico sta nell'agente.** Chi lo scrive traduce il nostro
vocabolario neutro nel dialetto dell'ERP:

| Kommessa dice | L'agente traduce |
|---|---|
| `causale: "straordinario"` | nella causale di presenza dell'ERP |
| `categoria: "albergo"` | nel codice articolo/voce di spesa dell'ERP |
| `tipo: "km"` | nel documento o nella riga che l'ERP usa per i rimborsi |
| `rif.commessa` | nell'identificativo di commessa/cantiere dell'ERP |

Il contratto da consegnare a chi scrive l'agente è **[Contratto_API.md](Contratto_API.md)**.
È autosufficiente: non serve dargli accesso al codice di Kommessa.

## 4. Quando invece bisogna toccare Kommessa

Solo in questi casi — e sono tutti aggiunte, non modifiche:

| Situazione | Cosa si aggiunge |
|---|---|
| Serve un tipo di dato nuovo (es. materiali, straordinari festivi separati) | una voce nel vocabolario in `packages/api/src/integrazione.ts` + la conversione in `integrazione-mappa.ts`, con i test |
| Il gestionale vuole informazioni in più nella descrizione | un preset in `integrazione.ts` |
| Il gestionale pretende riferimenti diversi | **niente codice**: si dichiara nella config (sopra) |
| Il gestionale ha un limite di caratteri più stretto | **niente codice**: `max_descrizione` nella config |

> Se ti ritrovi a scrivere `if (sistema === 'teamsystem')` dentro Kommessa, fermati: quella
> condizione va nell'agente. È la riga che, ripetuta dieci volte, trasforma il prodotto in
> dieci progetti su misura.

## 5. Il costo, onestamente

Quello che si rifà ogni volta è **l'agente**: leggere il gestionale, tradurre, gestire i
suoi errori. È il grosso del lavoro, e non si può evitare — ogni ERP è diverso.

Quello che **non** si rifà: il vocabolario, la coda, i permessi, l'API, la logica di
idempotenza, l'interfaccia in ufficio, il diario e gli allarmi. Che è esattamente la parte
che costa di più a costruirla bene la prima volta.
