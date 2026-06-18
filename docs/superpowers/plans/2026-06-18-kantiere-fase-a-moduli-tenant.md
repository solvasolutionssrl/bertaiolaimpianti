# Kantiere — Fase A: Moduli per tenant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introdurre un interruttore di "moduli per tenant" così che il super-admin possa accendere/spegnere il modulo `kantiere` per ogni tenant, lasciando Bertaiola (solo `base`) invariato.

**Architecture:** Nuova tabella `tenant_modules` (tenant-scoped, RLS). Una funzione pura `isModuleActive()` in `@kommessa/api` (unit-testata con Vitest). Un wrapper server request-cached `tenantHasModule()` in `apps/web`. Una server action super-admin con audit + una tab "Moduli" nel pannello `/admin/tenants/[id]`. `base` è sempre attivo (implicito); solo i moduli opzionali (es. `kantiere`) hanno una riga in tabella.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS), Zod, Vitest (introdotto qui), TypeScript.

**Riferimento spec:** `docs/superpowers/specs/2026-06-18-kantiere-tesserino-digitale-design.md` (sez. 2).

**Vincolo produzione:** lavoro sul branch `feat/kantiere-tesserino-digitale`. `main`/Bertaiola NON si tocca. Le migration al DB cloud le applica l'umano al merge; in locale si testa con `supabase db reset` (stack locale). Il modulo `kantiere` nasce spento → nessun impatto su Bertaiola.

---

### Task 1: Infrastruttura di test (Vitest in `packages/api`)

**Files:**
- Modify: `packages/api/package.json`
- Create: `packages/api/vitest.config.ts`
- Modify: `package.json` (root)
- Create: `packages/api/src/sanity.test.ts` (temporaneo, rimosso a fine task)

- [ ] **Step 1: Aggiungi Vitest come devDependency di `packages/api`**

Esegui dalla root:

```bash
pnpm --filter @kommessa/api add -D vitest@^2.1.0
```

- [ ] **Step 2: Crea la config Vitest**

Create `packages/api/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Aggiungi lo script `test` a `packages/api/package.json`**

In `packages/api/package.json`, dentro `"scripts"`, aggiungi `test` accanto a `lint`/`typecheck`:

```json
  "scripts": {
    "lint": "eslint src --ext .ts,.tsx",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 4: Aggiungi lo script `test` alla root (orchestrazione turbo)**

In `package.json` (root), dentro `"scripts"`, aggiungi:

```json
    "test": "turbo run test",
```

- [ ] **Step 5: Crea un test sanity per verificare il runner**

Create `packages/api/src/sanity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('vitest sanity', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Esegui il test sanity**

Run: `pnpm --filter @kommessa/api test`
Expected: PASS — 1 test passato (`vitest sanity > runs`).

- [ ] **Step 7: Rimuovi il test sanity**

```bash
rm "packages/api/src/sanity.test.ts"
```

- [ ] **Step 8: Commit**

```bash
git add packages/api/package.json packages/api/vitest.config.ts package.json pnpm-lock.yaml
git commit -m "chore(test): setup Vitest in @kommessa/api"
```

---

### Task 2: Logica pura dei moduli (`isModuleActive`) — TDD

**Files:**
- Test: `packages/api/src/modules.test.ts`
- Create: `packages/api/src/modules.ts`
- Modify: `packages/api/package.json` (exports map)

- [ ] **Step 1: Scrivi il test che fallisce**

Create `packages/api/src/modules.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isModuleActive, MODULE_CODES } from './modules';

