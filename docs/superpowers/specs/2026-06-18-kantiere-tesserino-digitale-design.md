# Design — Modulo `Kantiere` (Tesserino Digitale)

**Versione**: 1.0
**Stato**: Bozza in revisione
**Data**: 2026-06-18
**Contesto**: nuovo pacchetto applicativo per il tenant **FPM Impianti** (R2-only). Estende la gestione ore/dipendenti del pacchetto `base`. Bertaiola Impianti resta sul solo pacchetto `base` (modulo `kantiere` spento).

> Origine requisiti: `Downloads/Sistema digitale per rilevazione presenze.pdf` (esigenza Fincantieri: rilevazione presenze/ore tracciabile, verificabile, esportabile, con predisposizione a QR/badge cantiere).

---

## 1. Obiettivo e perimetro

Realizzare un modulo **`Kantiere`** (etichetta prodotto: *Tesserino Digitale*) che potenzia gestione dipendenti, squadre, presenze e ore di lavoro su commessa, con:

- anagrafica dipendenti (con o senza login app);
- squadre **per-commessa** con capo squadra;
- timbratura presenze via **QR cantiere** e/o **cronometro**, più inserimento manuale;
- **rapportino giornaliero a righe** (ore ordinarie / viaggio / straordinario per commessa) con flusso di invio e approvazione ufficio;
- pannello ufficio con viste, anomalie, **report ed export** (Excel/CSV/PDF), incluso il report di tracciabilità per stabilimento/cantiere;
- generazione **PDF con QR univoco per commessa** e registro super-admin dei QR.

Il modulo è **attivabile per tenant**: l'attuale prodotto è il pacchetto `base`; `Kantiere` è additivo.

---

## 2. Architettura a moduli per tenant (l'interruttore)

Concetto pulito di **moduli attivi per tenant**, ortogonale al piano commerciale.

- Nuova tabella **`tenant_modules`**: `tenant_id`, `modulo` (text), `attivo` (bool), `config` (jsonb), `created_at`, `updated_at`. Moduli iniziali: `base` (on per tutti), `kantiere`.
- Helper server **`tenantHasModule('kantiere')`** con `React.cache` (come il tenant context), usato nei layout/route per il gating, allo stesso modo del gating per ruolo già esistente.
- Le route `/office/kantiere/*` e `/mobile/timbra/*` redirezionano se il modulo è spento.
- Super-admin: nuova **tab "Moduli"** in `/admin/tenants/[id]` con i toggle dei moduli.
- `plans.features` (jsonb riservato/inutilizzato) **non** viene usato: i moduli sono indipendenti dal piano.

Esito atteso: Bertaiola → `base`; FPM → `base` + `kantiere`. Zero impatto sulla produzione attuale.

---

## 3. Storage multi-modalità (R2 promosso a provider) e modalità "senza cartelle"

Due assi **ortogonali**, entrambi selezionabili da super-admin per tenant:

1. **Dove vanno i file** (`storage_mode`):
   - `r2` — solo Cloudflare R2 (caso FPM);
   - `r2+nextcloud` — R2 staging → sync Nextcloud (caso Bertaiola, invariato).
2. **Provisioning cartelle** (`crea_cartelle`: bool):
   - `true` — alla creazione commessa/voci si crea la struttura cartelle (Bertaiola);
   - `false` — **modalità "senza cartelle"**: nessuna struttura provisioning (FPM). Le eventuali foto vanno comunque su R2 come blob.

Interventi tecnici:
- Promuovere **R2 a `StorageProvider` completo** (oggi è solo buffer): implementare `createFolder/uploadFile/listFolder/getDownloadUrl/delete/move/exists` su prefissi di chiave R2, conformi all'interfaccia `packages/integrations/src/storage/types.ts`.
- La factory `getStorageProvider()` istanzia il provider corretto in base a `storage_mode`.
- Quando `crea_cartelle = false`, gli hook di provisioning cartelle sono no-op.

FPM Impianti: `storage_mode = r2`, `crea_cartelle = false`.

> Futuro non in scope ora: con `crea_cartelle` riattivabile, FPM potrà archiviare attestati sicurezza/DURC per cantiere senza migrazioni dolorose.

---

## 4. Modello dati

### 4.1 Anagrafica dipendenti — `dipendenti`
Tabella separata da `users`:
`id, tenant_id, nome, cognome, mansione, codice_interno, stato_attivo (bool), user_id (FK users, nullable = login opzionale), badge_qr_token (nullable, predisposizione futura), note, created_at, updated_at`.

