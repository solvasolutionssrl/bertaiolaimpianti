# Logiche operative — Kantiere (presenze, viaggi, sedi, ore)

**Versione**: 1.0
**Stato**: Attivo (in produzione)
**Ultimo aggiornamento**: 06/07/2026
**Ambito**: modulo **Kantiere** (tenant con `app_mode=kantiere`, es. FPM Impianti). NON tocca il mondo commesse (Bertaiola).

> **A cosa serve questo file.** Non è un manuale d'uso: è il registro delle **regole e delle scelte operative** già implementate (arrotondamenti, soglie, quando si caricano i km, come si collegano sedi e cantieri, quali impostazioni gestisce l'ufficio). Serve come base per una futura sezione **Help** nell'office e come contesto per un **agente AI interno**.
>
> **Va mantenuto aggiornato**: ogni volta che cambia una logica importante (nuova soglia, nuovo settaggio, nuova regola di calcolo), aggiornare la sezione corrispondente e alzare la versione in testa.

---

## 1. Principio di fondo: le timbrature sono la verità

Il conteggio ore **non** si fida di ciò che l'utente scrive: si **ri-deriva sempre dalle timbrature**.

- Ogni giornata è ricalcolata da `ricomputaRapportinoAuto`, che **cancella e ricostruisce** le righe ore dalle timbrature (`minutiPerCommessa`).
- Le ore per cantiere si ottengono appaiando **ingresso → uscita** per quel cantiere.
- La **pausa** è un semplice **buco (gap)** tra un'uscita e l'ingresso successivo: non c'è un "campo pausa" che incide sul totale, conta solo il tempo effettivamente aperto.
- Conseguenza pratica: lo split multi-cantiere "regge" solo se è fatto di **segmenti timbrati reali** (per questo lo split di fine turno sintetizza segmenti, non scrive direttamente le righe ore).

Il **rapportino** è quindi la **forma** (record-giornata con stato di approvazione), le **timbrature** sono la **sostanza**.

---

## 2. Fine turno: arrotondamenti e tolleranza

| Regola | Valore default | Impostazione | Comportamento |
|---|---|---|---|
| **Tolleranza chiusura** | **5 min** | `tolleranza_chiusura_min` | Nello split "cosa hai fatto oggi" e nella "registra giornata": se i minuti assegnati ai cantieri si discostano dal totale di **≤ tolleranza**, si salva lo stesso e **l'ultimo cantiere assorbe il piccolo resto**. Così i minuti dispari (turno che finisce alle X:03) non bloccano l'utente. |
| **Arrotondamento viaggio** | **5 min** | `arrotondamento_viaggio_min` | Ogni tragitto **> 0** conta almeno uno step (≥ 5 min); un tragitto **= 0** resta 0. Vale sui turni **futuri**. |
| **Arrotondamento ore lavoro** | **0 = nessuno** | `arrotondamento_ore_min` | Scelta del cliente: si **raccoglie tutto al minuto** e si arrotonda **nel report a fine mese** sul dato aggregato, non sul singolo turno. |

> `arrotondaA(min, step)` è l'helper unico (step < 1 = arrotondamento disattivato).

---

## 3. Chilometri: quando e come si caricano

I km si registrano su una **tratta di viaggio** (`timbratura_viaggio`), non sulle ore.

**Quando si caricano:**

1. **Viaggio andata / ritorno** con scelta della **sede** di partenza/arrivo → km e tempo dalla **stima del provider** (vedi §5).
2. **Cambio cantiere live (A → B)**: chiudendo A e aprendo B, si registra la tratta **A → B** con i **km alla destinazione** (colonna `da_cantiere_id` = cantiere di partenza). Attivo solo se `km_switch_attivo` è ON.
3. **Fine turno verso "Abitazione privata"**: opzione sempre disponibile → **0 km, 0 tempo** (nessuna tratta di lavoro da rimborsare).

**Dettagli:**

- I km della stima sono **definitivi**: il tecnico non li corregge a mano (può correggere solo il **tempo**, con giustificazione se scosta dalla stima).
- Il flag **autista** sulla tratta distingue chi **guidava** (rilevante per i rimborsi km) dal passeggero.
- Il tempo di viaggio, ad oggi, **non** viene conteggiato nelle ore di lavoro: si tracciano **km + tempo** a parte (display sempre in `H:MM`).

---

## 4. Sedi ↔ cantieri (regola chiave)

### Modello dati

