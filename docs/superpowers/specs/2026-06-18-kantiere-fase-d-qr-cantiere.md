# Design — Kantiere Fase D · QR cantiere (generazione + stampa + registro)

**Versione**: 1.0
**Stato**: Approvato (estende il design master, §4.3 e §7)
**Data**: 2026-06-18
**Dipende da**: Fase B (R2/storage_mode + tenant FPM), Fase C (dipendenti/squadre).
**Master**: `docs/superpowers/specs/2026-06-18-kantiere-tesserino-digitale-design.md`

---

## 1. Obiettivo

Dotare ogni commessa (lato tenant col modulo `kantiere`) di un **QR univoco e permanente** che — scansionato — porterà (Fase E) alla timbratura ingresso/uscita. La Fase D copre:

1. modello dati `cantiere_qr` con **token opaco permanente** e vincoli DB di unicità;
2. **gestione QR lato desktop office**: genera (idempotente), stato, rigenera (con avviso), stampa;
3. **stampa PDF A4** con logo + colore brand del tenant, **3 template** selezionabili con **anteprima** WYSIWYG (la preview è identica alla stampa);
4. **registro super-admin** cross-tenant di tutti i QR (sola lettura);
5. **landing di risoluzione** `/t/[token]` che valida il QR e mostra la commessa (placeholder timbratura, completato in Fase E).

---

## 2. Decisioni di design (e divergenze dal master)

- **Token opaco random, non HMAC.** Il master (§4.3) ipotizzava firma HMAC. Si adotta invece un **token casuale non indovinabile** (24 byte, base64url) memorizzato in DB e validato sempre contro il DB. Stessa garanzia anti-contraffazione (non si può forgiare un token valido), zero gestione di un secret applicativo. Si annota qui la divergenza.
- **Permanenza e unicità (requisito cliente: "una volta stampati devono restare validi").**
  - Generazione **idempotente**: se esiste già un QR attivo per la commessa, l'azione lo **restituisce** senza coniarne uno nuovo.
  - Vincolo DB **un solo QR attivo per commessa** (`unique … where attivo`) + **token globalmente unico**.
  - Un nuovo token nasce **solo** dalla rigenerazione esplicita, che revoca il precedente (`attivo=false`, `revoked_at=now()`) — in UI con conferma e avviso "le copie già stampate smetteranno di funzionare".
- **PDF = stampa browser.** Niente pipeline PDF server-side: pagina A4 stilizzata con `@media print` + `window.print()` ("Stampa / Salva come PDF"). L'anteprima a schermo è la stessa resa della stampa → l'anteprima richiesta dal cliente è gratis e fedele.
- **QR generato server-side** con la libreria `qrcode` (`toDataURL`) — deterministico, nessuna dipendenza client.
- **Gating**: come Fase C, le superfici office sono gated da ruolo `admin`/`office` + `tenantHasModule('kantiere')` (il layout `/office/kantiere/layout.tsx` già lo fa). L'area permessi granulare `kantiere` del master §8 resta per E/F.

---

## 3. Contenuto del QR

Il QR codifica una **URL assoluta**: `${ORIGIN}/t/${token}` dove `ORIGIN` è l'origine pubblica dell'app (helper, da `NEXT_PUBLIC_APP_URL` con fallback a `VERCEL_PROJECT_PRODUCTION_URL`, poi `http://localhost:3000`). Una qualunque app fotocamera apre la URL; il token è globalmente unico → la commessa (e quindi il tenant) si risolve dal token, senza bisogno di info tenant nel QR.

---

## 4. Modello dati — `cantiere_qr`

Migration `supabase/migrations/20260621000000_cantiere_qr.sql` (additiva).

```
id          uuid pk default gen_random_uuid()
tenant_id   uuid not null references tenants(id) on delete cascade
commessa_id uuid not null references commesse(id) on delete cascade
token       text not null            -- opaco, base64url
attivo      boolean not null default true
created_by  uuid references users(id) on delete set null
created_at  timestamptz not null default now()
revoked_at  timestamptz
```

Indici/vincoli:
- `unique (token)` → unicità globale (un token = un solo QR, per sempre).
- `unique (commessa_id) where attivo` → **al massimo un QR attivo per commessa**.
- `index (tenant_id)`.

RLS (come Fase C):
- read: `tenant_id = current_tenant_id()` (tutti i ruoli del tenant — serve alla risoluzione `/t`);
- write (`for all`): `tenant_id = current_tenant_id() and current_role() in (owner,admin,office)`;
- platform admin read: `is_platform_admin()`.

> Nota risoluzione `/t/[token]`: la landing gira **server-side con service client** (cross-tenant, perché chi scansiona potrebbe non avere sessione del tenant giusto) e fa lookup per token. Nessuna esposizione di dati sensibili: mostra solo titolo commessa + esito validità.

---

## 5. Logica pura (unit-test, in `@kommessa/api`)

Nuovo file `packages/api/src/kantiere-qr.ts` (export via `@kommessa/api/kantiere-qr`):

