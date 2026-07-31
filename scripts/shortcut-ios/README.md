# Comando iOS "Carica su Kommessa"

Comando rapido (Shortcut) che compare nel **menu Condividi dell'app Foto**:
selezioni foto/video → Condividi → "Carica su Kommessa" → scegli la commessa →
i file salgono. L'app Kommessa **non si apre**: si resta dentro Foto.

Nasce per chi deve caricare materiale trovato sfogliando il rullino per giorni,
dove il picker di iOS dentro la PWA è cieco (nessun raggruppamento per data).

## Come si genera

```sh
python3 scripts/shortcut-ios/costruisci_shortcut.py CaricaSuKommessa
```

Serve un Mac (macOS 12+): la firma usa il comando di sistema `shortcuts sign`.
Da iOS 15 un comando **non firmato non è importabile**, e la firma non si può
fare on-device — quindi questo script gira solo su Mac.

Produce due file:

| File | A cosa serve |
|---|---|
| `CaricaSuKommessa_nonfirmato.shortcut` | il plist grezzo, per ispezionarlo |
| `CaricaSuKommessa.shortcut` | quello **firmato**, da mandare all'iPhone |

> ⚠️ `shortcuts sign` rifiuta qualunque estensione che non sia `.shortcut`,
> anche quando il contenuto è un plist perfettamente valido. L'errore che dà è
> fuorviante ("isn't in the correct format") e fa pensare a un plist rotto.

## Cosa fa il comando (10 azioni, nessun ciclo)

1. **Testo** con il token personale — l'unica cosa che l'utente deve modificare
2. Imposta variabile `token`
3. `GET /api/link/commesse` con header `Authorization: Bearer …`
4. Estrae la chiave `commesse`
5. **Scegli da elenco** — mostra `etichetta` (titolo · cliente)
6. Estrae `id`, lo mette in variabile `commessa`
7. `POST /api/link/upload` — form con `commessaId` + **tutti** i file
8. Estrae `messaggio` (frase già pronta lato server)
9. **Notifica**

Niente ciclo: l'endpoint accetta il campo `file` ripetuto, così la selezione
intera va in una richiesta sola. Meno azioni = meno superficie che si rompe a
un aggiornamento di iOS.

## Consegna all'utente

**AirDrop dal Mac all'iPhone** — non un link pubblico. Dopo l'installazione
l'utente incolla il proprio token nella **prima azione** del comando: il file
che consegni non contiene nessuna credenziale.

Il token si crea (e si revoca) da **`/admin/token-app`**.

## Limiti noti

- La schermata "Scegli da elenco" **non ha un campo di ricerca** (Apple lo ha
  tolto in iOS 14): per questo l'endpoint ritorna le commesse recenti, e la
  ricerca vera vive lato server (`?q=`).
- Un comando rapido non può aprire la PWA installata: un link aprirebbe Safari.
  Per questo l'upload lo fa il comando stesso e a fine giro c'è una notifica.
- Tetto di 200 MB per invio (il server bufferizza in memoria). Per i video
  lunghi conviene mandarne pochi per volta.

## Gotcha: usare l'URL con il `www`

`kommessa.it` risponde **307 verso `www.kommessa.it`**. Per un GET non cambia
nulla, ma per il POST multipart significherebbe spedire il corpo due volte.
`BASE_URL` nello script punta quindi all'URL canonico con il `www`.

Verifica veloce degli endpoint (401 atteso senza token valido):

```sh
curl -s -w "\n%{http_code}\n" https://www.kommessa.it/api/link/commesse
```

## Il campo file: `WFItemType` 0, non 5

Sembra ovvio che un campo file di un modulo abbia un tipo dedicato, e in giro si
legge che sia `5`. **È falso e non fallisce in modo gentile**: `5` non esiste fra
i tipi di un `WFDictionaryFieldValue`, il parser di WorkflowKit va in eccezione
mentre legge il file e l'app Comandi Rapidi **crasha all'import** — su iPhone si
vede solo un lampo e il comando non compare da nessuna parte.

Il campo file va dichiarato con **`WFItemType: 0`**, mettendo come valore un
allegato (`WFTextTokenAttachment` con `{"Type": "ExtensionInput"}`): è il valore
a essere un file, non il tipo del campo.

Traccia nel crash report, se ricapita:

```
-[WFPropertyListParameterValue initWithType:state:identity:]
 ← -[WFDictionaryParameterKeyValuePair initWithSerializedRepresentation:...]
```

## Banco di prova (`prova.sh`)

Il crash avviene alla **lettura** del plist, prima di qualunque clic: quindi si
può verificare un comando sul Mac senza toccare l'iPhone.

```sh
./scripts/shortcut-ios/prova.sh CaricaSuKommessa.shortcut
```

Apre il file, aspetta, e dice se l'app lo ha digerito.

> ⚠️ I crash report vengono scritti con **ritardo**: contarli prima e dopo
> produce un off-by-one (il crash del test N finisce nel conteggio del test
> N+1) e fa sembrare buoni file rotti. `prova.sh` usa un marcatore temporale
> (`find -newer`) proprio per questo — la prima versione, che contava, mi ha
> dato tre falsi negativi di fila.

## Il concatenamento implicito NON esiste: `WFInput` sempre

