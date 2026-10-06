# Logiche Richieste al telefono — dal post-it alla commessa

**Versione**: 1.0
**Stato**: ✅ in produzione dal 05/10/2026 (push `ef2da9f` + `c847a87`)
**Migration**: `20261005120000_richieste_al_telefono.sql` — ✅ applicata e verificata
**Ambito**: mondo **commesse** (`app_mode ≠ kantiere`, quindi Bertaiola). FPM non ne è toccata.

> **Il problema, nelle parole del cliente.** L'ufficio risponde al telefono —
> «c'è da cambiare la caldaia, nome Elena, è una Viessmann» — e scrive un
> **post-it**, che poi porta a mano a chi se ne deve occupare.

---

## 1. Perché non è una commessa

Il flusso del prodotto (`01_KICKOFF/Flusso_Operativo.md` §2) parte dal
**sopralluogo**: «il capo apre la PWA sul telefono dal cliente». La telefonata
in ufficio sta **a monte di tutto** e non esisteva da nessuna parte.

Creare una commessa a quel momento sarebbe sbagliato, e non per gusto:

| Effetto di `creaCommessa` | Reversibile? |
|---|---|
| brucia un numero dal contatore `commessa_counter` (gapless) | **no** |
| crea ~15 cartelle fisiche su Nextcloud (`01_Richieste/{nome}/` + scaffold) | cartelle che restano |
| può creare una riga in `clienti` | riga orfana |
| scrive versione 1 in `commessa_versioni` | — |

E **non esiste nessuna azione di eliminazione commessa** nel prodotto: l'unica
«pulizia» è archiviare, che fa un MOVE della cartella. Per una telefonata che a
volte non diventa niente, è troppo.

⚠️ Lo stato `bozza` dell'enum `stato_commessa` **non serve a questo**: è un
valore legacy e una commessa in `bozza` è una riga normale, perché il
*percorso* che la crea è lo stesso. Non evita nessuno dei costi sopra.

---

## 2. La decisione: una richiesta È un task senza commessa

⭐ **La lista condivisa esisteva già.** La pagina **Task** (`commessa_todo`) ha
da sempre stati, priorità, assegnatario, scadenza, note, allegati, vista
cross-commessa, filtro «A me», presenza in dashboard ufficio e in PWA. Le
mancava **una riga di schema**: `commessa_id` era `NOT NULL`.

Quindi la funzione è venuta fuori **togliendo due vincoli**, non scrivendo una
tabella nuova:

1. `commessa_todo.commessa_id` → **nullable** (`NULL` = richiesta);
2. `audit_events.tenant_id` → **nullable** (per gli eventi di piattaforma del
   lavoro gemello sui limiti di upload; vedi `Logiche_Upload_Media.md` §8.10).

L'alternativa valutata e **scartata**: una tabella `richieste` con la sua
pagina. Più pulita sulla carta, ma lasciava **due liste condivise** da guardare
ogni mattina e due meccanismi di assegnazione da tenere allineati. Il criterio
che ha deciso: *quante cose deve guardare la persona che risponde al telefono?*

---

## 3. I dati della telefonata

Colonne nuove su `commessa_todo`:

| Colonna | Significato |
|---|---|
| `cliente_id` | il cliente **in anagrafica**, se chi ha chiamato c'era già |
| `cliente_testo` | il nome **come è stato detto**, quando in anagrafica non c'è |
| `contatto` | come richiamare: numero o email, **testo libero** |

⭐ **Non si crea una riga in `clienti` per una telefonata.** La scheda cliente
vera (indirizzo, partita IVA, referenti) la chiede il form di creazione
commessa al momento della conversione. Al telefono si scrive quello che si ha:
a volte è solo «signora Elena, caldaia Viessmann, richiama».

Il resto riusa i campi che c'erano: `titolo` = cosa serve, `descrizione` =
dettagli, `priorita` = urgenza, `assegnato_a` = chi se ne occupa, `scadenza_at`
= entro quando. `metadata.fonte = 'telefono'` marca la provenienza (il campo
esisteva già con `'riunione:<id>' | 'manuale'`).

