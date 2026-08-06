# Come funziona, dentro

**Aggiornato**: 06/08/2026

Il pezzo tecnico: com'è fatto il lato Kommessa e perché ogni scelta è stata presa così.
Per la spiegazione discorsiva vedi [README.md](README.md); per chi scrive un agente,
[Contratto_API.md](Contratto_API.md).

---

## 1. Il vincolo che spiega metà del progetto

Sul gestionale di FPM le scritture sono **append-only e irreversibili via API**: non si
rileggono (`GET` risponde 405) e non si cancellano (l'identificativo restituito non è
utilizzabile per cancellare o modificare). Va dato per possibile su qualunque ERP finché
non si dimostra il contrario.

Da qui discende tutto:

| Conseguenza | Come è affrontata |
|---|---|
| Non possiamo chiedere al gestionale cosa gli abbiamo già mandato | teniamo noi il registro: `integrazione_outbox.esito_esterno` |
| Un doppio invio è permanente | chiave di idempotenza `UNIQUE`, e una riga `inviato` non si rilavora mai |
| Una correzione non è propagabile | si manda solo l'approvato; le correzioni successive si fanno a mano nel gestionale, e la UI lo dice |
| Un errore è costoso | prima del go-live, prova pilota col cliente davanti al gestionale aperto |

## 2. Le quattro tabelle

Migration `20260805090000_integrazione_gestionali.sql`.