- Login app → `user_id` valorizzato; "solo timbratura" → `user_id NULL`.
- UI ufficio: badge **"Con accesso"** / **"Solo timbratura"** ben visibile e gestibile.
- RLS: tenant-scoped; gestione da `admin`/`office`.

### 4.2 Squadra per-commessa — `commessa_squadra`
La squadra è un raggruppamento **dentro la commessa**, col nome del capo.
`id, tenant_id, commessa_id, dipendente_id, ruolo_commessa (capo|membro), capo_dipendente_id (nullable = a chi fa capo), created_at`.

- Stesso dipendente: capo su una commessa, membro su un'altra, o "solo" (nessun capo).
- Un dipendente sta in **una** squadra al massimo per commessa (vincolo unico `(commessa_id, dipendente_id)`).
- Eccezione: si può timbrare/compilare un dipendente non in roster (sostituzioni).

### 4.3 QR cantiere — `cantiere_qr`
`id, tenant_id, commessa_id, token (univoco, firmato HMAC), attivo (bool), created_at, revoked_at (nullable)`.

- Il QR codifica `commessa_id + token` firmato; la firma impedisce QR falsi.
- Super-admin ha il **registro globale** (cross-tenant) di tutti i QR esistenti.
- Rigenerazione = nuovo token + `revoked_at` sul precedente.

### 4.4 Timbrature — `timbrature`
Separata da `interventi` (che resta del pacchetto `base`):
`id, tenant_id, dipendente_id, commessa_id, tipo (ingresso|uscita), origine (qr|cronometro|manuale|capo), timestamp, geo_lat numeric(9,6) null, geo_lng numeric(9,6) null, creato_da (FK users, per "capo timbra per altri"), created_at`.

- Ingresso/uscita a **coppie** → somma delle coppie del giorno = minuti lavorati per commessa.
- Pausa pranzo = uscita + successivo ingresso.
- Indici per `(tenant_id, dipendente_id, timestamp)` e `(tenant_id, commessa_id, timestamp)`.

### 4.5 Rapportino giornaliero — `rapportini` + `rapportino_righe`
**Testata `rapportini`**: `id, tenant_id, dipendente_id, data, stato (bozza|inviato|verificato|approvato|respinto|esportato), inviato_da, inviato_at, approvato_da, approvato_at, respinto_motivo, note, created_at, updated_at`.

**Riga `rapportino_righe`**: `id, rapportino_id, commessa_id, ore_ordinarie numeric(4,2), ore_straordinarie numeric(4,2), ore_viaggio numeric(4,2), note`.

- Le timbrature del giorno **pre-compilano** le righe (totale lavorato per commessa).
- Vincolo: un rapportino per `(dipendente_id, data)`.
- Tracciabilità completa (chi/quando inserisce/modifica/invia/approva) per i requisiti Fincantieri — via colonne sopra + audit log esistente.

---

## 5. Calcolo ore (regola automatica, sovrascrivibile)

- **Soglia giornaliera** configurabile per tenant (in `tenant_modules.config` del modulo `kantiere`, default **8h**).
- Auto-suggerimento a livello **giornata**: sommo il lavorato di tutte le righe; le prime `soglia` ore → ordinarie, l'eccedenza → straordinario; il **viaggio** è separato/aggiuntivo. L'utente autorizzato può correggere l'attribuzione tra righe.
- Esempi: *4h Pippo + 5h X = 9h → 8 ord + 1 straord*; *10h Z → 8 ord + 2 straord*.
- Edge da coprire: 0h, solo viaggio, multi-commessa, correzione manuale che sfora la soglia.

---

## 6. Flussi PWA (mobile)

- **Timbra da sé**: PWA → "Timbra" → scan QR commessa → toggle ingresso/uscita (geo best-effort). Alternativa: **cronometro** manuale start/stop senza QR.
- **Capo timbra per la squadra**: scan QR → lista membri della sua squadra su quella commessa → spunta i presenti → timbrate per ciascuno. Più "aggiungi dipendente fuori squadra" (eccezione).
- **Fine giornata**: schermata "Le mie ore di oggi" (o "La mia squadra oggi" per il capo) → righe pre-compilate dalle timbrate → edit / aggiunta viaggio / straordinario → **Invia all'ufficio**.
- **Inserimento manuale puro**: senza timbrature, compilano il rapportino a mano e inviano.

Endpoint scan: la PWA autenticata risolve il token QR → valida firma + `attivo` → applica toggle ingresso/uscita per il dipendente (sé o, per il capo, i membri selezionati).

---

## 7. Pannello ufficio (desktop) — `/office/kantiere`

