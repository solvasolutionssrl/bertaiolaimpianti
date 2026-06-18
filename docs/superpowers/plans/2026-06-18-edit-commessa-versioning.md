# Revisione modifica commessa + versioning + azione rapida tipologie — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modifica completa della commessa (editor globale desktop + wizard 3 step PWA precompilato), versioning con storico/ripristino, e azione rapida append-only per aggiungere tipologie impianto.

**Architecture:** Riuso dei componenti di creazione (`VoiceReview`/`VociPicker`, `MediaAttachSection`) e degli helper di provisioning cartelle (`calcolaCartelleVoci`/`provisionaCartelle`), senza mai rigenerare codice/nome cartella. Nuova tabella snapshot `commessa_versioni` immutabile, scritta dalle action di modifica. Voci sempre solo-aggiunta.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres + RLS), server actions, Tailwind/@kommessa/ui, Cloudflare R2 + Nextcloud (StorageProvider).

**Gate di verifica (questo repo non ha unit test):** ad ogni task → `pnpm --filter @kommessa/web typecheck` e, a fine fase, `pnpm --filter @kommessa/web build`. Verifica funzionale manuale in produzione su una commessa di test, con check espliciti che `codice_interno`/`nome_cartella`/`cloud_folder_path` non cambino mai e che i salvataggi persistano.

**Regole ferree (ogni task le rispetta):**
- Mai toccare `codice_interno` / `nome_cartella` / `cloud_folder_path`.
- Voci: solo INSERT, mai DELETE (cartelle fisiche).
- Modifica online-only (no draft offline).
- Copy: mai "col/coi"; mai "—" nei testi. Date in `Europe/Rome`.
- Migration applicata dall'umano (`supabase db push`/`psql`) PRIMA del deploy del codice che la usa.

---

## File Structure

**Nuovi**
- `supabase/migrations/20260618000000_commessa_versioni.sql` — tabella + RLS + funzione `genera_versione_commessa`.
- `apps/web/app/_lib/versioni/snapshot.ts` — builder snapshot + diff (puro, riusabile).
- `apps/web/app/_actions/voci-provision.ts` — helper condiviso `aggiungiVociEProvisiona()` (DB insert + folder provisioning) estratto/condiviso.
- `apps/web/app/_actions/aggiorna-commessa-completa.ts` — action `aggiornaCommessaCompleta`.
- `apps/web/app/_actions/aggiungi-tipologie.ts` — action `aggiungiTipologie`.
- `apps/web/app/_actions/ripristina-versione.ts` — action `ripristinaVersione` (superadmin).
- `apps/web/app/_components/commessa-editor/` — core condiviso (`commessa-editor-core.tsx`, `types.ts`).
- `apps/web/app/_components/aggiungi-tipologie-dialog.tsx` — dialog/sheet condiviso.
- `apps/web/app/office/commesse/[id]/modifica/page.tsx` (+ `_components/`) — editor desktop.
- `apps/web/app/mobile/commessa/[id]/modifica/page.tsx` (+ `_components/`) — wizard mobile.
- `scripts/backfill-versioni-v1.mjs` — backfill one-shot v1.

**Modificati**
- `apps/web/app/_actions/crea-commessa.ts` — hook scrittura versione 1 alla creazione.
- `apps/web/app/office/commesse/[id]/cronologia/page.tsx` — storico versioni + restore.
- `apps/web/app/office/commesse/[id]/fasi/_components/aggiungi-fase.tsx` — sostituito/affiancato dal dialog tipologie.
- `apps/web/app/office/commesse/[id]/page.tsx` — entrypoint "Modifica" → editor completo, rimuove mini-dialog.
- `apps/web/app/mobile/commessa/[id]/page.tsx` — entrypoint modifica + azione rapida tipologie.

**Rimossi/deprecati**
- `apps/web/app/office/commesse/[id]/_components/commessa-edit-dialog.tsx`
- valutare `apps/web/app/mobile/commessa/[id]/_components/commessa-edit-mobile.tsx`