Indice parziale `commessa_todo_richieste_idx` su `WHERE commessa_id IS NULL`:
le richieste si cercano sempre come «quelle senza commessa».

---

## 4. La catena completa

```
telefonata
   │
   ▼
RICHIESTA  (task senza commessa, nella lista Task condivisa)
   │   ├── assegnabile a chiunque, con notifica
   │   └── modificabile (si assegna anche dopo)
   ▼
«Crea commessa»
   │
   ▼
BOZZA precompilata  (commessa_bozze: 1 INSERT, niente codice, niente cartelle, 30 giorni)
   │
   ▼
/office/commesse/nuova?bozza=<id>   → il form chiede il resto (voci, indirizzo, referenti)
   │
   ▼
COMMESSA  + la richiesta si AGGANCIA (commessa_todo.commessa_id = nuova commessa)
```

⭐ **Il post-it non si butta: diventa la prima riga di storia del lavoro.** È
anche il motivo per cui il modello giusto era «rendere nullable» e non «tabella
separata»: è lo **stesso oggetto** prima e dopo che ha una commessa.

Il form da 1555 righe **non è stato toccato**: gli si passa una bozza, cosa che
sa già riprendere (`?bozza=<id>`).

### 4.1 La conversione, in dettaglio

Azione `convertiRichiestaInBozza` (`_actions/richieste.ts`). Logica pura e
testata: `@kommessa/api/richiesta-bozza` → `payloadBozzaDaRichiesta`.

| Caso | Cosa fa |
|---|---|
| cliente in anagrafica | `clienteId` + `_clienteLabel` per il display al resume |
| cliente solo scritto | `clienteNew.ragione_sociale` = il nome detto |
| contatto con `@` | diventa `clienteNew.email` |
| contatto senza `@` | diventa `clienteNew.telefoni` |
| contatto ma cliente già in anagrafica | va nelle **note** (non c'è un `clienteNew` dove metterlo) |
| titolo ≤ 60 caratteri | diventa `descrizioneFinale` |
| titolo > 60 caratteri | **non** diventa descrizione, va nelle note, e il form la chiede |

⚠️ **La descrizione non si tronca.** Diventerebbe il `nome_cartella` su
Nextcloud, che **non si rinomina più**: meglio nessuna descrizione che
«SostituzioneCaldaiaViessman» tagliato a metà parola.

⭐ **Niente si perde**: tutto quello che è stato battuto al telefono finisce in
`noteIniziali`, comprese le cose che non hanno un campo dove andare.

L'aggancio alla commessa avviene in `finalizzaBozza`, leggendo
`payload._richiestaTodoId`. Best-effort e **loggato**: la commessa è già
creata, non si torna indietro per questo. Doppia conversione impedita: se
`commessa_id` è già valorizzato l'azione rifiuta.

---

## 5. Dove va una richiesta che nessuno ha preso

Nella **stessa lista**. Non c'è una seconda coda, ed è voluto: una richiesta non
assegnata non è un oggetto diverso, è lo stesso oggetto senza un nome accanto.

| Serve a | Come |
|---|---|
| vedere il mucchio | contatore ambra **«Da assegnare»** in alto, compare solo se esiste |
| isolarlo | scorciatoia **«Da assegnare»** nei filtri, un clic (`?assegnato=nessuno`) |
| assegnare | tendina **sulla riga**, senza aprire nulla |
| non dimenticarlo | avviso `todo_urgenti_non_assegnati` (urgenti e alte) in dashboard |

La tendina sulla riga è il gesto vero: l'ufficio apre «Da assegnare» e scende
smaltendo. Vale anche per i **task di commessa**, che pure potevano restare
senza nessuno.

---

## 6. Si assegna a CHIUNQUE

`elencaAssegnabiliTenant` (`_actions/commessa-tecnici.ts`): tutti gli utenti
attivi del tenant tranne i `cliente`, col ruolo restituito perché l'elenco va
raggruppato a schermo.

⚠️ Prima il picker mostrava **solo** `role='tecnico'`: una richiesta non si
poteva passare a un collega d'ufficio, e nel filtro «Assegnato» un task dato a
un non-tecnico non si poteva nemmeno cercare. «Ordina la pompa» è roba
d'ufficio, «passa a vedere la caldaia» è roba da capo.

`elencaTecniciTenant` **resta** per `commessa_tecnici`, dove assegnare una
persona a una commessa ha senso solo per un tecnico. Sono due domande diverse.

---

## 7. Chi viene assegnato lo sa

Evento `todo_assegnato` in `notification_event_types` (in-app + push, non
critico). Helper `notificaAssegnazione` (`_actions/_lib/notifica-assegnazione.ts`),
service role perché la RLS di `notifiche` è self-only.

Regole:
- **non** si avvisa chi assegna a se stesso;
- si avvisa **solo se l'assegnatario cambia** (altrimenti ogni ritocco al
  titolo riavvisava la stessa persona);
