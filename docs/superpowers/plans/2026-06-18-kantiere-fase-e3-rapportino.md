# Kantiere Fase E3 — Rapportino giornaliero · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Server Actions del rapportino (precompila da timbrature, salva, invia) + UI PWA "Le mie ore di oggi" dove il dipendente loggato vede le righe precompilate, le corregge e **invia all'ufficio**.

**Architecture:** precompila = get-or-create del rapportino del giorno per il dipendente corrente, righe suggerite da `minutiPerCommessa`+`calcolaOreGiornata` (E1). Editing solo se `stato='bozza'`; dopo invio diventa read-only. Nessuna migration (tabelle già in E1, applicate). Niente modifiche alla bottom-nav PWA (Bertaiola-safe): la pagina è raggiungibile da un link nello schermo di timbratura.

**Tech Stack:** Next.js 14, Supabase RLS, `@kommessa/api/kantiere-ore`, `@kommessa/ui`, `guardMobile`. Spec: `docs/superpowers/specs/2026-06-18-kantiere-fase-e-timbrature-rapportino.md` §5.2, §6.

**Fatti d'integrazione (verificati):**
- `guardMobile()` da `@/app/mobile/_lib/guard` → `TenantContext` (redirect a `/login?next=/mobile` se non loggato).
- `getTenantContext()` da `@kommessa/api/tenant`; `createServerSupabase` (RLS) da `@kommessa/api/server`; `tenantHasModule('kantiere')` da `@/app/_lib/modules`.
- `getTenantModulesCached()` espone la riga modulo con `config` (jsonb) — per leggere `soglia_ore_ordinarie`; in alternativa query diretta `tenant_modules`. Verifica il nome reale in `apps/web/app/_lib/modules.ts`.
- E1: `minutiPerCommessa`, `calcolaOreGiornata` da `@kommessa/api/kantiere-ore`.
- `risolviTitoloCommessa` da `@/app/_lib/commessa-display`; `titoloCase` da `@/app/mobile/_lib/display-case`; `Button` da `@kommessa/ui`.
- Tabelle `rapportini`/`rapportino_righe`/`timbrature`/`dipendenti`/`commesse` → cast `as never` dove non nei tipi generati.

---

### Task 1: Server Actions rapportino — `apps/web/app/_actions/kantiere-rapportino.ts`

**Files:**
- Create: `apps/web/app/_actions/kantiere-rapportino.ts`

- [ ] **Step 1: Implementa** (`'use server'`). Tipi di ritorno espliciti. Guard = utente loggato + modulo attivo (come `kantiere-timbra.ts`).

Funzioni:
- `sogliaOreTenant(): Promise<number>` (interna): legge `config.soglia_ore_ordinarie` del modulo kantiere del tenant corrente, default `8`.
- `precompilaMioRapportino({ data? }): Promise<{ ok:true; rapportino } | { ok:false; error }>`:
  - `ctx = getTenantContext()`; se null → `NON_AUTENTICATO`; modulo off → `MODULO_OFF`.
  - `data` = `input.data` (YYYY-MM-DD) o **oggi in Europe/Rome** (usa un formatter con `timeZone:'Europe/Rome'` per ricavare la data locale, non `toISOString().slice(0,10)` che è UTC).
  - trova `me` = dipendente per `user_id=ctx.userId`; se assente → `NESSUN_DIPENDENTE`.
  - cerca `rapportini` per `(dipendente_id=me.id, data)`. 
    - se **esiste** → carica le righe (`rapportino_righe` join `commesse` per titolo) e ritorna (NON ricalcola).
    - se **assente** → crea `rapportini` (stato bozza, tenant_id, dipendente_id, data); calcola le righe suggerite: query `timbrature` del giorno (ts nel range [inizio, fine] del giorno locale) per `me` → `minutiPerCommessa` → `calcolaOreGiornata({minutiLavoratiPerCommessa, sogliaOreOrdinarie: soglia})`; inserisci una `rapportino_righe` per ogni riga calcolata (ore_ordinarie/straordinarie; ore_viaggio 0). Se nessuna timbratura → nessuna riga (il dipendente le aggiunge a mano). Ritorna il rapportino con righe + titoli commessa.
  - Forma di ritorno `rapportino`: `{ id, data, stato, note, righe: [{ id, commessa_id, commessa_titolo, ore_ordinarie, ore_straordinarie, ore_viaggio, note }] }`.
- `salvaMioRapportino({ rapportinoId, righe: [{ id?, commessa_id, ore_ordinarie, ore_straordinarie, ore_viaggio, note? }], note? }): Promise<Result>`:
  - verifica che il rapportino sia del dipendente corrente e `stato='bozza'` (altrimenti `NON_MODIFICABILE`);
  - upsert/replace righe: semplice = cancella le righe esistenti del rapportino e reinserisci quelle passate (transazione logica; va bene per volumi piccoli); aggiorna `note` testata.
  - validazione zod: ore `>=0`, `<=24`, numeric(4,2).
