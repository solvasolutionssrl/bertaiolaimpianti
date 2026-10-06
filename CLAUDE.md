# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stato produzione

> **L'app è in produzione dal 28/05/2026.** Bertaiola Impianti è il cliente reale attivo. Ogni push su `main` viene deployato automaticamente. Tratta il DB e i dati come produzione — no test casuali, no reset senza conferma esplicita.

### Stack AI (28/05/2026)

| Fase | Modello | Override |
|---|---|---|
| Trascrizione audio dettato | **`gpt-4o-mini-transcribe`** (per-tenant override su Bertaiola) | `tenants.transcribe_model` o env `OPENAI_MODEL_TRANSCRIBE` |
| Estrazione campi strutturati da transcript | `gpt-4o-mini` | env `OPENAI_MODEL_EXTRACT` |
| Suggerimento nome cartella + copilot | `gpt-5-mini` (fallback `gpt-4o-mini`) | env `OPENAI_MODEL_CHAT` |

Il modello di trascrizione è scegliebile per tenant dal pannello super admin (`/admin/tenants/[id]` → tab "AI"): whisper-1 / gpt-4o-mini-transcribe / gpt-4o-transcribe. Bertaiola usa `gpt-4o-mini-transcribe` (più accurato di whisper-1 su rumore di cantiere, costa la metà).

## What this repository is

This is the working repo for the **Bertaiola Impianti × SOLVA (Kommessa)** project. It contains:

1. **Codice di prodotto** (sviluppo attivo):
   - `apps/web/` — Next.js 14 App Router (3 superfici sotto un solo app: `office/`, `mobile/`, `portal/`)
   - `packages/api/`, `packages/ui/`, `packages/integrations/` — pacchetti workspace (`@kommessa/*`)
   - `supabase/migrations/` — schema versionato (55 migrazioni applicate al cloud al 18/06/2026)
   - `supabase/functions/` — Edge Functions (Deno)
   - `scripts/` — script operativi (es. `reset-tenant-data.mjs`, banchi di prova UI in `banco-ui/`)
2. **Documentazione di prodotto** sotto `documentazione_generale/` — kickoff, architettura, brand, roadmap, mockup, preventivo, presentazioni.

### Pipeline thumbnail foto (dal 28/05/2026 sera, 50ª migration)

Le gallerie immagini (PWA mobile, office riunioni, foto-tab) servono **thumb 400×400 webp ~30 KB persistenti su R2** invece del full-size 3-5 MB proxato da Nextcloud.

- **Generazione**: hook fire-and-forget nel `/api/upload/media/[id]/complete` chiama `generateAndUploadThumb()` (helper `apps/web/app/_lib/thumbnails.ts`). Solo `mime image/*`, usa `sharp ^0.33.5`.
- **Path R2**: `{stesso_path_originale}/thumbs/{shortId}.webp` — derivato via `deriveThumbKey()`.
- **DB**: colonna `file_refs.r2_thumb_key text` (migration `20260528010000`).
- **Endpoint**: `/api/photo/[id]?size=thumb` redirect 302 a signed GET R2 5min TTL; fallback al full-size proxy se thumb mancante (foto vecchie funzionano comunque).
- **Backfill**: POST `/api/admin/thumbs/backfill` con header `X-Internal-Backfill-Secret: $CRON_SECRET`, body `{limit?, dryRun?}`.
- **Admin osservabilità**: `/admin/media` mostra `% thumb generate` + flag visivo per riga (synced+thumb → riga emerald).
- **Video**: NON gestiti (`sharp` non li supporta). Restano su `<video preload="metadata">`. Futuro: ffmpeg-server o frame extraction client-side.

### Limiti di invio media configurabili (dal 05/10/2026, migration `20261005090000`)

Quanti file per volta e quanto può pesare una foto / un video / un PDF **non sono più costanti nel codice**: sono dato su tre livelli, e il default del conteggio è passato da 30 a **50**.

| Livello | Dove | Chi lo cambia |
|---|---|---|
| **Tetti tecnici** | `packages/api/src/limiti-upload.ts` (`TETTI_UPLOAD`) | nessuno: paracadute contro il refuso |
| **Default globale** | `platform_settings`, riga `limiti_upload` | super admin, card in `/admin/media` |
| **Override per tenant** | `tenants.upload_config` | super admin, tab **Upload** di `/admin/tenants/[id]` |

Una chiave **assente eredita** il livello sopra, non azzera: `{}` significa «fai come dice il globale», ed è perché l'apply non ha cambiato il comportamento di nessun tenant. Logica pura e testata in `@kommessa/api/limiti-upload` (`risolviLimitiUpload`, `validaLimitiUpload`, `applicaLimitiAConfig`, `sogliaAvvisoNumero`, `sogliaAvvisoVideoMb`), 30 asserzioni.

