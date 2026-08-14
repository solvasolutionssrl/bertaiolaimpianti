# Le anagrafiche: collegare, creare, ignorare

**Aggiornato**: 14/08/2026

Prima che una sola ora o una sola spesa possa uscire da Kommessa, i due sistemi
devono essere d'accordo su **chi è chi** e **cosa è cosa**. Questa pagina descrive come
succede, e perché è fatto così.

Un abbinamento sbagliato non dà nessun errore: manda le ore sulla commessa di un altro, o
sulla busta paga di un altro, e lo si scopre a fine mese. È la ragione per cui quasi tutto
quello che segue è più prudente di quanto sembrerebbe necessario.

---

## 1. Il vocabolario

Tre parole, tre cose diverse. Confonderle è l'errore più comune:

| | |
|---|---|
| **Depositato** | il gestionale ce l'ha mandato (`POST /letture` → area di sosta) |
| **Collegato** | un nostro record e uno loro sono la stessa cosa (`integrazione_mappature`) |
| **Registrato sul gestionale** | un nostro dato è stato scritto là fuori (`integrazione_scritture`) |

Un cantiere può essere collegato da settimane senza che ne sia uscito niente.

> **A schermo non si scrive mai il nome del gestionale.** Si dice «il gestionale»; il nome
> vero (`ergo`, `teamsystem`…) arriva dalla configurazione del cliente e compare solo nel
> suggerimento. Una scritta «Aggiornato su ERGO» andrebbe cercata in venti file il giorno
> che arriva il secondo cliente.

## 2. Cosa si abbina su cosa

| Entità | Chiave | Perché |
|---|---|---|
| **Commesse / cantieri** | il **codice** (`externalCodiceCommessa` = `cantieri.codice_commessa`) | è lo stesso numero da entrambe le parti: uguaglianza, non somiglianza |
| **Dipendenti** | **solo il nome** | vedi il riquadro qui sotto |

> ⚠️ **Sui dipendenti il codice non si guarda mai.** La nostra matricola viene dal
> consulente del lavoro, quella del gestionale è la sua numerazione interna: sono due serie
> diverse che si somigliano. Su un caso reale `00003` era Benedetti e il `3` del gestionale
> era Biscaro — confrontarle avrebbe prodotto **33 accoppiamenti falsi su 35**, cioè ore
> sulla busta paga sbagliata.
>
> Prima di abbinare per nome si verifica che **non ci siano omonimi da nessuna delle due
> parti**. Con quella verifica un nome identico non è una somiglianza: è un'identità.

## 3. Chi decide, e quando

**In automatico**, alla chiusura di un giro di lettura (`POST /esecuzioni {chiudi}`):