- `inviaMioRapportino({ rapportinoId }): Promise<Result>`:
  - verifica proprietà + `stato='bozza'`; set `stato='inviato'`, `inviato_da=ctx.userId`, `inviato_at=now()`.
- (Stub office per F, opzionali ma utili) `approvaRapportino`/`respingiRapportino({ rapportinoId, motivo? })`: gated `office`/`admin`; set stato approvato/respinto + campi. Includerli se rapido; altrimenti annota come F.

Errori: `NON_AUTENTICATO`/`MODULO_OFF`/`NESSUN_DIPENDENTE`/`NON_TROVATO`/`NON_MODIFICABILE`/`FORBIDDEN`.

- [ ] **Step 2: Typecheck** `pnpm --filter @kommessa/web typecheck` verde. No `next build`.
- [ ] **Step 3: Commit**
```bash
git add apps/web/app/_actions/kantiere-rapportino.ts
git commit -m "feat(kantiere): server actions rapportino (precompila/salva/invia) self-service"
```

---

### Task 2: UI PWA "Le mie ore di oggi" — `/mobile/ore`

**Files:**
- Create: `apps/web/app/mobile/ore/page.tsx`
- Create: `apps/web/app/mobile/ore/_components/ore-client.tsx`
- Modify: `apps/web/app/t/[token]/_components/timbra-client.tsx` (aggiungi un link "Le mie ore di oggi" → `/mobile/ore` nello stato di conferma timbratura)

- [ ] **Step 1: Server page** `/mobile/ore`:
  - `const ctx = await guardMobile();`
  - se `!(await tenantHasModule('kantiere'))` → `redirect('/mobile')`.
  - chiama `precompilaMioRapportino({})` (oggi). Se `NESSUN_DIPENDENTE` → schermo "Nessun profilo dipendente collegato".
  - passa il `rapportino` a `<OreClient rapportino={...} />`.
  - layout mobile-first coerente con `/mobile/*` (header "Le mie ore di oggi" + data in Europe/Rome).
- [ ] **Step 2: Client `ore-client.tsx`** (`'use client'`):
  - mostra le righe: per ciascuna, titolo commessa (`titoloCase`) e tre input numerici (Ordinarie / Straordinario / Viaggio) — editabili solo se `stato==='bozza'`.
  - possibilità di **aggiungere una riga** scegliendo una commessa (caricare l'elenco commesse del tenant: o passarlo come prop dal server, o un piccolo endpoint; semplice = il server page passa anche `commesseDisponibili: [{id,titolo}]`).
  - campo note testata.
  - bottone **"Salva bozza"** → `salvaMioRapportino({ rapportinoId, righe, note })` → `router.refresh()`.
  - bottone primario **"Invia all'ufficio"** → conferma (`useConfirm`) → `inviaMioRapportino({ rapportinoId })` → `router.refresh()`. Dopo invio: righe read-only + badge "Inviato" (stato).
  - totali calcolati a schermo (somma ordinarie/straord/viaggio) per feedback. Copy IT, no "col", no trattino lungo "—". `useTransition` per pending.
  - (Per il capo: in E3 si gestisce solo il PROPRIO rapportino; la vista squadra read-only è F.)
- [ ] **Step 3: Link da `/t` timbra-client** — nello stato di conferma ("Ingresso registrato alle HH:MM") aggiungi un `Link` "Le mie ore di oggi" → `/mobile/ore`.
- [ ] **Step 4: Typecheck** verde.
- [ ] **Step 5: Commit**
```bash
git add apps/web/app/mobile/ore apps/web/app/t/[token]/_components/timbra-client.tsx
git commit -m "feat(kantiere): PWA Le mie ore di oggi (rapportino precompilato + invio ufficio)"
```

---

### Task 3: Verifica E3
- [ ] `pnpm --filter @kommessa/web typecheck` verde; **stop dev → `pnpm --filter @kommessa/web build` → exit 0 → rm -rf .next → restart dev** (gotcha .next). Smoke: `/mobile/ore` senza sessione → redirect `/login`.
- [ ] Nessuna migration. Test funzionale cumulativo (utente) più avanti: timbra → /mobile/ore precompilato → invia.

## Self-review
- §5.2 actions (precompila/salva/invia) → Task 1. §6 "fine giornata" UI → Task 2. Soglia tenant → Task 1 `sogliaOreTenant`. Capo/ufficio approvazione completa → F (stub opzionali in Task 1).
