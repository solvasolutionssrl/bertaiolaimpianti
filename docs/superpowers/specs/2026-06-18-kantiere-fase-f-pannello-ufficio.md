# Design — Kantiere Fase F · Pannello ufficio (approvazioni, viste, anomalie, export)

**Versione**: 1.0
**Stato**: Approvato (estende il design master §7)
**Data**: 2026-06-18
**Dipende da**: E (timbrature/rapportini/calcolo ore). Ultima fase del modulo Kantiere.
**Master**: `docs/superpowers/specs/2026-06-18-kantiere-tesserino-digitale-design.md`

---

## 1. Obiettivo

Dare all'ufficio (`office`/`admin`) il controllo completo su presenze e ore:
1. **Coda approvazioni**: rapportini `inviato` → approva / respingi (con motivo). **Solo l'ufficio approva.**
2. **Viste rapportini** con filtri (periodo, stato, dipendente) + dettaglio righe (ore ordinarie/straordinario/viaggio per commessa).
3. **Anomalie** su un periodo: giornate con timbrature dispari (ingresso senza uscita), rapportini con straordinario, dipendenti attivi senza rapportino in un giorno feriale, rapportini modificati dopo invio.
4. **Report ed export**: aggregati per dipendente / commessa / periodo; **export CSV** (Excel-compatibile, `;` + BOM) e **PDF** (stampa browser); base del "registro presenze per cantiere" per Fincantieri.

Tutto sotto `/office/kantiere/*`, gated dal layout esistente (ruolo office/admin + modulo kantiere). Bertaiola non vede nulla.

---

## 2. Integrazione con le fasi precedenti (il "collegamento dei punti")

