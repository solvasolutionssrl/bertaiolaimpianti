# Popolamento cantieri FPM + modello commessa↔cantiere — Design

**Data**: 2026-07-03
**Stato**: Bozza in revisione
**Tenant**: FPM Impianti (`FPMIMP`, `app_mode=kantiere`). Riutilizzabile da altri tenant kantiere.
**Ambito**: solo mondo **Kantiere** — Bertaiola (mondo commesse) NON toccata.

---

## 1. Contesto e obiettivo

Oggi i tecnici FPM attivano un solo cantiere via QR (Fincantieri **Monfalcone**, che conoscono bene). Vogliamo **popolare l'elenco dei cantieri/commesse attivi** di FPM (190 righe da un'estrazione Excel del cliente), così che, con una nuova modalità di lavoro, il tecnico scelga il cantiere da una lista già pronta invece che solo dal QR.

Sorgente: `Estrazione_cantieri_con_indirizzi.xlsx`, foglio `Cantieri`, **190 righe**. Colonne:

| Col | Nome | Contenuto | Note |
|---|---|---|---|
| A | *(codice)* | Codice commessa **loro** (intero) | 190 valorizzati, **0 duplicati**, range `2…26084`. Due nomenclature: piccoli sequenziali (vecchie manutenzioni) + anno-progressivo (`26054`=2026). |
| B | Descrizione cantiere | Nome lavoro | → `nome` |
| C | Cliente | Ragione sociale | → `cliente_nome` |
| D | Indirizzo completo | Via, CAP, città, prov. | 181/190 reali; 9 mancanti (privati) |
| E | Affidabilità / Note | Testo qualità dato | → `note` + alimenta il flag |
| F | Classificazione | Tipo lavoro | 10 valori (CONSUNTIVO MAN 72, QUADRI 24, INDUSTRIALE 22, MANUTENZIONE 20, TERZIARIO 15, ACQUA 13, CIVILE 8, CONTRATTO MAN 8, FOTOVOLTAICO 7, "QUADRI - CL" 1) → `categoria` |
| G | Verifica | OK / CORRETTO / vuoto | 123 OK, 27 CORRETTO, 40 vuoto → alimenta il flag |

## 2. Decisione di modello (commessa ↔ cantiere)

**Scelta: "solo cantieri ora". Contenitore-commessa introdotto solo quando servirà davvero (1 commessa → più cantieri).**

Modello concettuale target (verso cui i due mondi convergono):
- **Cantiere** = unità **fisica** atomica. Ha sempre luogo, coordinate, QR, presenze (timbrature), squadra. **È sempre l'oggetto su cui si timbra.**
- **Commessa** = contenitore **anagrafico/commerciale**. Codice, cliente, contratto, documenti (per Bertaiola: cartella Nextcloud + AI). Raggruppa **1..N cantieri**.
- Relazione **commessa 1 —— N cantiere**. Oggi FPM è **1:1** → materializziamo **solo il cantiere**.

**Perché il seam 1:N è già aperto (nessun rifacimento futuro):**
- `cantieri.commessa_id` è già FK **opzionale** (`on delete set null`).
- `cantiere_qr`, `timbrature`, `rapportino_righe` sono già **polimorfici**: target = commessa **XOR** cantiere (`num_nonnulls(commessa_id, cantiere_id) = 1`).
- Quindi una commessa con più cantieri = più righe `cantieri` con lo stesso `commessa_id`, ognuna col proprio QR/indirizzo/presenze; il roll-up ore/costi passa da `cantiere.commessa_id`.

**Scartato:**
- *Attivare il modulo commessa a FPM* → la tabella `commesse` pretende `cliente_id NOT NULL`, `nome_cartella NOT NULL`, provisioning cartelle Nextcloud, flusso AI. FPM non ne ha bisogno; peso e rischio (vicino a Bertaiola).
- *Nuovo modulo "progetti"* → frammenta (tre nomi per la stessa idea). Il raggruppamento **è** la commessa.

Quando FPM avrà davvero 1 commessa → 2 cantieri: si introdurrà un **contenitore-commessa leggero** (headless: stessa idea, senza cartelle/AI); timbrature/QR restano sul cantiere fisico. Decisione della forma esatta rimandata a quel momento.

## 3. Delta schema (migration additiva, solo kantiere)

`cantieri` esiste già (`id, tenant_id, codice, nome, indirizzo, indirizzo_lat/lng, sede_partenza(+lat/lng), commessa_id?, stato, note, timestamps`, unique `(tenant_id, codice)`). Aggiungiamo 4 colonne nullable + 1 indice:

```sql
alter table public.cantieri
  add column if not exists codice_commessa          text,
  add column if not exists cliente_nome             text,
  add column if not exists categoria                text,
  add column if not exists indirizzo_da_verificare  boolean not null default false;

-- il codice loro è univoco per tenant e chiave di upsert idempotente
create unique index if not exists cantieri_codice_commessa_uq
  on public.cantieri (tenant_id, codice_commessa)
  where codice_commessa is not null;
```

- RLS invariata (le nuove colonne ereditano le policy della tabella).
- Nessuna colonna resa NOT NULL, nessun default distruttivo → **Bertaiola e i cantieri esistenti non cambiano comportamento**.
- `categoria` = testo libero (no enum → niente migration per nuovi valori); la UI offrirà i 10 valori noti come suggerimenti. Micro-pulizia dato: "QUADRI - CL" (1 riga) probabilmente = "QUADRI" → da confermare con l'ufficio.
- **Apply**: solo file SQL in `supabase/migrations/`. L'apply al cloud lo fa l'umano (`supabase db push`).

