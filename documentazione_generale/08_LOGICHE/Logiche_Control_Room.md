# Logiche — Salute di Kommessa e lettura esterna (Control Room Solva)

**Versione**: 2.1
**Stato**: piano approvato, codice non ancora scritto
**Data**: 19/10/2026
**Sostituisce**: v1.0 del 19/10, che conteneva **due attribuzioni sbagliate** (vedi §5.3), trattava il lavoro come «un endpoint» invece che come «un modello di salute», e metteva **una cadenza sola** su tre controlli che costano e rischiano in modo diverso (vedi §7.1).

---

## 0. Il vincolo, riformulato con precisione

> ⛔ **Per chi usa l'applicativo non cambia niente.** Nessuna pagina d'ufficio, nessuna schermata del telefono, nessuna azione, nessun cron, nessuna RLS.
>
> ✅ **Cambia ciò che vede il super admin**, e **solo dopo** che i test dimostrano che i verdetti sono identici a quelli di oggi (§9).

Cosa questo significa in concreto:

| | |
|---|---|
| **L'endpoint è in sola lettura** | nessuna scrittura su tabelle di dominio. L'unica scrittura è nella tabella nuova dei propri controlli |
| **Niente scritture sullo storage dei clienti** | nessun file di prova su Nextcloud, nessuno su R2. Solo `PROPFIND` e `listObjects` |
| **Non si tocca** | le rotte di upload · il sincronizzatore · tutti e cinque i cron · `/api/health` · ogni RLS esistente · ogni superficie utente |
| **Si tocca, autorizzato** | `/admin/salute` (riscritta sul modello comune, con i test a garanzia) |
| **Nessuna dipendenza npm nuova** | |
| **Migration additiva** | una colonna e una tabella che, fuori dal nuovo modello, nessuno legge |

File modificati fuori dall'area nuova: `apps/web/middleware.ts` (una riga, che riguarda **solo** `/api/controlroom/*`), `turbo.json`, `.env.example`. Nessuno dei tre cambia un comportamento esistente.

---

## 1. Il salto di livello: un modello di salute, N lettori

La v1.0 progettava «un endpoint che riporta sette numeri». Un livello sopra, il problema vero è che **Kommessa non ha un modello della propria salute**. Ha sei pagine d'amministrazione che ricalcolano un verdetto ciascuna, con soglie proprie, e nessuna che scriva niente. Da cui tre difetti che la v1.0 accettava senza discuterli:

- **non esiste storia.** Un rallentamento alle tre di notte è invisibile la mattina dopo;
- **la stessa domanda ha risposte diverse in posti diversi.** `/admin/media` dice verde con tre righe «in attesa»; un indicatore nuovo le direbbe rosse. Nessuno dei due mente: hanno soglie diverse perché **nessuno ha mai deciso quale sia la soglia**;
- `tenant_usage_snapshot` **era** il tentativo di persistere tutto questo, ed è morto il 07/10 senza che nessuno se ne accorgesse (§3.4). Una cache di salute che nessuno legge marcisce.

⭐ **Quindi**: un modulo risponde a «come sta?», e i lettori sono tre — le pagine del super admin, l'endpoint della Control Room, il cron degli avvisi. L'endpoint smette di essere la funzione e diventa **il primo lettore esterno** di una cosa che a Kommessa serviva comunque.

Forma di una risposta del modello, per ogni controllo:

| campo | perché c'è |
|---|---|
| `chiave`, `etichetta` | nome stabile e nome leggibile, **uno solo per tutti i lettori** |
| `soggetto` | piattaforma, oppure un tenant |
| `stato` | `ok` / `attenzione` / `guasto` / `sconosciuto` |
| `valore`, `num`, `unita` | il numero e come si legge |
| `momento` | **quando è stato misurato**, non quando è stato chiesto |
| `provenienza` | ⭐ **da quale evento o predicato nasce**, e se è un *evento contato* o una *fotografia di stato* |

L'ultimo campo non è burocrazia: è la difesa contro l'errore descritto in §5.3, che in questo documento è stato commesso due volte.

## 2. Dal punto di vista del super admin

Oggi, per sapere come vanno le cose, si aprono sei pagine — salute, media, integrazioni, accessi, kantiere, audit — più la dashboard. Nessuna tiene memoria. E soprattutto: **quando Solva dirà «il semaforo di Kommessa è giallo», in Kommessa non c'è una pagina che mostri quello che la Control Room vede.** Due viste su una verità.