- `qrUrl(origin: string, token: string): string` — normalizza origin (no slash finale) + `/t/${token}`.
- `statoQr(row: { attivo: boolean; revoked_at: string | null } | null): 'assente' | 'attivo' | 'revocato'`.
- `mascheraToken(token: string): string` — per il registro admin: primi 6 + `…` + ultimi 4 (token corti → invariato).
- `TEMPLATE_QR: ReadonlyArray<{ id: string; nome: string; descrizione: string }>` — 3 voci.
- `risolviTemplateQr(id: string | null | undefined): string` — ritorna un id valido (fallback al primo) — usato per leggere `?template=` in modo sicuro.

La generazione del token (random) **non** è qui (non testabile in purezza): vive nell'action come `crypto.randomBytes(24).toString('base64url')`.

---

## 6. Server actions — `apps/web/app/office/_actions/cantiere-qr.ts`

`'use server'`, guard = office/admin + modulo attivo (come `dipendenti.ts`).

- `generaQrCommessa(commessaId: string)`: verifica commessa nel tenant; se esiste QR `attivo` lo ritorna (idempotente); altrimenti inserisce token nuovo (`created_by` = utente). Ritorna `{ ok, token }`. `revalidatePath`.
- `rigeneraQrCommessa(commessaId: string)`: revoca l'attivo (`attivo=false, revoked_at=now()`) e ne crea uno nuovo. Ritorna `{ ok, token }`. (UI conferma esplicita.)

Validazione zod su `commessaId` uuid. Errori: `FORBIDDEN`, `MODULO_OFF`, `COMMESSA_NON_TROVATA`.

---

## 7. Superfici UI

### 7.1 Office — gestione QR · `/office/kantiere/qr`
- Server page: lista commesse del tenant con stato QR (assente/attivo + data) via join `cantiere_qr`.
- Client: per riga → "Genera QR" (se assente) · "Stampa" (link a `/office/kantiere/qr/[commessaId]/stampa`) · "Rigenera" (dialog conferma con avviso copie stampate).
- Titolo commessa via `risolviTitoloCommessa()`; mai `nome_cartella` raw.
- Voce di navigazione "QR cantiere" nell'area kantiere (accanto a Dipendenti).

### 7.2 Office — stampa · `/office/kantiere/qr/[commessaId]/stampa`
- Server: carica commessa + tenant (`logo_url`, `brand_color`, `nome`) + QR **attivo** (se assente → redirect a `/office/kantiere/qr`). Genera `qrDataUrl` con `qrcode.toDataURL(qrUrl(origin, token), { width, margin })`.
- Client `StampaQrClient`: switcher 3 template (chip in alto, `class no-print`), **anteprima A4 live** del template scelto, bottone "Stampa / Salva PDF" → `window.print()`. `?template=` iniziale via `risolviTemplateQr`.
- I 3 template (componenti, foglio A4 210×297mm):
  - **`essenziale`** — sfondo bianco, logo piccolo in alto, QR grande centrato, titolo commessa + `codice_interno`, riga istruzione "Inquadra il QR per timbrare ingresso/uscita".
  - **`cartello`** — fascia superiore in `brand_color` con logo + "TIMBRATURA PRESENZE", QR in riquadro centrale, sotto cliente/stabilimento + indirizzo, footer piccolo.
  - **`industriale`** — alto contrasto, testo grande, header scuro, QR XXL — leggibile da lontano in cantiere rumoroso.
- CSS `@media print`: `@page { size: A4; margin: 0 }`, nasconde `.no-print`, mostra solo il template selezionato.

### 7.3 Super-admin — registro · `/admin/kantiere-qr`
- `requirePlatformAdmin`, `createServiceSupabase`. Tabella cross-tenant: tenant (nome), commessa (titolo), token mascherato, stato, created_at, revoked_at. Sola lettura. Voce in sidebar admin.

### 7.4 Landing risoluzione · `/t/[token]`
- Server (service client) lookup token. `attivo` → pagina minimale "Commessa «X» — la timbratura sarà disponibile a breve" (placeholder Fase E). `revoked`/inesistente → "QR non valido o revocato". Nessun dato sensibile.

---

## 8. Dipendenze nuove
- `qrcode` (^1.5) + `@types/qrcode` in `apps/web` — generazione QR server-side.

---

## 9. Testing
- Unit `kantiere-qr.ts`: `qrUrl` (slash finale, token), `statoQr` (null/attivo/revocato), `mascheraToken` (lungo/corto), `risolviTemplateQr` (valido/ignoto/null).
- Verifica manuale post-merge (con FPM): genera → idempotenza (riclic ⇒ stesso token) → stampa 3 template/anteprima → rigenera (vecchio `/t` ⇒ "non valido", nuovo ⇒ valido) → registro admin elenca → Bertaiola non vede l'area (modulo off).

---

## 10. Fuori scope Fase D (→ E)
Timbratura effettiva sullo scan, geo, cronometro, rapportino. `/t/[token]` resta placeholder.
