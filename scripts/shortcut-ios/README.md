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