⭐ **`/admin/salute` diventa «quello che vede la Control Room»**: stesso modello, stesse soglie, stessi nomi, più le due cose che l'endpoint non può dare — **la storia** e il dettaglio per tenant. La pagina e il semaforo diventano la stessa frase letta in due posti, e il super admin guadagna una cosa che oggi non ha affatto: poter dire *com'era ieri*.

---

## 3. Dati misurati il 19/10/2026

Tutto interrogato sul database di produzione. Nessun numero stimato.

### 3.1 I tenant

| slug | nome | app_mode | storage_provider | r2_config | utenti attivi |
|---|---|---|---|---|---|
| `BER` | Bertaiola Impianti | kommessa | **nextcloud** | vuoto | 21 |
| `FPMIMP` | FPM Impianti | kantiere | **r2** | vuoto | 35 |
| `DEMOK` | Rossi Impianti (DEMO) | kommessa | supabase | vuoto | 4 |
| `DEMOC` | Nordest Cantieri (DEMO) | kantiere | supabase | vuoto | 5 |

Nessuno sospeso. ⭐ **`r2_config` vuoto su tutti e quattro**: non esiste un R2 per cliente, c'è **un bucket solo** da variabili d'ambiente, condiviso.

### 3.2 Volumi, e cosa ne consegue

| misura | valore | conseguenza |
|---|---|---|
| `file_refs` | **403 righe** | i conteggi non vogliono né funzioni aggregate né paginazione, e **non vanno in cache** |
| dimensione database | **54 MB** | lo spazio non è un indicatore: dirà zero per anni |
| guasti AI **in assoluto** | **5**, l'ultimo il 10/09 | l'indicatore è muto quasi sempre, ed è giusto così |
| caricamenti dal flusso R2 | **541**, dal 28/05 al 15/10 | è il canale reale |
| caricamenti dalla rotta legacy | **0, mai** | §5.3 |
| annotazioni salvate | **0** su tutta la tabella | §5.2 |

### 3.3 Stati dei file (BER e DEMOK; FPM e DEMOC non hanno righe in `file_refs`)

| tenant | stato | righe | lettura |
|---|---|---|---|
| BER | `synced` | 385 | a destinazione |
| BER | `uploaded` | 3 | ⚠️ **non sono caricamenti**: §5.2 |
| BER | `deleted` | 13 | cestino |
| DEMOK | `synced` | 2 | marcati a mano per la dimostrazione |

**Zero `sync_failed`, zero `failed`.** E col predicato vero del sincronizzatore (§6.2) i file in attesa sono **zero per tutti i tenant**.

### 3.4 Attività: la misura che smentisce l'intuizione

| tenant | ultimo audit | ultima commessa | ultima timbratura |
|---|---|---|---|
| BER | 19/10 09:07 (3 h) | 19/10 09:07 (3 h) | — |
| FPMIMP | 17/10 11:14 (**48 h**) | — | **19/10 10:32 (1 h)** |
| DEMOK | 12/10 10:22 | 12/10 10:12 | — |
| DEMOC | 15/09 10:00 | — | 22/07 15:54 |

⭐ **Su FPM l'audit è vecchio di due giorni mentre l'app è in uso adesso.** Definire «ultima attività» come «ultimo evento di audit» avrebbe acceso un allarme falso su trentacinque persone che timbrano. Da qui la regola per mondo (§7.3).

Stessa cosa sulle persone: in sette giorni l'audit vede **4 persone su BER e 2 su FPM**; i login **1 e 2**. Nessuno dei due è «quante persone usano l'app»: nella PWA si entra una volta e si resta, e un `users.last_seen_at` non esiste.

`tenant_usage_snapshot`: `snapshot_at` = **07/10 11:05 su tutti e quattro**. Dice che Bertaiola è ferma dal 7 ottobre, mentre l'hanno usata stamattina. **Non si usa come fonte.**

### 3.5 Vincoli tecnici verificati