| Tabella | Ruolo |
|---|---|
| `sedi` | Luoghi di partenza/arrivo del tenant: sede aziendale, depositi, **hotel**. Campo `is_default` = **sede predefinita** (una sola per tenant). Tipi: `sede_principale`, `sede_secondaria`, `hotel`, `altro`. Ogni sede ha `indirizzo` + `lat`/`lng`. |
| `cantiere_sede` | Associazione **N↔N**: quali sedi (oltre alla predefinita) sono disponibili per un dato cantiere. |

### Regola: cosa si propone in un cantiere

Per un cantiere, alla timbratura/fine turno si propongono **solo**:

1. la **sede predefinita** del tenant (`is_default` — proposta **sempre**, non serve collegarla);
2. le **sedi collegate a quel cantiere** (righe di `cantiere_sede`);
3. l'**abitazione privata** a fine turno (opzione sintetica, 0 km / 0 tempo).

**Non** compaiono le sedi collegate ad **altri** cantieri. *Esempio: "Hotel Excelsior", collegato solo al cantiere Monfalcone, non appare nei cantieri non collegati.*

### Dove è applicata (UI + dati)

- **UI**: scansione QR (`/t/[token]`), fine turno/pausa in app (`turno-azioni-contesto`), wizard caposquadra (`gestione-squadra`), **inserimento manuale ore** (il dialog filtra le sedi in base al cantiere scelto).
- **Dati (server)**: la regola è **rivalidata lato server** da `sedeAmmessaPerCantiere` in `validaViaggio` e in `registraOreManuali` → una sede non predefinita e non associata al cantiere viene **rifiutata** (`SEDE_NON_VALIDA`), anche se forzata da client.

### Gestione lato ufficio

- Pagina **Sedi** (office → Kantiere → Sedi): crea/modifica sede, imposta la **predefinita**, collega/scollega i cantieri (campo di ricerca con dropdown, non l'intera lista).
- **Scheda cantiere** → card **"Sedi di partenza"** (tra "Chi c'è ora" e "Storico presenze"): mostra la sede **predefinita** (sempre) + **Abitazione privata** (sempre, a fine turno) come voci di sola lettura, poi le **sedi collegate** a quel cantiere (rimovibili) e due azioni: *Usa una sede esistente* (ricerca) o *Crea nuova sede* (auto-collegata). È il posto dove si gestiscono le sedi reali del cantiere.
- L'**indirizzo** della sede usa l'autocomplete geocoding (Google per i tenant su provider `google`, altrimenti Photon/Nominatim) e salva **lat/lng** per il calcolo dei tragitti.

> **Nota (legacy)**: la colonna `cantieri.sede_partenza` (testo, con lat/lng) è un vecchio campo **non usato** dal calcolo viaggio (che si basa su `sedi` + `cantiere_sede`). Il controllo è stato **rimosso dall'anagrafica** della scheda cantiere per non confondere; la colonna resta nel DB ma è inerte.

---

## 5. Stima viaggio: provider per-tenant

- Astrazione `RoutingProvider`: famiglia **free** (OSRM/OpenRouteService, gratis, **senza traffico**) o **google** (Google Routes API, **traffico reale**, a pagamento).
- La scelta è **per-tenant**, dal super admin (tab **"Viaggio"** di `/admin/tenants/[id]`): `tenant_modules.config.routing_provider` ∈ `free | google` (default `free`).
- La **chiave Google è unica di piattaforma** (`GOOGLE_MAPS_API_KEY`, in env — **mai** nel DB, **mai** per-tenant). Se il tenant è su `google` ma la chiave manca → fallback automatico a free.
- Lo **stesso toggle** vale anche per l'**autocomplete indirizzi** delle sedi/cantieri, così indirizzi, tempo e km di un tenant restano coerenti.
- FPM è su **google**; gli altri restano **free** (costo zero).

---

## 6. Impostazioni gestite dall'ufficio

Tutte in `tenant_modules.config` (per-tenant). Le principali:

### Turni & calcoli
| Chiave | Default | Effetto |
|---|---|---|
| `tolleranza_chiusura_min` | 5 | Tolleranza sulla somma dello split (§2). |
| `split_fine_turno_attivo` | on | Abilita "cosa hai fatto oggi" (dividi le ore tra più cantieri a fine turno). |
| `avvio_turno_libero` | on | **on**: i tecnici vedono **tutti** i cantieri e possono iniziare un turno senza QR. **off**: solo i cantieri con QR attivo (sostituisce il vecchio "gate weekend"). |
| `km_switch_attivo` | off | Abilita il calcolo km nel cambio cantiere live A→B. |
| `passo_minuti_stepper` | 15 | Passo dei tasti +/- di tutti gli stepper ore (split, modifica giornata, storico, registra giornata). |
| `registra_giornata_attivo` | on | Abilita la "registra giornata da zero" (giornata senza timbrature). |

### Approvazione presenze
| Chiave | Default | Effetto |
|---|---|---|
| `auto_approva_rapportini` | on | Auto-approva le giornate **chiuse** ed **entro soglia** (vedi §7). |
| `anomalia_turno_ore_max` | 10 h | Oltre questa durata (pause escluse) la giornata è **anomalia** → resta da verificare. |
| `soglia_pausa_pranzo_ore` | 5 h | Oltre questo tempo senza pausa timbrata, in uscita compare il promemoria "timbrare la pausa è il modo corretto" + opzioni 30/45/60 min. |
| Auto-spegnimento pausa | 1 h 30 | Se la pausa resta aperta oltre la soglia, l'orologio riparte da solo (rete di sicurezza per l'app chiusa). |