| Tabella | Scrive | Legge | Cosa contiene |
|---|---|---|---|
| `integrazione_outbox` | Kommessa (accoda), API (avanza) | entrambi | la coda delle scritture verso il gestionale |
| `integrazione_staging` | API (dall'agente) | Kommessa | dati grezzi letti dal gestionale, prima della riconciliazione |
| `integrazione_mappature` | Kommessa | entrambi | ponte fra i nostri identificativi e quelli del gestionale |
| `integrazione_esecuzioni` | API | Kommessa | diario dei giri, base per gli allarmi |

Tutto è filtrato per `tenant_id` **e** `sistema`.

### Ciclo di vita di un'operazione

```
in_attesa ──(l'agente la prende)──> in_corso ──(gestionale OK)──> inviato
                                        │
                                        └──(gestionale KO)──> errore ──(ritenta)──> in_corso
```

`annullato` lo mette solo l'ufficio, per togliere dalla coda qualcosa che non va più
mandato.

> La presa in carico avviene **nello stesso colpo** della lettura (`GET /lavori`), con un
> confronta-e-scambia. Senza, due giri sovrapposti — un agente lento e il successivo che
> parte — lavorerebbero le stesse righe, e sul gestionale finirebbero due volte.
>
> Effetto collaterale accettato: se l'agente muore dopo aver preso in carico, quelle righe
> restano `in_corso` e non tornano da sole. È voluto — meglio una riga ferma da sbloccare
> a mano che una scritta due volte.

## 3. Il vocabolario neutro

`packages/api/src/integrazione.ts` — tipi, validazione, preset delle descrizioni,
idempotenza. `integrazione-mappa.ts` — conversione dai dati di dominio. Entrambi **puri e
testati**: nessuna query, quindi verificabili senza database.

### Perché `commessa` e non `cantiere`

È l'unità di lavoro su cui si imputano ore e costi. Il nome è neutro perché nei due mondi
del prodotto è una cosa diversa:

| `tenants.app_mode` | tabella | esempio |
|---|---|---|
| `kantiere` | `cantieri` | FPM Impianti |
| `kommessa` | `commesse` | Bertaiola Impianti |
| `full` | preferisce `cantieri` | — |

> ⚠️ **Trappola dello schema.** Le tabelle operative (`timbrature`, `rapportino_righe`,
> `timbratura_viaggio`) hanno **due colonne**: `cantiere_id` **e** `commessa_id`. I due
> mondi sono nati in momenti diversi e convivono. Per FPM `commessa_id` è **sempre NULL**
> (verificato: 0 su 379 timbrature, 0 su 142 righe di rapportino). Chi legge `commessa_id`
> fidandosi del nome ottiene query che funzionano e non restituiscono nulla.
>
> Un solo punto del codice sa di questa doppia colonna: **`risolviCommessa()`** in
> `integrazione-mappa.ts`. Ripiega sull'altra colonna segnalandolo (`daFallback`), così una
> migrazione mancata resta visibile invece di far sparire righe in silenzio.

La distinzione concreta sopravvive in `integrazione_mappature.entita` (`'cantiere'` o
`'commessa'`), dove serve: una mappatura deve dire senza ambiguità a quale tabella punta.

### Le descrizioni

Su molti gestionali il campo descrizione è l'unico posto dove entra il contesto. È quindi
un **formato convenzionato**, non una frase libera: segmenti separati da ` · `, ordinati
dal più importante al meno, campi vuoti omessi, tetto a 200 caratteri con troncamento in
coda.

```
Straordinario · 1:30 · Rossi Mario · Fincantieri Monfalcone
Viaggio 03/08/2026 · Rossi Mario (autista) · Sede Verona → Fincantieri Monfalcone · 50 km
Pasto 03/08/2026 · Ristorante La Borsa · Rossi Mario · 2 pers. · Fincantieri Monfalcone
```

### Idempotenza

Ancorata alla **riga di Kommessa che ha originato l'operazione**, non al contenuto:

```
ore:rapportino_righe:<uuid>:ordinario
ore:rapportino_righe:<uuid>:straordinario
ore:rapportino_righe:<uuid>:viaggio
spesa:spese:<uuid>
km:timbratura_viaggio:<uuid>
```

La **variante** in coda serve perché una riga di rapportino genera fino a tre registrazioni,
una per causale: senza, la seconda e la terza sarebbero scartate come doppioni — in
silenzio.

Conseguenza voluta: se una riga viene corretta in Kommessa dopo l'invio, la chiave resta la
stessa e non si rispedisce. È giusto — una correzione si sommerebbe invece di sostituire.

### Granularità delle ore

**Una riga per commessa, non per giornata** (deciso col cliente il 05/08/2026). Il totale
giornaliero si ricava sommando; il contrario no. È anche il dato che serve al controllo di
commessa.

### Cosa non viene mai accodato

| Caso | Perché |
|---|---|
| Spesa in `bozza` | è ancora in revisione o in analisi AI |
| Tragitto del **passeggero** | l'auto non gli è costata nulla: sarebbe un rimborso non dovuto |
| Tragitto senza chilometraggio | niente da contabilizzare |
| Causale ore a zero | riga di rumore |
| Operazione con anagrafiche non collegate | fallirebbe di certo: meglio dire *quale* manca |

## 4. L'API

`apps/web/app/api/integrazione/v1/` — cinque rotte, autenticate con token di scope
`integrazione` (riusa `api_tokens`, la stessa tabella del comando iOS: hash, scope, revoca
istantanea).

Il `sistema` su cui l'agente lavora **non è un parametro**: si legge dalla config del
tenant. Se lo dichiarasse il chiamante, un token rubato potrebbe farsi dare la coda di un
altro gestionale dello stesso cliente.

### Perché l'API e non il collegamento diretto al database

Scelta rivista il 06/08 (la migration `20260806120000` rimuove il ruolo Postgres dedicato
che era stato costruito prima). Tre ragioni, in ordine di peso:

1. **Credenziali.** Col collegamento diretto ogni cliente custodirebbe una credenziale del
   nostro database di produzione — quello con i dati di tutti i tenant. Il confinamento RLS
   regge finché ogni tabella futura è protetta bene: una migration distratta fra sei mesi
   allarga il raggio d'azione. Un token apre solo queste rotte.
2. **Rete.** La porta Postgres è spesso chiusa in uscita nelle reti aziendali; la 443 non lo
   è mai. Con dieci clienti sarebbero dieci trattative con dieci reparti IT.
3. **Libertà di cambiare.** Con l'API lo schema resta privato: si possono rinominare tabelle
   e colonne senza rompere N agenti scritti in momenti diversi da persone diverse.

> Nota utile per il futuro, imparata a caro prezzo: un ruolo Postgres dedicato è **soggetto
> a RLS** e i `GRANT` da soli non bastano. E le policy che passano da `current_tenant_id()`
> non "tornano NULL" per un ruolo diretto — sollevano `42501 permission denied for schema
> auth` e fanno fallire l'intera query, anche una semplice SELECT.

## 5. Le tre superfici

### Ufficio — il pulsante "Sincronizza"

In alto a destra, **solo per i clienti che hanno un gestionale collegato**
(`hasIntegrazione` nel guscio office). Non parla col gestionale: **mette in coda**. È una
distinzione che conta per chi guarda, e il messaggio la dice esplicitamente — *"sul
gestionale non c'è ancora nulla: il collegamento le ritirerà al prossimo giro"* — altrimenti
arriva la telefonata «ho premuto e non vedo niente».

Action: `_actions/integrazione-sinc.ts`. Guarda indietro 31 giorni e raccoglie:

| Cosa | Da dove | Filtro |
|---|---|---|
| Ore | `rapportini` + `rapportino_righe` | stato `approvato` o `esportato` |
| Spese | `spese` | stato `confermata` |
| Km | `timbratura_viaggio` | solo `autista = true` |

L'accodamento usa `ignoreDuplicates` sul vincolo di idempotenza: il doppio clic sul pulsante
non produce un secondo documento sul gestionale, dove non si potrebbe cancellare.

Quello che **non** parte viene raggruppato **per motivo**, non per riga: cento voci bloccate
dalla stessa anagrafica scollegata sono *un* problema, non cento, e mostrarle tutte
nasconderebbe che basta un collegamento per sbloccarle.

### Super admin — `/admin/integrazioni`

Serve a rispondere in fretta a «il cliente dice che le ore non arrivano», senza aprire una
query a mano sul database. Tre schede, nell'ordine delle domande vere:

- **Code** — una scheda per cliente: in attesa / in corso / errore / inviate, e da quanto
  tempo non c'è un giro riuscito. Un cliente **silenzioso da oltre 24 ore** si colora
  d'ambra; con errori in coda, di rosso. Se ci sono operazioni ferme in `in_corso`, lo dice:
  vuol dire che l'agente le ha prese e non ha mai riferito, cioè è morto a metà giro.
- **Operazioni** — le ultime 100, con descrizione, esito del gestionale e messaggio
  d'errore. Filtro "solo errori".
- **Giri** — il diario: direzione, esito, conteggi. Un giro aperto e mai chiuso resta
  visibile come *in corso*, ed è il segnale più utile di tutti.

### Super admin — token

`/admin/token-app` ora chiede **a cosa serve** il token: caricare foto (comando iOS) oppure
sincronizzare col gestionale. I due mondi non si mescolano — un token per l'integrazione non
carica foto e viceversa.

## 6. Gating e sicurezza

- Modulo `integrazione` in `tenant_modules`. **Bertaiola non ha la riga → non è toccata.**
- In collaudo: `sinc_manuale=true`, `auto_push=false` → si sincronizza solo col pulsante.
  Nessun automatismo finché il cliente non ha verificato coi propri occhi.
- Le credenziali del gestionale **non escono dalla macchina dell'agente**. Kommessa non le
  vede e non le vuole.
- Le policy sulle tabelle `integrazione_*` sono ristrette `TO authenticated`: mai
  raggiungibili da `anon`.

---

## Da chiudere

- [ ] **Collegamento delle anagrafiche** — è il prossimo lavoro, ed è quello che sblocca
      tutto: finché `integrazione_mappature` è vuota, ogni operazione si ferma con
      "anagrafica non collegata". Serve un'interfaccia che confronti lo staging coi nostri
      cantieri e proponga gli abbinamenti, **da validare a mano** (i cantieri caricati da
      CSV non hanno alcun legame con quelli del gestionale)
- [ ] Allarme automatico "nessun sync riuscito da N ore" (la pagina super admin lo mostra
      già a colpo d'occhio, ma nessuno la guarda di notte) — riusare il pattern email degli
      errori AI
- [ ] Confermare col fornitore il limite reale del campo descrizione
- [ ] Valutare `auto_push` quando il cliente avrà verificato che scriviamo giusto
