# Design — Kantiere Fase E · Timbrature + Rapportino + Calcolo ore

**Versione**: 1.0
**Stato**: Approvato (estende il design master §4.4, §4.5, §5, §6, §8)
**Data**: 2026-06-18
**Dipende da**: Fase C (dipendenti/squadre), Fase D (QR cantiere + landing `/t/[token]`).
**Master**: `docs/superpowers/specs/2026-06-18-kantiere-tesserino-digitale-design.md`

---

## 1. Obiettivo

Trasformare lo scan del QR (Fase D, oggi placeholder) in **timbratura reale** e dare ai dipendenti/capi-squadra il **rapportino giornaliero a righe** che l'ufficio approva. Copre:

1. modello dati `timbrature`, `rapportini`, `rapportino_righe`;
2. **logica pura** (TDD pesante): toggle timbrature a coppie, somma minuti per commessa, **calcolo ore** (ordinarie/straordinario/viaggio con soglia configurabile);
3. **timbratura dallo scan** `/t/[token]` (PWA autenticata): self ingresso/uscita + **cronometro**; **capo timbra per la squadra**; inserimento **manuale**;
4. **rapportino**: precompilato dalle timbrature, editabile, **invio all'ufficio**; il capo vede la sua squadra in **sola lettura**;
5. predisposizione approvazione ufficio (la coda/approvazione completa è Fase F, ma lo stato `inviato` e il blocco post-invio sono qui).

Tutto gated dal modulo `kantiere` (Bertaiola non vede nulla).

---

## 2. Decisione su "capo squadra" (semplificazione consapevole vs master §8)

Il master prevede un'**area permessi granulare `kantiere`**. Per la Fase E si adotta una via più semplice e già coerente coi dati esistenti, rimandando la macchina dei permessi granulari alla Fase F:

- **Capo squadra = `commessa_squadra.ruolo_commessa = 'capo'`** su quella commessa, **con `user_id` valorizzato** (login app). Un dipendente loggato che è "capo" su una commessa può timbrare/vedere la sua squadra **solo su quella commessa**.
- Nessuna nuova tabella permessi in E. La derivazione è per-commessa (coerente con "il nome è quello del capo squadra, vincolato alla singola commessa").
- **Solo `office`/`admin` approvano** (in E: blocco post-invio; in F: coda + approva/respingi).

Si annota la divergenza; la `kantiere` permission-area resta candidata per F se servirà granularità oltre il binomio capo/ufficio.

---

## 3. Modello dati

Migration `supabase/migrations/20260622000000_kantiere_timbrature_rapportini.sql` (additiva). RLS come Fasi C/D.

### 3.1 `timbrature`
```
id          uuid pk default gen_random_uuid()
tenant_id   uuid not null references tenants(id) on delete cascade
dipendente_id uuid not null references dipendenti(id) on delete cascade
commessa_id uuid not null references commesse(id) on delete cascade
tipo        text not null check (tipo in ('ingresso','uscita'))
origine     text not null check (origine in ('qr','cronometro','manuale','capo'))
ts          timestamptz not null default now()
geo_lat     numeric(9,6)
geo_lng     numeric(9,6)
creato_da   uuid references users(id) on delete set null   -- chi ha timbrato (capo o sé)
created_at  timestamptz not null default now()
```
Indici: `(tenant_id, dipendente_id, ts)`, `(tenant_id, commessa_id, ts)`.

RLS:
- read: `tenant_id = current_tenant_id()` (tutti i ruoli del tenant — il capo legge la sua squadra, filtro applicativo);
- write (`for all`): `tenant_id = current_tenant_id() and current_role() in (owner,admin,office,tecnico)` — i tecnici (capi e non) timbrano; la correttezza "chi per chi" è garantita dalle Server Action (no insert diretto dal client).
- platform admin read.

> Nota: a differenza di C/D (write solo office/admin), qui **anche `tecnico`** scrive, perché i tecnici timbrano. L'autorizzazione fine (un capo timbra solo la propria squadra; un dipendente solo sé) è nelle Server Action, non in RLS (RLS resta tenant-scoped come backstop).

### 3.2 `rapportini` (testata)
```
id          uuid pk default gen_random_uuid()
tenant_id   uuid not null references tenants(id) on delete cascade
dipendente_id uuid not null references dipendenti(id) on delete cascade
data        date not null
stato       text not null default 'bozza'
            check (stato in ('bozza','inviato','verificato','approvato','respinto','esportato'))
inviato_da  uuid references users(id) on delete set null
inviato_at  timestamptz
approvato_da uuid references users(id) on delete set null
approvato_at timestamptz
respinto_motivo text
note        text
created_at  timestamptz not null default now()
updated_at  timestamptz not null default now()
unique (dipendente_id, data)
```
Trigger `tg_set_updated_at`. RLS: read tenant; write tenant + ruolo in (owner,admin,office,tecnico); platform admin read.