---

## FASE 0 — Ricognizione di conferma (no codice)

### Task 0: Verificare firme reali prima di codificare

**Files (sola lettura):**
- `apps/web/app/_actions/crea-commessa.ts:304-603` (voci union, `calcolaCartelleVoci`, `provisionaCartelle`)
- `apps/web/app/_actions/crea-commessa.schemas.ts:1-72` (`CreaCommessaServerInput`)
- `apps/web/app/_components/voice-review.tsx:82-101` (props `VoiceReview`, `VociPicker`)
- `apps/web/app/_actions/commesse.ts` (firma `aggiungiVoce`: verifica SE già provisiona cartelle)
- `packages/api` export di `requireTenantContext`, `createServiceSupabase`, `createServerSupabase`

- [ ] **Step 1: Leggere i file sopra** e annotare: (a) se `aggiungiVoce` provisiona cartelle (se sì, riusarlo come base del helper condiviso; se no, il helper le aggiunge), (b) firma esatta di `provisionaCartelle`/`calcolaCartelleVoci`, (c) shape di `CreaCommessaServerInput`, (d) props di `VoiceReview`/`VociPicker`.
- [ ] **Step 2: Nessun commit** (task di lettura).

---

## FASE 1 — DB: versioning

### Task 1: Migration `commessa_versioni`

**Files:**
- Create: `supabase/migrations/20260618000000_commessa_versioni.sql`

- [ ] **Step 1: Scrivere la migration**

```sql
-- Versioning commesse: snapshot immutabile per modifica.
-- Storico (chi/quando/cosa) + ripristino dei soli campi contenuto.
-- Le voci/tipologie NON vengono mai versionate per il restore (cartelle fisiche).

create table if not exists public.commessa_versioni (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  commessa_id         uuid not null references public.commesse(id) on delete cascade,
  versione            integer not null,
  snapshot            jsonb not null,            -- stato contenuto DOPO questa versione (per restore)
  diff                jsonb not null default '[]'::jsonb, -- [{campo, da, a}]
  modificato_da       uuid references public.users(id) on delete set null,
  modificato_da_nome  text,                      -- denormalizzato (display cross-tenant)
  azione              text not null default 'modifica'
                        check (azione in ('creazione','modifica','aggiunta_tipologie','ripristino')),
  created_at          timestamptz not null default now(),
  unique (commessa_id, versione)
);

create index if not exists commessa_versioni_commessa_idx
  on public.commessa_versioni (commessa_id, versione desc);
create index if not exists commessa_versioni_tenant_idx
  on public.commessa_versioni (tenant_id);

alter table public.commessa_versioni enable row level security;

-- Lettura: admin/office del tenant (sola lettura per loro)
create policy commessa_versioni_tenant_read on public.commessa_versioni
  for select
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role,'admin'::public.app_role,'office'::public.app_role)
  );

-- Scrittura: admin/office del tenant (le action scrivono le versioni)
create policy commessa_versioni_tenant_insert on public.commessa_versioni
  for insert
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role,'admin'::public.app_role,'office'::public.app_role)
  );

-- Policy additiva: platform admin legge cross-tenant
create policy commessa_versioni_platform_admin_read on public.commessa_versioni
  for select
  using (public.is_platform_admin());

-- Nessuna policy UPDATE/DELETE: tabella immutabile.

-- Funzione atomica per il prossimo numero di versione di una commessa.
create or replace function public.genera_versione_commessa(p_commessa_id uuid)
returns integer
language sql
as $$
  select coalesce(max(versione), 0) + 1
  from public.commessa_versioni
  where commessa_id = p_commessa_id;
$$;
```

