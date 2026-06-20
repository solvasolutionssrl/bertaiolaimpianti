# Kantiere — Accessi, modalità app e mappa delle pagine

**Versione**: 1.0 · **Stato**: allineato a `main` (giu 2026, Fase I)

Riferimento unico per: come `app_mode` e il modulo `kantiere` attivano/disattivano le aree, chi vede cosa (ruolo × superficie × modalità), e cosa fa ogni pagina. Esito dell'audit di accesso del 20/06/2026 (nessun data-leak: la RLS isola sempre per tenant; il gating modulo/app_mode è di esperienza, non di sicurezza dati).

---

## 1. I due interruttori per-tenant

| Interruttore | Dove | Valori | Effetto |
|---|---|---|---|
| **Modulo `kantiere`** | `tenant_modules` (super admin → tab Moduli) | on/off | Abilita TUTTA l'area Kantiere (office + mobile). Off = come non esistesse. |
| **`tenants.app_mode`** | `tenants` (super admin → tab Moduli, "Esperienza mobile") | `kommessa` (default) · `kantiere` · `full` | Sceglie l'esperienza app: quali aree sono attive su desktop e mobile. |

`app_mode` (sorgente unica: `app/_lib/app-mode.ts → getAppModeCached`, default `kommessa`):

- **`kommessa`** — app completa attuale. **Default → Bertaiola e ogni tenant esistente invariati.**
- **`kantiere`** — **solo Kantiere**: niente area commessa (Commesse, Task, Turni) né su desktop né su mobile. È il caso **FPM**.
- **`full`** — combinata (commessa + Kantiere).

> Bertaiola è `kommessa` + modulo OFF → comportamento identico a prima su tutte le superfici (garantito dai rami di default).

---

## 2. Chi entra dove (guard per superficie e ruolo)

| Superficie | Chi può entrare | Guard (file) |
|---|---|---|
| `/office/**` (desktop) | `admin`, `office`. `tecnico` → `/mobile`, `cliente` → `/portal` | `office/layout.tsx` |
| `/mobile/**` (PWA) | qualsiasi ruolo autenticato | `mobile/_lib/guard.ts` |
| `/portal/**` | solo utenti esterni (cliente) | `portal/_lib/portal-context.ts` |
| `/admin/**` | solo platform admin SOLVA | `admin/layout.tsx` |
| `/office/kantiere/**` | `admin`/`office` **e** modulo `kantiere` on | `office/kantiere/layout.tsx` |
| `/mobile/kantiere/**` | auth **e** modulo on **e** `app_mode ∈ {kantiere, full}` | `mobile/kantiere/layout.tsx` |
| `/office/commesse`, `/office/todo`, `/office/turni` | tutti tranne `app_mode='kantiere'` (→ redirect `/office/kantiere`) | `office/{commesse,todo,turni}/layout.tsx` |
| `/mobile/kantiere/cruscotto` | solo `admin`/`office` (tecnico → `/mobile/kantiere`) | `cruscotto/page.tsx` |

**Importante**: per i tenant `kantiere` le aree commessa sono **disattivate davvero** (redirect anche per URL diretto), non solo nascoste dalla sidebar. `Clienti` resta accessibile (fa parte anche di Kantiere).

---

## 3. Cosa vede ciascuno — matrice esperienza

### Desktop office (solo `admin`/`office` arrivano qui)

| `app_mode` | Sidebar | Landing `/office` |
|---|---|---|
| `kommessa` (Bertaiola) | nav completa attuale (`BASE_FULL_NAV`) | dashboard commesse |
| `kantiere` (FPM) | Dashboard · **Azienda** (Dipendenti, Clienti) · **Kantiere** (Cantieri, QR, Rapportini, Ore e costi, Report, Anomalie) · **Altro** (Ricerca, Avvisi, Co-pilot, Impostazioni). **Niente Commesse/Task/Turni.** | redirect → `/office/kantiere` (Panoramica) |
| `full` | gruppi Kommessa + Kantiere | dashboard |

### Mobile PWA (shell per `app_mode` × ruolo)