## 4. Codice: loro visibile e cercabile, nostro nascosto

- `codice` (CAN-xxx) → identificativo **interno**, generato dall'app, **non mostrato** a FPM.
- `codice_commessa` (il loro) → **il** codice a schermo (cima card cantiere, liste, admin) e **incluso nella ricerca** insieme a `nome` e `cliente_nome`. È la chiave d'oro: verbatim, mai riformattato, mai perso.

Lavoro UI a valle (workstream separato, non nella migration): mostrare + rendere ricercabile `codice_commessa` nelle superfici cantiere (liste, picker, ricerca, admin cross-tenant).

## 5. Pipeline di popolamento (script idempotente, 2 fasi)

**Sorgente riproducibile**: convertire una volta l'`.xlsx` in un JSON normalizzato committato (es. `scripts/data/cantieri-fpm.json`), rivedibile, così l'import non dipende dal file in Downloads.

**Script** `scripts/import-cantieri-fpm.mjs` (service-role, upsert su `(tenant_id, codice_commessa)`):

- **Fase 1 — subito, senza API key**: inserisce/aggiorna i 190 cantieri con `codice_commessa`, `nome`, `cliente_nome`, `indirizzo` (testo), `categoria`. Imposta `indirizzo_da_verificare = true` per: Verifica ≠ `OK`, oppure nota di criticità (sede legale ≠ cantiere), oppure indirizzo mancante (9 righe → indirizzo null).
- **Fase 2 — ultima, con API key**: geocoding (vedi §6) → riempie `indirizzo_lat/lng` (+ indirizzo normalizzato). I dubbi restano flaggati.

**Guard Monfalcone (turni aperti, niente weekend)** — il cantiere Fincantieri Monfalcone (`codice_commessa=25098`, INDUSTRIALE) **esiste già** in `cantieri` (QR attivo, turni possibili in corso). L'import deve:
1. **Matchare** la riga esistente (per `id` recuperato via lookup mirato dei cantieri FPM già presenti, non per codice) e fare **UPDATE in-place**: aggiunge `codice_commessa` + arricchisce, **senza toccare `id`**.
2. **Mai** delete+reinsert, **mai** duplicare Monfalcone.

Sicurezza turni: `timbrature`, `cantiere_qr`, `rapportino_righe` referenziano `cantieri.id` (UUID), **non** il codice → l'UPDATE dei metadati non impatta i turni aperti né il QR. Feasibile in settimana.

## 6. Geocoding (fase 2)

- Provider **Google Geocoding API** con `GOOGLE_MAPS_API_KEY` (chiave di piattaforma, in env — **mai** nel DB, **mai** committata). 181 indirizzi ≈ costo trascurabile, una tantum.
- Non è il `RoutingProvider` (quello fa distanze/tempi): geocoding = indirizzo → lat/lng.
- I ~30 incerti (CORRETTO/criticità) + 9 mancanti → `indirizzo_da_verificare=true`, revisione ufficio.
- **Reminder da dare a Luca prima della fase 2**: in Google Cloud abilitare **Geocoding API** (batch server) e **Places API** (autocomplete UI §7); restringere la key (API + IP/referrer + quota); ruotarla se serve (è stata incollata in chat).

## 7. UX "da controllare" + inserimento mancanti

- Badge **attenzione** (ambra) sul cantiere con `indirizzo_da_verificare=true`, in lista e in scheda.
- I 9 senza indirizzo → l'ufficio li completa da UI con **Places Autocomplete** (riempie indirizzo + coordinate). *Step successivo, citato per non perderlo.*

## 8. Sicurezza / segreti

- `GOOGLE_MAPS_API_KEY` in `apps/web/.env.local` (gitignored). Consigliato: restringere per API+referrer/IP+quota; eventuale rotazione post-setup.
- Import via **service-role** locale; nessun segreto lato client.

## 9. Cosa NON si tocca

Tabella `commesse`, mondo Bertaiola, nessun modulo "progetti", nessun modulo commessa per FPM. Nessuna colonna esistente modificata in modo distruttivo.

## 10. Scope / Out-of-scope

**In scope**: migration additiva (§3); JSON sorgente + script import fase 1 (§5); geocoding fase 2 (§6); guard Monfalcone (§5); badge "da verificare" (§7); wiring display+ricerca del `codice_commessa` (§4).

**Out-of-scope (step successivi)**: UI Places Autocomplete per i mancanti; contenitore-commessa 1:N; nuova modalità di scelta cantiere da lista lato tecnico (consumatore del popolamento, feature a sé).

## 11. Rischi e verifica

- **Rischio**: import duplica o ricrea Monfalcone → turni/QR orfani. **Mitigazione**: guard update-in-place per `id`, test su count righe FPM prima/dopo (deve crescere di 189, non 190).
- **Rischio**: geocoding pinna sedi legali sbagliate. **Mitigazione**: flag `indirizzo_da_verificare` + revisione ufficio.
- **Verifica**: prima della fase 1, elencare i cantieri FPM già presenti e quali `codice_commessa` del foglio combaciano (oggi almeno Monfalcone). Dopo la fase 1: `count(*)` cresce esattamente di `190 − (righe già presenti aggiornate)`; nessun duplicato per `nome`/luogo; `codice_commessa` univoci; Monfalcone conserva lo **stesso `id`** di prima (turni/QR intatti). `pnpm --filter @kommessa/web typecheck` verde per il wiring UI.