Costruendo un comando nella UI, ogni azione prende in pasto l'uscita della
precedente. **Nel plist quel collegamento va scritto a mano**: un'azione senza
`WFInput` esplicito non riceve niente.

Il guasto è **silenzioso e insidioso**: l'azione restituisce vuoto, il comando
non va in errore e tira dritto fino in fondo. Sintomo tipico: la schermata
"Scegli da elenco" non compare (lista vuota → Shortcuts la salta) e la notifica
finale è muta (nessun valore da mostrare).

Si riconosce a occhio nella UI: un'azione agganciata mostra il **nome del
valore** ("Scegli da *Valore dizionario*"), una scollegata mostra un
**segnaposto grigio** ("Ottieni Valore per etichette in *Dizionario*").

Vanno agganciate tutte le azioni che consumano un valore — `setvariable`,
`getvalueforkey`, `choosefromlist` — con:

```python
"WFInput": {
    "Value": {"Type": "ActionOutput", "OutputUUID": <uuid>, "OutputName": "..."},
    "WFSerializationType": "WFTextTokenAttachment",
}
```

## Come si ispeziona un comando davvero

Il modo più veloce per capire cosa Shortcuts ha accettato è **importarlo e
rileggerlo**: all'import l'app normalizza il plist, scarta i parametri che non
riconosce e riscrive gli altri.

```sh
shortcuts list                       # c'è?
shortcuts run <nome>                 # eseguilo e guarda cosa fa
```

```python
# e per leggere le azioni come le ha salvate l'app:
import sqlite3, plistlib
c = sqlite3.connect("~/Library/Shortcuts/Shortcuts.sqlite")
c.execute("select a.ZDATA from ZSHORTCUTACTIONS a join ZSHORTCUT s"
          " on a.ZSHORTCUT = s.Z_PK where s.ZNAME = ?", (nome,))
```

## Copia personale con il token dentro

```sh
python3 costruisci_shortcut.py CaricaSuKommessa kmsa_xxxxx
```

Il file diventa **una credenziale**: si consegna via AirDrop, mai con un link,
e se il telefono si perde si revoca il token da `/admin/token-app`.

## Il campo file di un modulo: doppio involucro

La forma corretta, ricavata configurando l'azione a mano nella UI e rileggendo
il comando dal database. Due tentativi a naso erano falliti in modi diversi:

| Cosa | Esito |
|---|---|
| `WFItemType: 5` + allegato **nudo** | il parser va in eccezione, **l'app crasha all'import** |
| `WFItemType: 0` + allegato nudo | si importa, ma il file parte come **testo** e al server non arriva |
| `WFItemType: 5` + allegato **avvolto** | ✅ |

```python
{
  "WFItemType": 5,
  "WFKey": {...},
  "WFValue": {
    "WFSerializationType": "WFTokenAttachmentParameterState",   # involucro esterno
    "Value": {
      "WFSerializationType": "WFTextTokenAttachment",           # involucro interno
      "Value": {"Type": "ExtensionInput"},
    },
  },
}
```

Il tipo 5 era giusto fin dall'inizio: sbagliato era il valore.

## Ricerca senza rami condizionali

`--ricerca` aggiunge in testa un "Chiedi input" e passa la risposta come `?q=`.
Nessun `se`: il caso vuoto si comporta da solo, perché `?q=` vuoto fa tornare la
lista completa. Un ramo condizionale dentro un comando rapido sarebbe più
fragile di quanto valga.

```sh
python3 costruisci_shortcut.py CaricaSuKommessa            kmsa_xxx
python3 costruisci_shortcut.py CaricaSuKommessa-conRicerca kmsa_xxx --ricerca
```

## Video: caricamento diretto su R2 (`--video`)

`/api/link/upload` fa passare i byte **dentro** la richiesta al nostro server, e
lì la piattaforma taglia a **100 MB**: un video da 200 MB viene respinto prima
di raggiungere il codice, con una risposta che non è JSON — e il comando muore
con «non ha potuto convertire da Testo a Dizionario», che non spiega niente.

La variante `--video` fa come l'app, in tre passi:

1. `POST /api/link/prepara` → crea la riga e restituisce un **indirizzo firmato**
2. `PUT` diretto a Cloudflare, il corpo è il file — **non passa dal nostro server**
3. `POST /api/link/completa` → verifica con HEAD, poi miniatura e sync

Tetto: quello di R2, 5 GB.

**Un file per esecuzione, di proposito.** Il caso "tanti file" richiederebbe un
ciclo, e dentro un ciclo l'elemento corrente si riferisce con un nome che iOS
**localizza** — la stessa trappola dei nomi delle variabili magiche. Nel comando
video il file è l'input stesso (`ExtensionInput`), riferimento stabile in ogni
lingua. Struttura del ciclo, se un giorno servisse: stessa azione due volte,
`WFControlFlowMode` 0 (apre) e 2 (chiude), legate da un `GroupingIdentifier`
condiviso.

**Content-Type non firmato**: il presigned viene generato con
`firmaContentType: false`, perché il comando deriva l'header dal file e un tipo
diverso da quello firmato farebbe fallire il PUT con `SignatureDoesNotMatch`.

```sh
python3 costruisci_shortcut.py CaricaVideoSuKommessa kmsa_xxx --video
```