| fatto | conseguenza |
|---|---|
| `CONTROLROOM_TOKEN` esiste su Vercel (Production, Sensitive) | niente da creare |
| **non è in `turbo.json` → `globalEnv`** | ⚠️ va aggiunta, **o Turbo non la vede in build**: in produzione risulta assente, ogni richiesta 401, e sembra un guasto della Control Room |
| nessuno fa `select('*')` su `tenants` | una colonna nuova **non vuole `grant`** e non rompe nessuna lettura |
| `/api/controlroom` non esiste | nessuna collisione |
| il middleware **non reindirizza mai al login** | l'esclusione serve solo a **saltare `auth.getUser()`**: 100-200 ms × 1440 al giorno |
| `segretoValido` / `bearerValido` esistono | il confronto a tempo costante **non si riscrive** |
| `testR2Connection()` è una server action con `requirePlatformAdmin()` | **non riusabile** senza sessione admin: si riusa la primitiva `getR2ProviderFromEnv().listObjects()`, non l'azione |
| `OPENAI_API_BASE` è esportato | la URL non si riscrive |
| `/admin/salute` fa i PROPFIND **in sequenza** | con quattro tenant sarebbero 20 secondi: nel modello vanno in parallelo |

---

## 4. Il contratto JSON

### 4.1 Indicatori della piattaforma — sette

| key | Etichetta | Valore | Verde | Giallo | Rosso |
|---|---|---|---|---|---|
| `db` | Database | ms | < 300 | ≥ 300 | errore |
| `r2` | Archivio R2 | ms | < 1000 | ≥ 1000 | errore o variabili incomplete |
| `nextcloud` | Nextcloud | ms del peggiore | < 1500 | ≥ 1500 | errore o configurazione incompleta |
| `openai` | Collegamento OpenAI | ms | < 3000 | ≥ 3000 | chiave rifiutata o irraggiungibile |
| `media_in_attesa` | File in attesa di Nextcloud | «N in attesa», `num` = ore del più vecchio | < 2 h | ≥ 2 h | ≥ 24 h |
| `ai_guasti_24h` | Guasti AI 24 h | numero | 0 | 1-5 | > 5 |
| `users_today` | Persone attive oggi | numero | sempre verde | — | — |

I quattro controlli esterni portano in `detail` **l'ora dell'ultimo controllo**.

### 4.2 Per tenant — e non sono simmetrici, di proposito

**`ber`** (5): `users_today` · `ultima_attivita` · `media_in_attesa` · `ai_guasti_24h` · `nextcloud`
**`fpmimp`** (3): `users_today` · `ultima_attivita` · `ai_guasti_24h`

⭐ FPM non ha un Nextcloud da controllare, e non può avere file in attesa: per un tenant `storage_provider = 'r2'` il sincronizzatore marca `synced` immediatamente (§6.1), quindi quell'indicatore sarebbe **zero per costruzione, per sempre**. Riempire un blocco di caselle che per quel cliente non vogliono dire niente è il modo più sicuro di far smettere di guardare il pannello.

`ultima_attivita`: verde < 72 h, giallo ≥ 72 h, rosso ≥ 168 h. **Le 72 ore non sono arrotondate a caso**: da venerdì sera a lunedì mattina passano circa 60 ore di chiusura normale, e una soglia più stretta accenderebbe un giallo ogni fine settimana.

**`id` del tenant = lo slug in minuscolo** (`ber`, `fpmimp`), mai lo UUID. I due tenant dimostrativi non escono (§8).

---

## 5. Le cinque porte di `file_refs`, e il campo che fa due mestieri

È la parte che la v1.0 aveva capito male, ed è il motivo per cui questo documento esiste in versione 2.

### 5.1 Chi scrive in `file_refs`, e con quale contratto

| porta | `status` | `r2_key` | cosa descrive la riga |
|---|---|---|---|
| `api/upload/media/init` | `uploading` → `uploaded` | sì | un caricamento nel flusso R2. **541 volte**, è il canale reale |
| `api/link/upload` (comando iOS) | `uploading` → `uploaded` | sì | idem, da fuori l'app |
| `api/link/prepara` | `uploading` | sì | idem, preparazione |
| **`_actions/annotations.ts` → `risolviFileRefPerPath`** | **non scritto → default `uploaded`** | **no** | ⚠️ **un file che sta GIÀ su Nextcloud**, referenziato per poterci attaccare annotazioni |
| `api/upload/media/route.ts` (legacy) | non scritto → default `uploaded` | no | **mai usata in produzione** (§5.3) |

### 5.2 Le tre righe `uploaded` di Bertaiola: non sono caricamenti