### 3.3 `rapportino_righe`
```
id            uuid pk default gen_random_uuid()
rapportino_id uuid not null references rapportini(id) on delete cascade
commessa_id   uuid not null references commesse(id) on delete cascade
ore_ordinarie    numeric(4,2) not null default 0
ore_straordinarie numeric(4,2) not null default 0
ore_viaggio      numeric(4,2) not null default 0
note          text
```
RLS via join al rapportino (stesso tenant). Indice `(rapportino_id)`.

---

## 4. Logica pura (TDD, in `@kommessa/api`) — il cuore "con cura"

Nuovo file `packages/api/src/kantiere-ore.ts` (subpath `@kommessa/api/kantiere-ore`). Funzioni **pure, deterministiche, totalmente testate**:

### 4.1 Coppie timbrature → minuti per commessa
`minutiPerCommessa(timbrature: Timbratura[]): Map<commessa_id, number>`
- `Timbratura = { commessa_id, tipo: 'ingresso'|'uscita', ts: string }`.
- Algoritmo per commessa: ordina per `ts`, accoppia ingresso→uscita; somma i delta in minuti. Una pausa pranzo = uscita + successivo ingresso (gap non contato). 
- **Edge** da testare: timbrata orfana (ingresso senza uscita → ignorata o conteggiata fino a "ora" NO: in calcolo storico si ignora la coda orfana), uscita senza ingresso precedente (ignorata), doppio ingresso (si chiude il precedente? no: si tiene il primo ingresso, il secondo ingresso senza uscita intermedia è anomalia → si ignora il secondo), multi-commessa nello stesso giorno.

