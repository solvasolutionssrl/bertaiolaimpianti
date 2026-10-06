# Osservazioni aperte — audit del 05/10/2026

**Versione**: 1.0
**Stato**: 📋 elenco di cose **non fatte di proposito**, da decidere
**Origine**: audit dei due lavori del 05/10/2026 (limiti di upload configurabili, richieste al telefono) — tre revisioni in parallelo più verifiche sul database di produzione
**Ambito**: mondo commesse, più alcune cose trasversali

> **Come leggere.** Niente qui è una dimenticanza. Ogni voce è stata trovata,
> valutata e **lasciata** per un motivo scritto accanto: perché cambia cosa
> l'app accetta in produzione, perché è una scelta di prodotto e non tecnica, o
> perché il rischio non valeva lo stesso push. Le voci in §1 sono quelle che un
> utente incontra **oggi**, senza fare niente di strano.

---

## 1. Decisioni di prodotto — un utente le incontra oggi

### 1.1 Allegati riunione: è limitato solo il video

Le tre superfici degli allegati riunione (`crea-riunione-dialog.tsx`,
`lavori-board.tsx`, `commessa-riunioni-mobile.tsx`) controllano `maxVideoMb` e
**niente altro**: non il peso delle foto, non il peso dei PDF, non il numero di
file.

**Conseguenza concreta** coi default (foto 25 MB, PDF 50 MB, 50 file): una foto
ProRAW da 60 MB è **rifiutata** in Nuova commessa / Scatto / Media e
**accettata** in Riunioni. Un PDF da 300 MB passa. 200 file in un colpo passano.
Stesso file, stessa commessa, due risposte opposte.

**Perché non l'ho fatto**: allinearle **riduce** quello che le riunioni
accettano oggi. È una perdita di capacità su una superficie di produzione, e va
decisa, non dedotta. L'incoerenza è **preesistente**: quelle superfici non hanno
mai avuto quei limiti.

**Se si decide di farlo**: una funzione condivisa `validaSelezione(files, limiti)`
chiamata dai tre picker, **non** una terza copia della `if`.

### 1.2 Lo scanner PDF da fotocamera scavalca la validazione

`_components/pdf-camera-capture.tsx` genera il PDF (3840×2160, JPEG 0.98:
decine di MB per poche pagine) e lo consegna al chiamante, che lo infila
**direttamente** nella lista o in coda, scavalcando `addFiles`:

| Dove | Riga | Cosa salta |
|---|---|---|
| `mobile/commessa/[id]/scatto/scatto-form.tsx` | 283 | `maxDocMb` **e** `maxFile` (il contatore può superare il massimo) |
| `mobile/commessa/[id]/_components/commessa-riunioni-mobile.tsx` | 547 | accoda diretto |
| `office/commesse/[id]/lavori/_components/crea-riunione-dialog.tsx` | 225 | `onPdfReady` |

**Conseguenza**: se il pannello abbassa `maxDocMb` a 10 MB, il selettore rifiuta
un PDF da 12 MB e lo scanner ne carica uno da 30 **nella stessa schermata**.

**Difetto vero, non scelta.** Rischio di correzione basso (il PDF lo genera il
nostro codice a qualità nota). Lo segnalo invece di farlo solo perché cambia
comunque un'accettazione in produzione.

### 1.3 `crea-riunione-dialog` scarta i file in silenzio

`if (!isImage && !isVideo) continue;` — chi sceglie un PDF da lì lo vede
**sparire** senza nessun messaggio.

### 1.4 Il flatten dell'annotatore fallisce in silenzio

`api/upload/media/[id]/flatten/route.ts` → `MAX_FLATTEN_BYTES = 50 MB`,
rifiuto con 413. Ma `_components/annotation/photo-annotator.tsx` riduce quel 413
a un `console.warn`: **l'utente legge «salvato» e il file consegnato su
Nextcloud non porta il disegno.**

Con `maxFotoMb` al tetto (200 MB) il caso diventa raggiungibile. Bug
indipendente, merita un suo intervento.

---

## 2. I limiti sono una cortesia dell'interfaccia, non una regola

**Nessuna superficie server applica i limiti configurati.** `init` valida solo
il `sizeBytes` **dichiarato** dal client; `api/upload/media/[id]/complete` fa
HEAD su R2, prende `head.size` come verità e **non lo confronta** con niente.
Quindi: chi dichiara 1 MB può caricare 2 GB.