- best-effort ma **loggato**.

⚠️ Prima, assegnare un task scriveva **solo** su `audit_events`: l'interessato
non riceveva niente e lo scopriva solo aprendo la lista. ⭐ **Una funzione di
assegnazione che non notifica non è finita.** Lo stesso vale ancora per
`commessa_tecnici` → vedi `Osservazioni_Audit_2026-10-05.md` §6.

---

## 8. L'interfaccia

### 8.1 Ufficio — `/office/todo`, «Task e richieste»

- Due pulsanti: **«Richiesta al telefono»** (pieno, è il gesto principale) e
  «Task su una commessa» (bordato).
- Filtri: gruppo **Tipo** (Tutto · Richieste da smistare · Task di commessa),
  e «Da assegnare» nel gruppo Assegnato.
- Le richieste stanno **in cima**: sono le uniche righe che aspettano una
  decisione (va in sopralluogo? si butta?), il resto è lavoro già incanalato.
- Riconoscibili senza leggere: barretta ambra a sinistra, badge «Richiesta»,
  cliente in evidenza e contatto in mono.
- Azioni di riga: tendina «Assegna a…» (se non assegnata), matita (modifica),
  **«Crea commessa»**.
- Contatori in alto: «Richieste», «Da assegnare», più quelli che c'erano.

### 8.2 Il modulo della telefonata

I campi stanno nell'ordine in cui le cose **vengono dette**, e l'unico
obbligatorio è il primo:

1. **Cosa serve** (`Es. Cambio caldaia`)
2. **Chi ha chiamato** — ricerca in anagrafica; se non c'è, nota: «Non è in
   anagrafica: per ora resta il nome scritto qui. La scheda cliente si crea
   quando diventa una commessa.»
3. **Come richiamare**
4. **Dettagli** (`Marca e modello, cosa succede, quando sono in casa…`)
5. **Urgenza**: Quando capita / Normale / Presto / Urgente
6. **Chi se ne occupa** — raggruppato per ruolo, con «Riceve una notifica sul
   telefono»
7. **Entro il**

Lo stesso modulo serve a modificare: è lì che si assegna se al telefono non si
sapeva ancora a chi darla.

### 8.3 Telefono — home PWA