### 4.2 Calcolo ore giornata
`calcolaOreGiornata(input): RisultatoOre`
- input: `{ minutiLavoratiPerCommessa: {commessa_id, minuti}[], minutiViaggio?: number, sogliaOreOrdinarie?: number /*default 8*/ }`.
- Output per riga commessa: `{ commessa_id, ore_ordinarie, ore_straordinarie }` + `ore_viaggio` totale separato.
- Regola: somma di tutto il lavorato del giorno; le prime `soglia` ore (in minuti) → ordinarie, l'eccedenza → straordinario; **ripartizione proporzionale** dell'ordinario/straordinario tra le commesse quando multi-commessa (oppure: riempi ordinario in ordine di commessa fino a soglia, poi straordinario — **scelta: riempimento sequenziale per ts della prima timbrata**, più intuitivo per l'ufficio). Viaggio sempre separato/aggiuntivo, mai dentro la soglia.
- Arrotondamento: ore con 2 decimali (minuti/60), half-up.
- **Edge** testati: 0h, solo viaggio, esattamente soglia, multi-commessa che sfora, soglia custom (tenant), override manuale che sfora (la funzione calcola il *suggerimento*; l'override utente è libero e non ricalcolato).

### 4.3 Helpers
- `sogliaOreOrdinarie(configModuloKantiere): number` — legge `config.soglia_ore_ordinarie` dal modulo, default 8.
- `prossimoTipoTimbratura(ultime: {tipo}[] ): 'ingresso'|'uscita'` — toggle: se l'ultima è ingresso → 'uscita', altrimenti 'ingresso'. (Per il bottone "Timbra".)
- `oreToString(n)` / formato display (no trattino lungo, virgola decimale IT).

I tipi di dominio (`Timbratura`, `RigaOre`, `RisultatoOre`) vivono qui.

---

## 5. Server Actions

### 5.1 Timbratura — `apps/web/app/_actions/kantiere-timbra.ts` (`'use server'`)
- `timbra({ token, dipendenteId? })`:
  - risolve `token` → QR attivo → `commessa_id` + `tenant_id` (service client per il lookup token, poi controllo sessione utente del tenant);
  - **auth**: utente loggato del tenant; modulo attivo;
  - **chi**: se `dipendenteId` assente → timbra **sé** (il `dipendenti` con `user_id = utente`); se presente → consentito **solo** se l'utente è **capo** (`commessa_squadra.ruolo_commessa='capo'`) di quella commessa e il `dipendenteId` è **membro della sua squadra** su quella commessa (o sé);
  - calcola `prossimoTipoTimbratura` dalle timbrature odierne del dipendente su quella commessa → inserisce `tipo` alternato, `origine='qr'` (o `'capo'` se per altri), `geo` best-effort;
  - ritorna `{ ok, tipo, ts }`.
- `timbraCronometro({ commessaId, azione: 'start'|'stop' })`: come sopra ma `origine='cronometro'`, senza QR (per chi è già in commessa). `start`=ingresso, `stop`=uscita.
- `timbraManuale({ commessaId, dipendenteId, tipo, ts })` (office/admin o capo): inserisce con `origine='manuale'`.

Tutte validate con zod; errori `FORBIDDEN`/`MODULO_OFF`/`QR_NON_VALIDO`/`NON_CAPO`/`FUORI_SQUADRA`.

### 5.2 Rapportino — `apps/web/app/_actions/kantiere-rapportino.ts`
- `precompilaRapportino({ dipendenteId, data })`: legge timbrature del giorno → `minutiPerCommessa` → `calcolaOreGiornata` → upsert `rapportini` (bozza) + righe suggerite. Idempotente (non sovrascrive righe già editate se stato != bozza).
- `salvaRapportino({ rapportinoId, righe, note })`: aggiorna righe (solo se `stato='bozza'`).
- `inviaRapportino({ rapportinoId })`: `stato='bozza'→'inviato'`, set `inviato_da/at`. Dopo invio le righe sono **read-only** per il tecnico.
- (Approva/respingi: stub in E, UI completa in F — ma le action `approvaRapportino`/`respingiRapportino` gated office/admin possono già esistere per sbloccare F.)

Autorizzazione: il dipendente compila il **proprio**; il capo può precompilare/inviare per i **membri della sua squadra** (sola lettura sui dati, ma può inviare per loro? — **decisione**: il capo *vede* e *timbra*, ma l'**invio rapportino lo fa il diretto interessato o l'ufficio**; il capo invia solo il proprio. Per i 5 "solo timbratura" senza login, **l'ufficio** compila/invia. Coerente con "tutti mandano all'ufficio, ci pensano in ufficio a confermare").

---

## 6. Flussi PWA (mobile)

Tutto sotto `/mobile`, gated modulo kantiere. Solo per utenti con un `dipendenti.user_id` collegato (o office/admin in anteprima).

- **`/t/[token]` (upgrade da placeholder)**: se utente loggato del tenant → mostra la commessa + bottone **Timbra ingresso/uscita** (toggle via `prossimoTipoTimbratura`); se l'utente è **capo** su quella commessa → sezione **"La mia squadra"** con i membri e spunta presenti → timbra per i selezionati. Se non loggato → invito al login (poi torna al token).
- **Cronometro**: schermata "Timbra" alternativa senza QR per chi è già loggato in una commessa assegnata (start/stop).
- **Fine giornata** `/mobile/ore` (o "Le mie ore di oggi"): righe precompilate dalle timbrate → edit ore (ordinarie/viaggio/straordinario) → **Invia all'ufficio**. Per il capo: "La mia squadra oggi" in sola lettura.
- **Inserimento manuale puro**: dalla stessa schermata, aggiungi riga commessa a mano e invia (senza timbrature).

Nota PWA title-case display (`mobile/_lib/display-case.ts`) per i titoli; mai path/codici.

---

## 7. Calcolo ore — soglia per tenant

`soglia_ore_ordinarie` vive in `tenant_modules.config` del modulo `kantiere` (jsonb), default **8**. Configurabile da super-admin (tab Moduli) — campo numerico opzionale; se assente → 8. (UI minima in E: lettura; editing avanzato eventualmente in F.)

---

## 8. Testing

- **Unit `kantiere-ore.ts`** (il grosso): `minutiPerCommessa` (coppie, pausa, orfane, doppio ingresso, multi-commessa), `calcolaOreGiornata` (0h, solo viaggio, soglia esatta, sfora, multi-commessa sequenziale, soglia custom), `prossimoTipoTimbratura`, arrotondamenti.
- **Gating**: route/azioni kantiere spente per Bertaiola.
- **Autorizzazione azioni** (dove testabile in modo puro): helper `puòTimbrarePer(utente, dipendente, squadra)` estratto come funzione pura e testato (capo→membro ok, capo→fuori-squadra no, sé→sé ok, estraneo no).
- Verifica manuale cumulativa (lato utente, più avanti): scan→timbra→fine giornata→invio; capo timbra squadra; soglia straordinari.

---

## 9. Fasizzazione interna E (sotto-step, eseguiti in serie)

| Step | Contenuto | Output |
|---|---|---|
| **E1** | Migration `timbrature`/`rapportini`/`rapportino_righe` + **logica pura `kantiere-ore.ts`** (TDD) + helper `puòTimbrarePer` | DB + cuore calcolo testato |
| **E2** | Server Actions timbratura (`timbra`/`cronometro`/`manuale`) + upgrade `/t/[token]` a timbratura reale (self + capo-squadra) | scan funzionante |
| **E3** | Server Actions rapportino (precompila/salva/invia) + UI PWA "Le mie ore di oggi" + invio | rapportino end-to-end |

Ogni step: migration (se presente) prima del codice; implementer **in serie**; review spec+quality; test/typecheck/build verdi prima del successivo.

---

## 10. Fuori scope E (→ F)
Coda approvazioni ufficio completa, viste/anomalie/report/export, editing soglia avanzato, area permessi granulare `kantiere`, geofencing.