> ⚠️ **`platform_settings`: mai un segreto.** È leggibile dagli utenti autenticati (serve: il selettore file deve sapere cosa accetta) e la policy elenca le chiavi pubbliche una per una (`chiave IN ('limiti_upload')`), così una chiave nuova nasce **non** leggibile. Chiavi API e token restano in env.
>
> ⚠️ **`audit_events.tenant_id` è ora NULLABLE** = evento di **piattaforma**, nessun cliente. Serviva: con il `NOT NULL` il salvataggio del default globale non lasciava **nessuna** traccia (l'insert veniva rifiutato e l'errore moriva nel best-effort di `auditPlatform`, che non guardava l'esito perché supabase-js non solleva). Ora `auditPlatform` **logga** i fallimenti: resta best-effort, non è più muto.

- **Due atteggiamenti opposti, ed è voluto**: in **lettura** (`risolviLimitiUpload`) si taglia ai tetti in silenzio e non si solleva mai — un dato storto nel database non deve impedire a un tecnico di caricare le foto del cantiere; in **scrittura** (`validaLimitiUpload`) si **rifiuta** dicendo campo e bordo, perché tagliare di nascosto il numero che un umano ha appena battuto nel pannello gli fa credere di aver salvato altro.
- **Come arriva al browser**: reader server `_lib/limiti-upload-server.ts` (`server-only` + `cache()`, tollerante alla colonna assente come `tenant-features.ts`) → context `_components/limiti-upload-provider.tsx` montato nei **due gusci** (`office/layout.tsx`, `mobile/layout.tsx`) → `useLimitiUpload()`. Si aggancia una volta per guscio invece di passare prop lungo cinque alberi di componenti; **fuori dai gusci** (banco `/prova-upload`) valgono i valori di sicurezza.
- ⚠️ **Il conteggio file misura la SELEZIONE in corso, non la commessa.** Dove la lista resta in piedi fino al salvataggio (creazione commessa, wizard sopralluogo, dettatura) il limite è di fatto cumulativo; dove i file vengono accodati e la lista si svuota (tab Scatto, tab Media) è un limite per infornata, ripetibile. Non è un tetto di foto per commessa.
- ⚠️ **Il tetto dei video ha due bordi sopra di sé, e vince il più basso**: `MAX_SIZE_BYTES` = **2 GiB** nello schema zod di `api/upload/media/init/route.ts` (oltre, l'init risponde `400 Body non valido` e l'utente vede un errore tecnico su un file che il pannello gli ha detto di poter caricare) e `SYNC_MAX_BUFFER_BYTES` = 5 GiB in `_lib/sync-r2-to-nextcloud.ts`. Il vincolante è il primo, quindi `TETTI_UPLOAD.maxVideoMb` sta a **2000 MB** (1,86 GiB). Alzandolo, alzare PRIMA quel cap. Riferimento incrociato annotato in entrambi i file.
- 📘 **Manuale**: `documentazione_generale/08_LOGICHE/Logiche_Upload_Media.md` §8. Cose **lasciate aperte di proposito** (nessun presidio lato server, allegati riunione limitati solo nel video, scanner PDF che scavalca): `08_LOGICHE/Osservazioni_Audit_2026-10-05.md`.
- **Niente seconde verità**: la vecchia `VIDEO_MAX_SIZE_BYTES` (500 MB) di `_lib/upload-queue/types.ts` è stata **rimossa** — era un limite indipendente usato dai tre percorsi degli allegati riunione, che avrebbero continuato a rifiutare a 500 MB dopo un cambio nel pannello. Aggiungendo un nuovo punto di ingresso file, leggere i limiti da `useLimitiUpload()`, non scrivere un numero.

### Mondo commesse — lavori del 06/10/2026

Un giro su piu' fronti. Le cose che restano vere oltre il singolo commit:

- **Trascrizione: niente elenco di modelli nel codice** (migration `20261006090000`). Quali modelli si possono scegliere e qual e' il predefinito stanno in `platform_settings` riga `modelli_trascrizione`; il `CHECK` su `tenants.transcribe_model` e' stato **tolto** (era la forma piu' rigida di elenco scritto nel codice). Nel codice resta solo la **grammatica della richiesta**, che e' un fatto sul contratto HTTP e si ricava **dal prefisso del nome** (`@kommessa/api/trascrizione`): `moderna` vuole `languages[]`+`keywords[]`, `gpt4o` e `whisper` vogliono `language` singola. ⚠️ I `gpt-4o` si riconoscono **prima** dei `gpt-`: invertire le due righe rompe tutto in silenzio. Bertaiola non ha piu' una scelta propria: segue il predefinito (`gpt-transcribe`), cosi' un domani si cambia una riga e si muovono tutti.
- **Il vocabolario della dettatura esce dai dati, mai da una lista** (`api/voice/_lib/vocabolario.ts`): i comuni dell'anagrafica (67 per Bertaiola, «Valeggio sul Mincio» compreso) e le lavorazioni a catalogo. ⚠️ **Niente nomi di clienti, di proposito**: OpenAI avverte che un elenco puo' far comparire termini mai pronunciati, e su un cognome significa una commessa aperta sulla persona sbagliata. ⚠️ Se la richiesta col vocabolario viene rifiutata (4xx non 401/429) si **riprova una volta senza**: i campi sono nuovi e la documentazione di OpenAI non e' allineata con se' stessa.
- **La creazione commessa non aspetta piu' le cartelle.** `provisionaCartelle`, audit e versione 1 sono in `waitUntil`. Il provider Nextcloud **ricorda** cosa ha gia' creato (`MKCOL` non e' ricorsivo: ~35 chiamate su 49 ricreavano cartelle appena fatte), crea **un livello alla volta in parallelo**, e ha un timeout — prima una `fetch` appesa bloccava tutto per sempre. ⚠️ E' sicuro perche' `sync-r2-to-nextcloud` crea da se' la cartella padre.
- **Priorita' a TRE livelli** (migration `20261006100000`): `1 - Urgente`, `2 - Alta`, `3 - Bassa` (predefinito). I 53 task su «media» sono diventati «bassa» perche' «media» era il default, cioe' l'assenza di scelta — e «bassa» non era mai stata usata da nessuno in cinque mesi. ⚠️ `media` **resta nel tipo Postgres** (e' usato da una chiave primaria, un trigger e due default): non si scrive piu' e `normalizzaPriorita` lo traduce in lettura. Vocabolario unico in `@kommessa/api/priorita` + `_components/priorita-ui.tsx`: prima c'erano **otto tavolozze divergenti** e cinque mappe di ordinamento copiate.
- **I video hanno un'anteprima vera.** Il fotogramma lo estrae il telefono all'invio (`_lib/poster-video.ts`) e lo manda a `api/upload/media/[id]/poster`. ⚠️ L'ordine degli eventi e' tutto: `loadedmetadata` → sposto il tempo → `seeked` → disegno. Impostare `currentTime` prima dei metadati non ha effetto e si cattura il fotogramma zero, quasi sempre nero. Attesa, errore e segnaposto stanno in `_components/miniatura-media.tsx`: **mai piu' un `<video preload="metadata">` sul file intero per disegnare un riquadro**.
- **Il cliente si sceglie con UN campo** (`_components/scelta-cliente.tsx`): si cerca, e solo se non c'e' l'app chiede il resto (prima persona o azienda, poi contatti, poi indirizzo con i comuni suggeriti). ⚠️ Il wizard sopralluogo scaricava 200 clienti e filtrava in memoria: con 214 in anagrafica gli ultimi quattordici erano **invisibili** e si creavano doppioni senza nessun segnale.
- **Menu a tendina con ricerca** (`_components/scelta.tsx`, su `@kommessa/api/scelta-opzioni`): singolo e multiplo, ricerca a token su piu' campi, accenti piegati. Il `<select>` nativo resta giusto sotto la decina di voci — non si sostituisce per simmetria.

#### Link pubblico di una commessa (migration `20261006110000`)

Un indirizzo da mandare al cliente che mostra **titolo, eventualmente i dettagli, e la libreria foto/video**. Rotta `/c/[token]`, media da `/api/pubblico/[token]/media/[fileId]`, entrambe escluse dal middleware.

> **Chi ha l'indirizzo entra.** Niente password: e' il punto, altrimenti non si potrebbe mandare in un messaggio. Quindi l'indirizzo **e'** il segreto: 32 byte casuali, in tabella solo lo SHA-256, scadenza a 30 giorni, revoca immediata, contatore delle aperture, **uno attivo per commessa** imposto da un indice unico.
>
> ⚠️ `commessa_link_pubblici` ha RLS accesa e **nessuna policy permissiva**, piu' `revoke all from anon, authenticated`. Non e' una dimenticanza: ci accede **solo il service role**, perche' la pagina pubblica una sessione non ce l'ha per definizione.
>
> ⚠️ **I campi vietati non sono nascosti: la query non li legge.** Telefono, indirizzo, mappa, cliente, stato, codice e documenti non arrivano fino alla pagina, cosi' nessuno li fa comparire aggiungendo una riga a un componente.
>
> ⚠️ **Non usare `risolviTitoloCommessa` su superfici pubbliche.** Ripiega su `note_iniziali` (la dettatura del capo, che finirebbe fuori **anche con i dettagli disattivati**) e poi su `nome_cartella`, che ha dentro il nome del cliente. Il titolo pubblico si compone a mano in `c/[token]/page.tsx`. Un ripiego comodo diventa una fuga di dati appena cambia il pubblico.
>
> I **dettagli** sono una scelta per singolo link, non una regola nel codice, e il pannello mostra il testo per intero sotto la casella: non si condivide per sbaglio un telefono che si e' appena letto. Sorveglianza cross-tenant in `/admin/link-pubblici`.

### Accessi, poteri e bacheca — lavori del 07/10/2026

Il giorno prima di dare gli accessi a tutta la squadra. Le cose che restano vere:

- **Un posto solo crea gli account**: `app/_actions/account.ts`. Prima erano
  CINQUE strade (due inviti per posta, tre creazioni manuali), ognuna con la sua
  copia delle regole sull'username e la sua formula per l'alias. Il contratto
  dell'identita' sta in `@kommessa/api/identita`: regole username, formula
  `<utente>@<sigla>.kommessa.local`, policy password, e la composizione della
  password temporanea — sillabe pronunciabili senza i caratteri che si
  confondono a voce (l/1, q/g, v/b, 0/O): `Tabero47`. Il risolutore del login
  **importa** quelle regole invece di riscriverle.
- **`must_change_password`**: cancello nei due gusci (ufficio e telefono),
  pagina `/cambia-password`. ⚠️ Su `public.users` i grant sono a livello di
  **TABELLA**, non per colonna come su `tenants`: una colonna nuova nasce
  scrivibile dall'utente stesso, e la difesa va nel trigger
  `users_proteggi_privilegi`, mai nel grant. ⚠️ La pagina colma un buco piu'
  grosso del primo accesso: **nessun utente di nessun cliente poteva cambiarsi
  la password** — l'unico modulo ce l'aveva il super admin.
- **Poteri veri al posto di un pannello che non faceva niente**: il sistema di
  permessi a 7 aree x 4 livelli **non era letto da nessuna riga di codice** (0
  utenti su 54 lo avevano compilato). Sostituito da `@kommessa/api/capacita`,
  con una voce sola — `capo_squadra` — e un posto che la legge. ⭐ **Criterio
  per aggiungerne una**: non «sarebbe comodo poterlo decidere», ma «c'e' una
  riga di codice che la legge e si comporta di conseguenza».
- **Aprire un lavoro e' un potere, non un ruolo**: `creaCommessa`,
  `creaRiunione` e i todo-da-riunione guardano `capo_squadra`. Chi non ce l'ha
  non vede il microfono al centro della barra: al suo posto un casco spento che
  al tocco dice a chi rivolgersi. Lo slot **non sparisce** — una barra che
  cambia numero di tasti a seconda di chi guarda disorienta.
- **Scrivere una cosa da fare e' di ogni tecnico in squadra** (migration
  `20261007100000`), senza assegnatario. ⚠️ Chiuso un buco: a livello di
  database un tecnico poteva spuntare **qualunque** cosa da fare dello spazio
  di lavoro — il filtro «solo le mie» viveva nella pagina, e una pagina non e'
  un presidio.
- **«Momento» si chiama «Fase lavori»**, e il campo «Fase» non c'e' piu':
  `file_refs.voce_id` era valorizzato su **0 file su 346**. Con lui sono stati
  ritirati `fase_target_raggiunto` e `fase_zero_foto` (migration
  `20261007110000`): senza il campo il contatore resta a zero per sempre e il
  cron avrebbe gridato «fase senza foto» in eterno su commesse piene di foto.
  Vocabolario unico in `@kommessa/api/fase-lavori`.
- **Il personale non e' una cosa del mondo presenze**: l'anagrafica si e'
  spostata in **Personale → Dipendenti** (`/office/personale/dipendenti`), e
  cio' che riguarda i turni compare solo dove si timbra. Il vecchio indirizzo
  rimanda dal **middleware**. Nuova **Attivita' per persona** (cose spuntate,
  foto caricate, registro): i dati c'erano tutti, nessuna pagina li interrogava
  per persona. ⚠️ `pianificazione_attiva` resta spenta sui tenant commesse:
  `pianificazione_blocchi.cantiere_id` e' una chiave esterna rigida su
  `cantieri`, e un tenant del mondo commesse ha commesse.
- **Profilo PWA**: via la matrice «cosa, quando, come» (7 eventi x 3 canali) e
  le ore di silenzio. Non per alleggerire: governavano `/api/push/send-internal`,
  che **non ha nessun chiamante**, e le sottoscrizioni push sono **zero su
  tutti e quattro i clienti**. Tabelle e rotte restano: quando colleghiamo
  l'invio, il pannello torna con una riga.
- **Notifiche**: `commessa_assegnata` esisteva da marzo, compariva nelle
  preferenze, e **nessuno la mandava**; un'azione in blocco ne mandava una con
  un nome diverso (`commessa_assigned`, in inglese, non registrato). Ora
  `assegnaTecnico` avvisa, il nome e' uno, e le etichette stanno in un posto
  solo (`_components/notifiche-meta.tsx`) con **solo i tipi che qualcuno manda
  davvero**.
- **Funzioni per-tenant gestibili dall'ufficio**: `/office/impostazioni/funzioni`.
  Il registro dice quali sono dell'ufficio (`gestibileDaUfficio`) e quali
  restano nostre. Prima funzione cosi': **Turno in cantiere**, che nasce spenta
  (usata una volta in tutto, su un tenant di prova).

> ⚠️ **Un `redirect()` sotto `<Suspense>` lascia una pagina bianca.** Con un
> `loading.tsx` accanto — e ce l'ha ogni pagina dell'app — la risposta e' gia'
> partita quando la pagina renderizza: l'indirizzo resta quello e si vede solo
> la barra in basso. **Misurato, non dedotto**: il banco
> `scripts/banco-ui/tecnico-poteri.mjs` ha bocciato la prima versione. Per
> negare l'accesso a una pagina si usa `mobile/_components/non-abilitato.tsx`
> (che spiega) oppure il **middleware** (dove il reindirizzamento e' una
> risposta HTTP e basta). La stessa nota c'era gia' per la landing dell'app, e
> non e' bastata a non ricascarci.

#### Un posto solo che fa nascere un account (07/10/2026, secondo giro)

`app/_actions/_lib/account-core.ts` → `faiNascereUnAccount()`. **Tutte** le
porte passano di qui: l'ufficio (nome utente, invito), il pannello di
piattaforma (crea manuale, nuovo utente con email, invito) e l'amministratore
che nasce insieme a un cliente nuovo. La funzione **non decide chi puo'**: la
guardia la mette chi chiama. Qui sta solo *come* nasce un account.

⚠️ Prima erano **otto strade** e solo due unificate. Cosa divergeva, contato:
- **Quattro su sei non scrivevano `must_change_password`**: un account creato
  dal pannello con password dettata a voce restava su quella per sempre. Lo
  stesso valeva per `impostaPasswordManuale`.
- `tenant_slug` mancante nei claim di un percorso (`requireTenantContext`
  solleva finche' il trigger non ripara).
- `invite_sent_at` scritto da uno solo dei tre inviti: gli altri due
  risultavano a schermo come «mai invitati».
- Due percorsi lasciavano l'**utente Auth orfano** se l'inserimento del profilo
  falliva; uno — l'owner di un cliente nuovo — **non leggeva nemmeno l'esito**
  e rispondeva «fatto».
- `cambiaRuoloTenantUser` accettava **qualunque stringa** come ruolo.
- Il controllo «questa email e' gia' di un altro cliente» lo faceva uno solo.
- Quattro nomi nell'audit per «e' nato un account» e due `entity_type`.

⚠️ **Il cancello del primo accesso copre anche `/t/[token]`**: il tecnico di un
cliente del mondo presenze vive sulla timbratura da QR, fuori dai gusci
`/office` e `/mobile`. Senza, poteva timbrare all'infinito sulla password
dell'ufficio.

#### Vocabolari unici, e come si riconosce quello che manca

Al 07/10/2026 i vocabolari condivisi sono: `priorita`, `fase-lavori`,
`capacita`, `identita` (username, alias, password, **etichette dei ruoli**),
`notifiche-meta` (etichette degli avvisi). Il segnale che ne serve uno nuovo e'
sempre lo stesso: **la stessa parola scritta in piu' di due posti, con rese
diverse**. In un giorno ne sono emersi cinque, e in tre casi uno dei posti
mostrava il valore grezzo del database a schermo.

> ⭐ **Un pannello che promette e non fa niente e' peggio di nessun pannello.**
> Ne sono stati trovati tre in un giorno: i permessi per utente (7 aree × 4
> livelli, **zero** utenti su 54 lo avevano compilato, nessun gate lo
> leggeva), le preferenze notifiche nel profilo (governano
> `/api/push/send-internal`, che **non ha chiamanti**, e le sottoscrizioni push
> sono **zero** su tutti e quattro i clienti), e il campo «Fase» (valorizzato
> su **0 file su 346**). Il danno non e' il codice morto: e' che chi compila
> crede di aver deciso qualcosa.
>
> **La regola per aggiungere una voce a un pannello di impostazioni**: non
> «sarebbe comodo poterlo decidere», ma **«c'e' una riga di codice che la legge
> e si comporta di conseguenza?»**. Se non c'e', la voce non si aggiunge.

#### Pulizia del 07/10/2026 (migration `20261007140000`)

- **Tolte tre Edge Functions senza nessun chiamante**: `notify-event`,
  `onboard-tenant`, `ai-name`. ⚠️ Restano **deployate** finche' non si esegue
  `supabase functions delete notify-event onboard-tenant ai-name`. I cron veri
  non passano da Edge Functions: chiamano rotte Next via `net.http_post`.
  Togliendo `onboard-tenant` il ruolo `owner` diventa **irraggiungibile**.
- Tolte la vista `users_with_permissions` e le funzioni
  `get_effective_permissions` / `role_default_permissions`. ⚠️ La **colonna**
  `users.permissions` resta: contiene i poteri nuovi.
- Tolti quattro tipi di avviso **senza mittente** (`ticket_assigned`,
  `ticket_created`, `dico_mancante`, `intervento_oggi`). Restano i cinque veri.
- ⚠️ **Resta aperto**: `inviaPushAUtente` e' chiamato da pianificazione, ferie
  e fine-caricamento, ma **nessun client puo' sottoscriversi** (l'interruttore
  e' stato tolto il 07/10 perche' non consegnava nulla). Le push sono plumbing
  pronto e non collegato: o si collega, o si toglie.
- ⚠️ **Resta orfana di proposito** `api/upload/media/route.ts`: nessun
  chiamante, ma un telefono con la PWA in cache potrebbe ancora usarla.

#### Attese nelle pagine d'ufficio

`office/_components/scheletri.tsx` (`ScheletroTabella`, `ScheletroCard`).
⚠️ L'area Kantiere dell'ufficio — lo strumento quotidiano di FPM — **non aveva
nemmeno un `loading.tsx`**: al clic non succedeva niente finche' il server non
aveva finito. Sedici pagine coperte il 07/10. Una pagina `force-dynamic` senza
`loading.tsx` e' una pagina che al tocco non dice niente.

> ⚠️ **Il banco di prova puo' mentire, e mentiva.**
> `(document.querySelector(...)||{click(){}}).click()` faceva un clic a vuoto
> **in silenzio** quando il collegamento stava in una sezione chiusa della
> sidebar, e riportava «nessun segno nei primi 500 ms» — un difetto dell'app
> che non esisteva. Ora apre la sezione, **aspetta il ridisegno** e, se il
> collegamento proprio non c'e', lo dice. Un banco che non distingue «non
> funziona» da «non l'ho trovato» e' peggio di nessun banco.

#### Bacheca: la pagina da televisione (migration `20261007130000`)

Un indirizzo per cliente da aprire sul televisore dell'ufficio: una casella per
persona, dentro quello che le resta da fare. Rotta `/tv/[token]`, esclusa dal
middleware. Si accende da **Impostazioni → Bacheca**.

> **Due strati, e diversamente dal collegamento di una commessa.** Li'
> l'indirizzo **e'** il segreto, perche' deve finire in un messaggio a un
> cliente. Qui l'indirizzo vive per mesi su uno schermo in una stanza di
> passaggio: quindi indirizzo casuale **piu'** password (scrypt con sale per
> riga, mai rileggibile), sessione di 30 giorni, e un freno ai tentativi (10,
> poi 15 minuti) perche' chi ha l'indirizzo puo' provarle a raffica.
>
> ⚠️ **Il cliente lo decide la riga trovata dall'indirizzo, mai il cookie.** Un
> biglietto firmato con un `tenantId` diverso ma l'indirizzo giusto apriva i
> dati di un altro cliente. Non sfruttabile da fuori (per firmare serve la
> chiave del server), ma era il difetto di fidarsi di cio' che il cookie
> afferma invece di cio' che la riga dice. Trovato provando, non leggendo.
>
> ⚠️ `bacheche_pubbliche` ha RLS accesa e **nessuna policy permissiva**, piu'
> `revoke all from anon, authenticated`: ci accede solo il service role.
> ⚠️ **I campi vietati non sono nascosti: la query non li legge** — niente
> clienti, telefoni, indirizzi, foto. Prima della password non si vede nemmeno
> di chi e' la bacheca.
>
> Serve a entrambi i mondi: dove non ci sono cose da fare (FPM ne ha zero)
> mostra la **pianificazione di oggi**. Logica pura in `@kommessa/api/bacheca`.

### Richieste al telefono (dal 05/10/2026, migration `20261005120000`) — mondo commesse

L'ufficio risponde al telefono («c'è da cambiare la caldaia, signora Elena, è una Viessmann») e finora scriveva un **post-it** da portare a mano a chi se ne doveva occupare. Il flusso del prodotto parte dal **sopralluogo**: questo momento sta a monte di tutto e non esisteva da nessuna parte.

