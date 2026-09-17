# Logiche Export paghe (area Personalizzazioni)

**Versione**: 1.0
**Stato**: in produzione dal 16/09/2026
**Ambito**: funzione `export_paghe` dentro il modulo per-tenant `personalizzazioni`, l'area delle funzioni su misura. L'area puo' essere accesa per qualunque cliente; le funzioni attive stanno in `tenant_modules.config.funzioni` e l'elenco vive in `apps/web/app/_lib/personalizzazioni-registry.ts`. Chi non ha la riga non vede nemmeno la voce in menu.

Registro delle regole e delle scelte operative dell'export mensile delle presenze verso il programma paghe del consulente del lavoro. Da tenere aggiornato come `Logiche_Kantiere.md`.

---

## 1. Che cosa fa

Produce `DatiMese.txt`, il file a lunghezza fissa che il consulente del lavoro importa nel suo programma paghe. Contiene **solo le variazioni** rispetto all'orario teorico del mese.

Pagina: `/office/personalizzazioni/paghe` (admin e ufficio). Download: `/api/office/paghe/export?periodo=AAAA-MM`.

### Regola fondamentale, confermata dal consulente
**Le ore ordinarie non si esportano.** L'azienda ha un orario settimanale fisso e il programma paghe conosce il teorico: si comunicano soltanto straordinari, assenze e maggiorazioni. Una giornata normale non produce nessuna riga, e va bene cosi'.

---

## 2. Da dove arrivano i dati

| Cosa | Fonte | Nota |
|---|---|---|
| Straordinari | `rapportino_righe` → `quoteDaRiga`/`sommaQuote` | solo giornate con `stato = 'approvato'` |
| Ore di viaggio oltre l'orario | stesse righe, quota `minutiViaggioEccedenti` | le giornate precedenti a `quote_ore_dal` hanno tutto il viaggio come eccedente |
| Ferie, permessi, malattie | `permesso_richieste` con `stato = 'approvato'` | periodo, non giorno per giorno |
| Codice paghe del dipendente | `dipendenti.codice_interno` | **e' gia' il codice dello Studio**: verificato sui dati reali di FPM (Benedetti `00003`, Valbusa `00009`) |
| Variazioni di chi non usa l'app | `paghe_eventi` | scritte dall'ufficio, sostituiscono il vecchio foglio Excel |
| Numero attestato e documento medico | `paghe_certificati` | il PUC in Kommessa non esisteva |

> **Niente si congela.** Il mese si ricostruisce a ogni apertura della pagina e a ogni download: una correzione su una giornata si vede subito nel file. Le tabelle `paghe_*` tengono solo cio' che in Kommessa non esiste.

**Le giornate non approvate restano fuori** e la pagina le elenca. Finche' una giornata e' in bozza le sue ore non si comunicano: il rapportino e' forma, ma l'approvazione e' il momento in cui l'ufficio se ne assume la responsabilita'.

### Il foglio del mese (scheda «Foglio del mese»)

E' il posto dove l'ufficio completa chi non usa ancora l'app, al posto del vecchio foglio Excel. Un **calendario per dipendente**, tre colonne: le persone (prima quelle senza giornate, marcate «vuoto»), il mese, e il pannello «Cosa e' successo».