`risolviFileRefPerPath` valida che il percorso stia dentro la cartella della commessa, verifica che l'utente possa accedere al file, e **cerca-o-crea** una riga `file_refs`. È chiamata dal **desktop d'ufficio**, tab *Documenti*, tasto «Annota» su un PDF (`documenti/_components/pdf-annotate-button.tsx`, `documenti/[file]/annota/client.tsx`).

Misurato: le tre righe sono PDF, **zero annotazioni** attaccate, e zero annotazioni in tutta la tabella. Due su tre stanno in una cartella `Preventivi` di commesse vere. **Tre clic su «Annota», tre righe, nessuna annotazione salvata.**

> ⭐ **`file_refs.status` fa due mestieri**: dice insieme *a che punto è un caricamento nella nostra pipeline* e *dove sta il file*. Per un file che non è mai entrato nella pipeline — un PDF che vive su Nextcloud — l'enum **non ha un valore onesto**, quindi prende il default `uploaded`, che significa «su R2, in attesa di sync»: **falso in entrambe le metà**.
>
> È lo stesso difetto già incontrato l'08/10 con `descrizione_ai_finale` — *un campo, due mestieri, e vinceva quello sbagliato*.

**Conseguenze operative:**
- **non si costruisce un indicatore sullo `status`.** Si costruisce su «cosa il sincronizzatore può prendere» (§6.2), che è una domanda sul lavoro da fare;
- `/admin/media` calcola `pendingSync = uploaded + sync_failed`: conta quelle righe «in attesa» **per sempre**, e ne conterà una in più a ogni clic su «Annota». È un difetto strutturale, non un residuo — si chiude con il modello comune (§12, fase 2);
- **niente manca a nessuno.** Nessuna foto, nessun documento. L'allarme della v1.0 era falso.

### 5.3 Come ho sbagliato, due volte, e la regola che ne esce

| affermazione della v1.0 | realtà misurata |
|---|---|
| «tre foto non sono mai arrivate su Nextcloud, una da 80 giorni» | i file **sono** a destinazione: la riga descrive un file del cloud, non un caricamento |
| «le ha scritte `api/upload/media/route.ts`, che il `CLAUDE.md` dichiara orfana a torto» | quella rotta ha **zero** eventi `via: api_buffered` in assoluto: **non ha mai ricevuto un caricamento**. Il `CLAUDE.md` ha ragione |

Il meccanismo dell'errore è lo stesso due volte: **dedurre un evento da uno stato**, poi **dedurre un autore dalla forma del codice** invece che da una prova.

> ⭐ **La regola, ed è per questo che il modello ha il campo `provenienza`**: ogni indicatore dichiara da quale evento nasce; se nasce da uno stato, dichiara che è **una fotografia e non un conteggio**. Chi legge il semaforo deve poter sapere se un rosso significa «è successo N volte» o «adesso è così».

### 5.4 La rotta legacy si può ritirare, ed è dimostrato

Storia: nata il 21/05 come motore di caricamento del desktop d'ufficio (`office/commesse/nuova/_lib/upload-media.ts`), migrata al flusso R2 **lo stesso giorno** (`8d4086b`), ultimo residuo di citazione tolto il 15/09 (`aa1e187`). Audit: **zero caricamenti, mai**.

Quindi non è «nessun chiamante oggi» ma **nessun caricamento in tutta la vita dell'applicazione**, e si può togliere senza il rischio che il `CLAUDE.md` ipotizza. ⚠️ Resta un cambio di funzionalità: va in lista (§13), non in questo lavoro. La nota del `CLAUDE.md` va aggiornata col dato al posto dell'ipotesi.

---

## 6. La logica di assegnazione R2 / Nextcloud

### 6.1 Una porta sola, tre destinazioni

**Ogni caricamento normale passa prima da R2**, con una PUT firmata dal dispositivo, **per tutti i tenant indistintamente**: non esiste un percorso che scelga R2 *oppure* Nextcloud in base al cliente. Poi la destinazione dipende da `tenants.storage_provider`:

| provider | chi | cosa fa `syncOneFile` |
|---|---|---|
| `nextcloud` | **BER** | sposta su Nextcloud e marca `synced`. ⭐ **La miniatura resta su R2**, ed è quella che le gallerie servono |
| `r2` | **FPMIMP** | **nessun sync**: marca `synced` per formalità e si ferma. R2 **è** la casa definitiva |
| `supabase` | i due demo | il sync fallirebbe. Irrilevante: esclusi |

