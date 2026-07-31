# Banco di prova — area upload media

Collauda il percorso che il cliente usa ogni giorno: **scegli foto/video →
preparazione → coda → parti su R2 → fine**, con Chrome emulato iPhone e un
finto R2 locale. Non tocca nulla di produzione.

## Come si lancia

```bash
# 1. server di sviluppo sulla porta 3010
cd apps/web && npx next dev -p 3010

# 2. banco (dalla radice del repo)
node scripts/banco-upload/prova.mjs
```

I file di prova (2 foto + 2 video da 40 MB) si generano da soli in
`$TMPDIR/kommessa-banco-upload` al primo giro. Serve Google Chrome installato.

## Cosa verifica (17 controlli)

| Area | Controllo |
|---|---|
| Attesa del picker | l'avviso "il telefono sta preparando i file" non compare sotto 1,2 s, compare quando l'attesa è vera, sparisce all'arrivo dei file |
| Piena qualità | la foto normale viene spedita **byte per byte identica** all'originale |
| Valvola | la foto sopra 12 MB viene ancora ridotta |
| Impronta | SHA-256 calcolata sulle foto, **non** sui video da 40 MB (era un blocco a fine upload) |
| Progresso | con 2 video in parallelo e una parte che fallisce, la percentuale **non torna mai indietro** (un azzeramento è ammesso: è un nuovo tentativo) |
| Tenuta | dopo un errore di rete i due video arrivano comunque in fondo |
| Ripresa | il tentativo successivo chiede `/resume` invece di ricominciare da zero |
| Chiusura app | ricaricando a metà, i file tornano in coda marcati "Riprendo" e finiscono da soli |

## Due trappole scoperte costruendolo

1. **Intercettare i PUT dal protocollo di debug falsa la prova**: il corpo non
   viene mai trasmesso, `xhr.upload.onprogress` non scatta e il progresso — cioè
   la cosa da collaudare — non esiste. Per questo i byte vanno a un server vero
   (`finto-r2.mjs`) che consuma il corpo **al rallentatore**.
2. **Chrome ritenta da solo una connessione caduta prima della risposta**: se il
   guasto si simula buttando giù il socket, l'app non vede alcun errore e il
   collaudo passa senza aver provato niente. Il guasto va simulato con un
   **500 vero** a metà corpo.

## Cosa NON prova

È Chrome che si finge un iPhone, non Safari. Restano fuori: la conversione che
iOS fa uscendo dal picker, le stranezze di IndexedDB su WebKit, la sospensione
del JS quando l'app va in background. Quelle vanno viste su un telefono vero.