La richiesta compare in «Cosa fare» con la barretta ambra e la scritta
«Richiesta». **Non** porta a una commessa (non ce l'ha) e, se c'è un numero, il
tasto lo **chiama** (`tel:`): la prima cosa che serve a chi la riceve è
richiamare la persona.

⚠️ La home mobile **non esce più subito** quando non hai commesse assegnate: un
capo con una sola richiesta in mano leggeva «nessuna commessa assegnata» e non
la vedeva mai. Ora si esce solo se non c'è **né** l'una **né** l'altra.

---

## 9. Ricerca cliente: un componente per tutta l'app

`_components/cliente-picker.tsx` → `ClientePicker` + hook `useRicercaClienti`.

Prima la stessa domanda «chi è il cliente?» aveva **tre** risposte:

| Dove | Come |
|---|---|
| form creazione commessa | query Supabase **dal browser**, debounce 200 ms, 8 risultati, tipo suo |
| dettato vocale | azione server, debounce 400 ms, 5 risultati, minimo 3 caratteri |
| telefono | niente |

Ora la meccanica è una: `cercaClientiPerNome` (minimo **2** caratteri — con tre,
«Bo» per «Bortolussi» non dava niente e sembrava che il cliente non esistesse;
`limite` opzionale, default 8), e l'hook gestisce debounce, soglia,
annullamento e «errore → nessun risultato».

**Il dettato vocale conserva la sua resa**, di proposito: non è un picker,
**avvisa che il cliente forse esiste già** sui dati estratti dall'AI, con una
dismissione per-nome. È un'altra interazione.

Il form commessa è passato **sull'hook** (via la query dal browser) ma ha
mantenuto il suo markup, che è intrecciato con gli errori di campo: unificare
anche quello nello stesso push non valeva il rischio su una pagina di
produzione. → resta aperto, `Osservazioni_Audit_2026-10-05.md` §7.

⚠️ L'elenco del picker è un **overlay assoluto in-flow**, non un Portal: dentro
un dialog Radix un Portal è un clic «fuori» e chiude il dialog sotto (regola
già nota, vedi i gotcha UI in `CLAUDE.md`).

---

## 10. Regole da non violare

1. ⚠️ **Ogni punto che legge i task deve gestire la commessa mancante.**
   `/office/commesse/null/lavori` è un link rotto. Sistemati: board Task, card
   dashboard, avvisi (`_lib/alerts.ts`), home mobile. Le revalidation passano da
   `rivalida()`, che salta i percorsi che citano una commessa inesistente.
   **Nessuno di questi era visibile dai tipi**: `commessa_todo` non è nei tipi
   generati, si usa `.from('x' as never)`.
2. ⚠️ `commessa_todo` ha ora **due** relazioni verso `clienti` (`cliente_id`
   diretto e `commessa → cliente`): gli embed vanno **nominati**
   (`richiedente:clienti!commessa_todo_cliente_id_fkey`), altrimenti PostgREST
   muore. Il nome del vincolo è quello generato da Postgres: **verificato in
   produzione**, non dedotto.
3. ⚠️ `.eq('commessa_id', null)` **non trova i NULL**: serve
   `.is('commessa_id', null)`. Vale anche per il calcolo di `sort_order`.
4. La RLS di `commessa_todo` è sempre stata **per tenant**, non per commessa:
   togliere il vincolo non ha aperto niente.
5. `commessa_bozze` è **privata dell'autore** (RLS `created_by`): chi converte
   diventa l'autore della bozza, e un collega non la vede.

---

## 11. Come è stato verificato

- Migration provata in **transazione annullata**, poi applicata, poi verificata.
- 510 test verdi in `packages/api` (10 nuovi su `richiesta-bozza`), typecheck
  4/4, lint pulito, `next build` di produzione completata.
- **Prova end-to-end sul tenant demo DEMOK**: richiesta senza commessa creata,
  la select esatta della pagina con **due relazioni verso `clienti`** che si
  risolvono entrambe (il punto rischioso), filtro «senza commessa», payload
  della bozza col contatto conservato nelle note, pulizia a zero.
- Verificato che l'elenco assegnabili su DEMOK include ora **Ufficio** e
  **Chiara Bianchi (office)**, che prima non comparivano.

**Resta da provare sul campo**: le schermate in un browser vero. Il banco UI
(`scripts/banco-ui/`) entra solo come utente dei tenant demo e queste sono
pagine d'ufficio; le pagine `/admin` non sono verificabili con quello.