È la postura **preesistente** — prima era una costante client coerente con sé
stessa. Ma ora il pannello presenta quei numeri come una **politica per tenant**,
e nessun endpoint la fa rispettare. Il pannello lo dice in chiaro («il controllo
avviene nell'app quando si scelgono i file: non è un blocco lato server»), che
è onesto ma non è una soluzione.

**Dove metterlo, se si decide**: in `complete`, che ha già la dimensione vera in
mano. Sono poche righe. ⚠️ Deve **fallire morbido** se i limiti non si leggono,
altrimenti un intoppo di lettura blocca i caricamenti; e va considerato che
inizierebbe a **rifiutare** casi che oggi passano (es. una foto che arriva sopra
i 25 MB da un percorso che non passa dal selettore).

Il **numero di file** non è applicabile lato server: non esiste la nozione di
«una selezione». Quello resta per forza un controllo d'interfaccia.

---

## 3. Due rotte di upload senza limiti e senza chiamanti

| Rotta | Stato |
|---|---|
| `api/upload/media/route.ts` | bufferizza tutto il body in memoria, **nessun controllo**; nessun chiamante in `apps/web` |
| `api/upload/riunione-allegato/route.ts` | multipart, **nessun controllo di dimensione**; nessun chiamante |

Sono endpoint **vivi e raggiungibili col cookie di sessione**. Finché esistono,
qualunque presidio si aggiunga ha una porta di servizio accanto. Candidati alla
rimozione insieme alle 3 Edge Functions morte già in lista.

---

## 4. Comando iOS: nessuno dei limiti

- `api/link/upload/route.ts` → `MAX_BYTES = 90 MB`, ma è un **totale per
  richiesta**: nessun controllo per-file, nessuno sul numero. Una foto da 80 MB
  entra (l'app la rifiuta a 25); 200 file piccoli entrano.
- `api/link/prepara/route.ts` → **nessun limite di dimensione**, per scelta
  dichiarata nel suo docblock («il limite diventa quello di R2, 5 GB»).
  ⚠️ Fra 2 e 5 GB: file consegnato al cliente che **dall'app non sarebbe mai
  potuto partire**. Sopra 5 GiB: resta `sync_failed` per sempre mentre l'utente
  lo crede caricato.

---

## 5. Scritte con un numero che può diventare falso

| Dove | Cosa dice | Nota |
|---|---|---|
| `office/personale/permessi/_components/area-documento.tsx` | «Il limite è 15 MB», «fino a 15 MB» | coerente oggi, ma il numero è scritto in **5 posti** (3 in codice, 2 stringhe) |
| `office/personalizzazioni/paghe/_components/certificato-dialog.tsx` | «Fino a 15 MB» | e **non ha nessun controllo client**: si affida al server |
| `office/impostazioni/branding/_components/branding-form.tsx` | «max 2 MB» | duplicato a mano di `branding.ts` |
| `office/kantiere/kontabilita/_components/nuova-spesa-office.tsx` | — | una ricevuta da 12 MB prende 413 e l'utente legge **«Non sono riuscito a leggere la ricevuta. Riprova.»** Il limite di 8 MB non è scritto da nessuna parte nell'interfaccia office (il mobile fa meglio) |
| `api/upload/media/[id]/flatten/route.ts` | `max 52428800 byte` | byte grezzi in un messaggio d'errore |

⭐ **Buon esempio da imitare**: `api/link/upload/route.ts` **calcola** il numero
dalla costante (`${Math.round(MAX_BYTES / 1024 / 1024)} MB`) invece di scriverlo
a mano.

---

## 6. Assegnazioni che non notificano

`commessa_tecnici` (assegnare un tecnico a una **commessa**) scrive solo
`audit_events`: il tecnico scopre la commessa perché compare nelle sue liste.
Ora che `notificaAssegnazione` esiste, è poco lavoro.

**Incoerenza nel catalogo notifiche**, preesistente: il codice inserisce
`type: 'commessa_assigned'` mentre `notification_event_types` ha
`commessa_assegnata`. Stringhe diverse → per quella riga le **preferenze
per-utente non si applicano**.

---

## 7. Ricerca cliente: metà unificazione

Il form di creazione commessa (`office/commesse/nuova/_components/form.tsx`,
1555 righe) è passato **sull'hook condiviso** — via la query Supabase fatta dal
browser — ma ha **mantenuto il suo markup** della tendina, che è intrecciato
con gli errori di campo (`fieldErrors.ragione_sociale`, `aria-describedby`).

Quindi esistono ancora due rese della stessa interazione. Sostituire anche il
markup è fattibile, ma è la pagina principale di creazione commessa in
produzione: non nello stesso push di una funzione nuova.

Il dettato vocale (`voice-review.tsx`) **resta diverso di proposito**: avvisa
che il cliente forse esiste già, non lo fa scegliere.

---

## 8. Note tecniche da tenere a mente

### 8.1 `database.generated.ts` è arretrato di ~3600 righe

2579 righe committate contro 6166 generando dal cloud (`supabase gen types
typescript --linked`). È il motivo dei `.from('x' as never)` sparsi: mezzo
schema non è tipizzato (`commessa_todo`, `tenant_modules`, `platform_settings`,
`transcribe_model`…).

Rigenerarlo **non è un refactor piccolo**: farebbe emergere errori in tutto il
repo dove i cast nascondono disallineamenti. Va fatto come lavoro a sé.
⚠️ Lo script `pnpm supabase:types` punta a `--local`, non al cloud.

### 8.2 `/office/tickets` è orfano dalla navigazione

Non è in `DEFAULT_OFFICE_NAV`; il `case 'tickets'` in `office-shell-client.tsx`
è **codice morto**. La pagina è viva e funzionante, raggiungibile solo dalla
ricerca globale. E la pagina Task dichiara nel codice di sostituirla
concettualmente. Da cancellare, prima o poi.

### 8.3 Un terzo numero nello stesso dominio

`_actions/kantiere-spese.ts` valida `sizeBytes` a **20 MB** in
`creaSpesaOffice`, mentre le due rotte che caricano davvero si fermano a **8 MB**.
I 20 MB sono gioco morto, ma sono un terzo numero.

### 8.4 Picker e server non dicono la stessa cosa

`certificato-dialog.tsx` ha `accept="application/pdf,image/*"` contro la lista
chiusa del server (pdf, jpeg, png, webp, heic): un `image/gif` passa il picker
e viene respinto **dopo** l'invio.

### 8.5 Lettura-poi-scrittura senza lucchetto

Le due azioni dei limiti di upload leggono il valore precedente e poi scrivono.
Due super admin che salvano insieme si sovrascrivono, senza avviso. Probabilità
reale bassissima (un solo super admin, operazione rara). Si risolverebbe con un
merge `jsonb` lato SQL (`valore || $1`) o un `if_version`.

### 8.6 `commessa_bozze` è privata dell'autore

RLS `created_by = auth.uid()`. Chi converte una richiesta diventa l'autore della
bozza e **un collega non la vede né la può finalizzare**. Per un centralino con
più persone che si passano il lavoro potrebbe dare fastidio.

### 8.7 Chi può registrare una richiesta

Solo `admin` / `office` (`FULL_ROLES` di `creaTodo`). Un capo in giro che riceve
una chiamata diretta non può registrarla. Da valutare se serve.

### 8.8 Niente dettaglio richiesta su mobile

L'assegnatario vede la riga e può **chiamare**, ma per cambiarne lo stato o
aggiungere una nota deve passare dall'ufficio.

---

## 9. Verifiche fatte, perché non si rifacciano

- **Tetti e vincoli**: `MAX_SIZE_BYTES` = 2 GiB in `init` (dentro lo schema
  zod), `SYNC_MAX_BUFFER_BYTES` = 5 GiB nella sync. Il primo è il bordo che
  morde.
- **`audit_events.tenant_id`**: era `NOT NULL`; ora nullable. Le policy
  gestiscono il NULL correttamente (`audit_events_read` vuole
  `tenant_id = current_tenant_id()`, che con NULL non combacia mai; il super
  admin passa da `is_platform_admin()`). 55 righe di piattaforma preesistenti,
  tutte con un tenant reale.
- **`platform_settings`**: `authenticated` ha solo SELECT, `anon` niente.
  Verificato che un utente autenticato legge `limiti_upload` e che una chiave
  nuova inserita nella stessa transazione **non** è visibile.
- **Nomi dei vincoli FK** di `commessa_todo`: letti dal database, non dedotti.
  `commessa_todo_cliente_id_fkey` esiste con quel nome.
- **Tenant all'apply**: BER, FPMIMP, DEMOK, DEMOC tutti a `upload_config = {}`
  e zero task orfani preesistenti → nessun comportamento cambiato.
- **Autorizzazioni**: le azioni dei limiti hanno `requirePlatformAdmin()` come
  prima istruzione; `20260915180000` concede `UPDATE` su `tenants` solo a 6
  colonne e `upload_config` non c'è → un tenant non può alzarsi i limiti da sé.
