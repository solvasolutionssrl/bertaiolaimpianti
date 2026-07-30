# Logiche Upload Media — analisi difetti e piano di intervento

**Versione**: 2.0
**Stato**: ✅ tutte le fasi implementate, verificate con test e build
**Data**: 30/07/2026
**Ambito**: upload foto/video/PDF verso R2 (poi sync Nextcloud) da PWA mobile e office

> Documento nato dall'analisi di due problemi segnalati dal cliente Bertaiola:
> (1) l'upload video dalla tab Media / creazione commessa è percepito molto piu`
> lento che dalla riunione; (2) caricando 2 video la percentuale avanza, poi
> torna indietro (80% → 20% → 60% → 10%) e a volte gli upload non finiscono piu`.
> **Entrambi i problemi sono reali e riproducibili nel codice.**

> ⚠️ **Come leggere questo documento.** Le sezioni **1, 2, 3 e 4 descrivono lo
> stato PRIMA della correzione** e vanno tenute: sono la diagnosi, con i numeri
> di riga di allora, e servono a non reintrodurre gli stessi difetti. Lo stato
> attuale del codice è nella sezione **4bis**. I riferimenti `file:riga` delle
> sezioni 1-3 non corrispondono più al codice di oggi.

---

## 1. Architettura PRE-FIX — DUE motori di upload distinti

| Motore | Chi lo usa | Persistenza | Comportamento |
|---|---|---|---|
| **Coda globale** `UploadQueueProvider` + `_lib/upload-queue/engine.ts` | riunione (`commessa-riunioni-mobile.tsx`), tab Media (`add-media-section.tsx`), Scatto | IndexedDB (`kommessa-uploads`) | 3 job in parallelo, 3 parti multipart in parallelo, retry con backoff |
| **Batch one-shot** `office/commesse/nuova/_lib/upload-media.ts` (`uploadMediaBatch`) | creazione commessa (office `form.tsx`, mobile `voice-intake-flow.tsx`), sopralluogo | **nessuna** (solo React state + staging server-side su bozza) | comprime tutte le immagini in `Promise.all`, poi video/PDF **in sequenza** |

Il trasferimento vero e proprio è equivalente: entrambi spezzano in multipart con
**3 parti in parallelo** (`upload-media.ts:249`, `upload-queue/engine.ts:19`).
A parita` di file la banda usata è la stessa.

**Conseguenza architetturale**: ogni difetto va corretto due volte, e i due
percorsi hanno garanzie di durabilita` diverse (vedi §4).

---

## 2. Problema A — "il video da Media/creazione è piu` lento"

Non è il trasferimento a essere lento: è **quanto tardi parte**.

### Riunione (veloce)
`commessa-riunioni-mobile.tsx` mette il `File` **grezzo** in coda: nessuna
anteprima, nessun EXIF, nessuna compressione. `queue.enqueue()` e l'upload parte
subito.

### Tab Media / Scatto (lento)
Passa da `MediaAttachSection`, che prima di consegnare i file fa tre cose:

1. **Decodifica il video per l'anteprima** — `VideoThumb`
   (`media-attach-section.tsx:583`) crea un `<video>`, lo carica, si posiziona a
   0.5s e disegna su canvas. Su file da centinaia di MB è il pezzo piu` pesante,
   e gira sul main thread.
2. **Aspetta l'EXIF di tutto il batch** — `await Promise.all(readImageDate(...))`
   (`media-attach-section.tsx:139-148`): finche` non ha letto la data di **tutte**
   le foto selezionate non consegna nulla al parent, quindi non parte nemmeno un
   upload.
3. **Comprime le foto in sequenza** — `add-media-section.tsx:55-71` è un `for`
   con `await compressImage(...)` uno alla volta. Un video in fondo alla
   selezione viene accodato **dopo** la compressione di tutte le foto.