⭐ **R2 è il punto singolo di guasto dell'intera applicazione.** Se è giù: nessuno carica niente in nessun tenant, **e** nessuna foto si vede più in nessuna galleria (`/api/photo/[id]?size=thumb` è un redirect verso R2), anche con Nextcloud perfettamente sano. Per questo l'indicatore si chiama `r2` e non `r2_staging`: un nome che dice «transito» fa leggere l'allarme come «si perde qualche upload», mentre ciò che si rompe è tutto.

### 6.2 Il predicato vero del sincronizzatore

```sql
deleted_at is null
and bozza_id is null                    -- bozza non finalizzata
and r2_key is not null                  -- esclude chi non è mai passato da R2 (§5.1)
and ( status in ('uploaded','sync_failed')
      or (status = 'syncing' and updated_at < now() - interval '10 minutes') )
and tenant.storage_provider <> 'r2'     -- i tenant r2-only non hanno un Nextcloud
```

**`media_in_attesa` usa esattamente questo.** Qualunque definizione più larga conta righe che non si muoveranno mai e accende un rosso che non può tornare verde — che è la forma più efficace di far ignorare un pannello.

---

## 7. Come si calcola ogni indicatore

### 7.1 Tre controlli in cache, uno dal vivo — e una cadenza per ciascuno

⭐ **`db` NON va in cache.** L'endpoint interroga il database comunque, a ogni chiamata, per i conteggi di §7.2 e §7.3: misurare la latenza di una query che stiamo già facendo costa zero. In cache vanno **tre** controlli, non quattro.

**Regola per i tre esterni**: l'endpoint **non chiama mai** R2, Nextcloud o OpenAI mentre risponde. Legge l'ultimo risultato scritto; se è più vecchio della sua cadenza ne fa rinfrescare uno in sottofondo (`waitUntil`) e restituisce quello che ha, **dichiarando l'età**.

Perché non dal vivo: senza I/O esterno nel percorso della richiesta il tetto dei 2 secondi smette di essere un problema; l'endpoint non può amplificare carico verso terzi se il token finisce in mano sbagliata; e il grafico di Solva non eredita le oscillazioni di latenza di Hetzner e OpenAI. ⭐ In più un controllo datato dice una cosa che uno istantaneo non può dire: **da quanto nessuno guarda**. Se l'età smette di scendere, quello è un guasto in sé.

⚠️ **Una cadenza sola per tre cose diverse era l'errore della v1.0** (erano 30 minuti per tutti). Costo di controllare e costo di arrivare tardi sono **sbilanciati in direzioni opposte**: R2 è quello che costa meno controllare ed è il punto singolo di guasto dell'applicazione (§6.1) — tenerlo in cache mezz'ora significa mezz'ora di «va tutto bene» su un disastro. Quando le due parti sono così sbilanciate si sceglie il lato che sbaglia in modo innocuo.

| controllo | cadenza | timeout | come | perché questa cadenza |
|---|---|---|---|---|
| `db` | **dal vivo** | 1500 ms | `count` con `head: true` su una tabella piccola | la query si fa comunque |
| `r2` | **2 min** | 2000 ms | `getR2ProviderFromEnv().listObjects('', { maxKeys: 1 })` | nostro bucket, operazione banale, punto singolo di guasto |
| `nextcloud` | **5 min** | 2000 ms ciascuno | `PROPFIND Depth: 0` su `{baseUrl}/remote.php/dav/files/{user}/{basePath}`, per ogni tenant `nextcloud`, **in parallelo**. `207` = ok | è la macchina del cliente e ogni richiesta gli fa verificare una password: un po' di misura è giusta. Ma Nextcloud giù vuol dire foto che non arrivano a destinazione |
| `openai` | **15 min** | 3000 ms | `GET ${OPENAI_API_BASE}/models`, chiamata non a consumo | una chiave morta degrada dettatura e scansione, non ferma l'app. E i guasti veri li vede `ai_guasti_24h` dal vivo: il probe dice solo «la chiave è ancora valida», cosa che cambia raramente |

**Alla primissima chiamata** i tre valgono `sconosciuto` con dettaglio «primo controllo in corso». Onesto, e si risolve al giro dopo.

### Tre trappole della cadenza, da scrivere adesso