- Una casella per giorno; **sabati** («riposo») e **festivi** gia' marcati, come le sigle `RS` e `FG` del foglio di prima. I giorni normali non si scrivono: nel file vanno solo le variazioni.
- Si sceglie la **causale una volta sola** e poi si cliccano i giorni: resta selezionata, e con Invio si conferma. E' questo che rende veloce un mese intero, non il numero di campi.
- **«Ripeti fino al»** apre da sola una riga per ogni giorno del periodo, saltando sabati, domeniche e festivi (la spunta si puo' togliere per lo straordinario del sabato).
- **Azzurro** = scritto a mano, si toglie con la ×. **Verde** = arriva dalle timbrature: si vede ma non si tocca da qui, si corregge nella giornata.
- In alto a destra i totali della persona (assenza in ore e giorni, straordinario, viaggio), come la riga di totali in fondo al foglio Excel.

> **Impaginazione**: su questa scheda la pagina va **a tutta larghezza**, senza la striscia dei numeri in alto e senza la colonna di destra. E' un banco di lavoro, non una scheda da leggere: lo spazio serve al calendario.

---

## 3. Il tracciato (manuale `InterfacciaPresenze`, versione 2026)

File ASCII, righe chiuse da CR LF, campi alfanumerici a sinistra con spazi a destra, numerici a destra con zeri a sinistra. Gli spazi fanno parte del tracciato.

| Record | Lunghezza | A cosa serve |
|---|---|---|
| `00` | 87 | intestazione del file: periodo `AAAAMM`, programma paghe, programma presenze |
| `10` | 76 | apre il blocco di un dipendente: codice ditta (alfanumerico, 7), codice paghe (numerico, 6), cognome e nome |
| `12` | 96 | evento per periodo: causale, data inizio, data fine, ore, tipo info aggiuntiva, info aggiuntiva, data di riferimento |
| `14` | 47 | evento giornaliero: giorno, causale, ore (obbligatorie) |

Record `11` e `13` non si usano: i totali li calcola il programma paghe dal calendario e dagli eventi.

**Ore in centesimi**: `001,50` e' un'ora e mezza, non un'ora e cinquanta minuti. Nel record 12 le ore restano a zero quando l'evento copre giornate intere; una frazione di giornata va comunicata come periodo a se' con le sue ore.

**Progressivo** crescente a sei cifre: `000000` sul record 00, poi `000001` in avanti su tutti gli altri.

Codice: `@kommessa/api/paghe-essepaghe` (composizione e controllo dei record), `@kommessa/api/paghe-causali` (dizionario), `@kommessa/api/paghe-mappatura` (traduzione). Tutto puro e testato: `paghe-essepaghe.test.ts` riproduce **carattere per carattere** il fac-simile approvato dal consulente.

---

## 4. Causali

Il dizionario completo dello Studio (233 codici) e' importato in `paghe-causali.ts`, generato dal CSV: **si aggiorna rigenerando, non a mano**. Ogni codice porta descrizione, famiglia e record di destinazione, perche' una sigla da sola non e' leggibile da nessuno.

Il cliente puo' **aggiungere causali** che nella tabella non ci sono (config `causali_extra`): servono se il consulente apre una voce nuova, e non richiedono un rilascio.

### Corrispondenze di partenza (modificabili dalla pagina)

| Kommessa | Causale | Record |
|---|---|---|
| ferie | `FE` | 14 |
| rol, ex-festivita' (PAR) | `PR` | 14 |
| permesso retribuito / non retribuito | `P1` / `P0` | 14 |
| malattia | `ML` | **12** |
| infortunio | `IN` | **12** |
| maternita' obbligatoria | `MO` | **12** |
| congedo di paternita' | `C6` | 12 |
| lutto | `C0` | 12 |
| permesso 104 | `B7` a giornate, `B1` a ore | 14 |
| donazione sangue | `DS` | 12 |
| permesso elettorale | `P4` | 14 |
| straordinario | `S0` feriale, `S9` sabato, `S7` festivo o domenicale | 14 |
| ore di viaggio eccedenti | `V1` | 14 |

**Lasciate volutamente da decidere**: visita medica, congedo matrimoniale, congedo parentale. Il programma paghe ha piu' voci vicine e sceglierne una al posto del consulente sarebbe una decisione sulla busta paga. La pagina le segnala e chiede la scelta una volta sola.

> **Regola**: non si deduce una causale dal giorno della settimana quando Kommessa sa gia' di che evento si tratta. Il giorno serve soltanto a distinguere i tre straordinari, e la regola e' esplicita e modificabile.

---

## 5. Malattia e PUC

Il record 12 di malattia vuole il **PUC**, il numero dell'attestato telematico, con tipo info `P`. In Kommessa non esisteva: ora sta in `paghe_certificati`, insieme al documento del medico archiviato su R2.

- Il PUC **non si inventa mai**. Se manca, il file esce lo stesso con un avviso evidente e lo Studio lo inserisce a mano (confermato dal consulente).
- Il certificato si aggancia alla richiesta di assenza o all'evento scritto a mano, e comunque porta le date: si ritrova anche se la richiesta viene cancellata.
- Il documento resta in archivio e **non viene mandato allo Studio**: nel file va solo il numero.

> ⚠️ **Da riprendere**: l'archivio documentale e' appena abbozzato (una chiave R2 sulla riga). Quando i documenti saranno tanti servira' un vero documentale, con ricerca e ciclo di vita. Deciso con Luca il 16/09/2026.

---

## 6. Controlli prima di consegnare

Bloccanti, la riga resta fuori dal file e la pagina dice perche':
- dipendente senza codice paghe;
- causale che non esiste nella tabella;
- evento fuori dal mese esportato;
- evento giornaliero senza ore o che copre piu' giorni;
- causale obbligatoria per periodo comunicata giorno per giorno;
- data di fine prima della data di inizio.

Non bloccanti: malattia senza PUC.

Sul file finito si ricontrollano lunghezza di ogni record, caratteri ASCII e delimitatori. Gli accenti vengono tolti (`Niccolo'` diventa `NICCOLO`): il file e' dichiarato ASCII.

---

## 7. Impostazioni per cliente (`tenant_modules.config.export_paghe`, modulo `personalizzazioni`)

| Chiave | Significato |
|---|---|
| `codice_ditta` | codice della ditta dato dallo Studio, gruppo compreso. Finche' e' vuoto il file non si genera |
| `programma_presenze` | nome scritto nell'intestazione del file (`Kommessa`) |
| `fornitore` | quale programma paghe usa il consulente |
| `regole_causali` | corrispondenze, causali degli straordinari, arrotondamento |
| `causali_extra` | causali aperte dal cliente |

**Codice ditta**: confermato `100145` dal consulente. ⚠️ Il foglio presenze dello Studio in testata riporta `100.1045` e il fac-simile usava `1001045`: la differenza e' nota e la scelta segue l'ordine di affidabilita' (conferma del consulente prima di tutto). E' modificabile dalla pagina in un secondo, senza rilascio.

**Arrotondamento** di straordinari e viaggio: di partenza **al minuto**, cioe' il dato come e' stato registrato. Si applica al totale del giorno e si cambia dalle impostazioni della pagina. Cambia quello che viene pagato, quindi va deciso con il consulente. Se un arrotondamento azzera del tutto i minuti di una giornata, la pagina lo dice invece di lasciarli sparire.

> ⚠️ **Le impostazioni si salvano riscrivendo la config dell'area.** Il pezzo di questa funzione e il resto (l'elenco delle funzioni accese, le impostazioni delle altre) stanno nella stessa riga `tenant_modules`, e ogni salvataggio rilegge e riscrive. Due salvataggi nello stesso istante, o un salvataggio mentre il super admin spegne la funzione, possono far vincere l'ultimo arrivato. La finestra e' di millisecondi e chi tocca queste impostazioni e' una persona sola, ma se un domani diventasse un problema la soluzione e' una funzione SQL che fonde solo la propria chiave.

---

## 8. Ordine di affidabilita' delle fonti

Quando due fonti sono in contrasto:

**conferma del consulente > manuale ufficiale > foglio Excel storico > file di esempio > nostre deduzioni.**