### Creazione commessa (la piu` lenta)
`uploadMediaBatch` ha uno step 1 che comprime **tutte** le immagini in
`Promise.all` e blocca tutto, poi carica i non-immagini **in sequenza**
(commento esplicito a `upload-media.ts:69-71`). In piu` lo staging parte solo
quando la bozza esiste lato server.

> Nota non cosmetica: la compressione canvas occupa il main thread **mentre** gli
> XHR dovrebbero avanzare → contribuisce anche ai fallimenti di §3.

---

## 3. Problema B — progresso che torna indietro e upload che non finiscono

### 3.1 Causa primaria: due tentativi vivi dello stesso file

`engine.ts:160-164`:

```js
const workers = Array.from({ length: 3 }, runWorker);
await Promise.all(workers);
```

`Promise.all` **rigetta al primo errore ma non ferma gli altri worker**. Quelli
proseguono il loro `while(true)`, caricano altre parti e continuano a chiamare
`onProgress` → `updateJob(job.id, { bytesUploaded })`.

Nel frattempo `startJob` va in catch, rimette il job in `queued` e nel `finally`
chiama `pump()`, che **lo riparte immediatamente**. Da quel momento **due
tentativi dello stesso file** scrivono sullo stesso `bytesUploaded`: il vecchio
manda valori alti, il nuovo riparte da zero → **80% → 20% → 60% → 10%**.

I worker orfani continuano anche a consumare banda, quindi il nuovo tentativo è
piu` lento, quindi altre parti scadono, quindi altro retry: **livelock**.

**Perche` solo con i video e solo a volte**: le foto vanno in `single PUT` (un
solo XHR, nessun worker fratello da orfanare). Solo il multipart crea la
condizione. Con 2 video in coda si arriva a **9 XHR contemporanei**
(3 job × 3 parti), che su rete mobile genera errori da solo.

### 3.2 Elenco completo dei difetti

| | Difetto | Dove |
|---|---|---|
| **A** | Al primo errore i worker fratelli non vengono abortiti → progresso da un tentativo morto. `cleanup()` è agganciato **solo** all'abort dell'utente | `engine.ts:160-164`, `:70-78` |
| **B** | **Il backoff non viene rispettato**: il filtro dei candidati guarda solo `status === 'queued'` e ignora `nextAttemptAt` (il commento sopra dice il contrario). Con `pump()` nel `finally`, il retry parte istantaneamente e i 5 tentativi si bruciano in secondi | `upload-queue-provider.tsx:109-114` vs `RETRY_DELAYS_MS` in `types.ts` |
| **C** | Sul retry `bytesUploaded` non viene azzerato → la barra salta indietro anche senza orfani | `upload-queue-provider.tsx:213-218` |
| **D** | **Nessun timeout sugli XHR**: una parte che si impianta (iOS in background, rete che sparisce) non fallisce mai e non avanza mai → slot occupato per sempre | `engine.ts:252-299`, `:206-250` |
| **E** | **`putJob` a ogni tick di progresso riscrive il blob intero in IndexedDB**: `updateJob` (`:168`) → `void putJob(target)` (`:91`) → `store.put(job)` con `payload.fileBlob` (`idb-store.ts:55`). Per un video da 300 MB sono decine di transazioni readwrite al secondo su un record enorme → disk thrash, pressione di memoria, stalli | `upload-queue-provider.tsx:79-98`, `idb-store.ts:54-56` |
| **F** | `startJob` (che fa `setState`) è invocato **dentro l'updater di `setJobs`**: side effect in un reducer, fragile, in dev eseguito due volte | `upload-queue-provider.tsx:119-122` |
| **G** | `notifyAbortToServer` parte solo all'ultimo fallimento → i multipart dei tentativi intermedi restano appesi su R2 fino al cleanup 24h (spazzatura + costo) | `upload-queue-provider.tsx:199-207` |
| **H** | La percentuale del pannello è **aggregata su tutti i job** → il reset di un file trascina giu` il totale, amplificando il caos visivo | `upload-tray.tsx:88-90` |
| **A2** | Il difetto **A esiste identico nel secondo motore** | `upload-media.ts:249-268`, retry a `:162` |

### 3.3 Ipotesi verificata e SCARTATA

Sospetto iniziale: parti multipart inviate fuori ordine → R2 rifiuta
`CompleteMultipartUpload` (`InvalidPartOrder`) → fallimento a `complete` → loop.
**Falso**: `packages/integrations/src/storage/r2.ts:156` riordina le parti per
`partNumber` prima di inviarle. Non è questa la causa.

