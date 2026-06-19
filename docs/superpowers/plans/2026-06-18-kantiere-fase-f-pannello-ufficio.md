# Kantiere Fase F — Pannello ufficio · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Tasks SERIALI (toccano il sottoalbero condiviso `office/kantiere/` + la subnav): un implementer alla volta.

**Goal:** Pannello ufficio Kantiere: coda approvazioni rapportini, viste con filtri + dettaglio, report aggregati con export CSV/PDF, anomalie. Collega il giro: rapportino inviato dalla PWA → coda ufficio → approva → report/export.

**Architecture:** server pages tenant-scoped (RLS) sotto `/office/kantiere/*`, gated dal layout esistente (office/admin + modulo). Logica pura di aggregazione/anomalie in `@kommessa/api/kantiere-report` (TDD). Export CSV via route handler (pattern `api/office/turni/export`). PDF via `window.print()`.

**Convenzioni (verificate):** `@/app/office/_lib/format` → `fmtData/fmtDataOra/fmtOra` (Europe/Rome, gestiscono null→'—' MA il repo vieta il trattino lungo nei testi: per i valori vuoti nei CSV usa stringa vuota, in UI il '—' del formatter è tollerato perché è il placeholder dei formatter, vedi memoria). `risolviTitoloCommessa` da `@/app/_lib/commessa-display`. Container office `mx-auto w-full max-w-6xl space-y-6 p-6` + `<h1 className="text-xl font-semibold">`. `Card`/`Button`/`Dialog` da `@kommessa/ui`. Guard office: `requireTenantContext` + ruolo `['admin','office']` + `tenantHasModule('kantiere')`. Tabelle non nei tipi → `as never`. Copy IT, no "col", no "—" nei testi scritti a mano.

Spec: `docs/superpowers/specs/2026-06-18-kantiere-fase-f-pannello-ufficio.md`.

---

## F1 — Rapportini (coda + viste + azioni)

### Task F1.A: Server Actions ufficio — `apps/web/app/office/_actions/kantiere-rapportini.ts`
**Files:** Create.
- [ ] `'use server'`. Guard come `office/_actions/dipendenti.ts` (`requireTenantContext` + ruolo admin/office + `tenantHasModule('kantiere')`).
- [ ] Azioni (zod uuid; ritorno `{ok}|{ok:false,error}`; `revalidatePath('/office/kantiere/rapportini')`):
  - `approvaRapportino({rapportinoId})`: verifica rapportino del tenant con `stato='inviato'` → set `stato='approvato'`, `approvato_da=ctx.userId`, `approvato_at=now()`. Altrimenti `STATO_NON_VALIDO`.
  - `respingiRapportino({rapportinoId, motivo})` (motivo string 1..500): `inviato → respinto`, set `respinto_motivo`.
  - `riapriRapportino({rapportinoId})`: `approvato|respinto → bozza`, azzera `inviato_*`/`approvato_*`/`respinto_motivo`.
- [ ] Typecheck verde. Commit `feat(kantiere): azioni ufficio rapportini (approva/respingi/riapri)`.

### Task F1.B: Pagina Rapportini + badge + subnav
**Files:** Create `apps/web/app/office/kantiere/rapportini/page.tsx`, `_components/rapportini-client.tsx`, `_components/rapportino-badge.tsx`; Modify `apps/web/app/office/kantiere/_components/kantiere-subnav.tsx`.
- [ ] **Subnav**: aggiungi `{ label: 'Rapportini', href: '/office/kantiere/rapportini' }` dopo "QR cantiere".
- [ ] **`rapportino-badge.tsx`** (`'use client'` non necessario; può essere server): mappa stato→{label,colore}: bozza="Bozza"(slate), inviato="Inviato"(amber), approvato="Approvato"(emerald), respinto="Respinto"(red), verificato="Verificato"(blue), esportato="Esportato"(slate). Render `<span>` con dot, stile come gli altri badge.
- [ ] **Server page** (`export const dynamic='force-dynamic'`): legge `searchParams` `{from?,to?,stato?,dipendente?}`; default periodo ultimi 14 giorni (calcola con Date, formato YYYY-MM-DD). Query `rapportini` (`as never`) where tenant + `data` nel range (+ stato/dipendente se presenti), order `data desc`. Per ogni rapportino carica le `rapportino_righe` (batch `.in('rapportino_id', ids)`) e le `dipendenti` (batch `.in('id', dipIds)` → nome/cognome) e i titoli commessa (batch `.in('id', commessaIds)` + `risolviTitoloCommessa`). Costruisci righe `{id, dipendenteNome, data, stato, tot:{ord,straord,viaggio}, righe:[{commessaTitolo, ore_ordinarie, ore_straordinarie, ore_viaggio}]}`. Carica anche l'elenco `dipendenti` per il filtro. Render `<RapportiniClient ... filtri=... />`.
- [ ] **Client**: barra filtri (date from/to, select stato, select dipendente) che aggiorna i `searchParams` (router.push). Tabella con riga espandibile (mostra le righe per commessa). Azioni per stato `inviato`: **Approva** (→`approvaRapportino`), **Respingi** (dialog motivo →`respingiRapportino`); per `approvato`/`respinto`: **Riapri** (→`riapriRapportino`). `useTransition`+`router.refresh()`. Date con `fmtData`. Link "Esporta CSV" → `/api/office/kantiere/rapportini/export?from=..&to=..&stato=..&dipendente=..`.
- [ ] Typecheck verde. Commit `feat(kantiere): pannello ufficio Rapportini (coda+viste+approva/respingi)`.