- [ ] **Step 2: Verificare sintassi** rileggendo che i tipi `app_role`, le funzioni `current_tenant_id()/current_role()/is_platform_admin()` e le tabelle `tenants/commesse/users` esistano (confermato da ricognizione: 20260101*). Allineare i nomi se difformi.
- [ ] **Step 3: NON applicare automaticamente.** Segnalare all'umano: applicare con `supabase db push` PRIMA del deploy codice. (In alternativa, l'apply via MCP `apply_migration` è consentito solo dopo conferma esplicita dell'utente per questo file.)
- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260618000000_commessa_versioni.sql
git commit -m "feat(db): tabella commessa_versioni per versioning commesse (snapshot+diff+RLS)"
```

---

## FASE 2 — Logica condivisa (puro + helper)

### Task 2: Snapshot + diff builder

**Files:**
- Create: `apps/web/app/_lib/versioni/snapshot.ts`

- [ ] **Step 1: Scrivere il builder**

```ts
// Builder puro dello snapshot "contenuto" di una commessa e del diff tra due snapshot.
// Lo snapshot NON include i campi congelati (codice_interno/nome_cartella/cloud_folder_path)
// né le voci (il restore è solo-contenuti).

export interface CommessaSnapshot {
  descrizioneFinale: string | null;
  indirizzoCantiere: string | null;
  noteIniziali: string | null;
  isCritica: boolean | null;
  stato: string | null;
  responsabileId: string | null;
  clienteId: string | null;
  // referenti come array ordinato per confronto stabile
  referenti: Array<{
    nome: string;
    ruolo: string | null;
    telefono: string | null;
    email: string | null;
  }>;
}

export interface DiffEntry {
  campo: string;
  da: unknown;
  a: unknown;
}

const LABELS: Record<keyof CommessaSnapshot, string> = {
  descrizioneFinale: 'Descrizione',
  indirizzoCantiere: 'Indirizzo cantiere',
  noteIniziali: 'Note iniziali',
  isCritica: 'Criticità',
  stato: 'Stato',
  responsabileId: 'Responsabile',
  clienteId: 'Cliente',
  referenti: 'Referenti',
};