⭐ **Una richiesta È un task senza commessa**: `commessa_todo.commessa_id` è diventata **nullable**. La lista condivisa esisteva già (pagina **Task**, ora «Task e richieste»): le mancava solo poter contenere qualcosa che non è ancora un lavoro. Non è una commessa perché una commessa brucia un codice interno da un contatore senza buchi e crea ~15 cartelle su Nextcloud, e non esiste nessuna azione per eliminarla.

- **Colonne nuove** su `commessa_todo`: `cliente_id` (se chi chiama è in anagrafica), `cliente_testo` (il nome come è stato detto, quando non c'è — **non** si crea una riga in `clienti` per una telefonata), `contatto` (numero o email, testo libero). Indice parziale `commessa_todo_richieste_idx` su `where commessa_id is null`.
- **La catena**: `Richiesta` → «Crea commessa» → **bozza precompilata** (`commessa_bozze`, costa un INSERT, non brucia niente, vive 30 giorni) → `/office/commesse/nuova?bozza=<id>` chiede il resto → alla finalizzazione `finalizzaBozza` **aggancia** la richiesta alla commessa (`_richiestaTodoId` nel payload). Il post-it diventa la prima riga di storia del lavoro invece di essere buttato. Puro e testato: `@kommessa/api/richiesta-bozza`.
- ⚠️ **La descrizione non si tronca**: diventerebbe il `nome_cartella` su Nextcloud, che non si rinomina più. Un titolo oltre 60 caratteri finisce nelle note e il form lo chiede.
- **Se non si assegna a nessuno** resta nella stessa lista: non c'è una seconda coda. Si trova con la scorciatoia **«Da assegnare»** (un clic, filtro `assegnato=nessuno`) e col contatore ambra in alto; e si assegna **dalla riga**, con una tendina, senza aprire nulla — è il gesto che l'ufficio ripete a raffica smaltendo il mucchio. L'avviso `todo_urgenti_non_assegnati` copre già urgenti e alte rimaste senza nessuno.
- **Si assegna a CHIUNQUE** (`elencaAssegnabiliTenant`), non solo ai `role='tecnico'`: «ordina la pompa» è roba d'ufficio, «passa a vedere la caldaia» è roba da capo. `elencaTecniciTenant` resta per `commessa_tecnici`, dove solo un tecnico ha senso.
- **Chi viene assegnato lo sa**: evento `todo_assegnato` + `notificaAssegnazione` (`_actions/_lib/notifica-assegnazione.ts`). Prima assegnare un task scriveva **solo** su `audit_events` e l'interessato non riceveva niente. Non si avvisa chi assegna a se stesso, e si avvisa solo se l'assegnatario **cambia**.
- **Sul telefono** la richiesta compare in «Cosa fare» e, se c'è un numero, il tasto lo **chiama** (`tel:`): non porta a una commessa perché non ce l'ha. ⚠️ La home mobile non esce più subito quando non hai commesse assegnate: un capo con una sola richiesta in mano vedeva «nessuna commessa assegnata».
- ⚠️ **Ogni punto che legge i task deve gestire la commessa mancante**: `/office/commesse/null/lavori` è un link rotto. Sistemati board Task, card dashboard, avvisi (`_lib/alerts.ts`), home mobile; le revalidation passano da `rivalida()`.

- 📘 **Manuale**: `documentazione_generale/08_LOGICHE/Logiche_Richieste_Telefono.md` (perché non è una commessa, la catena completa, le regole da non violare). Aperti in `08_LOGICHE/Osservazioni_Audit_2026-10-05.md`.

> **Ricerca cliente: un componente per tutta l'app.** `_components/cliente-picker.tsx` (`ClientePicker` + hook `useRicercaClienti`). Prima la stessa domanda «chi è il cliente?» aveva **tre** risposte diverse: il form di creazione commessa interrogava Supabase **dal browser** (debounce 200 ms, 8 risultati), il dettato vocale passava dall'azione server (400 ms, 5 risultati, minimo 3 caratteri), e per il telefono non c'era niente. Ora la meccanica è una (`cercaClientiPerNome`, minimo **2** caratteri, `limite` opzionale); il dettato vocale conserva la sua resa perché è un'altra interazione — **avvisa che il cliente forse esiste già**, non lo fa scegliere. ⚠️ L'elenco è un **overlay assoluto in-flow**, non un Portal: dentro un dialog Radix un Portal è un clic «fuori» e chiude il dialog sotto.

> **Display titolo commessa**: nelle UI non mostrare mai `nome_cartella` raw (è la directory Nextcloud nel formato `{codice}_{cliente}_{lavoro}`). Usare sempre `risolviTitoloCommessa()` da `apps/web/app/_lib/commessa-display.ts` che pesca da `descrizione_ai_finale → proposta → note_iniziali` con fallback estrattivo da nome_cartella (CamelCase → spazi).

### Modifica commessa, versioning e tipologie (dal 18/06/2026, migration 20260618000000)

La modifica di una commessa finalizzata riapre il flusso di creazione:

- **Desktop**: pagina `/office/commesse/[id]/modifica` (editor globale completo). Il bottone "Modifica" sulla scheda apre questa pagina; il vecchio mini-dialog a 3 campi è stato rimosso.
- **PWA**: wizard `/mobile/commessa/[id]/modifica` a 3 step (Dati → Tipologie → Conferma), precompilato, con dettatura vocale **opzionale** (merge non distruttivo via `/api/voice/extract`). Solo `admin`/`office`.
- **Action**: `aggiornaCommessaCompleta` (`apps/web/app/_actions/aggiorna-commessa-completa.ts`). UI condivisa: `apps/web/app/_components/commessa-editor/`.

> **Regola ferrea (editor + versioning + tipologie)**: `codice_interno`, `nome_cartella`, `cloud_folder_path` NON si toccano MAI (rinominare romperebbe i file su Nextcloud — dirlo in UI). Le voci/tipologie sono **append-only**: si aggiungono soltanto, mai si rimuovono (le cartelle sono fisiche). La modifica è **online-only** (serve il server per versioning + provisioning cartelle).

**Versioning** — tabella `commessa_versioni` (snapshot jsonb + diff + `modificato_da`/`modificato_da_nome` + `azione` ∈ creazione|modifica|aggiunta_tipologie|ripristino). La versione 1 è scritta da `creaCommessa` (hook best-effort); le esistenti hanno v1 da backfill (`scripts/backfill-versioni-v1.mjs`). Storico nella tab **Cronologia** office. **Ripristino solo superadmin** (`ripristinaVersione`, content-only — mai voci/cartelle), gating `isSuperadminActor()` da `admin/_lib/guard` che riconosce anche l'impersonation (cookie `shadow_admin`). Helper: `_lib/versioni/snapshot.ts`, `_actions/_lib/scrivi-versione.ts`.

**Tipologie impianto** ("cosa si fa") — sono un **elemento master nella sidebar** office (`commessa-sidebar.tsx` → `tipologie-panel.tsx`), NON nella tab Fasi (che monitora l'avanzamento). Azione rapida `AggiungiTipologieDialog` (append-only, conferma con avviso "creerà le cartelle su Nextcloud") disponibile in sidebar office, scheda mobile ed editor. Action `aggiungiTipologie`; provisioning condiviso `_actions/_lib/provisiona-cartelle.ts` + `_actions/_lib/aggiungi-voci.ts`. NB: anche `aggiungiVoce` della tab Fasi ora provisiona le cartelle (prima inseriva solo la riga DB).

### Etichette display degli stati commessa (solo forma, non toccare l'enum)

L'enum `stato_commessa` resta `bozza/aperta/in_corso/collaudo/completata/archiviata`. A schermo però si mostrano queste **diciture** (decise dal cliente — le commesse non sono "critiche/a rischio", sono lavori nel loro ciclo): `aperta` → **"Non presa"**, `collaudo` → **"In collaudo"**, gli altri col nome naturale. La label vive in `StatoBadge` (`packages/ui`) + mappe locali allineate (liste/filtri, stato-picker, scheda, editor, PWA, admin). Non reintrodurre "Aperta"/"Collaudo" né framing "a rischio" sulla dashboard (la sezione è "Commesse in lavorazione").

### Kantiere (FPM) — impostazioni e scelte recenti (giu 2026)

Modulo presenze (tenant FPM, `app_mode=kantiere`). Tutto gated da `tenantHasModule('kantiere')` → **Bertaiola non ne è toccata**. Decisioni di prodotto stabili:

- **Arrotondamenti** (Impostazioni Kantiere office, conferma prima di salvare, valgono sui turni **futuri**): tempo di **viaggio** default **5 min** con pavimento di uno step (ogni tragitto > 0 conta ≥ 5 min; 0 resta 0); ore **lavoro** default **0 = nessun arrotondamento** — scelta cliente: si raccoglie tutto **al minuto**, si arrotonda **nel report a fine mese** sul dato aggregato. Helper `arrotondaA(min, step)` (step<1 = off), config in `tenant_modules.config.arrotondamento_{viaggio,ore}_min`.
- **Pausa pranzo dichiarata in uscita**: se il turno è durato oltre una **soglia configurabile** senza pausa timbrata, il dialog di uscita mostra un avviso giallo che **ricorda che timbrare la pausa è il modo corretto** (la dichiarazione è un ripiego) + opzioni 30/45/60 min. La soglia è **per-tenant** (`tenant_modules.config.soglia_pausa_pranzo_ore`, default **5h**, gestita in Impostazioni Kantiere → Pause) ed è **identica per QR e tasto in-app** (self scheda cantiere + wizard capo). Costante `SOGLIA_PAUSA_PRANZO_ORE` = solo default; reader `leggiSogliaPausaPranzoOre`. Lato dati è una **coppia pausa** centrata (`origine='manuale'`, helper unico `coppiaPausaCentrata`/`inserisciPausaDichiarata` in `_actions/_lib/viaggio-timbra`) → il calcolo ore la sottrae con la logica pausa esistente. Se la pausa è timbrata regolarmente, **nessun avviso**. La pausa è avviabile anche **da app senza QR** (scheda cantiere → "Avvia pausa pranzo", `pausaPranzoMia`).
- **Stima viaggio (km + tempo) — provider per-tenant**: l'astrazione `RoutingProvider` (`apps/web/app/_lib/routing`) ha due famiglie: **free** (OSRM demo / OpenRouteService con `ORS_API_KEY`, gratis, **senza traffico**) e **google** (Google Routes API `computeRoutes` + `TRAFFIC_AWARE`, **traffico reale**, a pagamento). La **chiave Google è UNICA di piattaforma** (`GOOGLE_MAPS_API_KEY`, env — **non** per-tenant, **mai** nel DB). Il **super admin** sceglie per-tenant se usarla dal tab **"Viaggio"** di `/admin/tenants/[id]` (`tenant_modules.config.routing_provider` ∈ `free|google`, default `free`; action `aggiornaRoutingProviderTenant`). La route `/api/routing/stima` legge la scelta (`leggiRoutingProvider`), costruisce il provider e fa fail-soft (se google scelto ma chiave assente → free). Cache `routing_cache` per **profilo** (`driving-car` vs `driving-traffic`, non si mescolano) con **TTL 15 min** sul traffico. FPM → google; gli altri restano free (costo zero).
- **Autocomplete indirizzi (sedi/cantieri)**: `/api/geocode/autocomplete` usa lo **stesso toggle** del routing → **Google Geocoding** per i tenant su provider `google` (chiave `GOOGLE_MAPS_API_KEY`, env), altrimenti **Photon→Nominatim** (free), sempre fail-soft. Componente `AddressAutocomplete` (salva `lat/lng` accanto al testo).
- **Sedi ↔ cantieri (regola ferrea)**: per un cantiere si propongono SOLO la **sede predefinita** (`sedi.is_default`, sempre) + le **sedi associate** a quel cantiere (`cantiere_sede`) + **"Abitazione privata"** a fine turno (0 km/0 tempo; non in Registra giornata, dove partenza e rientro sono sempre una sede). MAI le sedi di altri cantieri. Applicata in tutte le UI (QR, app, capo, Registra giornata che **filtra le sedi per cantiere**) **e** ri-validata lato server da `sedeAmmessaPerCantiere` (`_actions/_lib/viaggio-timbra.ts`) in `validaViaggio(…, cantiereId)` (e in `registraGiornataDaZero` per le tratte passando da una sede). UI office **Sedi**: il collegamento cantieri usa un **dropdown di ricerca** (`sedi/_components/cantieri-collegati-select.tsx`), non l'intera lista di chip. → dettaglio in `documentazione_generale/08_LOGICHE/Logiche_Kantiere.md` (registro **regole/scelte operative** Kantiere: arrotondamenti, tolleranza, km, sedi, settings, auto-approvazione — **da tenere aggiornato**).
- **Scanner QR su iPhone-app-installata**: niente stream live (limite WebKit). Si usa **scatto-foto** (`<input capture>` + jsQR) o la fotocamera nativa sul poster. **Android usa BarcodeDetector live — non toccare.**
- **Super admin**: `/admin/kantiere` (panoramica + timbrature cross-tenant con GPS/origine/chi/viaggio) e `/admin/accessi` (login/logout, tabella `auth_events`). Moduli/app_mode: `kantiere`/`full` richiedono il modulo attivo (guard server); spegnere il modulo riporta a `kommessa` in cascata.

#### Kontabilità + auto-approvazione + viaggio-da-app (in prod dal 26/06/2026, push `9d971d6`)

- **Auto-approvazione rapportini** (tutti i tenant kantiere): le **timbrature sono la sostanza**, il rapportino è **forma**. Una giornata si auto-compila dalle timbrature e si **auto-approva** quando è **chiusa** (ingressi = uscite) ed **entro soglia** (config `anomalia_turno_ore_max`, default **10h**, pause escluse); **aperta o oltre soglia** → resta **"da verificare"** (bozza), gestita solo da office/admin. Si ri-valuta a ogni timbratura (riaprire un turno la riporta in bozza). Disattivabile per tenant (`auto_approva_rapportini`). Logica pura `esitoAutoApprovazione` (testata), wiring in `ricomputaRapportinoAuto` (congelata solo se `approvato_da` valorizzato dall'ufficio). Correzione anomalia "pausa pranzo dimenticata" (office: `aggiungiPausaGiornata` → coppia-pausa → se rientra in soglia auto-approva). Anteprima soglia del dialog letta dal config (non hardcoded). **Dal 20/08/2026 vale anche per le giornate scritte A MANO** (`esitoAutoApprovazioneManuale`, pura+testata, agganciata a `marcaRapportinoManuale`): guarda le **ore dichiarate** invece degli ingressi, perché una giornata senza timbrature ha `ingressi=0` e veniva scartata per sempre come «nessun turno» — restava in bozza e non usciva mai verso il gestionale. Non approva se 0 ore o se un turno timbrato è ancora aperto. ⚠️ **`auto_compilato` resta `false`**: rimetterlo a `true` farebbe cancellare le ore a mano dal ricalcolo successivo.
- **Viaggio di ritorno anche da APP** (non solo QR): chiusura turno self (scheda cantiere) e capo (wizard per-membro) aprono lo stesso dialog del QR (sede/km/autista/mezzo + pausa) e **tracciano** la tratta `timbratura_viaggio` `direzione='ritorno'`. Uscite in-app `origine='cronometro'` (QR resta `'qr'`). Helper viaggio/pausa condivisi in `_actions/_lib/viaggio-timbra` (`ViaggioSchema`, `validaViaggio`, `inserisciViaggioRow`, `inserisciPausaDichiarata`, `inizioSeEleggibilePausa`, `coppiaPausaCentrata`) — il viaggio si **valida sempre PRIMA** di scrivere pausa/uscita (niente righe orfane). `<LiveRefresh>` auto-aggiorna i dati live ogni 60s (office presenze/cantiere/dashboard, mobile cruscotto/cantiere).
- **Kontabilità (spese di cantiere)** — sotto-modulo dentro Kantiere, flag `kontabilita_attiva` (default on). Il tecnico fotografa lo scontrino dalla PWA → **AI vision** (`OPENAI_MODEL_VISION` = `gpt-5.4-mini`, `reasoning_effort: 'low'`) estrae i campi → revisione → salva, agganciata al cantiere del turno (helper condiviso `mioTurnoAttivo`). Tabella `spese` (migration `20260625120000`, **foto su R2** via `r2_key`/`r2_thumb_key`, NON `file_refs`; RLS: tecnico le proprie, office/admin tutto il tenant). Office `/office/kantiere/kontabilita`: tabella spese + Analisi costi + Costo cantiere + **Ricevute** (browser R2 con zip via `archiver@7`). Upload office (immagine/PDF) via `creaSpesaOffice` (service-role, gated ruolo). Cleanup R2 best-effort se l'insert DB fallisce. Super admin `/admin/kantiere/kontabilita` (cross-tenant). PDF: solo archiviazione, niente AI.

> Dettaglio operativo, milestone e TODO vivono nella memoria (`MEMORY.md` → `kantiere-overview`, `project-branch-kontabilita-wip`, checkpoint 24–25/06).

#### Presenze e ore — UI alleggerita + dettaglio origine/viaggio (29-30/06/2026)

La tab office **"Presenze e ore"** (`/office/kantiere/rapportini`) è stata semplificata e arricchita (solo UI/lettura, motore auto-approvazione invariato):

- **Niente più Approva/Respingi/selezione-bulk a schermo** (l'auto-approvazione resta sotto, nascosta): storico **per giorno** + blocco **"In corso oggi"** (sfondino verde, colonne allineate, timeline inline `GiornataFlow`). Esito per giornata: 🟢 Regolare / 🔴 anomalia con motivo (giorno aperto / oltre soglia) / ☕ pausa non timbrata (giornate lunghe). **Modifica + Cronologia su OGNI giornata** → correzione retroattiva tracciata (`commessa_versioni`-style `rapportino_versioni`, azione `modifica_ufficio`). Filtro "Solo anomalie".
- **`rapportino` ≠ PDF**: nel codice è il **record-giornata** (con stato approvazione), ed è il nome di questa pagina. Non esiste un PDF "rapportino"; il prospetto ore È questa tabella + export CSV + Ore e costi.
- **Ore in formato `H:MM`** (es. 7:30, non 7.5/2,6) in **tutte** le tabelle/KPI Kantiere (office desktop + mobile). ⚠️ **Eccezione: i TOTALI.** Su una somma `H:MM` diventa illeggibile (`705:19` per 65 giornate non dice niente e quei minuti non li usa nessuno): coppia di helper puri: **`formattaOreGiornata`** (sempre `7:30`, per riga/giornata) e **`formattaOreTotale`** (`45 min` / `7:30` / `705 ore`, per KPI, totali di colonna, grafici di periodo). **Nel CSV resta il decimale con la virgola**, che il foglio di calcolo deve poter sommare. Audit 01/09: sistemati «Ore e costi» (scriveva `7,5`), scheda cantiere app, KPI «Ore settimana» (`123:55`), grafico «Ripartizione ore». Il viaggio mostra sempre **km + tempo H:MM** (da `timbratura_viaggio.distanza_km`).
- **Origine + viaggio nel dettaglio espanso** (office desktop + cruscotto mobile): ogni timbratura/pausa mostra l'**origine** (`origine` = `qr`/`cronometro` = "Timbrata"; `manuale` = "Inserita a mano · da {chi} · agg. {quando}" da `created_at`+`creato_da`), e il **viaggio** come tratte (sede→cantiere / cantiere→sede al ritorno, km, H:MM, autista/passeggero). Componente condiviso `office/kantiere/_components/timbrature-riepilogo.tsx` (`TimbratureRiepilogo` con `OrigineLine`, `GiornataFlow`).
- **Cruscotto mobile office** (`/mobile/kantiere/cruscotto`, gated admin/office) = **dashboard navigabile per giorni** (`?giorno=YYYY-MM-DD`, no futuro): consultabile lo **storico** di un giorno passato; "Presenze del giorno" per-persona espandibili con origine+viaggio.
- **Anomalie** tolta dalla **sidebar** office (pagina ancora raggiungibile dalla dashboard — non del tutto ridondante: ha festivo/weekend/straordinari). Soglia promemoria pausa **configurabile, default 5h**. Icona card viaggio scheda cantiere: aereo → **macchina** (`Car`).

#### Funzioni per-tenant (feature-flag) — super admin (29/06/2026, migration `20260629120000`)

`tenants.features jsonb` (NON segreto, `grant select (features) to anon, authenticated`) per **mostrare/nascondere funzioni office per-tenant** dal super admin. Tab **"Funzioni"** in `/admin/tenants/[id]` (Predefinito/Mostra/Nascondi). Default per-funzione derivato dall'app_mode (mondo commesse = `app_mode ≠ kantiere`). Reader **difensivo** `_lib/tenant-features.ts` (+ registry client-safe `_lib/tenant-features-registry.ts`) → finché la colonna non c'è, si usano i default. Oggi gestisce **Voci catalogo** e **Preset di lavoro** (nascoste ai tenant solo-Kantiere, anche via route `notFound()`). Per aggiungerne: 1 voce nel registry + `tenantFeatureEnabled(key, kommessaWorld)` al gate. Migration **applicata** al cloud il 29/06.

#### PWA — landing role-based e fluidità (01/07/2026)

- **Landing mobile role-based nel MIDDLEWARE, non nel render.** `/mobile` → `/mobile/kantiere/cruscotto` (admin/office) o `/cantieri` (tecnici) è un **redirect HTTP** in `middleware.ts` (`resolveMobileLanding` in `packages/api/src/server.ts`), scoped al solo `/mobile`, fail-soft. ⚠️ NON rimettere il `redirect()` dentro `mobile/page.tsx` (resta lì solo come fallback): un `redirect()` in un Server Component sotto `<Suspense>` innesca il **bug Next.js #63121 → React #310 transitorio** (schermata "Errore critico" all'avvio a freddo, visibile SOLO sui tenant kantiere perché solo loro rediregono). Vedi memoria `project-pwa-chunk-reload`.
- **Fluidità PWA**: ogni rotta mobile `force-dynamic` deve avere un `loading.tsx` skeleton (helper `apps/web/app/mobile/_components/skeletons.tsx`) → al tap tab compare subito lo skeleton invece di restare fermi. Transizione pagina in `apps/web/app/mobile/template.tsx` (`animate-page-in`, fill-mode **`backwards`** per non lasciare transform residui che romperebbero elementi `position:fixed`). Mai `Date.now()`/`new Date()` in `useState(initializer)` o direttamente nel render di un client component SSRato (mismatch di hydration): seed deterministico da una prop, poi tempo reale in `useEffect`.

#### Turno manuale (no QR) + multi-cantiere + pattern UI mobile (lug 2026)

**Funzioni** (gated kantiere → Bertaiola-safe): **avvio turno senza QR** (scegli un cantiere qualsiasi), **cambia cantiere** live (chiude A/apre B → ore dai timestamp reali + km A→B alla destinazione via provider tenant, tratta con km e tempo, dal 15/09 conta come viaggio), **picker cantiere** riusabile (`mobile/kantiere/_components/cantiere-picker.tsx`), **"Abitazione privata"** a fine turno (0 km/0 tempo), card turno prop **`compatto`** (CTA orizzontali 33/33/33, usata sul cruscotto office), **"Cantieri di oggi"** in tab Ore (mini-tabella), **"Modifica giornata"** con ore **editabili** (input tap-and-type + −/+ 15min). Azioni in `_actions/kantiere-timbra.ts` (`avviaTurnoMio`, `cambiaCantiereMio`, `elencoCantieriTurno`).

**Conteggio ore (regola ferrea)**: `ricomputaRapportinoAuto` **ri-deriva SEMPRE le righe dalle timbrature** (`minutiPerCommessa` appaia ingresso→uscita per cantiere; la pausa è un GAP fra un'uscita e l'ingresso successivo, il flag `pausa` non incide sul conteggio). Quindi lo split ore/cantiere "regge" solo se fatto di **segmenti timbrati reali** → è ciò che produce lo **switch live**.

**Split "cosa hai fatto oggi" a fine turno** (chi NON ha cambiato cantiere live): alla chiusura manuale, se la **giornata è pulita** (un solo evento = l'ingresso; `TurnoAzioniContesto.giornataPulita`), il dialog "Termina turno" offre *Solo qui / Più cantieri*. Dividendo, si **sintetizzano i segmenti timbrati** (NON `rapportino_righe`, che verrebbero sovrascritte) via **`calcolaSegmentiSplit`** (`@kommessa/api/kantiere-split`, **pura + unit-testata**: segmenti back-to-back dai timestamp, pausa come gap al confine più vicino al centro o straddle su cantiere unico, l'ultima riga assorbe il resto, primo ingresso = quello reale). Wiring in `terminaTurnoMio` → `terminaConSplit` (additivo, guardia giornata-pulita, mai delete distruttivo; viaggio di ritorno sull'ultima uscita). UI in `ViaggioRitornoDialog` (sezione split + `MinutiStepper` + foglio picker per aggiungere cantieri). Netto = `(chiusura − inizio) − pausa`, con `ts` di chiusura **snapshot** così UI e server usano lo stesso valore. **Tolleranza** (`tolleranza_chiusura_min`, default 5): se `|restano| ≤ tolleranza` si salva (l'ultima riga assorbe il resto) → i minuti dispari non bloccano.

**Caso 4 — registra giornata SENZA timbrature**: chi non ha mai timbrato dichiara inizio + pausa + cantieri/ore (la fine si calcola) → azione **`registraGiornataDaZero`** (guardia **giornata VUOTA**, gate `registra_giornata_attivo`) = ingresso(inizio) + `calcolaSegmentiSplit`. UI `RegistraGiornataDialog` in tab Ore.

**Impostazioni ufficio "Turni"** (`tenant_modules.config`, tab in Impostazioni Kantiere): `tolleranza_chiusura_min` (5), `split_fine_turno_attivo` (on), `avvio_turno_libero` (on — **sostituisce il gate weekend**: se off i tecnici vedono solo i cantieri con QR attivo), `passo_minuti_stepper` (15, i +/- degli stepper), `registra_giornata_attivo` (on — gate caso 4). **Lettura unica** di tutte le impostazioni Kantiere: `impostazioniDaConfig` / `leggiImpostazioniKantiere` (`_lib/kantiere-config.ts`); i reader parziali (`leggiImpostazioniTurno`, `leggiArrotondamenti`…) passano di lì. Per aggiungerne: campo in `ImpostazioniKantiere` + `impostazioniDaConfig`, schema e merge di `salvaImpostazioniKantiere`, UI con descrizione oggettiva.

**Km switch "A → B"**: `timbratura_viaggio.da_cantiere_id` (migration `20260706000000`) = cantiere di partenza dello switch; il display (cruscotto + rapportini office, `ViaggioTratta.daCantiere`) mostra "cantiere A → cantiere B" invece di "Sede → cantiere".

**Ricerca cantieri = a TOKEN cross-campo** (usata sia nel picker sia nella tab Cantieri): `q.trim().toLowerCase().split(/\s+/)` e **ogni token** deve comparire in `[nome, codice_commessa, codice, cliente_nome, indirizzo, categoria].join(' ')` → "fincantieri monf" trova "Fincantieri … Monfalcone" anche con le parole in campi diversi. Non usare più il match single-field.

**Gotcha UI mobile (dialog/dropdown/foglio) — imparati risolvendo bug reali** (verificati riproducendo in Chrome headless):
- **Overflow orizzontale "form gigante"**: un `DialogContent` `display:grid` ha grid item con `min-width:auto` (= min-content); un titolo `truncate` (nowrap) allarga il *track* della griglia → tutto sborda. Fix: `min-w-0` sul grid item (+ eventualmente `grid-cols-[minmax(0,1fr)]`), `overflow-x-hidden`, `min-w-0` su tutta la catena, testi troncati.
- **Scroll che non ingaggia / dialog che cresce**: a `flex-1 overflow-y-auto` serve un antenato ad **altezza definita** e **`min-h-0`** sul figlio flex. Struttura header (`shrink-0`) · body (`min-h-0 flex-1 overflow-y-auto`) · footer (`shrink-0`).
- **Dialog che sborda su/sotto**: con `viewport-fit=cover`, `100dvh` include status bar e home-indicator → il `max-h` deve **sottrarre `env(safe-area-inset-top/bottom)`**.
- **Zoom iOS all'apertura**: input con font < 16px → WebKit zooma la pagina. Globals già forza 16px sui form field; per input custom usare `text-base`.
- **Elemento nascosto sotto la bottom-nav**: un `fixed` dentro la shell resta intrappolato nello stacking context → **`createPortal` su body + z alto** (pattern `Portal`, `mobile/_components/portal.tsx`).
- **Tastiera che copre i tasti**: aggancia alla **`visualViewport`** (spaziatore bianco = altezza tastiera, oppure restringi il foglio).
- **Dropdown dentro un dialog Radix**: usare un **overlay assoluto in-flow** (NON un Portal: Radix lo tratterebbe come "fuori" → chiude il dialog / ruba il focus).
- **Tasti fissi in alto (campanella, «＋ Spesa»)**: 34px a `safe-area + 6px`, tocco da 44px con un'area invisibile `before:`. La fascia in alto a destra fino a 40px va lasciata libera: niente a destra sulla riga del titolo, «Aggiornato alle» sta sulla riga sotto (14/09/2026, prima la campanella copriva il testo su Cantieri, Ore, Spese). Banco `scripts/banco-ui/campanella.mjs`.

#### Audit Kantiere + correzioni payroll/sicurezza/log (06/07/2026)

Audit completo (5 investigatori paralleli + verifiche live Supabase) e correzioni. Regole/decisioni che ne derivano — **non reintrodurre i bug**:

- **Fine turno in pausa = VIETATO**: chiudere un turno mentre si è in **pausa** lascerebbe un'uscita orfana e perderebbe le ore del pomeriggio. `AZIONI_AMMESSE.fine = ['lavoro']` (QR + capo), `terminaTurnoMio` rifiuta lo stato `pausa` (`RIPRENDI_PRIMA`), e la card `TurnoAzioniCantiere` in pausa mostra **solo "Riprendi"** (niente "Fine turno"). Prima si riprende (timbra la ripresa reale), poi si chiude.
- **Auto-approvazione pausa-aware**: `esitoAutoApprovazione` accetta `inPausa` → una giornata ferma in pausa (ultimo evento = uscita di pausa) NON si auto-approva con le sole ore del mattino. `ricomputaRapportinoAuto` calcola `inPausa` (serve la colonna `pausa` nella query timbrature).
- **Override manuale vince sempre**: in `ricomputaRapportinoAuto` il guard `auto_compilato=false` è onorato **anche con timbrature presenti** (prima solo se `length===0`) → la "Modifica giornata" del tecnico/ufficio non viene più cancellata dal ricalcolo.
- **Dedupe doppio-tap**: `avviaTurnoMio`/`terminaTurnoMio`/`cambiaStatoTurnoMio` usano `eventoRecenteUguale` (25s) → ritornano idempotente invece di creare doppioni che bloccherebbero l'auto-approvazione.
- **Log strutturato Kantiere**: helper condiviso **`auditTenant`** (`_actions/_lib/audit.ts`, best-effort) su `audit_events` per sede (crea/modifica/elimina/collega/scollega/predefinita), cantiere (crea/modifica/elimina), impostazioni Kantiere (before/after) e **spesa elimina**. Visibile in `/admin/audit`. **Da usare per ogni nuova mutazione Kantiere.**
- **Kontabilità gated davvero**: `kontabilita_attiva=false` ora fa `notFound()` sulla pagina office (`kantiere/kontabilita`) e mobile (`kantiere/spese`) via `kontabilitaAttiva()`.
- **Super admin**: tab **Viaggio** di `/admin/tenants/[id]` mostra la **config Kantiere in sola lettura** (soglie payroll/operative) — supporto senza impersonare.
- **Spese hardening**: `eliminaSpesa` con guard ruolo + scope tenant; `aggiornaSpesa` valida il cantiere del tenant prima di riassegnarlo; split fine turno valida la sede sul cantiere **finale**.
- **RLS presenze (migration `20260706120000`, ✅ APPLICATA 06/07)**: la scrittura di `timbrature/rapportini/rapportino_righe/rapportino_versioni/timbratura_viaggio` è vincolata al **proprio `dipendente_id`** (o capo della squadra, via `public.sono_capo_di()` + `public.dipendente_del_utente()`); office/admin/owner restano tenant-wide; service role bypassa. Prima di applicare ho **validato sui dati reali**: caposquadra **non usato** in prod (0 squadre, 0 timbrature `origine='capo'`) e tutti i self-writer hanno `user_id` → superficie reale = solo "il tecnico scrive le proprie righe", che è già così per tutte le 119 timbrature. **Rollback** = ricreare le vecchie `*_tenant_write` FOR ALL `(tenant_id=current_tenant_id() and current_role() in (owner,admin,office,tecnico))`.

#### Trasferimenti cantiere→cantiere (km + tempo)

Chi lavora su **più cantieri** in un giorno genera tragitti **A → B** (gated kantiere → Bertaiola-safe). Riga `timbratura_viaggio` con `timbratura_id` null, `da_cantiere_id`=A, `cantiere_id`=B (km sulla **destinazione**), `durata_stimata_min`=tempo. Copre switch live, split fine turno e Registra giornata (`registraTrasferimentiCantiere` + puro `trasferimentiDaSegmenti`); il super admin le vede in `/admin/kantiere/timbrature`.

**Dal 15/09/2026 sono viaggio, sempre**: km nei totali per tutti i tenant (toggle `km_switch_attivo` e `leggiTrasferimentiAttivi` **tolti**, chiave rimossa dal config con la migration `20260915090000`); `durata_confermata_min` = stima arrotondata (in Registra giornata correggibile a mano, con motivo in `giustificazione`); il tempo si toglie dal lavoro (buco fra i segmenti o erosione del segmento di arrivo, `minutiDaTimbrature`). → `Logiche_Kantiere.md` §3.1.

#### Metodi di pagamento, avviso soglia e conferma passeggero (01/09/2026)

- **Metodi di pagamento gestibili** (migration `20260901090000`, ✅ APPLICATA) — tabella `metodi_pagamento` per-tenant, UI in **Impostazioni → Pagamenti** (`/office/impostazioni/pagamenti`, admin/ufficio, con audit). **Non è gated da nessun modulo: vale per tutti i clienti.** ⚠️ **`codice` immutabile** (è il testo in `spese.metodo_pagamento`), si rinomina solo `nome` — sempre con conferma. Ritirare ≠ cancellare. L'**AI vede l'elenco del tenant** (`promptScontrino(metodi)` + glossario; un codice inventato viene scartato) e le action validano con `metodoAmmesso` (lo schema zod non è più un enum chiuso). Lettore difensivo `_lib/metodi-pagamento.ts` → se la tabella manca tornano i tre di sempre.
- **Avviso dashboard giornate oltre soglia** — la soglia resta 10h (scelta cliente); la dashboard Kantiere segnala quante giornate/ore/chi restano ferme. `giornateOltreSoglia` **esclude oggi e le giornate rimaste aperte** (senza quei filtri su FPM direbbe 71 invece di 65).
- **Conferma passeggero PWA** — chi conferma un viaggio senza spuntare «sono l'autista» deve confermarlo; se dice che guidava torna al modulo con la casella evidenziata. Pezzo unico `_components/conferma-passeggero.tsx`, usato da viaggio-ritorno, partenza e Registra giornata (la vecchia «ore a mano» è stata tolta il 14/09). ⚠️ È un **pannello dentro il foglio**, non un dialog annidato (Radix lo tratterebbe come clic "fuori" e chiuderebbe quello sotto).

#### Cronologia della giornata + tasti ufficio (14/09/2026)

- **Cronologia** (migration `20260914090000`, ✅ APPLICATA): `timbrature.modalita` (vocabolario chiuso, scritta nello stesso insert in tutti i 15 punti — `origine` non diceva come) + azioni versione `pausa_ufficio`/`chiusura_ufficio`/`ricalcolo`. Storia **ricostruita dai dati** (`@kommessa/api/kantiere-cronologia`, puro+testato), non da un diario. Ogni modifica passa `prima` (`leggiStatoGiornata`) e le versioni vuote non si scrivono. UI: pannello laterale in Presenze e ore + bollino; tecnico = una riga «Corretta dall'ufficio». Giornate scritte a mano senza timbrature: pallino generico «5:00 di lavoro ordinario» **senza orario** (fra andata e ritorno) e riga «Senza timbrature · 5:00 di lavoro». ⚠️ Nuovi punti che inseriscono timbrature **devono** scrivere `modalita` (valore del CHECK). → `Logiche_Kantiere.md` §7.5.
- **`scrollbar-gutter`**: i gusci office/admin non scorrono mai sulla pagina (scorre `<main>`). `html:has([data-app-shell])` → `auto`, riserva sul `<main>` dei gusci. Prima si perdevano 15px su ogni pagina e i `fixed right-0` si fermavano a 1425/1440.
- **Tasti ufficio**: azioni di pagina e di barra = `<Button size="sm">` (40px, testo 12px, nero; outline per le secondarie). **Mai** tasti fatti a mano con `bg-primary`: il cobalto è per link, badge e stato «selezionato» di filtri e schede. Censimento ripetibile: `BANCO_CDP=9334 node scripts/banco-ui/tasti.mjs`.

Working language for the app UI is **Italian**. Preserve it.

#### Viaggio dentro «Registra giornata» (14/09/2026)

- **Percorso**: partenza e rientro agli estremi, **chi guidava per ogni tratta con strada** (etichetta compatta, solo dove c'è strada), tratte fra cantieri costruite dal sistema (dirette con km/tempo, nel menu due scelte affiancate «Diretta» / «Passando da» la sede, tempo correggibile con motivo; «passando da casa» tolta). Premendo «Registra giornata» il foglio **«Il viaggio»** chiede solo i dati obbligatori mancanti; la **barra dei tempi** (lavoro + viaggio, partenza/rientro) resta visibile sotto. Conferma passeggero **sempre**.
- **Ore**: andata e ritorno = tempo di viaggio fuori dall'orario dichiarato (vanno in `ore_viaggio`); le tratte fra cantieri stanno dentro l'orario e dal 15/09 sono **viaggio**: la fine si calcola (inizio + ore + pausa + tratte), con un buco fra i cantieri (`viaggioFraCantieri`, stesso calcolo in pagina e server); se la pausa cadrebbe sullo stesso cambio di una tratta va 30 minuti dopo l'arrivo (`SCARTO_PAUSA_MIN`), così pausa e viaggio restano due buchi distinti. Andata legata alla prima entrata, ritorno all'ultima uscita, scritte **insieme** (se falliscono si tolgono le timbrature appena scritte). Tutto validato prima di scrivere.
- **Codice**: puro `@kommessa/api/kantiere-percorso` (+ test), UI `mobile/kantiere/ore/_components/registra-giornata-dialog.tsx` + `percorso-giornata.tsx`, `/api/routing/stima` anche cantiere → cantiere, cache condivisa `_lib/routing/stima-cache.ts`. Banco `scripts/banco-ui/registra-giornata.mjs` (`BANCO_SALVA=1` salva sul tenant demo: ripulire dopo). Regole in `Logiche_Kantiere.md` §7.6.
- **15/09/2026, prove da telefono**: partenza e rientro di default la sede predefinita, senza abitazione privata (tutto il giorno in sede = niente partenza e rientro); tempo correggibile su ogni tratta fra cantieri, con motivo; si indica solo l'ora di inizio (fine = inizio + ore + pausa + tratte, con il conto a vista), chi guidava per tratta, pausa pranzo arancione, card «La giornata» più bassa e ad altezza fissa (le card sotto non si spostano con + e −).
- **Tolta la vecchia «Ore su un cantiere, con viaggio»** (`manuale-dialog.tsx` e il suo banco): Registra giornata è l'unico inserimento a mano del tecnico. `registraOreManuali` è stata eliminata il 15/09/2026; le tratte storiche che aveva scritto contano ancora nel ricalcolo. Interfaccia di Registra giornata rimpicciolita del 10% circa su richiesta del cliente (a schermo era grandina).

#### Ore pure, quote derivate, lavoro dalla sede e impostazioni (15/09/2026)

- **Si registra il dato puro**: `rapportino_righe.minuti_lavoro` / `minuti_viaggio` per cantiere (migration `20260914160000`, ✅ APPLICATA). Le quote si **derivano** dall'orario ordinario del tenant (`soglia_ore_ordinarie`, 8 h): **ordinarie** = lavoro + viaggio fino all'orario; **straordinarie** = lavoro oltre; **viaggio eccedente** = viaggio oltre (`ore_viaggio_ordinarie` / `ore_viaggio_eccedenti`, `rapportini.orario_ordinario_min`). Puro e testato: `@kommessa/api/kantiere-quote` (`quoteGiornata`, `quoteDaRiga`, `sommaQuote`, `quoteOre`, `minutiDaTimbrature`, `COLONNE_QUOTE`).
- ⚠️ **Scrittore unico** delle righe: `scriviRigheGiornata` / `aggiornaRigheGiornata` (`_actions/_lib/righe-giornata.ts`). Nuovi punti che scrivono ore **devono** passare di lì; chi legge usa `quoteDaRiga`/`quoteOre`, mai `ore_ordinarie` da solo (è solo la parte lavoro). Tolti `salvaMioRapportino`, `inviaMioRapportino`, `registraOreManuali`, `calcolaOreGiornata`, `minutiViaggioPerTarget`.
- **Giornate vecchie intatte**: config `quote_ore_dal` (FPM, DEMOC = 2026-09-15); righe con quote di viaggio null = vecchie, tutto il viaggio conta eccedente. API v1 `/ore`: campi di sempre invariati + `lavoro`, `viaggioOrdinario`, `viaggioEccedente`. Costi: tariffa ordinaria su lavoro + viaggio entro l'orario, `pctViaggio` solo sull'eccedente.
- **«Lavoro dalla sede sul progetto»** (flag in avvio turno, cambio cantiere, Registra giornata per cantiere): ore del cantiere, tratte da/verso la **sede predefinita**; stessa sede = nessuna tratta. `timbrature.sede_lavoro_id`; `/api/routing/stima` accetta `{ daSedeId, aSedeId }`. → `Logiche_Kantiere.md` §3.2.
- **Impostazioni Kantiere riordinate** (Orario e ore · Turni · Pause · Viaggi e chilometri · Approvazione giornate · Anomalie · Kontabilità) con descrizioni oggettive ed esempio calcolato; tolta `anomalie_ore_max` (mai letta); soglia di verifica ora con i decimali. Fix: salvare dall'elenco Dipendenti azzerava `costo_orario`.

#### Audit generale: sicurezza, convivenza e pulizia (15/09/2026)

- **Segreti** (cron, webhook, backfill): `segretoValido` / `bearerValido` in `_lib/segreto.ts`, mai `===`. **`?next=`** dopo login e callback: `percorsoInterno` (`_lib/percorso-sicuro.ts`), mai un URL esterno. **Super admin** solo da `app_metadata.platform_admin`: nessuna eccezione per email.
- ⚠️ **Tetto di 1000 righe di PostgREST confermato** (chiesto 5000, restituite 1000, senza errore): una lettura che deve essere completa (totali, export, API) va paginata. API v1: `LIMITE_MAX = 999` perché si chiede `limite+1`.
- **Nuove funzioni SECURITY DEFINER**: `revoke execute ... from public, anon, authenticated` se non servono agli utenti (le funzioni nuove in `public` nascono eseguibili da tutti).
- **Convivenza dei mondi**: pagine commesse mobile con `soloMondoCommesse()` (`mobile/_lib/mondo.ts`), `/office/tickets` chiuso ai tenant solo Kantiere, Kontabilità spenta = niente voce e `notFound()` (layout), `getAppModeCached` torna a `kommessa` se manca il modulo Kantiere, ⌘K filtrata per mondo. `app_mode=full` su mobile: il tab Kantiere prende il posto di Notifiche, Profilo resta.
- **Scritture ore**: `scriviRigheGiornata` inserisce le righe nuove e poi cancella le vecchie (se l'insert fallisce la giornata resta com'era); `inserisciPausaDichiarata` restituisce l'esito e chi chiude il turno si ferma se la pausa non entra.
- **Upload**: l'annullamento vale solo per un caricamento `uploading`, dell'autore o dell'ufficio (prima un file già sincronizzato finiva fra gli upload morti e veniva cancellato). La pagina Storage non manda più la password al browser.
- **Letture complete**: `leggiTutto` / `leggiPerGruppi` da `@kommessa/api/pagine` (pure + test). Ordinamento stabile che finisce su una colonna unica (`.order(...).order('id')`), un errore interrompe la lettura (meglio una pagina d'errore che ore a metà), liste `in(...)` a gruppi da 100 id. Usarle per totali, export, report e API; non per le letture volutamente limitate («ultime N»).
- **Impersonation**: il cookie `shadow_admin` è firmato (HMAC con chiave derivata dalla service role, `admin/_lib/shadow.ts`, scade con il cookie). `isSuperadminActor` accetta solo un cookie valido di un utente ancora super admin nel database; `ripristinaVersione` resta nel tenant della sessione. Mai leggere quel cookie con `JSON.parse`.
- **Librerie** (15/09): Next 14.2.35, sharp 0.35, jsPDF 4 (import nominato `{ jsPDF }`), `pnpm.overrides` per le dipendenze indirette vulnerabili nella stessa major. Ottimizzatore immagini spento (`images.unoptimized`): è l'endpoint delle vulnerabilità di Next 14 chiuse solo da Next 15, che resta da pianificare (React 19, `cookies()`/`params` asincroni).
- Migration **`20260915180000_sicurezza_privilegi_utenti_tenant`**: autorizzata da Luca il 15/09, provata in transazione annullata. Punti ancora aperti → memoria `project-audit-generale-2026-09-15`.
- **Portale clienti chiuso** (16/09, migration `20260916090000`): il ruolo `cliente` non accede a nessuna tabella dello staff (policy RESTRITTIVE `*_no_cliente`), le pagine `/portal` esistono solo con la funzione per-tenant `portale_clienti` accesa (spenta per tutti) e l'invito non propone più quel ruolo. Per riaprirlo servono policy per-tabella scritte apposta: vedi la testa della migration.

### Personalizzazioni: export paghe verso il consulente del lavoro (16/09/2026)

Area office **Personalizzazioni** = il **contenitore** delle funzioni su misura, gated dal modulo per-tenant **`personalizzazioni`** (Bertaiola non ha la riga → non vede niente). Qualunque cliente può averla accesa; quali funzioni sono attive sta in `tenant_modules.config.funzioni`, e sotto la chiave di ognuna stanno le sue impostazioni. L'elenco vive in `apps/web/app/_lib/personalizzazioni-registry.ts`: **per aggiungerne una servono una voce nel registro e la sua pagina**, poi la voce in sidebar e la casella nel pannello super admin compaiono da sole. Due porte: il layout controlla l'area, la pagina controlla la sua funzione. Prima funzione: **Export paghe** (`/office/personalizzazioni/paghe`), che produce `DatiMese.txt`, il file a lunghezza fissa che il consulente del lavoro importa nel suo programma paghe. Manuale: `documentazione_generale/08_LOGICHE/Logiche_Export_Paghe.md`.

- **Si esportano solo le variazioni** rispetto all'orario teorico: straordinari, assenze, maggiorazioni. Le ore ordinarie **no** (confermato dal consulente: l'azienda ha un orario settimanale fisso e il programma paghe conosce il teorico). Una giornata normale non produce nessuna riga.
- **Niente si congela**: il mese si ricostruisce a ogni apertura da rapportini **approvati** + `permesso_richieste` **approvate** + le variazioni scritte a mano in `paghe_eventi` (per chi non usa ancora l'app). Le giornate in bozza restano fuori e la pagina le elenca.
- ⭐ **`dipendenti.codice_interno` è già il codice paghe dello Studio** (verificato sui dati FPM). Non confonderlo con l'id del gestionale, che non si guarda mai.
- **Record 12 (periodo) obbligatorio** per malattia, maternità, infortunio e congedi; tutto il resto va nel record 14 (giornaliero, ore obbligatorie). **Ore in centesimi**: `001,50` è un'ora e mezza.
- **Il PUC non si inventa**: se manca, il file esce lo stesso con avviso evidente e lo Studio lo inserisce a mano. Numero e documento del medico stanno in `paghe_certificati` (allegato su R2, non viene mandato allo Studio).
- Logica **pura e testata** in `@kommessa/api/paghe-essepaghe` (record composti dichiarando le posizioni del manuale), `paghe-causali` (le 233 causali dello Studio, **generate dal CSV**: rigenerare, non modificare a mano), `paghe-mappatura` (corrispondenze, festività, taglio dei periodi). ⚠️ Un test riproduce **carattere per carattere** il fac-simile approvato dal consulente: se cambia, è cambiato il tracciato.
- Il **dizionario è dato, non codice**: codice ditta, corrispondenze e causali aggiunte dal cliente vivono in `tenant_modules.config`. Le corrispondenze ambigue (visita medica, congedo matrimoniale, congedo parentale) restano **da decidere** di proposito: sceglierle al posto del consulente sarebbe decidere sulla busta paga.
- Ordine di affidabilità delle fonti: **conferma del consulente > manuale > Excel storico > esempi > nostre deduzioni.**

### Infrastruttura produzione

| Servizio | Dettaglio |
|---|---|
| **Vercel** | team `solvasolutions`, progetto `bertaiolaimpianti`. Deploy automatico da `main`. URL: `https://bertaiolaimpianti.vercel.app` |
| **Supabase** | progetto `BertaiolaImpianti_GestioneCommesse`, ref `vuhqioixvgaadyxnerfg`, region **West EU (Ireland)**. Dashboard: `https://supabase.com/dashboard/project/vuhqioixvgaadyxnerfg` |
| **Nextcloud** | Hetzner Storage Share managed, già acquistato e configurato dal cliente. `basePath` e credenziali in `apps/web/.env.local` sotto `STORAGE_*`. |
| **Cloudflare R2** | Bucket staging per upload media. Credenziali `R2_*` in `.env.local`. I file vengono inviati prima su R2 poi sincronizzati su Nextcloud. |

**Credenziali**: tutte in `apps/web/.env.local` (gitignored). **Mai citare password in chiaro in prompt/transcript/commit.**

> **Segreti su `tenants` (hardening, migration `20260627010000`)**: le colonne `storage_config` (credenziali Nextcloud) e `r2_config` (secret key R2) sono **segreti** e NON sono leggibili dal client `authenticated`/`anon` (privilegi di colonna: SELECT di tabella revocato, ri-concesso solo sulle colonne non sensibili). Vanno lette **esclusivamente via service role** (`createServiceSupabase`, scoping esplicito `.eq('id', tenantId)`) — già così in tutto il codice. **Mai** passare questi due campi a un componente client per i tenant. ⚠️ Aggiungendo una **nuova colonna NON segreta** a `tenants`, concederla: `grant select (col) on public.tenants to anon, authenticated;` (le colonne segrete NON si concedono). La chiave Google Maps non sta qui (è env globale): vedi sopra.

**Migrazioni DB**: scrivere il file SQL in `supabase/migrations/`. L'apply al DB cloud si fa con `supabase db query --linked < supabase/migrations/<file>.sql` — **`db push` non funziona su questo repo**.

> ⚠️ **Ogni migration DEVE essere idempotente.** Applicate con `db query` non finiscono in `supabase_migrations.schema_migrations`, quindi un domani un `db push` proverebbe a rilanciarle tutte. Il registro è fermo a `20260814150000` mentre nel repo ci sono 10 file più recenti: verificato il 23/09/2026 che **tutti e 10 sono idempotenti** (drop-if-exists in pari con ogni create, `on conflict` sugli insert), quindi una riesecuzione gira a vuoto senza danni.
>
> **Non registrarle a mano** in `schema_migrations` per "sistemare" il disallineamento: il rischio è asimmetrico. Segnare come applicata una migration che non lo è la fa saltare **per sempre**, cioè deriva silenziosa dello schema; non segnarla costa al massimo una riesecuzione a vuoto. In pratica: `add column if not exists`, `drop constraint if exists` prima di `add constraint`, `drop policy if exists` prima di `create policy`, `on conflict` sugli insert.

**Deploy**: solo `git push origin main`. La GitHub integration Vercel fa tutto. Non usare `vercel deploy --prod` manualmente (raddoppia la build sul piano Hobby).

Working language for all documents is **Italian**. Preserve it when editing; do not translate existing content unless asked.

> **Product name**: `Kommessa` (rebrand definitivo da `impiantiXplus`, maggio 2026). Pacchetti workspace: `@kommessa/api`, `@kommessa/ui`, `@kommessa/integrations`, `@kommessa/web`.

## Repository layout (purpose-ordered, not alphabetical)

- `README.md`, `CLAUDE.md` — root-level docs
- `documentazione_generale/` — all kickoff documentation, consolidated:
  - `00_input_cliente/` — original client meeting PDFs (14/11 and 28/11/2025), source-of-truth raw input
  - `01_KICKOFF/` — Documento Zero (vision/context), Report Riunione (decisions log), Flusso_Operativo (product flow), Domande_Cliente_SOLVA.md (compiled client questionnaire)
  - `02_ARCHITETTURA/` — technical architecture, stack choices, storage comparison, infra cost estimate
  - `03_BRAND/` — three legacy candidate names (Cantiera, Posa, ImpiantOS) kept as historical material; current working name `impiantiXplus` is in the top-of-file note
  - `04_ROADMAP/` — Sprint 0 → Sprint 5 plan with effort estimates
  - `05_MOCKUP/` — UI wireframes (6 priority screens)
  - `06_PREVENTIVO/` — commercial quote with 3 package tiers
  - `07_PRESENTAZIONI/` — generated `.pptx` slide decks (Executive, Tecnica; Commerciale TBD) — **out of date with current product name, need regeneration**

The `README.md` reading order (Documento_Zero → Report_Riunione → Flusso_Operativo → Comparativa_Storage → Architettura_Soluzione → Roadmap → Preventivo → PPTs) is the canonical onboarding path. All paths there are now relative to `documentazione_generale/`.

## Load-bearing architectural decisions (do not silently contradict)

These decisions evolved across versions — the current state is **v3** (commit `5000547`: "v3: abbandono Freshdesk + PWA tecnici al posto di Expo"). When editing any document, keep these aligned:

| Decision | Status |
|---|---|
| **Product name** | **Kommessa** (definitivo dal maggio 2026, rebrand da `impiantiXplus`). Legacy alternatives in `03_BRAND/` sono solo contesto storico. |
| **Freshdesk** | **Abandoned** post go-live: ticketing nativo nell'app. Lo script di migrazione one-time è stato rimosso il 16/09/2026 (non funzionava più); resta solo l'enum storico `imported_from_freshdesk`. Do not describe it as "integrated". |
| **Mobile tecnici** | **PWA** (Next.js + Service Worker + Web App Manifest). **Not** Expo, **not** React Native, **not** native iOS/Android. No App Store / Play Store. |
| **Storage cloud** | ✅ **Nextcloud confirmed** (Hetzner Storage Share managed). Decisione chiusa: il cliente Bertaiola ha già acquistato e configurato Nextcloud, il file browser mobile vede i file reali. Mantenere comunque l'astrazione `StorageProvider` nel codice per supportare in futuro altri tenant con provider diversi. |
| **Backend** | Supabase Pro, region **Frankfurt EU** (GDPR). Postgres + Auth + Realtime + Edge Functions. |
| **Web** | Next.js 14 on Vercel. Monorepo with shared codebase across web office / PWA tecnici / portale cliente. |
| **Multitenant** | From day 1. Bertaiola is the **pilot tenant** of a SaaS product (working name **impiantiXplus**). |
| **Hosting** | 100% EU. GDPR compliance is a hard requirement. |
| **Pricing reference** | Pacchetto B ≈ €20.020 + IVA year 1; ≈ €3.920/year recurring. Update `documentazione_generale/06_PREVENTIVO/Preventivo_Base.md` if numbers change anywhere else. |

## Cross-document consistency

These files cite each other and must stay in sync — when changing one, check the others:

- Scope/decisions: `README.md` ↔ `documentazione_generale/01_KICKOFF/Documento_Zero.md` ↔ `documentazione_generale/01_KICKOFF/Report_Riunione.md` ↔ `documentazione_generale/01_KICKOFF/Flusso_Operativo.md`
- Tech choices: `documentazione_generale/02_ARCHITETTURA/Stack_Tecnico.md` ↔ `documentazione_generale/02_ARCHITETTURA/Architettura_Soluzione.md` ↔ `documentazione_generale/07_PRESENTAZIONI/Bertaiola_Tecnica.pptx`
- Costs: `documentazione_generale/02_ARCHITETTURA/Stima_Costi_Infrastruttura.md` ↔ `documentazione_generale/06_PREVENTIVO/Preventivo_Base.md`
- High-level pitch: both PPTs in `documentazione_generale/07_PRESENTAZIONI/` reflect the choices above and need to be regenerated when those choices change (see open-items list at the bottom of `README.md`).

## Document conventions

- Versioned headers (`**Versione**: 1.0`, `**Stato**: …`) at the top of each `.md` — bump them when making substantive changes.
- Pricing or third-party-claim text is wrapped in `<span class="cite">…</span>` to flag it as needing a citation/source — preserve these spans.
- Tables are used heavily for decisions and trade-offs; keep that format rather than converting to prose.
- `.pptx` files are binary artifacts generated from the markdown — editing them by hand is out of scope; regenerate from source when content drifts.
- The word "**cantiere/cantieri**" (with the "e") is the working domain ("construction site/job site") and must NOT be confused with the obsolete product name "Cantiera". Do not rename `cantiere` occurrences.