---

## 4. Durabilita`: il caso "commessa al volo in campo"

Scenario del cliente: fuori sede, scatta foto/video, crea la commessa al volo,
allega, **chiude il telefono ed esce**.

### 4.1 Cosa NON si puo` fare in PWA su iOS

| API | Stato su Safari/iOS | Conseguenza |
|---|---|---|
| **Background Sync** | non supportata, e non prevista a breve | niente ripresa automatica a app chiusa |
| **Background Fetch** | solo Chromium | idem |
| `fetch(..., {keepalive:true})` | body max ~64 KB | inutile per i video |
| Service Worker post-chiusura | finestre di esecuzione brevissime | non regge un upload da centinaia di MB |

**Quando l'utente chiude (o mette in background per piu` di pochi secondi) l'app,
il JS viene sospeso e l'upload muore.** Il Wake Lock già presente
(`upload-queue-provider.tsx:384-445`) serve a tenere lo schermo acceso, ma non
sopravvive al blocco del telefono.

L'upload in background **vero** esiste solo nel guscio nativo: su iOS è
`URLSession` in modalita` background transfer, che continua a trasferire con app
sospesa o terminata e rilancia l'app a fine trasferimento. → **arriva con
Capacitor** (branch `feat/capacitor-ios-app`), non prima.

### 4.2 Le due garanzie da distinguere

**G1 — non perdere MAI il legame commessa ↔ file.** È la garanzia che il cliente
teme di piu`, ed è la piu` economica.

- Percorso **coda globale**: i job (blob compreso) sono in IndexedDB → il legame
  sopravvive alla chiusura. ✅ Al riavvio pero` il job riparte da zero
  (`upload-queue-provider.tsx:325-333` azzera `bytesUploaded` e `fileRefId`).
- Percorso **creazione commessa**: `useBozzaMedia` + `uploadMediaBatch` tengono
  i `MediaFile[]` **solo in React state**. I file già caricati sulla bozza sono
  salvi lato server; **quelli in volo o non ancora partiti si perdono alla
  chiusura**. ❌ **Questo è esattamente lo scenario temuto dal cliente, ed è un
  buco reale oggi.**
- Fix: far passare anche la creazione commessa dalla coda persistente, e
  scrivere l'intento (bozzaId/commessaId + blob) in IndexedDB **prima** di
  iniziare qualunque upload.

**G2 — riprendere i byte (resume multipart vero).** Per un video da 300 MB su 4G
ripartire da zero è inaccettabile.

- Persistere `fileRefId` + `uploadId` + parti completate (`partNumber` + `etag`)
  mano a mano che atterrano.
