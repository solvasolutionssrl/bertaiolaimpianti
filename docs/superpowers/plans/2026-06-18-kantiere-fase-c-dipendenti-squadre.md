# Kantiere — Fase C: Dipendenti + Squadre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Anagrafica dipendenti (login opzionale) + squadre per-commessa nell'area office, gated dal modulo `kantiere`, senza impatto su Bertaiola (modulo spento).

**Architecture:** Due tabelle (`dipendenti`, `commessa_squadra`) con RLS. Area office `/office/kantiere/*` gated da `tenantHasModule('kantiere')` + ruolo. Pannello squadra nella sidebar commessa, gated. Voce di menu condizionale. Server actions in stile esistente.

**Tech Stack:** Next.js 14 App Router, Supabase + RLS, Zod, `@kommessa/ui`, Vitest.

**Riferimento spec:** `docs/superpowers/specs/2026-06-18-kantiere-fase-c-dipendenti-squadre.md`.

**Vincolo produzione:** branch `feat/kantiere-tesserino-digitale`. File condivisi con Bertaiola (`office-shell-client.tsx`, `commessa-sidebar.tsx`, `office/layout.tsx`) si toccano in modo **additivo e gated**: per `hasKantiere=false` il comportamento resta identico. Migration additiva, apply cloud = umano.

---

### Task C1: Migration `dipendenti` + `commessa_squadra`

**Files:** Create `supabase/migrations/20260620000000_kantiere_dipendenti_squadre.sql`

- [ ] **Step 1: Scrivi il file SQL**

```sql
-- =====================================================================
-- 20260620000000_kantiere_dipendenti_squadre.sql
-- Fase C modulo Kantiere: anagrafica dipendenti + squadre per-commessa.
-- Additivo. Visibile solo ai tenant col modulo kantiere attivo (gating app).
-- =====================================================================

-- ---------- dipendenti (anagrafica, login opzionale) -----------------
create table if not exists public.dipendenti (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  user_id        uuid references public.users(id) on delete set null,
  nome           text not null,
  cognome        text not null,
  mansione       text,
  codice_interno text,
  badge_qr_token text,
  stato_attivo   boolean not null default true,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists dipendenti_tenant_idx on public.dipendenti (tenant_id);
create unique index if not exists dipendenti_user_unique
  on public.dipendenti (tenant_id, user_id) where user_id is not null;

drop trigger if exists trg_dipendenti_updated_at on public.dipendenti;
create trigger trg_dipendenti_updated_at
  before update on public.dipendenti
  for each row execute function public.tg_set_updated_at();

alter table public.dipendenti enable row level security;

drop policy if exists dipendenti_tenant_read on public.dipendenti;
create policy dipendenti_tenant_read on public.dipendenti
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists dipendenti_admin_write on public.dipendenti;
create policy dipendenti_admin_write on public.dipendenti
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists dipendenti_platform_admin_read on public.dipendenti;
create policy dipendenti_platform_admin_read on public.dipendenti
  for select using (public.is_platform_admin());

-- ---------- commessa_squadra (raggruppamento per-commessa) ------------
create table if not exists public.commessa_squadra (
  commessa_id        uuid not null references public.commesse(id) on delete cascade,
  dipendente_id      uuid not null references public.dipendenti(id) on delete cascade,
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  ruolo_commessa     text not null default 'membro' check (ruolo_commessa in ('capo','membro')),
  capo_dipendente_id uuid references public.dipendenti(id) on delete set null,
  assegnato_da       uuid references public.users(id) on delete set null,
  assegnato_at       timestamptz not null default now(),
  primary key (commessa_id, dipendente_id)
);

create index if not exists commessa_squadra_tenant_idx on public.commessa_squadra (tenant_id);
create index if not exists commessa_squadra_dip_idx on public.commessa_squadra (dipendente_id);

alter table public.commessa_squadra enable row level security;

drop policy if exists commessa_squadra_tenant_read on public.commessa_squadra;
create policy commessa_squadra_tenant_read on public.commessa_squadra
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists commessa_squadra_admin_write on public.commessa_squadra;
create policy commessa_squadra_admin_write on public.commessa_squadra
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists commessa_squadra_platform_admin_read on public.commessa_squadra;
create policy commessa_squadra_platform_admin_read on public.commessa_squadra
  for select using (public.is_platform_admin());
```

- [ ] **Step 2: Validazione statica (NO DB apply)**