⚠️ **Su «credenziali sbagliate» di Nextcloud si rallenta di colpo, a un'ora.** Nextcloud ha la protezione contro i tentativi a raffica: una password applicazione errata più un controllo ogni cinque minuti e i nostri indirizzi finiscono limitati dal server del cliente — che poi penalizza **anche il sincronizzatore vero**. Su errore di **rete o 5xx**, invece, si resta alla cadenza normale.

⭐ **Non si rallenta perché è rosso.** L'istinto è allontanare i tentativi quando una cosa è guasta; per un monitoraggio è sbagliato, perché la notizia che serve di più è **«è tornato»**, e rallentando arriva tardi. L'unica eccezione è quella sopra, e non riguarda la gravità ma il *tipo* di errore.

⚠️ **Con più istanze su Vercel un rinfresco pigro fa partire tre probe insieme.** Il rinfresco si **prende in carico** con un aggiornamento condizionato sul momento dell'ultimo controllo — lo stesso schema di claim atomico che `sync-r2-to-nextcloud` usa già per non lavorare due volte sullo stesso file.

### 7.2 I conteggi, live a ogni chiamata

Le tabelle sono minuscole: **non vanno in cache** (⚠️ il contrario di quanto suggerisce il kit di Solva — qui i lenti sono i servizi esterni, non le query).

- `media_in_attesa`: il predicato di §6.2. `num` = **ore del più vecchio**; la soglia guarda l'età, non il conteggio. **Provenienza: fotografia di stato.**
- `ai_guasti_24h`: `audit_events` con `action = 'platform.ai_unavailable'` nelle 24 h. **Provenienza: eventi contati.**

### 7.3 Attività e persone: per mondo, non per comodità

⭐ Una tabella sola non dice l'attività di entrambi i mondi, e §3.4 lo dimostra coi numeri.

| mondo | `ultima_attivita` | `users_today` |
|---|---|---|
| commesse → **BER** | il più recente fra `max(audit_events.created_at)` e `max(commesse.updated_at)` | persone distinte con un evento di audit **oggi** (Europe/Rome) |
| presenze → **FPMIMP** | il più recente fra `max(audit_events.created_at)` e `max(timbrature.created_at)` | persone distinte che hanno **timbrato oggi** |

`users_today` resta **sempre verde**: è un numero da leggere, non una soglia. ⚠️ Va dichiarato a Solva che misura **chi ha fatto qualcosa**, non chi era connesso.

---

## 8. La migration — una, additiva, idempotente

Applicata con `supabase db query --linked < file.sql` (⚠️ `db push` non funziona su questo repo).

**a) `tenants.dimostrativo boolean not null default false`**, con `true` su `DEMOK` e `DEMOC`. Serve perché oggi un tenant dimostrativo si riconosce **solo dal «(DEMO)» nel nome**, convenzione che si rompe al primo cliente rinominato. ✅ Verificato che **non serve alcun `grant`**: nessuna lettura fa `select('*')` su `tenants`.

**b) Una tabella piccola per i controlli**: chiave, soggetto, stato, valore, dettaglio, **momento del controllo**. Upsert, una riga per controllo. È anche ciò che dà la **storia** al super admin (§2) e, in un secondo giro, il posto per l'esito dei cron.

Non si usa `platform_settings`: è la tabella delle **impostazioni**, e il suo commento avverte che è un contenitore generico da maneggiare con cura. Uno **stato** merita un posto proprio.

RLS accesa, **nessuna policy permissiva**, `revoke all from anon, authenticated`: ci accede solo il service role — stessa forma di `commessa_link_pubblici` e `bacheche_pubbliche`.

---

## 9. Unificare i probe: il metodo, che è la parte che conta

I probe di Nextcloud, R2 e del database esistono oggi in `/admin/salute`. Vanno unificati nel modello comune. ⭐ **L'unificazione non è una pulizia: è il punto** — due copie significano che il giorno in cui una soglia cambia in un posto, la pagina e il semaforo diranno cose diverse e nessuno saprà quale ha ragione.

**Ordine obbligatorio, e non è negoziabile:**