export function diffSnapshot(
  prima: CommessaSnapshot,
  dopo: CommessaSnapshot,
): DiffEntry[] {
  const out: DiffEntry[] = [];
  (Object.keys(LABELS) as Array<keyof CommessaSnapshot>).forEach((k) => {
    const a = JSON.stringify(prima[k] ?? null);
    const b = JSON.stringify(dopo[k] ?? null);
    if (a !== b) out.push({ campo: LABELS[k], da: prima[k] ?? null, a: dopo[k] ?? null });
  });
  return out;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @kommessa/web typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/_lib/versioni/snapshot.ts
git commit -m "feat(versioni): builder snapshot + diff commessa (puro)"
```

### Task 3: Helper condiviso aggiunta voci + provisioning

**Files:**
- Create: `apps/web/app/_actions/voci-provision.ts`
- Reference: `apps/web/app/_actions/crea-commessa.ts` (`calcolaCartelleVoci`, `provisionaCartelle`)

- [ ] **Step 1: Estrarre/centralizzare la logica voci-add.** Esporre da `crea-commessa.ts` (o duplicare in modo DRY) `calcolaCartelleVoci` e `provisionaCartelle` se non già esportate. Poi scrivere:

```ts
'use server';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
// importare provisionaCartelle / calcolaCartelleVoci dal modulo dove vivono
// (esportarle da crea-commessa.ts se attualmente sono private)

export interface AggiungiVociResult {
  ok: boolean;
  added: number[];
  storageOk: boolean;
  error?: string;
}

/**
 * Aggiunge voci a una commessa (solo nuove) e provisiona le sole cartelle
 * mancanti. NON rimuove mai voci. Provisioning best-effort (non blocca il DB).
 * Da chiamare solo dopo aver verificato i permessi del chiamante.
 */
export async function aggiungiVociEProvisiona(opts: {
  tenantId: string;
  commessaId: string;
  nomeCartella: string;
  cloudFolderPath: string;
  vociRichieste: number[];
}): Promise<AggiungiVociResult> {
  const supabase = createServerSupabase();

  const { data: esistentiRaw } = await supabase
    .from('commessa_voci')
    .select('voce_id')
    .eq('commessa_id', opts.commessaId);
  const esistenti = new Set<number>((esistentiRaw ?? []).map((r: any) => r.voce_id as number));

  const added = Array.from(new Set(opts.vociRichieste)).filter((v) => !esistenti.has(v));
  if (added.length === 0) return { ok: true, added: [], storageOk: true };

  const rows = added.map((voceId) => ({
    commessa_id: opts.commessaId,
    voce_id: voceId,
    tenant_id: opts.tenantId,
    stato: 'da_iniziare' as const,
    note: null as string | null,
  }));
  const { error: insErr } = await supabase.from('commessa_voci').insert(rows);
  if (insErr) return { ok: false, added: [], storageOk: false, error: insErr.message };

  // Provisioning cartelle best-effort: union vecchie+nuove così provisionaCartelle
  // crea solo quelle mancanti (idempotente).
  let storageOk = false;
  try {
    const unione = Array.from(new Set<number>([...esistenti, ...added]));
    // provisionaCartelle(opts) — firma reale da confermare in Task 0
    await provisionaCartelle({
      tenantId: opts.tenantId,
      nomeCartella: opts.nomeCartella,
      cloudFolderPath: opts.cloudFolderPath,
      vociAttive: unione,
    });
    storageOk = true;
  } catch {
    storageOk = false; // non fatale
  }

  return { ok: true, added, storageOk };
}
```

- [ ] **Step 2: Typecheck.** Run: `pnpm --filter @kommessa/web typecheck` → PASS (aggiustare import/firme reali).
- [ ] **Step 3: Commit**

```bash
git add apps/web/app/_actions/voci-provision.ts apps/web/app/_actions/crea-commessa.ts
git commit -m "feat(voci): helper condiviso aggiungiVociEProvisiona (append-only + provisioning)"
```

---

## FASE 3 — Server actions

### Task 4: `aggiornaCommessaCompleta`

**Files:**
- Create: `apps/web/app/_actions/aggiorna-commessa-completa.ts`
- Reference: `aggiorna-commessa.ts` (pattern auth/audit), `crea-commessa.ts` (cliente dedup/referenti), `voci-provision.ts`, `_lib/versioni/snapshot.ts`

- [ ] **Step 1: Definire input schema** (zod): `commessaId` uuid; opzionali `clienteId`, `clienteNew` (come crea), `descrizioneFinale` (max 120), `indirizzoCantiere` (max 200 nullable), `noteIniziali` (nullable), `isCritica` (bool), `stato` (enum stato_commessa), `responsabileId` (uuid nullable), `referenti` (array come crea), `voci` (number[] — interpretate come set finale desiderato; verranno aggiunte solo le nuove).
- [ ] **Step 2: Implementare l'action**:
  1. `requireTenantContext()`; ruolo ∈ {admin, office}, altrimenti errore.
  2. Caricare commessa (per `tenant_id`, `nome_cartella`, `cloud_folder_path` + campi contenuto) e referenti correnti → costruire `snapshotPrima`.
  3. Costruire `patch` SOLO con campi forniti; **mai** campi congelati. UPDATE `commesse`.
  4. Cliente: se `clienteNew` → dedup+insert (riusare logica di `crea-commessa.ts`); se `clienteId` diverso → set `cliente_id`. (Folder invariata.)
  5. Referenti: upsert `contatto_cliente` scope commessa.
  6. Voci: `aggiungiVociEProvisiona(...)` con `voci` richieste (append-only).
  7. Costruire `snapshotDopo` + `diff = diffSnapshot(prima, dopo)`. Se `diff.length>0`: RPC `genera_versione_commessa` → INSERT `commessa_versioni` (`azione='modifica'`, `modificato_da=ctx.userId`, `modificato_da_nome` da lookup users, snapshot=snapshotDopo). Best-effort (non fatale).
  8. `audit_events` insert (come oggi, con before/after).
  9. `revalidatePath` `/office/commesse/[id]`, `/office/commesse/[id]/cronologia`, `/office/commesse/[id]/fasi`, `/mobile/commessa/[id]`.
  10. Return `{ ok:true, storageOk }` o `{ ok:false, error }`.
- [ ] **Step 3: Typecheck** → PASS.
- [ ] **Step 4: Commit** `feat(commesse): aggiornaCommessaCompleta (edit completo + versione)`.

### Task 5: `aggiungiTipologie`

**Files:**
- Create: `apps/web/app/_actions/aggiungi-tipologie.ts`

- [ ] **Step 1: Implementare**: input `{ commessaId: uuid, voci: number[] }`; auth admin/office; carica commessa (tenant/nome_cartella/cloud_folder_path); `snapshotPrima`/`snapshotDopo` (le voci non sono nello snapshot, ma scriviamo comunque una versione di tipo aggiunta con diff vuoto + nota voci aggiunte nel campo diff come `{campo:'Tipologie', da:null, a:<elenco nomi>}`); chiama `aggiungiVociEProvisiona`; INSERT `commessa_versioni` (`azione='aggiunta_tipologie'`); audit; revalidate. Return `{ ok, added: number[], storageOk }`.
- [ ] **Step 2: Typecheck** → PASS.
- [ ] **Step 3: Commit** `feat(commesse): aggiungiTipologie (append-only + avviso cartelle)`.

### Task 6: `ripristinaVersione` (superadmin)

**Files:**
- Create: `apps/web/app/_actions/ripristina-versione.ts`
- Reference: `apps/web/app/admin/_lib/guard` (`requirePlatformAdmin`)

- [ ] **Step 1: Implementare**: input `{ commessaId: uuid, versioneId: uuid }`; `requirePlatformAdmin()`; usare `createServiceSupabase()` per leggere la versione cross-tenant; leggere `snapshot`; applicare i SOLI campi contenuto via UPDATE su `commesse` + upsert referenti + set `cliente_id` (NO voci, NO campi congelati); INSERT nuova `commessa_versioni` (`azione='ripristino'`, `modificato_da` = platform admin user, snapshot = stato applicato, diff vs stato precedente); audit con metadata `{platform:true, ripristino_da_versione:<n>}`; revalidate. Return `{ ok }` / `{ ok:false, error }`.
- [ ] **Step 2: Typecheck** → PASS.
- [ ] **Step 3: Commit** `feat(admin): ripristinaVersione commessa (solo superadmin, solo contenuti)`.

### Task 7: Hook versione 1 alla creazione

**Files:**
- Modify: `apps/web/app/_actions/crea-commessa.ts` (dopo insert commessa + voci, prima del return)

- [ ] **Step 1: Aggiungere** scrittura best-effort della versione 1: costruire `snapshot` dallo stato appena creato, RPC `genera_versione_commessa` (sarà 1), INSERT `commessa_versioni` `azione='creazione'`, `modificato_da=ctx.userId`. Avvolgere in try/catch non-fatale (come l'audit esistente).
- [ ] **Step 2: Typecheck** → PASS.
- [ ] **Step 3: Commit** `feat(commesse): scrive versione 1 (creazione) alla creazione commessa`.

---

## FASE 4 — UI condivisa

### Task 8: Core editor condiviso

**Files:**
- Create: `apps/web/app/_components/commessa-editor/types.ts`
- Create: `apps/web/app/_components/commessa-editor/commessa-editor-core.tsx`
- Reference: `apps/web/app/_components/voice-review.tsx` (VoiceReview/VociPicker), `media-attach-section.tsx`

- [ ] **Step 1: `types.ts`** — definire `CommessaEditValue` (cliente, indirizzoCantiere, descrizioneFinale, noteIniziali, isCritica, stato, responsabileId, referenti, vociPresenti: number[] (locked), vociAggiunte: number[]) e props del core (`value`, `onChange`, `vociCatalogo`, `nomeCartellaFrozen: string`, `online: boolean`, `onSubmit`).
- [ ] **Step 2: `commessa-editor-core.tsx`** — `'use client'`. Renderizza i campi riusando dove possibile `VociPicker` (con voci presenti **bloccate**, selezionabili solo le nuove) + sezione cliente + descrizione + note + referenti + `MediaAttachSection` (target = `{commessaId}`). Mostra avviso read-only del `nome_cartella` con testo: "Il nome della cartella resta invariato per sempre (rinominarla romperebbe i file su Nextcloud)." Banner offline se `!online` (riusare pattern esistente) che disabilita voce e submit. Nessuna logica di rete: solo stato + callback `onSubmit(value)`.
- [ ] **Step 3: Typecheck** → PASS.
- [ ] **Step 4: Commit** `feat(ui): core editor commessa condiviso (campi + voci append-only + media)`.

### Task 9: Dialog condiviso "Aggiungi tipologie"

**Files:**
- Create: `apps/web/app/_components/aggiungi-tipologie-dialog.tsx`

- [ ] **Step 1: Implementare** `'use client'` un Dialog (desktop) / Sheet (mobile) — accetta `variant: 'dialog'|'sheet'`, `commessaId`, `vociPresenti: number[]`, `vociCatalogo`, `presets`. Riusa `VociPicker`/preset; voci presenti **bloccate**. Pulsante Conferma → step di conferma con messaggio: "L'aggiunta di N nuove tipologie creerà le relative cartelle e strutture collegate su Nextcloud. Confermi?" → chiama server action `aggiungiTipologie`, poi `router.refresh()`. Stato pending + errori.
- [ ] **Step 2: Typecheck** → PASS.
- [ ] **Step 3: Commit** `feat(ui): dialog/sheet condiviso aggiungi tipologie (append-only + conferma cartelle)`.

---

## FASE 5 — Wiring desktop (office)

### Task 10: Pagina edit desktop

**Files:**
- Create: `apps/web/app/office/commesse/[id]/modifica/page.tsx` (+ `_components/edit-client.tsx`)

- [ ] **Step 1:** Server component carica commessa + cliente + referenti + voci + catalogo voci + preset; passa al client `edit-client.tsx` che monta `CommessaEditorCore` (tutte le sezioni in vista) e su `onSubmit` chiama `aggiornaCommessaCompleta`. Redirect a `/office/commesse/[id]` al successo.
- [ ] **Step 2:** Typecheck → PASS.
- [ ] **Step 3:** Commit `feat(office): pagina modifica commessa (editor completo)`.

### Task 11: Entrypoint office + rimozione mini-dialog

**Files:**
- Modify: `apps/web/app/office/commesse/[id]/page.tsx`
- Delete: `apps/web/app/office/commesse/[id]/_components/commessa-edit-dialog.tsx`

- [ ] **Step 1:** Sostituire il bottone che apriva `CommessaEditDialog` con un link a `/office/commesse/[id]/modifica`. Rimuovere import e file del mini-dialog. Verificare che nessun altro punto importi `CommessaEditDialog` (grep).
- [ ] **Step 2:** Typecheck → PASS.
- [ ] **Step 3:** Commit `feat(office): "Modifica" apre l'editor completo; rimosso mini-dialog`.

### Task 12: Azione rapida tipologie su Fasi (office)

**Files:**
- Modify: `apps/web/app/office/commesse/[id]/fasi/page.tsx`
- Modify/replace: `apps/web/app/office/commesse/[id]/fasi/_components/aggiungi-fase.tsx`

- [ ] **Step 1:** Affiancare/sostituire `AggiungiFaseButton` con `AggiungiTipologieDialog variant="dialog"` (selezione multipla + preset + conferma cartelle). Mantenere il comportamento append-only. Se `aggiungiVoce` legacy resta usata altrove, lasciarla; altrimenti deprecare.
- [ ] **Step 2:** Typecheck → PASS.
- [ ] **Step 3:** Commit `feat(office): azione rapida tipologie su tab Fasi (bulk + conferma)`.

---

## FASE 6 — Wiring mobile (PWA)

### Task 13: Wizard edit mobile (3 step precompilato)

**Files:**
- Create: `apps/web/app/mobile/commessa/[id]/modifica/page.tsx` (+ `_components/edit-wizard.tsx`)
- Reference: `apps/web/app/mobile/voice-intake/_components/voice-intake-flow.tsx`

- [ ] **Step 1:** Server component carica gli stessi dati del desktop; client `edit-wizard.tsx` con 3 step: (1) **Rivedi** = `CommessaEditorCore` in modalità campi (riuso `VoiceReview`-style) precompilato + pulsante voce **opzionale** (riusa `VoiceRecorder` → `/api/voice/extract`, merge sui campi; disabilitato offline con messaggio "Offline: match AI non disponibile, esci e riprova quando torni online"), (2) **Media** (`MediaAttachSection` target `{commessaId}`), (3) **Conferma e salva** → `aggiornaCommessaCompleta`. Freccia indietro = `ArrowLeft`. Avviso `nome_cartella` invariato.
- [ ] **Step 2:** Typecheck → PASS.
- [ ] **Step 3:** Commit `feat(mobile): wizard modifica commessa 3 step precompilato (voce opzionale)`.

### Task 14: Entrypoint mobile + azione rapida tipologie

**Files:**
- Modify: `apps/web/app/mobile/commessa/[id]/page.tsx`
- (eventuale) Delete/deprecate: `apps/web/app/mobile/commessa/[id]/_components/commessa-edit-mobile.tsx`

- [ ] **Step 1:** "Modifica commessa" → naviga a `/mobile/commessa/[id]/modifica`. Aggiungere azione rapida "Aggiungi tipologie" che apre `AggiungiTipologieDialog variant="sheet"` (le voci oggi non sono mostrate sul mobile: l'azione vive nell'header o nel menu della scheda). Rimuovere/deprecare il vecchio `commessa-edit-mobile` se non più referenziato.
- [ ] **Step 2:** Typecheck → PASS.
- [ ] **Step 3:** Commit `feat(mobile): entrypoint modifica completa + azione rapida tipologie`.

---

## FASE 7 — Storico (Cronologia)

### Task 15: Tab Cronologia → storico versioni + restore

**Files:**
- Modify: `apps/web/app/office/commesse/[id]/cronologia/page.tsx`
- Create: `apps/web/app/office/commesse/[id]/cronologia/_components/ripristina-button.tsx`

- [ ] **Step 1:** Server component: query `commessa_versioni` per `commessa_id` (order `versione desc`), oltre/invece dell'audit. Render per riga: `versione`, `fmtDataOra(created_at)` (Europe/Rome), `modificato_da_nome` (o "sistema"), `azione` (label IT), e il `diff` come elenco "Campo: da → a" (usare " → " ASCII, **mai** "—"). Determinare `isPlatformAdmin` server-side (`is_platform_admin()` via funzione/guard) per mostrare il pulsante restore.
- [ ] **Step 2:** `ripristina-button.tsx` (`'use client'`): visibile solo se `isPlatformAdmin`; conferma "Ripristina i contenuti di questa versione? Le tipologie e le cartelle non verranno modificate." → chiama `ripristinaVersione`, `router.refresh()`.
- [ ] **Step 3:** Typecheck → PASS.
- [ ] **Step 4:** Commit `feat(office): storico versioni in Cronologia + ripristino superadmin`.

---

## FASE 8 — Backfill v1 + verifica produzione

### Task 16: Script backfill versione 1

**Files:**
- Create: `scripts/backfill-versioni-v1.mjs`
- Reference: `scripts/reset-tenant-data.mjs` (pattern connessione service)

- [ ] **Step 1:** Scrivere script idempotente: per ogni commessa SENZA righe in `commessa_versioni`, costruire snapshot dallo stato attuale e INSERT versione 1 `azione='creazione'`, `modificato_da=NULL`, `modificato_da_nome='sistema'`. Supportare `--dry-run`. Usare connessione service-role (env già presenti).
- [ ] **Step 2:** `node scripts/backfill-versioni-v1.mjs --dry-run` → stampa conteggio commesse da popolare, nessuna scrittura.
- [ ] **Step 3:** Commit `chore(scripts): backfill versione 1 commesse esistenti (idempotente, dry-run)`.

### Task 17: Verifica end-to-end (produzione, mirata)

- [ ] **Step 1: Apply migration** (umano): `supabase db push` o `psql`. Confermare tabella + RLS create. Aggiornare `schema_migrations` se serve per allineare al file.
- [ ] **Step 2: Build** `pnpm --filter @kommessa/web build` → PASS. Deploy via `git push origin main`.
- [ ] **Step 3: Backfill** dry-run poi run reale; verificare che ogni commessa abbia v1.
- [ ] **Step 4: Test su una commessa reale di test:**
  - Edit desktop: cambia descrizione/indirizzo/note/referenti → salva → ricarica → persistito. Verifica `codice_interno`/`nome_cartella`/`cloud_folder_path` invariati (query DB).
  - Aggiungi una tipologia (desktop e mobile) → conferma messaggio cartelle → verifica nuova riga `commessa_voci` + cartella creata su Nextcloud + versione `aggiunta_tipologie`.
  - Edit mobile wizard: precompilato, salva senza dettare; poi prova voce opzionale online.
  - Cronologia: vede versioni, diff corretto, date in Europe/Rome.
  - Ripristino (come superadmin): ripristina una versione → contenuti tornano, voci/cartelle invariate, nuova versione `ripristino`.
  - Offline (mobile): banner mostrato, voce e salvataggio disabilitati.
  - Verifica che **non sia possibile rimuovere** voci da nessun percorso.
- [ ] **Step 5:** Aggiornare la memoria (`MEMORY.md` + file dedicato) con la feature deployata. Commit doc se previsto.

---

## Self-Review (compilato)

- **Spec coverage:** A (edit completo desktop+mobile) → Task 8,10,11,13,14. B (versioning) → Task 1,4,5,6,7,15,16. C (tipologie append-only + avviso) → Task 5,9,12,14. Backfill v1 → Task 16. Frozen fields/append-only/online-only → ribaditi in ogni task rilevante. Restore solo-contenuti + superadmin → Task 6,15.
- **Placeholder scan:** i task UI (8-15) contengono istruzioni precise + riferimenti ai componenti reali; il codice letterale completo dei componenti dipende dalle firme verificate in Task 0 (per questo Task 0 è bloccante). Migration e helper hanno codice completo.
- **Type consistency:** `aggiungiVociEProvisiona` (Task 3) usato da Task 4 e 5; `CommessaSnapshot`/`diffSnapshot` (Task 2) usati da Task 4,5,6; `CommessaEditorCore` (Task 8) usato da Task 10,13; `AggiungiTipologieDialog` (Task 9) usato da Task 12,14; `genera_versione_commessa` (Task 1) usato da Task 4,5,6,7.

## Note di rischio
- Task 0 è bloccante: senza le firme reali di `provisionaCartelle`/`VoiceReview` il codice UI/helper va adattato.
- Provisioning cartelle best-effort: il DB deve restare consistente anche se Nextcloud è giù.
- Apply migration PRIMA del deploy del codice che la usa.