```bash
grep -rn "tg_set_updated_at\|current_tenant_id\|current_role\|is_platform_admin" supabase/migrations | head
ls supabase/migrations | sort | tail -3
```
Expected: helper/funzioni esistono; il nuovo file ordina dopo `20260619010000_storage_r2_mode.sql`. NON applicare al DB.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260620000000_kantiere_dipendenti_squadre.sql
git commit -m "feat(kantiere): migration dipendenti + commessa_squadra (Fase C)"
```

---

### Task C2: Helper puro + server actions dipendenti

**Files:**
- Create: `apps/web/app/office/kantiere/_lib/dipendenti-display.ts` (+ `.test.ts` — usa Vitest di `@kommessa/api`? No: web non ha vitest). → Mettere l'helper PURO in `packages/api/src/kantiere.ts` per testarlo con Vitest già presente.
- Create: `packages/api/src/kantiere.ts` (+ `kantiere.test.ts`) e relativo export subpath.
- Create: `apps/web/app/office/_actions/dipendenti.ts`

- [ ] **Step 1: Test del helper puro (fallisce)**

Create `packages/api/src/kantiere.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { etichettaAccesso } from './kantiere';

describe('etichettaAccesso', () => {
  it('Con accesso se ha user_id', () => {
    expect(etichettaAccesso({ user_id: 'u1' })).toBe('Con accesso');
  });
  it('Solo timbratura se user_id null', () => {
    expect(etichettaAccesso({ user_id: null })).toBe('Solo timbratura');
    expect(etichettaAccesso({ user_id: undefined })).toBe('Solo timbratura');
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `pnpm --filter @kommessa/api test` → FAIL (cannot resolve './kantiere').

- [ ] **Step 3: Implementa l'helper**

Create `packages/api/src/kantiere.ts`:
```ts
/** Etichetta UI che distingue dipendenti con login app da quelli solo-timbratura. */
export function etichettaAccesso(d: { user_id?: string | null }): 'Con accesso' | 'Solo timbratura' {
  return d.user_id ? 'Con accesso' : 'Solo timbratura';
}
```

- [ ] **Step 4: Export subpath**

In `packages/api/package.json` `"exports"`, aggiungi: `"./kantiere": "./src/kantiere.ts"`.

- [ ] **Step 5: Run → PASS**

Run: `pnpm --filter @kommessa/api test` → tutti verdi.

- [ ] **Step 6: Server actions dipendenti**

Create `apps/web/app/office/_actions/dipendenti.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';

const BaseSchema = z.object({
  nome: z.string().min(1).max(80),
  cognome: z.string().min(1).max(80),
  mansione: z.string().max(120).optional().nullable(),
  codice_interno: z.string().max(60).optional().nullable(),
  user_id: z.string().uuid().optional().nullable(),
  stato_attivo: z.boolean().optional(),
  note: z.string().max(2000).optional().nullable(),
});

type Result = { ok: true; id?: string } | { ok: false; error: string };

async function guard() {
  const ctx = await requireTenantContext();
  if (!['admin', 'office'].includes(ctx.role)) throw new Error('FORBIDDEN');
  if (!(await tenantHasModule('kantiere'))) throw new Error('MODULO_OFF');
  return ctx;
}

export async function creaDipendente(input: unknown): Promise<Result> {
  const parsed = BaseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  const ctx = await guard();
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('dipendenti')
    .insert({
      tenant_id: ctx.tenantId,
      nome: parsed.data.nome,
      cognome: parsed.data.cognome,
      mansione: parsed.data.mansione ?? null,
      codice_interno: parsed.data.codice_interno ?? null,
      user_id: parsed.data.user_id ?? null,
      stato_attivo: parsed.data.stato_attivo ?? true,
      note: parsed.data.note ?? null,
    } as never)
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/dipendenti');
  return { ok: true, id: (data as { id: string }).id };
}

export async function aggiornaDipendente(input: unknown): Promise<Result> {
  const schema = BaseSchema.extend({ id: z.string().uuid() });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  await guard();
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('dipendenti')
    .update({
      nome: parsed.data.nome,
      cognome: parsed.data.cognome,
      mansione: parsed.data.mansione ?? null,
      codice_interno: parsed.data.codice_interno ?? null,
      user_id: parsed.data.user_id ?? null,
      stato_attivo: parsed.data.stato_attivo ?? true,
      note: parsed.data.note ?? null,
    } as never)
    .eq('id', parsed.data.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/dipendenti');
  return { ok: true };
}

export async function eliminaDipendente(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  await guard();
  const supabase = createServerSupabase();
  const { count } = await supabase
    .from('commessa_squadra')
    .select('dipendente_id', { count: 'exact', head: true })
    .eq('dipendente_id', parsed.data.id);
  if ((count ?? 0) > 0) {
    return { ok: false, error: `Dipendente assegnato a ${count} commesse: rimuovilo dalle squadre prima.` };
  }
  const { error } = await supabase.from('dipendenti').delete().eq('id', parsed.data.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/dipendenti');
  return { ok: true };
}
```
NOTE: se `.from('dipendenti'|'commessa_squadra')` non è nei tipi generati, usa `.from('dipendenti' as never)` ecc. (pattern del repo). Verifica l'import alias `@/app/_lib/modules` (se il repo non usa `@/`, usa il path relativo corretto, es. `../../_lib/modules`).

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @kommessa/web typecheck && pnpm --filter @kommessa/api test`. Expected: clean + verdi.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/kantiere.ts packages/api/src/kantiere.test.ts packages/api/package.json apps/web/app/office/_actions/dipendenti.ts
git commit -m "feat(kantiere): helper accesso + server actions dipendenti"
```

---

### Task C3: Area office `/office/kantiere` + pagina dipendenti + nav gated

**Files:**
- Create: `apps/web/app/office/kantiere/layout.tsx`
- Create: `apps/web/app/office/kantiere/dipendenti/page.tsx`
- Create: `apps/web/app/office/kantiere/dipendenti/_components/dipendenti-client.tsx`
- Modify: `apps/web/app/office/layout.tsx` (calcola `hasKantiere`, passalo allo shell)
- Modify: `apps/web/app/office/_components/office-shell-client.tsx` (voce nav condizionale)

- [ ] **Step 1: Layout gating** — `apps/web/app/office/kantiere/layout.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '../../_lib/modules';

export default async function KantiereLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenantContext();
  if (!['admin', 'office'].includes(ctx.role)) redirect('/office');
  if (!(await tenantHasModule('kantiere'))) redirect('/office');
  return <>{children}</>;
}
```

- [ ] **Step 2: Pagina dipendenti (server)** — `apps/web/app/office/kantiere/dipendenti/page.tsx`. Leggi `apps/web/app/office/clienti/page.tsx` per il pattern. Query i dipendenti del tenant + (per il select "collega ad account") gli `users` del tenant senza dipendente. Passa a un client component. Scheletro:
```tsx
import { createServerSupabase } from '@kommessa/api/server';
import { DipendentiClient } from './_components/dipendenti-client';

export const dynamic = 'force-dynamic';

export default async function DipendentiPage() {
  const supabase = createServerSupabase();
  const { data: dipendenti } = await supabase
    .from('dipendenti' as never)
    .select('id, nome, cognome, mansione, codice_interno, user_id, stato_attivo, note')
    .order('cognome');
  const { data: utenti } = await supabase
    .from('users')
    .select('id, display_name, role')
    .order('display_name');
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Dipendenti</h1>
        <p className="text-sm text-muted-foreground">Anagrafica del personale di cantiere.</p>
      </header>
      <DipendentiClient
        dipendenti={(dipendenti ?? []) as never[]}
        utenti={(utenti ?? []) as never[]}
      />
    </div>
  );
}
```

- [ ] **Step 3: Client component** — `apps/web/app/office/kantiere/dipendenti/_components/dipendenti-client.tsx`. Tabella/lista con: nome cognome, mansione, codice, **badge "Con accesso"/"Solo timbratura"** (usa `etichettaAccesso` da `@kommessa/api/kantiere`), stato attivo. Bottone "Nuovo dipendente" → `Dialog` (da `@kommessa/ui`) con form (nome, cognome, mansione, codice_interno, select "Collega ad account" opzionale tra `utenti`, checkbox attivo, note). Submit → `creaDipendente`/`aggiornaDipendente` via `useTransition`; errori via `useAlert` (`@/app/_components/confirm-provider`). Elimina con conferma → `eliminaDipendente`. Mirror dello stile dei dialog esistenti (es. `tab-ai.tsx` per useTransition + useAlert; clienti per le liste). Italiano. `'use client'`.

- [ ] **Step 4: Nav gated** — In `apps/web/app/office/layout.tsx`, calcola `const hasKantiere = await tenantHasModule('kantiere');` (import da `../_lib/modules`) e passalo a `OfficeShellClient` come prop `hasKantiere`. In `apps/web/app/office/_components/office-shell-client.tsx`, accetta la prop `hasKantiere?: boolean` e, nella costruzione del `NAV`, aggiungi la voce SOLO se `hasKantiere`:
```tsx
// dentro la build del NAV, additivo:
if (hasKantiere) {
  out.push({ id: 'kantiere', label: 'Kantiere', href: '/office/kantiere/dipendenti', icon: HardHat });
}
```
Importa un'icona Lucide adatta (es. `HardHat`) già nel modo in cui le altre icone sono importate nel file. NON cambiare la nav esistente: per `hasKantiere` falsy il NAV è identico a oggi.

- [ ] **Step 5: Typecheck + build**

Run: `pnpm --filter @kommessa/web typecheck && pnpm --filter @kommessa/web build`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/office/kantiere "apps/web/app/office/layout.tsx" apps/web/app/office/_components/office-shell-client.tsx
git commit -m "feat(kantiere): area office /kantiere + pagina dipendenti + voce menu gated"
```

---

### Task C4: Squadra per-commessa (actions + pannello sidebar gated)

**Files:**
- Create: `apps/web/app/office/_actions/commessa-squadre.ts`
- Create: `apps/web/app/office/commesse/[id]/_components/squadra-panel.tsx`
- Modify: `apps/web/app/office/commesse/[id]/_components/commessa-sidebar.tsx` (montaggio gated) + il layout che la alimenta (`apps/web/app/office/commesse/[id]/layout.tsx`) per caricare squadra + `hasKantiere`.

- [ ] **Step 1: Server actions squadra** — `apps/web/app/office/_actions/commessa-squadre.ts`. Mirror di `apps/web/app/_actions/commessa-tecnici.ts` (leggilo). Funzioni: `elencaSquadraCommessa(commessaId)`, `assegnaDipendenteSquadra({ commessaId, dipendenteId, ruolo_commessa, capo_dipendente_id })` (upsert su PK), `aggiornaRuoloSquadra(...)`, `rimuoviDaSquadra({ commessaId, dipendenteId })`. Stesso `guard()` (admin/office + modulo kantiere). `revalidatePath('/office/commesse/' + commessaId)`. Inserisci sempre `tenant_id = ctx.tenantId` e `assegnato_da = ctx.userId`. Cast `as never` sulle tabelle se non tipizzate.

- [ ] **Step 2: Pannello squadra** — `squadra-panel.tsx`. Leggi `apps/web/app/office/commesse/[id]/_components/tecnici-panel.tsx` e imitane stile/struttura (Card + lista + picker `Dialog`/`Select`). Mostra i membri raggruppati: capi in evidenza, membri sotto il rispettivo capo (campo `capo_dipendente_id`); chi non ha capo è "senza squadra". Picker per aggiungere un dipendente (Select tra i dipendenti attivi del tenant) con scelta ruolo (capo/membro) e, se membro, il capo di riferimento. Azioni: cambia ruolo, rimuovi. `'use client'`, italiano, `useTransition` + `useAlert`.

- [ ] **Step 3: Montaggio gated nella sidebar** — In `commessa-sidebar.tsx`, aggiungi `<SquadraPanel .../>` (dopo `TecniciPanel`) reso SOLO se una nuova prop `hasKantiere` è true. In `apps/web/app/office/commesse/[id]/layout.tsx`, calcola `hasKantiere = await tenantHasModule('kantiere')` e carica la squadra (`elencaSquadraCommessa`) + i dipendenti del tenant; passa entrambi (e `hasKantiere`) alla sidebar. Per `hasKantiere=false` (Bertaiola) NIENTE query extra e NIENTE pannello → comportamento identico a oggi (gate la query dietro `if (hasKantiere)`).

- [ ] **Step 4: Typecheck + build**

Run: `pnpm --filter @kommessa/web typecheck && pnpm --filter @kommessa/web build`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/office/_actions/commessa-squadre.ts "apps/web/app/office/commesse/[id]"
git commit -m "feat(kantiere): squadra per-commessa (actions + pannello sidebar gated)"
```

---

### Task C5: Verifica finale Fase C

- [ ] **Step 1:** `pnpm test && pnpm --filter @kommessa/web typecheck && pnpm --filter @kommessa/web build` → tutto verde.
- [ ] **Step 2: Bertaiola-safety** — verifica che i file condivisi siano gated: `git diff main..HEAD -- apps/web/app/office/_components/office-shell-client.tsx apps/web/app/office/commesse/[id]/_components/commessa-sidebar.tsx` e conferma a vista che ogni aggiunta è dietro `if (hasKantiere)` / prop falsy → nessun cambiamento per Bertaiola.

---

## Definition of Done (Fase C)

- [ ] Tabelle `dipendenti` + `commessa_squadra` con RLS (read tenant, write admin/office). Migration additiva non applicata al cloud.
- [ ] CRUD dipendenti in `/office/kantiere/dipendenti`, gated da modulo + ruolo; badge con-accesso/solo-timbratura.
- [ ] Voce menu "Kantiere" mostrata solo se modulo attivo; per Bertaiola assente.
- [ ] Squadra per-commessa: pannello nella sidebar commessa, gated; actions assegna/ruolo/rimuovi.
- [ ] Bertaiola invariato (file condivisi gated). `pnpm test`/typecheck/build verdi.

## Self-review

Copertura spec: tabelle ✓ (C1), helper+actions dipendenti ✓ (C2), UI dipendenti+nav gated ✓ (C3), squadra per-commessa ✓ (C4). Permesso granulare kantiere e UI mobile → fuori scope (Fase E), annotato. File condivisi toccati solo additivamente e gated → Bertaiola-safe (C5 lo verifica). Niente placeholder; identificatori coerenti (`tenantHasModule`, `etichettaAccesso`, `creaDipendente`, `commessa_squadra`, `hasKantiere`).