1. **Si scrivono i test contro il comportamento ATTUALE** di `/admin/salute`: per ogni controllo, le soglie di oggi e i casi di bordo (800 ms sul database, `207` di Nextcloud, config incompleta, 401 da Deployment Protection trattato come avviso e non come guasto).
2. **Si vedono passare** sul codice attuale, non toccato. Se un test non passa, ho capito male il comportamento attuale: si corregge il test, non il codice.
3. ⭐ **Si vedono FALLIRE**: si altera di proposito una soglia e si verifica che il test diventi rosso. Un test che non sa bocciare la regressione che descrive non è un test — in questo repo è già capitato, su `ETICHETTA_ASSEGNA_A`.
4. Si estrae il modello comune, si rifattorizza `/admin/salute` per leggerlo, **gli stessi test passano invariati**.
5. Si aggiunge l'endpoint come secondo lettore.

Le soglie di oggi si **conservano** nel passaggio. Se una va cambiata, è una decisione a parte, dopo, con il suo test.

---

## 10. Sicurezza e forma della risposta

- **Token** in `Authorization: Bearer <token>`, confronto a tempo costante con `CONTROLROOM_TOKEN` (e `CONTROLROOM_TOKEN_NEXT` per le rotazioni) **usando `bearerValido` che esiste già**.
- **Il token si verifica prima di qualunque altra cosa**, prima di ogni lettura e di ogni I/O.
- **Errore sempre `401` generico** `{"error":"unauthorized"}`, senza dettagli. `Cache-Control: no-store` su ogni risposta.
- **Nessun parametro ammesso**: query string o corpo → 401.
- **Circa 10 richieste al minuto.** ⚠️ È **decorativo**: il contatore è in memoria e ogni istanza ha il suo. La difesa è il token; non vale introdurre Redis.
- **Nel JSON solo** conteggi, stati, tempi, versione e ragioni sociali dei due clienti. **Mai** nomi di persone, email, contenuti, credenziali, URL interni, percorsi di file, nomi di tabelle, messaggi d'errore o stack trace.
- `version` = i primi 7 caratteri di `VERCEL_GIT_COMMIT_SHA`, come già fa `/api/health`.
- ⚠️ `CONTROLROOM_TOKEN` in `turbo.json` → `globalEnv` **e** in `.env.example`. In locale un token di prova in `.env.local`, **mai quello di produzione**.

### Dove vive il codice

```
packages/api/src/salute.ts                      puro: tipi, soglie, giudizi. Testato, nessun I/O
apps/web/app/_lib/salute/                       i rilevatori: probe, conteggi, lettura/scrittura dei controlli
apps/web/app/api/controlroom/health/route.ts    lettore esterno: assembla e serializza
apps/web/app/admin/salute/page.tsx              lettore interno: riscritta sul modello + storia
```

---

## 11. Fuori ambito, e perché

| escluso | motivo |
|---|---|
| `errors_24h` | **decisione di Solva: non interessa.** Non esiste una tabella di errori; la fonte sarebbe Sentry, configurato e attivo |
| `supabase_usage` | **decisione di Solva: non interessa.** E il database è a 54 MB: dirà zero per anni |
| **tutti gli indicatori ERGO** | **decisione di Solva: fuori dalla salute di Kommessa**, perché riguardano il singolo tenant FPM. Esiste già `/admin/integrazioni` con un giudizio puro e testato (`@kommessa/api/integrazione-salute`) |
| `ergo_reachable` | **non sarebbe implementabile**: è l'agente di ERGO che chiama Kommessa da una VM senza porte esposte. In tutto il repo **non esiste un `fetch` verso un host esterno** |
| `ergo_queue` | **non esiste più**: `integrazione_outbox` creata ad agosto e droppata, passando «da coda di lavoro ad API a risorse» |
| upload di prova su R2 e Nextcloud | **decisione di Solva: sola lettura.** Scrivere 1440 volte al giorno nello Storage Share del cliente, col rischio che una cancellazione fallita lasci spazzatura fra le cartelle delle commesse. E un upload riuscito non dice che il sync funziona |
| un contatore delle richieste AI | abiliterebbe «fallite / totali» e il costo per cliente, ma è una **funzione nuova del prodotto**: da sola, un'altra volta |

---

## 12. Le fasi

**Fase 1 — questo lavoro.** Il modello puro con i test · i probe unificati col metodo di §9 · la persistenza dei controlli · l'endpoint · `/admin/salute` riscritta come «quello che vede la Control Room», con la storia. Migration: flag demo + tabella dei controlli.