### Viaggio
| Chiave | Default | Effetto |
|---|---|---|
| `routing_provider` | free | Provider stima viaggio + geocoding indirizzi (§5). |

### Kontabilità (spese)
| Chiave | Default | Effetto |
|---|---|---|
| `kontabilita_attiva` | on | Abilita le spese di cantiere (foto scontrino → AI vision → revisione → salva). |

---

## 7. Auto-approvazione rapportini

- Una giornata si **auto-compila** dalle timbrature e si **auto-approva** quando è **chiusa** (ingressi = uscite) **ed entro soglia** (`anomalia_turno_ore_max`, pause escluse).
- Giornata **aperta** o **oltre soglia** → resta **"da verificare"** (bozza), in carico a **office/admin**.
- Si **ri-valuta a ogni timbratura** (riaprire un turno riporta la giornata in bozza).
- Congelata solo se l'ufficio l'ha già toccata (`approvato_da` valorizzato).
- Logica pura testata: `esitoAutoApprovazione`; wiring in `ricomputaRapportinoAuto`.

---

## 8. Ordinario vs straordinario

- Il **tecnico** inserisce le **ore totali di lavoro** (un solo campo): non decide lui cosa è ordinario o straordinario.
- L'**ufficio** fa lo split ordinario/straordinario in fase di ricalcolo, applicando la **soglia** concordata.

---

## 9. Casi di registrazione della giornata

| Caso | Come | Vincolo |
|---|---|---|
| **Turno con QR** | Ingresso QR → uscita QR | Standard. |
| **Turno senza QR** | "Inizia turno" scegliendo un cantiere | Un solo turno aperto per volta. |
| **Cambio cantiere live** | "Cambia cantiere": chiude A, apre B | Ore dai timestamp reali; km A→B se `km_switch_attivo`. |
| **Split a fine turno** | "Cosa hai fatto oggi": dividi le ore tra più cantieri | Solo se la **giornata è pulita** (un solo ingresso). Somma = netto ± tolleranza. |
| **Registra giornata da zero** | Inizio/fine + pausa + cantieri/ore | Solo se **nessuna timbratura** oggi e `registra_giornata_attivo`. |
| **Inserimento manuale ore** | Ore + eventuale viaggio con sede/mezzo | Sede filtrata per cantiere (§4). |

Il netto giornata = `(chiusura − inizio) − pausa`. La pausa dichiarata è una **coppia di timbrature centrata** nel turno (così il calcolo ore la sottrae con la logica pausa esistente).

---

## 10. File chiave nel codice (per manutenzione / AI)

| Area | File |
|---|---|
| Calcolo ore dalle timbrature | `packages/api/src/kantiere-ore.ts` (`minutiPerCommessa`, `statoTurno`) |
| Split multi-cantiere (puro + testato) | `packages/api/src/kantiere-split.ts` |
| Ricalcolo + auto-approvazione | `apps/web/app/_actions/kantiere-rapportino.ts` (`ricomputaRapportinoAuto`) |
| Timbrature (avvio/cambio/fine turno) | `apps/web/app/_actions/kantiere-timbra.ts` |
| Viaggio/pausa condivisi + validazione sede | `apps/web/app/_actions/_lib/viaggio-timbra.ts` (`validaViaggio`, `sedeAmmessaPerCantiere`) |
| Sedi (CRUD + associazioni) | `apps/web/app/office/_actions/kantiere-sedi.ts` |
| Lettura impostazioni | `apps/web/app/_lib/kantiere-config.ts` (`leggiImpostazioniTurno`, soglie, provider) |
| Stima viaggio + geocoding | `apps/web/app/_lib/routing/`, `apps/web/app/api/routing/stima`, `apps/web/app/api/geocode/autocomplete` |

---

*Modifiche a queste logiche vanno riflesse qui e nel `CLAUDE.md` (sezione Kantiere).*