- **Sotto-nav** `kantiere-subnav.tsx` (D) estesa: `Dipendenti` (C) · `QR cantiere` (D) · **`Rapportini`** · **`Report`** · **`Anomalie`** (F). Un'unica area office coerente.
- Il rapportino **`inviato`** dalla PWA (E3) compare nella **coda Rapportini** (F): chiude il giro tecnico → ufficio.
- Le **anomalie** leggono `timbrature` (E1/E2) e `rapportini` (E3).
- Il **calcolo ore** mostrato è quello salvato nelle righe (E3) — F non ricalcola, mostra/aggrega ciò che il dipendente ha inviato (verificabilità Fincantieri: si vede esattamente l'inviato).
- Convenzioni riusate: `@/app/office/_lib/format` (`fmtData`/`fmtDataOra`/`fmtOra`, Europe/Rome), `risolviTitoloCommessa`, container office `mx-auto w-full max-w-6xl space-y-6 p-6`, `Card`/`Button` da `@kommessa/ui`, pattern CSV di `api/office/turni/export`.

---

## 3. Stato rapportino e transizioni (chi può cosa)

`bozza → inviato` (tecnico, E3) → **`approvato`** | **`respinto`** (ufficio, F) → eventuale `esportato` (marcatura all'export, F, best-effort). `verificato` resta disponibile nell'enum ma non usato in F (YAGNI).

- **approva**: `inviato → approvato`, set `approvato_da`/`approvato_at`.
- **respingi**: `inviato → respinto`, set `respinto_motivo`; il tecnico potrà poi re-inviare (E3 consente editing solo su `bozza` → per riaprire, l'ufficio "respinge"; la riapertura a bozza è un follow-up se servirà). In F: respinto è terminale lato tecnico finché l'ufficio non riapre — **decisione**: aggiungo anche `riapriRapportino` (respinto/approvato → bozza, solo ufficio) per chiudere il ciclo in modo pulito.
- Solo `office`/`admin`. Gating in action + RLS tenant.

---

## 4. Superfici

### 4.1 `/office/kantiere/rapportini` — coda + viste
- Server: query `rapportini` del tenant con filtri da `searchParams` (`from`,`to` date; `stato`; `dipendente`). Join `dipendenti` (nome) e somma ore dalle `rapportino_righe`. Default periodo = ultimi 14 giorni.
- Client: tabella con riga per rapportino (dipendente, data, stato badge, tot ordinarie/straordinario/viaggio); espandibile a mostrare le righe per commessa (`risolviTitoloCommessa`). Per `inviato`: bottoni **Approva** / **Respingi** (dialog motivo). Per `approvato`/`respinto`: **Riapri**. Barra filtri (periodo, stato, dipendente) + link "Esporta CSV".
- Badge stato rapportino: piccolo componente locale `RapportinoBadge` (non si tocca `StatoBadge` di `@kommessa/ui`, che è per le commesse).

### 4.2 `/office/kantiere/report` — aggregati + export
- Server: dato un periodo (`from`,`to`, default mese corrente) e raggruppamento (`per=dipendente|commessa`), aggrega le ore dalle `rapportino_righe` dei rapportini nel periodo (di norma `approvato`+`inviato`; filtro stato opzionale). 
- Client: tabella aggregata (riga = dipendente o commessa; colonne ordinarie/straordinario/viaggio/totale) + KPI in testa (totali periodo). Bottoni **Esporta CSV** (link all'endpoint) e **Stampa / PDF** (`window.print()` con `@media print`).
- Endpoint **`/api/office/kantiere/rapportini/export`** (GET): CSV dettagliato (una riga per `rapportino_riga`: data, dipendente, commessa, ordinarie, straord, viaggio, stato), filtri via query, `;`+BOM, `Content-Disposition: attachment`, gating office/admin + modulo.

### 4.3 `/office/kantiere/anomalie` — verifica
- Server: dato un periodo, calcola e mostra:
  - **Timbrature incomplete**: per dipendente+commessa+giorno, numero ingressi ≠ numero uscite (giornata aperta).
  - **Straordinario**: rapportini/righe con `ore_straordinarie > 0`.
  - **Senza rapportino**: dipendenti `stato_attivo` senza alcun `rapportino` in un dato giorno feriale del periodo (lun-ven) — lista sintetica.
  - **Modificato dopo invio**: rapportini con `updated_at > inviato_at` (indizio di modifica post-invio).
- Client: sezioni con conteggi + tabelline. Sola lettura (azioni si fanno dai Rapportini).

---

## 5. Export & report (dettaglio)

- **CSV**: come `api/office/turni/export` — `'﻿'` BOM, separatore `;`, escape virgolette, date `fmtData`, numeri con virgola decimale IT. Nome file `rapportini_{from}_{to}.csv`.
- **PDF**: niente libreria; pagina report con `@media print` (`@page{size:A4}`, nasconde controlli `.no-print`) + bottone `window.print()` → "Salva come PDF". Coerente con la stampa QR (D).
- **Excel**: il CSV `;`+BOM si apre nativamente in Excel IT — copre "Excel/CSV". Un vero `.xlsx` (SheetJS) è un possibile upgrade futuro, non in scope ora (YAGNI).

---

## 6. Testing
- Logica pura aggregazione/anomalie estratta dove sensato in `@kommessa/api/kantiere-report.ts` e testata: `aggregaOre(righe, per)` (somma per chiave), `giornateIncomplete(timbrature)` (conta ingressi≠uscite per dipendente+commessa+giorno). Vitest.
- Gating: route `/office/kantiere/*` spente per Bertaiola; azioni approva/respingi negate a non-ufficio.
- Verifica manuale cumulativa (utente): invio rapportino (E3) → compare in coda → approva → appare in report → export CSV/PDF.

---

## 7. Fasizzazione interna F (serie)
| Step | Contenuto |
|---|---|
| **F1** | Actions `kantiere-rapportini` (approva/respingi/riapri) + pagina **Rapportini** (coda+viste+dettaglio) + `RapportinoBadge` + subnav(+Rapportini) |
| **F2** | Logica pura `kantiere-report` (TDD) + pagina **Report** (aggregati+KPI+CSV+stampa) + endpoint export CSV + subnav(+Report) |
| **F3** | Pagina **Anomalie** + subnav(+Anomalie) |

## 8. Fuori scope F (YAGNI)
Vero `.xlsx`, area permessi granulare, geofencing, riapertura automatica a bozza su respinto, notifiche push su approvazione.