**Fase 2 — da autorizzare.** `/admin/media` e la dashboard leggono lo stesso modello, così «come stanno i media» ha **una** risposta e il `pendingSync` smette di contare le righe di §5.2. Più la decisione su quelle righe: nascono `synced` (il file **è** a destinazione) oppure serve un valore che dica «vive sul cloud, non passa da noi».

**Fase 3 — da autorizzare.** Ritiro della rotta legacy (ora dimostrato sicuro, §5.4) · l'esito dei cron persistito, che risponderebbe a «il sincronizzatore gira?», oggi non sapibile · `users.last_seen_at`, per rendere vero «persone attive».

---

## 13. Lista aperta — trovata misurando, da affrontare a parte

Nessuna viene toccata da questo lavoro. Il modello le rende **visibili**, non le risolve.

1. **`/admin/media` conta «in attesa» le righe di annotazione** (§5.2), e ne conterà una in più a ogni clic su «Annota» su un documento del cloud.
2. **`risolviFileRefPerPath` scrive righe senza `status` e senza `r2_key`**: il default `uploaded` è falso in entrambe le metà.
3. **`tenant_usage_snapshot` è fermo al 07/10 11:05** su tutti e quattro i tenant. Da riparare o da ritirare: è il quarto pannello che promette e non mantiene.
4. **Sette spese appese** su FPM e demo: due in `in_elaborazione` da 94 giorni, cinque con analisi fallita. Esiste già un indice parziale creato per questo recupero, e nessuno lo interroga.
5. **Una miniatura mancante** su 216 immagini di BER.
6. **Il sincronizzatore non lascia traccia dei suoi giri**: se pg_cron si fermasse, tutto si fermerebbe in silenzio.
7. **La nota del `CLAUDE.md` sulla rotta legacy** va aggiornata: non «nessun chiamante», ma **nessun caricamento mai** (§5.4).

---

## 14. Come si verifica

```
curl -i http://localhost:3000/api/controlroom/health
    → 401

curl -i -H "Authorization: Bearer <prova>" ".../api/controlroom/health?x=1"
    → 401 (parametri non ammessi)

curl -i -H "Authorization: Bearer <prova>" ".../api/controlroom/health"
    → 200, JSON, Cache-Control: no-store, sotto i 2 secondi
```

Valori attesi, dai dati del 19/10: `media_in_attesa` **0**, `ai_guasti_24h` **0**, due tenant, `ber` con cinque indicatori e `fpmimp` con tre, `ultima_attivita` di FPM che segue le **timbrature** e non l'audit.

Prima del rilascio: `pnpm build` e la suite esistente **invariati**, più i test di §9 verdi — ed è la prova che nessun verdetto è cambiato.

---

## 15. Cosa si riporta a Solva

1. URL di produzione dell'endpoint e URL pubblico dell'app.
2. `version` = i primi 7 caratteri del commit.
3. **`errors_24h` e `supabase_usage` non sono implementati per nostra decisione**: non ci interessano.
4. **Gli indicatori ERGO non escono da qui** per nostra decisione, e due dei quattro non sarebbero comunque implementabili: `ergo_reachable` perché è l'agente a chiamare noi, `ergo_queue` perché la coda non esiste più.
5. **Tre nomi cambiati perché cambiava il significato**: `nextcloud_upload` → `nextcloud` (non carichiamo niente), `media_failures_24h` → `media_in_attesa` (è una fotografia di stato, non eventi contati), `ai_failures_24h` → `ai_guasti_24h` (è un conteggio: il totale delle richieste AI non esiste).
6. **`users_today` conta chi ha fatto qualcosa**, non chi era connesso.
7. **Gli id veri sono `ber` e `fpmimp`**, non `fpm-impianti`. I tenant dimostrativi non escono.
8. **Tre controlli non sono dal vivo** (R2, Nextcloud, OpenAI): portano l'ora dell'ultimo controllo, con una cadenza propria ciascuno — 2, 5 e 15 minuti (§7.1). È deliberato, e le tre cadenze sono diverse di proposito. Il controllo del database invece è **sempre dal vivo**.
9. ⭐ **Ogni indicatore dichiara se è un conteggio di eventi o una fotografia di stato.** Serve a loro quanto a noi: un rosso che significa «adesso è così» si legge diversamente da uno che significa «è successo N volte».
10. Conferma che il JSON non contiene dati personali, URL interni né stack trace.