- **Coda approvazioni**: rapportini `inviato` → ufficio verifica / approva / respinge (con motivo). **Solo l'ufficio approva.**
- **Viste**: per commessa, per dipendente, per periodo (settimana/mese/intervallo), **anomalie** (dipendenti senza ore, giornate incomplete, ore oltre soglia, dati modificati dopo invio, commesse non selezionate).
- **Anagrafica dipendenti** e **squadre per commessa** (con badge "Con accesso / Solo timbratura").
- **Report ed export**: giornaliero/settimanale/mensile per dipendente · commessa · squadra · periodo; **export Excel/CSV e PDF**; **report tracciabilità "registro presenze per stabilimento/cantiere"** per Fincantieri.
- **Gestione QR**: genera/ristampa **PDF con QR univoco** per commessa; revoca/rigenera.

---

## 8. Ruoli e permessi

- Riuso del sistema **permessi granulari per-area** esistente (`packages/api/src/types/permissions.ts` + `get_effective_permissions()` in DB), con nuova area **`kantiere`** e livelli: `timbra_self`, `timbra_squadra`, `compila_rapportino`, `approva`, `report`, `gestione` (anagrafica/squadre/QR).
- **Capo squadra = permesso**, non ruolo: un **tecnico** a cui `office`/`admin` assegnano il permesso di capo squadra (`timbra_squadra` + lettura squadra). Nessun ruolo nuovo; il ruolo resta `tecnico`.
- Il capo squadra vede in **sola lettura** i dati reali della sua squadra e può timbrare/compilare per essa; **non approva**.

---

## 9. Cantiere/commessa lato FPM

- FPM **riusa l'entità `commesse`** in versione **"leggera"**: creazione semplice (nome, codice, cliente/stabilimento, indirizzo, stato), **senza** sopralluogo AI, **senza** voci/tipologie, **senza** cartelle (modalità `crea_cartelle = false`).
- Le commesse esistono per agganciare QR, timbrature e ore. Eventuali foto → R2.
- Riuso (anziché nuova entità "cantiere") per coerenza di report e codice.

---

## 10. Predisposizione futura (solo schema, non si costruisce ora)

- `dipendenti.badge_qr_token` + `timbrature.origine` aprono a **badge/QR personale** e **registro accessi** senza migrazioni dolorose.
- `crea_cartelle` riattivabile → archiviazione **attestati sicurezza / DURC** per cantiere.
- Nessuna UI/flow per questi ora.

---

## 11. Fuori scope v1 (YAGNI)

Geofencing rigido, integrazioni con piattaforme nazionali, gestione documentale/abilitazioni dipendenti, badge personale, transcoding video.

---

## 12. Testing

- Unit **calcolo ore**: soglia, split ord/straord/viaggio, edge (0h, solo viaggio, multi-commessa, override oltre soglia).
- Unit **toggle timbrature**: coppie ingresso/uscita, pausa pranzo, timbrata orfana.
- Test **gating moduli**: route `kantiere` spente per Bertaiola; attive per FPM.
- Test **firma/validazione QR**: token valido/revocato/contraffatto.
- Test **R2 `StorageProvider`**: parità con l'interfaccia esistente; modalità `r2` e `crea_cartelle = false` (provisioning no-op).

---

## 13. Fasizzazione (ogni fase = spec/piano propri)

| Fase | Contenuto | Dipendenze |
|---|---|---|
| **A** | Moduli per-tenant (`tenant_modules`) + helper gating + tab super-admin "Moduli" | — |
| **B** | `storage_mode` (`r2`/`r2+nextcloud`) + `crea_cartelle` + R2 `StorageProvider` completo + **creazione tenant FPM Impianti** | A |
| **C** | Anagrafica `dipendenti` + squadre per-commessa (`commessa_squadra`) + permesso capo squadra | A |
| **D** | QR cantiere: `cantiere_qr` + generazione PDF + registro super-admin + endpoint scan | B, C |
| **E** | Timbrature (`timbrature`) + rapportino (`rapportini`/`rapportino_righe`) + flussi PWA + calcolo ore | C, D |
| **F** | Pannello ufficio `/office/kantiere`: viste, anomalie, approvazioni, report/export | E |

---

## 14. Note operative

- **Produzione**: app live dal 28/05/2026; ogni push su `main` deploya. Il modulo `kantiere` nasce **spento** per Bertaiola → nessun impatto. Lavoro su branch dedicato.
- **Migrazioni DB**: solo file SQL in `supabase/migrations/`; l'apply al cloud lo esegue l'umano. Migration **prima** del codice che la usa.
- **Lingua UI**: italiano.
- **Creazione tenant FPM**: azione di produzione — eseguita solo dopo approvazione, in fase B.