---

## F2 — Report (aggregati + export)

### Task F2.A: Logica pura `kantiere-report.ts` (TDD)
**Files:** Create `packages/api/src/kantiere-report.ts` + `.test.ts`; Modify `packages/api/package.json` (export `./kantiere-report`).
- [ ] Test prima (FAIL):
  - `aggregaOre(righe, per)`: `righe: {chiaveDipendente,chiaveCommessa, ore_ordinarie,ore_straordinarie,ore_viaggio}[]`, `per:'dipendente'|'commessa'` → `Map<chiave, {ordinarie,straordinarie,viaggio,totale}>` (somma; totale=ord+straord+viaggio). Test: somma multipla, chiavi multiple, vuoto.
  - `giornateIncomplete(timbrature)`: `{dipendente_id,commessa_id,giorno,tipo}[]` → lista `{dipendente_id,commessa_id,giorno}` dove #ingressi ≠ #uscite. Test: pari→ok, dispari→anomalia, multi-giorno.
- [ ] Implementa (pure). Export subpath. `pnpm test` verde + typecheck. Commit `feat(kantiere): logica pura report/anomalie (aggregaOre, giornateIncomplete) + test`.

### Task F2.B: Pagina Report + endpoint CSV + subnav
**Files:** Create `apps/web/app/office/kantiere/report/page.tsx`, `_components/report-client.tsx`, `apps/web/app/api/office/kantiere/rapportini/export/route.ts`; Modify subnav.
- [ ] **Subnav**: aggiungi `{ label: 'Report', href: '/office/kantiere/report' }`.
- [ ] **Server page report**: `searchParams` `{from?,to?,per?}` (default mese corrente, `per='dipendente'`). Carica `rapportino_righe` dei rapportini del tenant nel periodo (join testata per data/stato/dipendente; di default includi `inviato`+`approvato`), risolvi nomi dipendente + titoli commessa, costruisci l'array per `aggregaOre`. Calcola KPI totali. Render `<ReportClient aggregati=... kpi=... filtri=... />`.
- [ ] **Client report**: toggle raggruppamento (dipendente/commessa), filtri periodo; tabella aggregata + KPI in testa; bottone **Esporta CSV** (link endpoint con gli stessi filtri) e **Stampa / PDF** (`window.print()`); CSS `@media print { .no-print{display:none!important} @page{size:A4} }`.
- [ ] **Endpoint export** `route.ts` (GET): guard `requireTenantContext` + ruolo office/admin + modulo (se non autorizzato → 403). Legge filtri da query. Query righe dettagliate (una per `rapportino_riga`: data, dipendente nome, commessa titolo, ord, straord, viaggio, stato). Genera CSV `;`+BOM (pattern `api/office/turni/export/route.ts` — leggilo e riusa lo stesso `escape`/header/Content-Disposition). Filename `rapportini_{from}_{to}.csv`.
- [ ] Typecheck verde. Commit `feat(kantiere): Report ufficio (aggregati+KPI) + export CSV + stampa PDF`.

---

## F3 — Anomalie

### Task F3.A: Pagina Anomalie + subnav
**Files:** Create `apps/web/app/office/kantiere/anomalie/page.tsx`, `_components/anomalie-client.tsx`; Modify subnav.
- [ ] **Subnav**: aggiungi `{ label: 'Anomalie', href: '/office/kantiere/anomalie' }`.
- [ ] **Server page**: `searchParams` periodo (default ultimi 14 giorni). Calcola:
  - **Timbrature incomplete**: carica `timbrature` del periodo (tenant), mappa a `{dipendente_id, commessa_id, giorno=YYYY-MM-DD(Europe/Rome di ts), tipo}` e usa `giornateIncomplete` (F2.A). Risolvi nomi/titoli.
  - **Straordinario**: `rapportino_righe` con `ore_straordinarie>0` nei rapportini del periodo → lista (dipendente, data, commessa, ore_straord).
  - **Senza rapportino**: dipendenti `stato_attivo=true` del tenant senza `rapportini` nel periodo (almeno un giorno) → lista sintetica nomi (semplice: dipendenti attivi che non hanno NESSUN rapportino nel range).
  - **Modificato dopo invio**: `rapportini` con `inviato_at not null and updated_at > inviato_at` → lista (dipendente, data, stato).
- [ ] **Client**: sezioni con conteggio + tabelline; sola lettura; link al dettaglio in Rapportini dove utile (`?from=..&to=..&dipendente=..`). Date con `fmtData`/`fmtDataOra`.
- [ ] Typecheck verde. Commit `feat(kantiere): Anomalie ufficio (incomplete/straordinario/senza-rapportino/modificato)`.

---

## F4 — Verifica integrazione & build
- [ ] `pnpm --filter @kommessa/api test` verde (nuovi kantiere-report). 
- [ ] `pnpm --filter @kommessa/web typecheck` verde.
- [ ] **stop dev → `pnpm --filter @kommessa/web build` → exit 0 → rm -rf .next → restart dev** (gotcha .next).
- [ ] Verifica wiring: subnav mostra Dipendenti·QR·Rapportini·Report·Anomalie; tutte le route compilano; gating Bertaiola (modulo off) intatto.

## Self-review
- §3 transizioni → F1.A. §4.1 rapportini → F1.B. §4.2 report+CSV → F2. §4.3 anomalie → F3. §6 logica pura+test → F2.A. Collegamento PWA→ufficio: rapportino inviato (E3) visibile in coda (F1.B).