- Alla riapertura: il **server** interroga R2 con `ListParts` (fonte di verita`
  piu` robusta del client), rigenera gli URL presigned per le sole parti mancanti
  e il client riprende da li`.
- Il multipart resta aperto su R2 fino al cleanup 24h, quindi la finestra di
  ripresa è ampia.
- Era già stato rinviato consapevolmente: vedi commento `engine.ts:57-59` e
  `types.ts` ("la ripresa cross-session di parti già caricate è fuori scope").

**G3 — onesta` verso l'utente.** Alla riapertura: banner "2 file in attesa ·
riprendi", ripresa automatica su Wi-Fi, e nudge via push ("hai 2 video da
caricare") — una push puo` risvegliare il service worker per mostrare una
notifica anche se non puo` caricare.

---

## 4bis. Com'è FATTA adesso (stato dopo l'intervento del 30/07/2026)

**Un solo motore.** `UploadQueueProvider` + `_lib/upload-queue/`, con la parte
decisionale estratta in due moduli **puri e unit-testati** dentro
`packages/api`:

| Modulo | Cosa decide | Test |
|---|---|---|
| `@kommessa/api/upload-multipart` | orchestrazione delle parti: pool, abort dei fratelli, progresso monotono, offset in ripresa | `upload-multipart.test.ts` (9) |
| `@kommessa/api/upload-queue-policy` | chi parte, quando si ritenta, quando si rinuncia | `upload-queue-policy.test.ts` (15) |

`office/commesse/nuova/_lib/upload-media.ts` non contiene più codice di upload:
è ridotto ai soli tipi della UI.

**Ciclo di vita di un file**, identico da riunione, tab Media, Scatto,
sopralluogo e creazione commessa:

1. selezione → compressione (solo immagini) → `queue.enqueue()`; il blob va su
   IndexedDB **una volta sola** (store `blobs`);
2. `/init` (o `/resume`) → parti su R2 → `/complete`;
3. errore ⇒ i fratelli si fermano, il tentativo successivo aspetta davvero il
   backoff e **riprende** le parti già caricate;
4. app chiusa ⇒ alla riapertura il job torna in coda marcato `ripreso` e
   riprende da dove era.

**Ripresa (F5).** `POST /api/upload/media/[id]/resume` chiede a R2 `ListParts`
quali parti ci sono già, rifirma solo le mancanti e restituisce `giaCaricate` +
`bytesGiaCaricati`. La fonte di verità è **R2**, non il client: non c'è nessun
elenco di ETag da tenere sincronizzato sul telefono. Se il multipart non esiste
più → `mode: 'scaduto'` e si riparte da `/init`.

**UI.** Codice colore condiviso fra pannello fluttuante e pagina dedicata:
**blu** = file nuovo in salita, **ambra** = ripreso da prima o in ritentativo,
**verde** = fatto, **rosso** = da riprovare. Il pannello non sparisce più se ci
sono errori. Pagina `/mobile/caricamenti` (raggiungibile dal pannello e dalla
voce "Caricamenti" nel profilo) con i gruppi Riprendo / In corso / Da riprovare
/ Completati e il tasto "riprova tutti".

## 4ter. La conversione video di iOS — NON è un problema da risolvere

Selezionando un video dalla libreria, iOS resta fermo qualche decina di secondi
con uno spinner su ogni elemento **prima** di restituire il controllo alla
pagina: in quella fase il JS non è ancora in gioco, quindi non è un difetto
dell'app. Sta preparando gli originali, e può fare due lavori:

1. **scaricarli da iCloud** (se "Ottimizza spazio iPhone" è attivo);
2. **ricodificarli** — misurato in campo il 30/07/2026: sorgente HEVC **300 MB**
   → consegnato **110 MB** H.264 ridimensionato.

**La ricodifica conviene e va lasciata stare.** Sono ~190 MB in meno da caricare
(su 5 Mbps in upload, circa 5 minuti risparmiati contro qualche decina di
secondi di CPU), e l'H.264 **si apre ovunque** mentre l'HEVC originale spesso non
si riproduce in ufficio su Chrome/Firefox desktop.

⚠️ **Non "correggerla".** Sembra un'ottimizzazione ma è un peggioramento: si
otterrebbero upload 3× più pesanti e video che l'ufficio non riesce a vedere.

Per completezza, le leve esistenti (tutte lato iPhone, **nessuna lato codice**:
non esiste un attributo HTML che controlli la conversione):

| Leva | Effetto | Costo |
|---|---|---|
| Fotocamera → Formati → "Più compatibile" | registra già in H.264 → niente conversione all'export | sorgenti molto più grandi |
| Foto → "Mantieni originali" | documentata per il trasferimento a Mac/PC; effetto sull'upload web **non documentato** | da verificare sul device |
| Salvare il video in File e caricarlo da "Scegli file" | bypassa la compressione | passaggi manuali + si caricano i MB pieni |

## 5. Piano di intervento (eseguito)

### ✅ Fase 1 — il bug del progresso
1. **Abortire i worker fratelli** al primo errore: AbortController locale
   derivato da quello esterno, abortito nel catch prima di rilanciare. In piu` un
   **token di generazione** sul callback di progresso, così un tentativo morto
   non puo` scrivere nemmeno per errore.
2. **Rispettare il backoff**: nel filtro di `pump` aggiungere
   `if (j.nextAttemptAt && j.nextAttemptAt > now) return false`. Il timer di
   ri-pump esiste già (`:128-133`).
3. **Azzerare `bytesUploaded`** all'inizio di ogni tentativo; mostrare
   "tentativo 2 di 5" invece di una barra che balla.
4. **`xhr.timeout` per parte** (60-90s) + `ontimeout` → reject.
5. **Non persistere su ogni tick**: `putJob` solo sui cambi di stato, progresso
   throttlato (o non persistito affatto, dato che oggi la ripresa riparte da 0).

**Verifica**: repro deterministico forzando il fallimento della parte #2 al primo
tentativo con rete strozzata; la barra non deve mai tornare indietro e il job
deve chiudere.

### ✅ Fase 2 — parallelismo
6. Tetto **globale** alle parti in volo; per i video scendere a 2 job × 2 parti.
   Oggi 9 XHR insieme lavorano contro l'obiettivo su rete mobile.
7. Abort del `fileRefId` orfano a **ogni** tentativo fallito; `startJob` fuori
   dall'updater di `setJobs`.

### ✅ Fase 3 — lentezza percepita
8. Video accodati **per primi**, senza aspettare la compressione delle foto.
9. EXIF non bloccante: consegnare subito i file, aggiornare `takenAt` a seguire.
10. Niente decodifica del frame di anteprima sopra una soglia (es. 30 MB).

### ✅ Fase 4 — durabilita` (G1)
11. Unificare i motori: la creazione commessa usa la coda persistente.
12. Intento persistito prima di ogni upload.