| `app_mode` | `admin`/`office` | `tecnico` |
|---|---|---|
| `kommessa` | shell **gestione** (Dashboard/Commesse/Nuova/Attività/Profilo) | shell **campo** |
| `kantiere` | shell **kantiere — gestione**: **Cruscotto** · Cantieri · **Scansiona** · Ore · Profilo | shell **kantiere — campo**: Cantieri · Ore · **Scansiona** · Attività · Profilo |
| `full` | gestione/campo + voce Kantiere | idem |

> Sì: **dentro ogni modalità esiste sia la versione tecnico sia quella admin/office.** Per `kantiere`, l'admin ha in più il **Cruscotto** (vista gestionale); il tecnico ha la vista "da campo" semplice.

---

## 4. Mappa pagine

### Office — `/office/kantiere/**`
| Pagina | Rotta | Cosa fa |
|---|---|---|
| Panoramica | `/office/kantiere` | landing Kantiere (KPI, accessi rapidi) |
| Dipendenti | `/office/kantiere/dipendenti` | anagrafica personale; badge "account collegato" se ha login |
| Cantieri | `/office/kantiere/cantieri` (+ `/[id]`) | siti fisici (CAN-NNN), indirizzo+lat/lng, squadra, QR |
| QR code | `/office/kantiere/qr` (+ `…/stampa`) | registro QR (commessa o cantiere), n. scansioni, stampa A4 |
| Rapportini | `/office/kantiere/rapportini` | coda rapportini giornalieri, approva/respingi/riapri, registra ore per dipendente |
| **Ore e costi** | `/office/kantiere/ore-costi` | tab **Regole** (maggiorazioni), **Tariffe** (costo orario), **Costi** (ore pesate + € + CSV) |
| Report | `/office/kantiere/report` | aggregati ore per dipendente/commessa/cantiere + export |
| Anomalie | `/office/kantiere/anomalie` | giornate incomplete (ingresso/uscita dispari) |
| Impostazioni Kantiere | `/office/impostazioni` (tab) | soglia ore ordinarie, sede partenza default |

### Mobile — `/mobile/kantiere/**`
| Pagina | Rotta | Per chi |
|---|---|---|
| Home Kantiere | `/mobile/kantiere` | tutti (stato timbratura, accessi rapidi) |
| **Cruscotto** | `/mobile/kantiere/cruscotto` | **admin/office**: KPI (rapportini da approvare, timbrature oggi, dipendenti, cantieri) + lista rapportini da approvare + ultime timbrature |
| Scansiona | `/mobile/kantiere/scansiona` | tutti — scanner QR → flusso timbratura `/t/[token]` |
| Cantieri | `/mobile/kantiere/cantieri` (+ `/[id]`) | tutti, sola lettura |
| Ore | `/mobile/kantiere/ore` | tutti — rapportino/ore personali |

---

## 5. Regole di maggiorazione & costi (sintesi tecnica)

- Schema: `kantiere_regole_ore` (tipo, params, `maggiorazione_pct`, priorità) + `kantiere_regola_ambito` (ambito `tenant`/`dipendente`/`cantiere`, target polimorfico). `dipendenti.costo_orario`.
- Tipi regola: `soglia_giornaliera`, `maggiorazione_straordinario`, `maggiorazione_viaggio`, `notturno`, `festivo`, `weekend`, `personalizzata` (CHECK DB ↔ codice ↔ UI allineati).
- Motore puro `@kommessa/api/kantiere-costi` (23 test): `risolviRegoleEffettive` (più specifica vince: **dipendente > cantiere > tenant**, poi priorità/%/id), `calcolaCostoGiornata` (costo = Σ ore_classe × tariffa × (1+%); tariffa nulla → costo `n.d.`), `festivitaItaliane` (Pasqua Gauss/Meeus + festività nazionali).
- **Festivo/weekend**: applicati a livello-giorno (festivo prevale sul weekend). **Notturno**: regola memorizzata ma classificazione automatica predisposta (non ancora derivata dagli intervalli) — comportamento intenzionale e documentato.
- Default seminati alla prima apertura (idempotente, `assicuraRegoleDefault`): straord +25, viaggio +15, festivo/weekend +50, notturno +30, soglia 8h. Sostituibili con la tabella reale del tenant.

---

## 6. Garanzia Bertaiola

Per `app_mode='kommessa'` + modulo OFF: nav office = `BASE_FULL_NAV`, nessun redirect dashboard, shell mobile gestione/campo invariate, aree Kantiere irraggiungibili. Verificato in build e via audit di accesso.