- i **cantieri** che il gestionale ha e noi no **si creano**, con la nostra numerazione e i
  dati che abbiamo (`indirizzo_da_verificare` resta comunque `true`: sul gestionale
  l'indirizzo è spesso la sede legale del committente, non il posto dove si lavora);
- le **categorie** mai viste finiscono in una coda «da smistare»: non si crea mai una
  categoria canonica da un valore esterno, altrimenti un refuso del gestionale entra nel
  vocabolario del cliente per sempre. L'uguaglianza esatta fa eccezione, perché non è
  un'ipotesi.

**Mai in automatico**: i **dipendenti**. Un cantiere sbagliato è una riga da cancellare;
una persona è un contratto, una busta paga e un accesso all'app. Quando ne compare uno
nuovo, l'anagrafica mostra un avviso ad admin e ufficio con tre strade.

## 4. Le tre strade, e perché sono tre

Su `/office/kantiere/dipendenti`:

1. **Collega** a un nostro dipendente esistente — il caso più frequente, quando il match
   automatico ha fallito per una grafia diversa (`Dalgal Nicola` contro `Dal Gal Nicola`).
   Chi è già collegato non è scegliibile: lo stesso record del gestionale su due persone
   imputerebbe le ore due volte.
2. **Crea** — nome e cognome arrivano dal gestionale, il resto è dell'ufficio. **La
   matricola si scrive a mano**, e se non la si sa si lascia vuota.
3. **Non è una persona** → `integrazione_ignorati`.

La terza non è un ripiego. L'anagrafica di un gestionale è piena di account di servizio e
postazioni — `User Ergo SW`, `Officina Mobile`, `Master Mobile`. **Ogni ERP ne ha.** Senza
un modo per dire «questo non ci riguarda», l'avviso resterebbe acceso per sempre, e in due
settimane nessuno lo guarderebbe più. Un avviso che suona sempre non è un avviso.

Ignorare non cancella niente e si disfa con un click.

## 5. Lo stato «in forza» è nostro

Alcuni gestionali dicono chi è cessato, altri no. Il campo canonico esiste
(`attiva` su `POST /letture`) e se arriva lo usiamo, ma **la fonte di verità resta
Kommessa**: è l'ufficio a governare chi è in forza.

Quando un cliente parte con un elenco già suo (un foglio del consulente del lavoro),
`scripts/allinea-dipendenti-da-file.ts` lo importa una volta sola. Le colonne e il segno
che vale «in forza» si passano da riga di comando, così il prossimo cliente con un foglio
diverso non richiede di riscrivere niente. È **una-tantum, non un meccanismo**.

Serve anche a un secondo scopo, meno ovvio: i cessati che noi non abbiamo si archiviano
subito, e l'avviso dei nuovi nasce con due voci invece di trentacinque.

## 6. Dove si guarda

| | |
|---|---|
| `/office/integrazione` | abbinamento commesse/cantieri, e quelle presenti solo sul gestionale |
| `/office/kantiere/dipendenti` | avviso dei nuovi, con le tre strade |
| `/office/kantiere/categorie` | registro delle categorie e coda «da smistare» |
| `/office/kantiere/kontabilita` | quali spese sono già uscite, con il riferimento del documento |
| `/admin/integrazioni` | semaforo per cliente, registro delle scritture, diario dei giri |
| `/admin/tenants/[id]` → Integrazione | modulo, gestionale, simulazione ↔ attiva, token |

## 7. Le tabelle

| | |
|---|---|
| `integrazione_staging` | copia di lavoro di ciò che il gestionale ci ha mandato. Si può svuotare |
| `integrazione_mappature` | «questo nostro record è quello loro». `origine`: `manuale` = l'ha guardato una persona |
| `integrazione_ignorati` | «questo loro record non ci riguarda» |
| `integrazione_scritture` | il registro degli ACK: cosa è uscito, quando, con che riferimento |
| `integrazione_esecuzioni` | il diario dei giri. Uno aperto e mai chiuso = il client è morto a metà |
| `cantiere_categorie` · `categoria_mappature` | il vocabolario nostro e la corrispondenza col loro |

## 8. Dove sta il codice

| | |
|---|---|
| `apps/web/app/_lib/integrazione/` | i quattro lettori: `collegati`, `nuovi`, `promuovi`, `alert` — vedi il README lì dentro |
| `apps/web/app/admin/_lib/integrazione/` | lato piattaforma: `config` (una sola lettura della configurazione) e `foto` (la misura di un collegamento) |
| `apps/web/app/_actions/integrazione-*.ts` | le mutazioni d'ufficio: abbinamento anagrafiche, e le tre strade sui nuovi |
| `apps/web/app/admin/_actions/integrazioni.ts` | il governo per-cliente: modulo, gestionale, la leva simulazione/attiva |
| `packages/api/src/integrazione-*.ts` | logica **pura e testata**: abbinamento, salute, smistamento categorie |

Il giudizio sta sempre nei file puri di `packages/api`, mai nelle pagine: lo
usano il tab del cliente, la console di piattaforma e il cron delle mail, e se
ognuno se lo calcolasse la pagina direbbe «tutto a posto» mentre parte un
avviso di guasto.

Nessuna di queste è materializzata quando può essere derivata: l'elenco dei «nuovi dal
gestionale» si calcola ogni volta come *depositati − collegati − ignorati*. Una coda tenuta
a mano direbbe una bugia il giorno che qualcuno collega un record da un'altra strada.
