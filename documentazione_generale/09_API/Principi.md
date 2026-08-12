# Principi — come si aggiunge o si cambia una risorsa

**Aggiornato**: 12/08/2026

Per chi domani deve esporre una risorsa nuova (rapportini, mezzi, presenze, commesse del
mondo Kommessa) o aggiungere un campo a una che c'è.

---

## 1. Espone il dato, non la decisione

Una risorsa consegna **quello che è**, con lo stato in chiaro, e non decide cosa se ne
faccia chi la legge.

Concretamente: niente `.eq('stato', 'approvato')` dentro un endpoint. Se il record non è
approvato, arriva con `approvato: false` e chi consuma sceglie. Il momento in cui si
scrive un filtro di merito dentro l'API è il momento in cui si comincia a costruire
l'adattamento per un cliente invece del prodotto.

L'eccezione è il tenant: quello si filtra sempre, e viene dal token.

## 2. Additiva, mai distruttiva

Si **aggiungono** campi e risorse. Non si rinominano, non si cambia il tipo, non si
restringe un vocabolario. Un client scritto un anno fa deve continuare a funzionare senza
che nessuno lo tocchi.

Se una cosa va proprio cambiata: si aggiunge il campo nuovo accanto al vecchio, si
documenta che il vecchio è superato, e lo si toglie solo quando nessuno lo usa più — cosa
che si verifica, non si presume.

Il numero di `contratto` cambia solo per una rottura. Non dovrebbe cambiare mai.

## 3. Ogni elenco: cursore e lettura incrementale

Nessuna eccezione, nemmeno per una risorsa che "tanto ha dieci righe". Le dieci righe
diventano diecimila, e a quel punto il client è già scritto.

- `limite` + `cursore`, mai `pagina`/`offset`: con dati che cambiano mentre li leggi,
  l'offset salta o ripete.
- Il cursore incapsula `(istante, id)`, non solo l'istante.
- `modificatoDopo` sempre disponibile, e ordinamento sullo stesso campo su cui si pagina.
- Si chiede sempre `limite + 1` record: è il modo più semplice di sapere se ce ne sono
  altri senza un secondo conteggio.

Su cosa ordinare: il campo che indica l'**ultima modifica** del record. Se la tabella non
ne ha uno perché quel dato non si ritocca mai (`timbratura_viaggio`), va bene la data di
creazione — ma va detto nel commento, altrimenti il prossimo lo cambia per sbaglio.

## 4. Gli identificativi esterni arrivano già risolti, e si vede dal nome

Ogni record porta `externalId` dove serve. L'alternativa — che ogni client interroghi le
mappature e se le tenga in memoria — è lo stesso lavoro ripetuto da tutti, e un'occasione
in più di sbagliare per ciascuno.

**Il nome dice la provenienza**: un campo che inizia con `external` contiene un dato del
gestionale, senza prefisso è un dato di Kommessa. Il prefisso sta in testa, sempre —
`externalClienteId`, non `clienteExternalId`: in coda si legge come un aggettivo e si
perde nella riga.

Vale per identificativi, codici e riferimenti. **Non** per gli attributi descrittivi:
`nome`, `categoria`, `indirizzo`, `attiva` restano nudi anche quando descrivono un'entità
esterna, perché se lo mettessimo ovunque ce l'avrebbero tutti e smetterebbe di significare
qualcosa.

Se aggiungi un campo, la domanda è una: *questo valore chi lo genera?* Se il gestionale,
prefisso.

> Nasce da un errore vero: fino al contratto 1 `codice` era il nostro in uscita e il loro
> in entrata. Un client che rileggeva e riscriveva li invertiva in silenzio.

## 5. Il registro delle scritture vive qui

Quando una risorsa può essere portata su un sistema esterno, deve esporre `esportazioni`.
Non è un di più: su un gestionale che non lascia rileggere né cancellare, «l'ho già
mandato?» è la domanda che separa un'integrazione da un disastro contabile, e la risposta
non può stare solo su una macchina che può morire.

## 6. Le sicure sono esplicite e per-tenant

`inviabile` non è una proprietà del dato: è una decisione di Kommessa, che dipende dalla
configurazione. Chi legge non deve dedurre nulla — glielo diciamo riga per riga.

Il valore prudente è sempre il predefinito. Se la configurazione manca o è storta, non si
scrive niente da nessuna parte.

---

## La ricetta pratica

Aggiungere `GET /api/v1/<risorsa>`:

1. **File** `apps/web/app/api/v1/<risorsa>/route.ts`.
2. **Guardia**: `autenticaApi(request)` in cima, sempre.
3. **Parametri**: `leggiParametri(new URL(request.url))`, e se `p.errore` rispondi 400.
4. **Query**: filtra sul tenant, ordina su `(modificato, id)`, `limit(p.limite + 1)`,
   applica `modificatoDopo` e `cursore`.
5. **Arricchimento**: `caricaMappature` e `esportazioniPerLotto` — **una query per lotto**,
   mai una per record.
6. **Mappa** in un oggetto con nomi in italiano, `modificatoAl` sempre presente, e
   `inviabile` se il dato può uscire.
7. **Chiudi** con `impagina(...)` e `rispostaElenco(...)`.
8. **Documenta** in `Riferimento.md` con un esempio vero, e aggiungi la risorsa all'elenco
   in `GET /info`.

## Cosa non fare

| | Perché |
|---|---|
| Un filtro di merito nell'endpoint | è una politica: appartiene a chi consuma |
| `offset`/`pagina` | salta e ripete su dati che cambiano |
| Una query per record | con 200 record è un timeout |
| Rinominare un campo | rompe i client installati, in silenzio |
| Esporre un id interno di un'altra tabella | diventa un accoppiamento che non puoi più sciogliere |
| `if (sistema === 'ergo')` | se serve, sei nel posto sbagliato: va nel client |