describe('isModuleActive', () => {
  it('base è sempre attivo, anche senza righe', () => {
    expect(isModuleActive([], 'base')).toBe(true);
  });

  it('kantiere è inattivo se non esiste alcuna riga', () => {
    expect(isModuleActive([], 'kantiere')).toBe(false);
  });

  it('kantiere è attivo se esiste una riga attiva', () => {
    expect(
      isModuleActive([{ module_code: 'kantiere', attivo: true }], 'kantiere'),
    ).toBe(true);
  });

  it('kantiere è inattivo se la riga esiste ma attivo=false', () => {
    expect(
      isModuleActive([{ module_code: 'kantiere', attivo: false }], 'kantiere'),
    ).toBe(false);
  });

  it('ignora righe di altri moduli', () => {
    expect(
      isModuleActive([{ module_code: 'altro', attivo: true }], 'kantiere'),
    ).toBe(false);
  });

  it('MODULE_CODES contiene base e kantiere', () => {
    expect(MODULE_CODES).toEqual(['base', 'kantiere']);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `pnpm --filter @kommessa/api test`
Expected: FAIL — `Failed to resolve import './modules'` (file non ancora creato).

- [ ] **Step 3: Implementa la logica pura**

Create `packages/api/src/modules.ts`:

```ts
/**
 * Moduli applicativi attivabili per tenant.
 *
 * - `base`   : il prodotto attuale (commesse, foto, ticketing, ecc.).
 *              Sempre attivo per ogni tenant — NON ha una riga in tabella.
 * - `kantiere`: Tesserino Digitale (dipendenti, squadre, presenze/ore, QR).
 *              Opzionale: attivo solo se esiste una riga `attivo=true`.
 */
export type ModuleCode = 'base' | 'kantiere';

export const MODULE_CODES: ModuleCode[] = ['base', 'kantiere'];

/** Moduli che richiedono una riga esplicita in `tenant_modules` per attivarsi. */
export const OPTIONAL_MODULE_CODES: Exclude<ModuleCode, 'base'>[] = ['kantiere'];

export interface TenantModuleRow {
  module_code: string;
  attivo: boolean;
}

/**
 * `base` è sempre attivo. Gli altri moduli sono attivi solo se in `rows`
 * esiste una riga con quel `module_code` e `attivo=true`.
 */
export function isModuleActive(
  rows: TenantModuleRow[],
  code: ModuleCode,
): boolean {
  if (code === 'base') return true;
  return rows.some((r) => r.module_code === code && r.attivo);
}
```

- [ ] **Step 4: Aggiungi l'export subpath al package**

In `packages/api/package.json`, nella mappa `"exports"`, aggiungi la riga `./modules` (dopo `./tenant`):

```json
  "exports": {
    ".": "./src/index.ts",
    "./client": "./src/client.ts",
    "./server": "./src/server.ts",
    "./service": "./src/service.ts",
    "./types": "./src/types/index.ts",
    "./schemas": "./src/schemas/index.ts",
    "./tenant": "./src/tenant.ts",
    "./modules": "./src/modules.ts"
  },
```

- [ ] **Step 5: Esegui i test e verifica che passano**

Run: `pnpm --filter @kommessa/api test`
Expected: PASS — 6 test passati.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/modules.ts packages/api/src/modules.test.ts packages/api/package.json
git commit -m "feat(kantiere): logica pura moduli per tenant (isModuleActive)"
```

---

### Task 3: Migration `tenant_modules`

**Files:**
- Create: `supabase/migrations/20260619000000_tenant_modules.sql`

- [ ] **Step 1: Scrivi il file SQL**

Create `supabase/migrations/20260619000000_tenant_modules.sql`:

```sql
-- =====================================================================
-- 20260619000000_tenant_modules.sql
--
-- Moduli applicativi attivabili per tenant (Fase A modulo "Kantiere").
--
-- 'base' NON ha riga qui (è implicitamente sempre attivo).
-- I moduli opzionali (es. 'kantiere') esistono come riga con attivo bool.
-- Riga mancante o attivo=false => modulo spento per quel tenant.
--
-- Solo il super-admin (service-role) scrive. Admin/office del tenant
-- possono leggere i moduli del proprio tenant.
-- =====================================================================

create table if not exists public.tenant_modules (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  module_code   text not null,
  attivo        boolean not null default false,
  config        jsonb not null default '{}'::jsonb,
  configured_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, module_code)
);

comment on table public.tenant_modules is
  'Moduli applicativi opzionali attivati per tenant. base e'' implicito (sempre on).';

create index if not exists tenant_modules_tenant_idx
  on public.tenant_modules (tenant_id);

-- trigger updated_at (riusa la funzione esistente public.tg_set_updated_at())
drop trigger if exists trg_tenant_modules_updated_at on public.tenant_modules;
create trigger trg_tenant_modules_updated_at
  before update on public.tenant_modules
  for each row execute function public.tg_set_updated_at();

alter table public.tenant_modules enable row level security;

-- Lettura: admin/office dello stesso tenant
drop policy if exists tenant_modules_tenant_read on public.tenant_modules;
create policy tenant_modules_tenant_read on public.tenant_modules
  for select
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in (
      'owner'::public.app_role,
      'admin'::public.app_role,
      'office'::public.app_role
    )
  );

-- Lettura cross-tenant per platform admin
drop policy if exists tenant_modules_platform_admin_read on public.tenant_modules;
create policy tenant_modules_platform_admin_read on public.tenant_modules
  for select
  using (public.is_platform_admin());

-- Nota: le scritture avvengono via service-role (super-admin action),
-- che bypassa RLS. Nessuna policy di write per i ruoli tenant.
```

- [ ] **Step 2: (verifica già fatta) funzione trigger confermata**

La funzione `public.tg_set_updated_at()` è definita in `supabase/migrations/20260101000100_tenants.sql:37` ed è la stessa riusata da tutte le tabelle (convenzione trigger `trg_<tabella>_updated_at`). Nessuna azione: il file SQL sopra la usa già correttamente.

- [ ] **Step 3: Applica e valida in locale (se stack Supabase locale disponibile)**

Run:

```bash
pnpm supabase:start
supabase db reset
```

Expected: il reset riapplica tutte le migration senza errori, inclusa `20260619000000_tenant_modules`. Se lo stack locale non è disponibile, salta questo step: la migration verrà validata dall'umano e applicata al cloud al merge (vedi header del piano).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260619000000_tenant_modules.sql
git commit -m "feat(kantiere): migration tenant_modules (interruttore moduli per tenant)"
```

---

### Task 4: Helper server `tenantHasModule` (request-cached)

**Files:**
- Create: `apps/web/app/_lib/modules.ts`

- [ ] **Step 1: Implementa il wrapper server cached**

Create `apps/web/app/_lib/modules.ts`:

```ts
import 'server-only';
import { cache } from 'react';
import { createServerSupabase } from '@kommessa/api/server';
import {
  isModuleActive,
  type ModuleCode,
  type TenantModuleRow,
} from '@kommessa/api/modules';
import { requireTenantContextCached } from './tenant-cache';

/**
 * Righe `tenant_modules` del tenant corrente, deduplicate per request
 * (React.cache). Letto via RLS (admin/office) — sufficiente per il gating
 * nei layout/route, che girano per utenti autenticati del tenant.
 */
export const getTenantModulesCached = cache(
  async (): Promise<TenantModuleRow[]> => {
    const ctx = await requireTenantContextCached();
    const supabase = createServerSupabase();
    const { data } = await supabase
      .from('tenant_modules')
      .select('module_code, attivo')
      .eq('tenant_id', ctx.tenantId);
    return ((data ?? []) as unknown) as TenantModuleRow[];
  },
);

/** True se il modulo è attivo per il tenant corrente. `base` sempre true. */
export async function tenantHasModule(code: ModuleCode): Promise<boolean> {
  if (code === 'base') return true;
  const rows = await getTenantModulesCached();
  return isModuleActive(rows, code);
}
```

- [ ] **Step 2: Verifica il typecheck del workspace web**

Run: `pnpm --filter @kommessa/web typecheck`
Expected: PASS (nessun errore TypeScript). Il `.from('tenant_modules')` può non essere nei tipi generati: il cast `as unknown as TenantModuleRow[]` lo gestisce; se Supabase tipizza `.from` con union di tabelle note e segnala `tenant_modules` sconosciuta, lascia il `.from('tenant_modules' as never)`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/_lib/modules.ts
git commit -m "feat(kantiere): helper server tenantHasModule (request-cached)"
```

---

### Task 5: Server action super-admin `aggiornaModuloTenant`

**Files:**
- Modify: `apps/web/app/admin/_actions/tenants.ts`

- [ ] **Step 1: Aggiungi schema Zod + action in fondo al file**

In `apps/web/app/admin/_actions/tenants.ts`, aggiungi in fondo (il file ha già `z`, `requirePlatformAdmin`, `createServiceSupabase`, `auditPlatform`, `revalidatePath` importati/definiti — riusali, non re-importarli):

```ts
const TENANT_MODULE_SCHEMA = z.object({
  tenantId: z.string().uuid(),
  moduleCode: z.enum(['kantiere']),
  attivo: z.boolean(),
});

/**
 * Accende/spegne un modulo opzionale per un tenant. Upsert su
 * (tenant_id, module_code). Solo super-admin. base non passa di qui.
 */
export async function aggiornaModuloTenant(input: {
  tenantId: string;
  moduleCode: 'kantiere';
  attivo: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requirePlatformAdmin();
  const parsed = TENANT_MODULE_SCHEMA.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Input non valido',
    };
  }
  const supabase = createServiceSupabase();

  const { data: prev } = await supabase
    .from('tenant_modules')
    .select('attivo')
    .eq('tenant_id', parsed.data.tenantId)
    .eq('module_code', parsed.data.moduleCode)
    .maybeSingle();
  const previousAttivo =
    (prev as { attivo?: boolean } | null)?.attivo ?? false;

  const { error } = await supabase.from('tenant_modules').upsert(
    {
      tenant_id: parsed.data.tenantId,
      module_code: parsed.data.moduleCode,
      attivo: parsed.data.attivo,
      configured_at: new Date().toISOString(),
    } as never,
    { onConflict: 'tenant_id,module_code' },
  );
  if (error) return { ok: false, error: error.message };

  await auditPlatform({
    actorUserId: admin.userId,
    actorEmail: admin.email,
    tenantId: parsed.data.tenantId,
    entityType: 'tenant',
    entityId: parsed.data.tenantId,
    action: 'tenant.module.update',
    before: { module_code: parsed.data.moduleCode, attivo: previousAttivo },
    after: { module_code: parsed.data.moduleCode, attivo: parsed.data.attivo },
  });

  revalidatePath(`/admin/tenants/${parsed.data.tenantId}`);
  return { ok: true };
}
```

- [ ] **Step 2: Verifica typecheck**

Run: `pnpm --filter @kommessa/web typecheck`
Expected: PASS. (Se `auditPlatform` non è nello scope del file, controlla il nome reale dell'helper di audit in cima al file e allinealo.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/admin/_actions/tenants.ts
git commit -m "feat(kantiere): action super-admin aggiornaModuloTenant + audit"
```

---

### Task 6: Tab "Moduli" nel pannello super-admin + wiring page

**Files:**
- Create: `apps/web/app/admin/tenants/[id]/_components/tab-moduli.tsx`
- Modify: `apps/web/app/admin/tenants/[id]/page.tsx`

- [ ] **Step 1: Crea il client component della tab**

Create `apps/web/app/admin/tenants/[id]/_components/tab-moduli.tsx`:

```tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Badge, Button, Card, CardContent } from '@kommessa/ui';
import { aggiornaModuloTenant } from '../../../_actions/tenants';
import { useAlert } from '@/app/_components/confirm-provider';

export function TabModuli({
  tenantId,
  kantiereAttivo,
}: {
  tenantId: string;
  kantiereAttivo: boolean;
}) {
  const router = useRouter();
  const showAlert = useAlert();
  const [pending, start] = React.useTransition();
  const [attivo, setAttivo] = React.useState(kantiereAttivo);
  const dirty = attivo !== kantiereAttivo;

  const apply = () => {
    start(async () => {
      const res = await aggiornaModuloTenant({
        tenantId,
        moduleCode: 'kantiere',
        attivo,
      });
      if (!res.ok) {
        await showAlert({ title: 'Errore', body: res.error });
        return;
      }
      router.refresh();
    });
  };

  return (
    <Card>
      <CardContent className="space-y-5 py-6">
        {/* base: sempre attivo, non modificabile */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Base</p>
            <p className="text-[11px] text-muted-foreground">
              Commesse, foto, ticketing. Sempre attivo per ogni tenant.
            </p>
          </div>
          <Badge variant="secondary">Sempre attivo</Badge>
        </div>

        {/* kantiere: toggle */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Kantiere — Tesserino Digitale</p>
            <p className="text-[11px] text-muted-foreground">
              Dipendenti, squadre, presenze/ore, QR cantiere. Additivo a base.
            </p>
          </div>
          <label className="inline-flex shrink-0 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={attivo}
              onChange={(e) => setAttivo(e.target.checked)}
              disabled={pending}
            />
            <span className="text-xs text-muted-foreground">
              {attivo ? 'Attivo' : 'Spento'}
            </span>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-[11px] leading-snug text-muted-foreground">
            L&apos;attivazione è immediata. Lo storico audit registra il cambio
            e l&apos;utente platform admin.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {dirty ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAttivo(kantiereAttivo)}
                disabled={pending}
              >
                Annulla
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={apply}
              disabled={pending || !dirty}
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {pending ? 'Salvo…' : 'Applica'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Importa la tab nella page**

In `apps/web/app/admin/tenants/[id]/page.tsx`, aggiungi l'import accanto agli altri tab (dopo la riga `import { TabAi } ...`):

```tsx
import { TabModuli } from './_components/tab-moduli';
```

- [ ] **Step 3: Carica le righe `tenant_modules` nella query della page**

In `apps/web/app/admin/tenants/[id]/page.tsx`, aggiungi una query dentro il `Promise.all` (dopo la query `audit_events`). Aggiorna anche la destrutturazione dell'array per includere `moduliRes`:

```tsx
  const [tenantRes, usageRes, quotaRes, plansRes, utentiRes, auditRes, moduliRes] =
    await Promise.all([
      // ...query esistenti invariate...
      supabase
        .from('audit_events')
        .select('id, created_at, entity_type, entity_id, action, actor_role, metadata')
        .eq('tenant_id', params.id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('tenant_modules')
        .select('module_code, attivo')
        .eq('tenant_id', params.id),
    ]);
```

E sotto, accanto a `const audit = ...`, calcola il flag kantiere:

```tsx
  const moduli = (moduliRes.data ?? []) as any[];
  const kantiereAttivo = moduli.some(
    (m) => m.module_code === 'kantiere' && m.attivo === true,
  );
```

- [ ] **Step 4: Monta trigger + contenuto della tab**

In `apps/web/app/admin/tenants/[id]/page.tsx`, aggiungi il `TabsTrigger` nella `TabsList` (es. dopo `ai`):

```tsx
        <TabsTrigger value="moduli">Moduli</TabsTrigger>
```

e il `TabsContent` (accanto agli altri):

```tsx
      <TabsContent value="moduli">
        <TabModuli tenantId={tenant.id} kantiereAttivo={kantiereAttivo} />
      </TabsContent>
```

- [ ] **Step 5: Verifica typecheck + build**

Run: `pnpm --filter @kommessa/web typecheck && pnpm --filter @kommessa/web build`
Expected: PASS, nessun errore.

- [ ] **Step 6: Verifica manuale (locale)**

Avvia `pnpm dev`, accedi come super-admin (`dev@solva.it` in dev), apri `/admin/tenants/<id-di-un-tenant-di-test>` → tab **Moduli**. Attiva "Kantiere", Applica.
Expected: toast assente/ok, la tab resta su "Attivo" dopo `router.refresh()`; ricaricando la pagina lo stato persiste. Verifica su Bertaiola che il toggle resti **spento** (non attivarlo).

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/admin/tenants/[id]/_components/tab-moduli.tsx "apps/web/app/admin/tenants/[id]/page.tsx"
git commit -m "feat(kantiere): tab Moduli nel pannello super-admin"
```

---

### Task 7: Rigenera i tipi DB + verifica finale

**Files:**
- Modify: `packages/api/src/types/database.generated.ts` (auto-generato)

- [ ] **Step 1: Rigenera i tipi (solo se stack Supabase locale disponibile e migration applicata)**

Run: `pnpm supabase:types`
Expected: `database.generated.ts` ora include la tabella `tenant_modules`. Questo permette di rimuovere i cast `as never`/`as any` introdotti nei task 4–6 dove non più necessari (opzionale: rimuovili solo se il typecheck resta verde). Se lo stack locale non è disponibile, salta: i cast mantengono il codice compilabile e l'umano rigenererà i tipi dopo l'apply al cloud.

- [ ] **Step 2: Verifica finale dell'intero workspace**

Run: `pnpm test && pnpm --filter @kommessa/web typecheck && pnpm --filter @kommessa/web build`
Expected: test verdi (incluso `isModuleActive`), typecheck e build OK.

- [ ] **Step 3: Commit (se i tipi sono cambiati)**

```bash
git add packages/api/src/types/database.generated.ts
git commit -m "chore(types): rigenera tipi DB con tenant_modules"
```

---

## Definition of Done (Fase A)

- [ ] Tabella `tenant_modules` creata con RLS (lettura tenant admin/office + platform admin; scritture via service-role).
- [ ] `isModuleActive()` puro e unit-testato (Vitest verde).
- [ ] `tenantHasModule('kantiere')` server-side request-cached funzionante.
- [ ] Tab "Moduli" nel super-admin con toggle Kantiere + audit, immediato e persistente.
- [ ] Bertaiola resta con Kantiere **spento**; `main` non toccato; tutto su `feat/kantiere-tesserino-digitale`.
- [ ] `pnpm test`, typecheck e build verdi.

## Self-review note

Copertura spec sez. 2: tabella `tenant_modules` ✓, helper `tenantHasModule` ✓, tab super-admin "Moduli" ✓, base sempre-on / kantiere opzionale ✓, niente uso di `plans.features` ✓. Il gating delle ROUTE `kantiere` non è in Fase A perché quelle route non esistono ancora — verrà fatto nelle fasi D–F quando le route saranno create (ognuna importerà `tenantHasModule`). Nessun placeholder; tipi/firme coerenti (`ModuleCode`, `TenantModuleRow`, `aggiornaModuloTenant`) tra i task.