### ✅ Fase 5 — resume vero (G2)
13. Persistenza parti + endpoint di resume basato su `ListParts` R2.

### ⏳ Fase 6 — solo con Capacitor (NON fatta: serve il guscio nativo)
14. Upload in background reale via `URLSession` background transfer.

---

## 6. File coinvolti

- `apps/web/app/_lib/upload-queue/engine.ts` — motore R2 (init → parti → complete)
- `apps/web/app/_lib/upload-queue/idb-store.ts` — persistenza IndexedDB
- `apps/web/app/_lib/upload-queue/types.ts` — `MAX_ATTEMPTS`, `RETRY_DELAYS_MS`
- `apps/web/app/_components/upload-queue-provider.tsx` — pool, retry, wake lock
- `apps/web/app/_components/upload-tray.tsx` — UI progresso
- `apps/web/app/office/commesse/nuova/_lib/upload-media.ts` — secondo motore
- `apps/web/app/office/commesse/nuova/_components/media-attach-section.tsx` — selezione, EXIF, anteprime
- `apps/web/app/mobile/commessa/[id]/_components/add-media-section.tsx` — compressione + enqueue
- `apps/web/app/_lib/bozze/use-bozza-media.ts` — staging media su bozza
- `apps/web/app/api/upload/media/**` — init / complete / abort
- `packages/integrations/src/storage/r2.ts` — multipart R2

## 7. Come è stato verificato

Il sintomo originale era **intermittente**, quindi prima delle correzioni è
stato costruito un **repro deterministico** come unit test (parte #2 che
fallisce, caricatore finto, nessuna rete):

1. il repro è stato eseguito contro una copia dell'implementazione **PRE-fix**
   (`Promise.all` senza abort dei fratelli) → **fallisce**, e i progressi emessi
   dopo il fallimento sono `[50, 13, 25, 38, 50, 13, 25, 38, 50]`: esattamente
   il ping-pong descritto dal cliente, riprodotto in laboratorio;
2. lo stesso repro contro l'implementazione nuova → **passa**;
3. la copia legacy è stata rimossa (serviva solo a validare il repro).

Un test che passa sia sul codice vecchio che sul nuovo non dimostra niente:
questo passaggio è il motivo per cui sappiamo che il bug è **corretto** e non
solo "diventato più raro".

Suite: 205 test verdi in `packages/api`, typecheck pulito su `apps/web` e
`packages/api`, `next build` di produzione completata.

**Resta da provare sul campo** (non riproducibile in unit test): la ripresa
reale su iPhone dopo chiusura dell'app con un video grande a metà, e il
comportamento della sentinella di stallo su rete di cantiere.
