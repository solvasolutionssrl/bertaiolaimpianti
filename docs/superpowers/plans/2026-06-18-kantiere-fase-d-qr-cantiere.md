# Kantiere Fase D — QR cantiere · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** QR univoco e permanente per commessa (tenant col modulo `kantiere`): generazione idempotente, stampa A4 con 3 template + anteprima, registro super-admin, landing di risoluzione.

**Architecture:** tabella `cantiere_qr` con token opaco + vincoli DB (unico globale, uno-attivo-per-commessa); logica pura in `@kommessa/api/kantiere-qr` (TDD); server actions office; UI stampa via `@media print` + `window.print()` (anteprima = stampa); registro admin cross-tenant; landing `/t/[token]`.

**Tech Stack:** Next.js 14 App Router, Supabase RLS, `qrcode` (server-side), Vitest. Spec: `docs/superpowers/specs/2026-06-18-kantiere-fase-d-qr-cantiere.md`.

**Convenzioni del repo (rispettare):** titolo commessa solo via `risolviTitoloCommessa()` (`apps/web/app/_lib/commessa-display.ts`), mai `nome_cartella` raw; date/ora con timezone `Europe/Rome`; tabelle non ancora nei tipi generati → cast `as never`; copy IT, niente "col"/trattino lungo "—". Gating come `dipendenti.ts` (office/admin + `tenantHasModule('kantiere')`).

---

### Task 1: Migration `cantiere_qr`

**Files:**
- Create: `supabase/migrations/20260621000000_cantiere_qr.sql`

- [ ] **Step 1: Scrivi la migration** (additiva, segui lo stile di `20260620000000_kantiere_dipendenti_squadre.sql`)

```sql
-- =====================================================================
-- 20260621000000_cantiere_qr.sql
-- Fase D modulo Kantiere: QR univoco e permanente per commessa.
-- Additivo. Gating app via modulo kantiere.
-- =====================================================================

create table if not exists public.cantiere_qr (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  commessa_id uuid not null references public.commesse(id) on delete cascade,
  token       text not null,
  attivo      boolean not null default true,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

create unique index if not exists cantiere_qr_token_unique on public.cantiere_qr (token);
create unique index if not exists cantiere_qr_one_active
  on public.cantiere_qr (commessa_id) where attivo;
create index if not exists cantiere_qr_tenant_idx on public.cantiere_qr (tenant_id);

alter table public.cantiere_qr enable row level security;

drop policy if exists cantiere_qr_tenant_read on public.cantiere_qr;
create policy cantiere_qr_tenant_read on public.cantiere_qr
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists cantiere_qr_office_write on public.cantiere_qr;
create policy cantiere_qr_office_write on public.cantiere_qr
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role)
  );

drop policy if exists cantiere_qr_platform_admin_read on public.cantiere_qr;
create policy cantiere_qr_platform_admin_read on public.cantiere_qr
  for select using (public.is_platform_admin());
```

- [ ] **Step 2: Verifica sintattica** — rileggi il file: nomi colonne/policy coerenti con la Fase C, niente `tg_set_updated_at` (qui non serve `updated_at`).
- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260621000000_cantiere_qr.sql
git commit -m "feat(kantiere): migration cantiere_qr (Fase D) — token permanente, uno-attivo-per-commessa"
```

> NB: l'apply al cloud lo fa l'umano (controller) via MCP dopo il merge dei task; non eseguire `db push`.

---

### Task 2: Logica pura `kantiere-qr.ts` (TDD)

**Files:**
- Create: `packages/api/src/kantiere-qr.ts`
- Test: `packages/api/src/kantiere-qr.test.ts`
- Modify: `packages/api/package.json` (export subpath, se serve come per `kantiere`)

- [ ] **Step 1: Test che falliscono**

```ts
import { describe, it, expect } from 'vitest';
import { qrUrl, statoQr, mascheraToken, risolviTemplateQr, TEMPLATE_QR } from './kantiere-qr';

describe('qrUrl', () => {
  it('compone origin + /t/token togliendo lo slash finale', () => {
    expect(qrUrl('https://app.test/', 'abc')).toBe('https://app.test/t/abc');
    expect(qrUrl('https://app.test', 'abc')).toBe('https://app.test/t/abc');
  });
});

describe('statoQr', () => {
  it('assente quando null', () => expect(statoQr(null)).toBe('assente'));
  it('attivo quando attivo=true', () => expect(statoQr({ attivo: true, revoked_at: null })).toBe('attivo'));
  it('revocato quando attivo=false', () =>
    expect(statoQr({ attivo: false, revoked_at: '2026-06-21T00:00:00Z' })).toBe('revocato'));
});

describe('mascheraToken', () => {
  it('maschera i token lunghi', () => {
    const t = 'abcdef0123456789wxyz';
    expect(mascheraToken(t)).toBe('abcdef…wxyz');
  });
  it('lascia invariati i token corti', () => expect(mascheraToken('abc')).toBe('abc'));
});

describe('risolviTemplateQr', () => {
  it('ritorna l’id valido', () => expect(risolviTemplateQr(TEMPLATE_QR[1]!.id)).toBe(TEMPLATE_QR[1]!.id));
  it('fallback al primo per id ignoto/null', () => {
    expect(risolviTemplateQr('boh')).toBe(TEMPLATE_QR[0]!.id);
    expect(risolviTemplateQr(null)).toBe(TEMPLATE_QR[0]!.id);
  });
});
```

- [ ] **Step 2: Esegui i test, verifica falliscono** — `cd packages/api && pnpm test kantiere-qr` → FAIL (modulo assente).
- [ ] **Step 3: Implementa `kantiere-qr.ts`**

```ts
export function qrUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/t/${token}`;
}

export function statoQr(
  row: { attivo: boolean; revoked_at: string | null } | null,
): 'assente' | 'attivo' | 'revocato' {
  if (!row) return 'assente';
  return row.attivo ? 'attivo' : 'revocato';
}

export function mascheraToken(token: string): string {
  if (token.length <= 12) return token;
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

export const TEMPLATE_QR = [
  { id: 'essenziale', nome: 'Essenziale', descrizione: 'Bianco, QR grande centrato, logo discreto.' },
  { id: 'cartello', nome: 'Cartello cantiere', descrizione: 'Fascia colorata col brand, riquadro QR, dati cantiere.' },
  { id: 'industriale', nome: 'Industriale', descrizione: 'Alto contrasto, testo grande, QR XXL leggibile da lontano.' },
] as const;

export function risolviTemplateQr(id: string | null | undefined): string {
  const ok = TEMPLATE_QR.some((t) => t.id === id);
  return ok ? (id as string) : TEMPLATE_QR[0]!.id;
}
```

- [ ] **Step 4: Esporta il subpath** — replica per `kantiere-qr` ciò che `package.json`/build fa per `kantiere` (controlla come è esposto `@kommessa/api/kantiere` e aggiungi l'equivalente, se necessario).
- [ ] **Step 5: Esegui i test** — `pnpm test kantiere-qr` → PASS. Poi `pnpm -w typecheck` (o turbo) verde.
- [ ] **Step 6: Commit**

```bash
git add packages/api/src/kantiere-qr.ts packages/api/src/kantiere-qr.test.ts packages/api/package.json
git commit -m "feat(kantiere): logica pura QR (qrUrl/statoQr/mascheraToken/template) + test"
```

---

### Task 3: Dipendenza `qrcode` + server actions

**Files:**
- Modify: `apps/web/package.json` (`qrcode` + `@types/qrcode`)
- Create: `apps/web/app/office/_actions/cantiere-qr.ts`

- [ ] **Step 1: Aggiungi la dipendenza** — `cd apps/web && pnpm add qrcode && pnpm add -D @types/qrcode` (poi `pnpm install` a monte se serve).
- [ ] **Step 2: Implementa le actions** (modella guard/stile su `apps/web/app/office/_actions/dipendenti.ts`)

```ts
'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';

const IdSchema = z.object({ commessaId: z.string().uuid() });
type Result = { ok: true; token: string } | { ok: false; error: string };

async function guard() {
  const ctx = await requireTenantContext();
  if (!['admin', 'office'].includes(ctx.role)) throw new Error('FORBIDDEN');
  if (!(await tenantHasModule('kantiere'))) throw new Error('MODULO_OFF');
  return ctx;
}

function nuovoToken(): string {
  return randomBytes(24).toString('base64url');
}

async function commessaDelTenant(supabase: ReturnType<typeof createServerSupabase>, tenantId: string, commessaId: string) {
  const { data } = await supabase
    .from('commesse')
    .select('id')
    .eq('id', commessaId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return Boolean(data);
}

export async function generaQrCommessa(input: unknown): Promise<Result> {
  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const supabase = createServerSupabase();
  if (!(await commessaDelTenant(supabase, ctx.tenantId, parsed.data.commessaId)))
    return { ok: false, error: 'COMMESSA_NON_TROVATA' };

  const { data: esistente } = await supabase
    .from('cantiere_qr' as never)
    .select('token')
    .eq('commessa_id', parsed.data.commessaId)
    .eq('attivo', true)
    .maybeSingle();
  if (esistente) return { ok: true, token: (esistente as { token: string }).token };

  const token = nuovoToken();
  const { error } = await supabase.from('cantiere_qr' as never).insert({
    tenant_id: ctx.tenantId,
    commessa_id: parsed.data.commessaId,
    token,
    created_by: ctx.userId,
  } as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/qr');
  return { ok: true, token };
}

export async function rigeneraQrCommessa(input: unknown): Promise<Result> {
  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const supabase = createServerSupabase();
  if (!(await commessaDelTenant(supabase, ctx.tenantId, parsed.data.commessaId)))
    return { ok: false, error: 'COMMESSA_NON_TROVATA' };

  await supabase
    .from('cantiere_qr' as never)
    .update({ attivo: false, revoked_at: new Date().toISOString() } as never)
    .eq('commessa_id', parsed.data.commessaId)
    .eq('attivo', true);

  const token = nuovoToken();
  const { error } = await supabase.from('cantiere_qr' as never).insert({
    tenant_id: ctx.tenantId,
    commessa_id: parsed.data.commessaId,
    token,
    created_by: ctx.userId,
  } as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/qr');
  return { ok: true, token };
}
```

> Verifica il nome esatto del campo user nel ctx (`ctx.userId`?) in `dipendenti.ts`/`requireTenantContext` e allinea. Se assente, usa `null` per `created_by`.

- [ ] **Step 3: Typecheck** — `pnpm --filter @kommessa/web typecheck` (o build) verde.
- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json apps/web/app/office/_actions/cantiere-qr.ts pnpm-lock.yaml
git commit -m "feat(kantiere): actions QR (genera idempotente + rigenera) + dep qrcode"
```

---

### Task 4: Office — pagina gestione QR `/office/kantiere/qr`

**Files:**
- Create: `apps/web/app/office/kantiere/qr/page.tsx`
- Create: `apps/web/app/office/kantiere/qr/_components/qr-client.tsx`
- Modify: navigazione area kantiere (la voce "QR cantiere" accanto a "Dipendenti" — individua dove è resa la nav dell'area office kantiere, p.es. la dipendenti page o un layout; aggiungila in modo additivo)

- [ ] **Step 1: Server page** — carica le commesse del tenant (riusa la stessa query usata altrove in office per elencarle; titolo via `risolviTitoloCommessa`) + left join `cantiere_qr` attivo per stato. Passa al client `{ id, titolo, codice, statoQr, created_at }[]`.

```tsx
// scheletro
import { requireTenantContext } from '@kommessa/api/tenant';
import { createServerSupabase } from '@kommessa/api/server';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';
import { statoQr } from '@kommessa/api/kantiere-qr';
import { QrClient } from './_components/qr-client';

export default async function Page() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const { data: commesse } = await supabase
    .from('commesse')
    .select('id, codice_interno, nome_cartella, descrizione_ai_finale, proposta, note_iniziali')
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false });
  const { data: qr } = await supabase
    .from('cantiere_qr' as never)
    .select('commessa_id, attivo, revoked_at, created_at')
    .eq('attivo', true);
  const byCommessa = new Map((qr ?? []).map((r: any) => [r.commessa_id, r]));
  const righe = (commesse ?? []).map((c: any) => ({
    id: c.id,
    titolo: risolviTitoloCommessa(c),
    codice: c.codice_interno,
    stato: statoQr(byCommessa.get(c.id) ?? null),
    createdAt: byCommessa.get(c.id)?.created_at ?? null,
  }));
  return <QrClient righe={righe} />;
}
```

> Verifica i campi reali che `risolviTitoloCommessa` consuma e selezionali (vedi `_lib/commessa-display.ts`). Se la lista commesse ha già un helper server condiviso, riusalo.

- [ ] **Step 2: Client** — tabella/elenco con badge stato (Assente/Attivo), bottoni: "Genera QR" (chiama `generaQrCommessa`, poi `router.refresh()`), "Stampa" (link `/office/kantiere/qr/${id}/stampa`, abilitato solo se attivo), "Rigenera" (dialog conferma con avviso "Le copie già stampate smetteranno di funzionare" → `rigeneraQrCommessa`). Stile coerente con `dipendenti-client.tsx`. Date in `Europe/Rome`.
- [ ] **Step 3: Voce di navigazione** "QR cantiere" nell'area kantiere (additiva).
- [ ] **Step 4: Typecheck/build** verde.
- [ ] **Step 5: Commit**

```bash
git add apps/web/app/office/kantiere/qr
git commit -m "feat(kantiere): office gestione QR (genera/rigenera/stampa) + nav"
```

---

### Task 5: Office — stampa con 3 template + anteprima `/office/kantiere/qr/[commessaId]/stampa`

**Files:**
- Create: `apps/web/app/office/kantiere/qr/[commessaId]/stampa/page.tsx`
- Create: `apps/web/app/office/kantiere/qr/[commessaId]/stampa/_components/stampa-qr-client.tsx`
- Create: `apps/web/app/office/kantiere/qr/[commessaId]/stampa/_components/templates.tsx`
- Create: `apps/web/app/_lib/app-origin.ts` (helper origine pubblica)

- [ ] **Step 1: Helper origine**

```ts
// apps/web/app/_lib/app-origin.ts
export function appOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return 'http://localhost:3000';
}
```

- [ ] **Step 2: Server page** — carica commessa (titolo, codice, cliente/indirizzo se presenti) + tenant (`nome, logo_url, brand_color`) + QR **attivo**. Se manca il QR attivo → `redirect('/office/kantiere/qr')`. Genera `qrDataUrl` con `qrcode`:

```tsx
import QRCode from 'qrcode';
import { qrUrl } from '@kommessa/api/kantiere-qr';
import { appOrigin } from '@/app/_lib/app-origin';
// ...
const url = qrUrl(appOrigin(), token);
const qrDataUrl = await QRCode.toDataURL(url, { width: 900, margin: 1, errorCorrectionLevel: 'M' });
```

Passa a `StampaQrClient`: `{ qrDataUrl, url, titolo, codice, cliente, indirizzo, tenant: { nome, logoUrl, brandColor }, templateIniziale }`.

- [ ] **Step 3: `templates.tsx`** — 3 componenti React puri (`EssenzialeTemplate`, `CartelloTemplate`, `IndustrialeTemplate`) che ricevono le stesse props e rendono un foglio A4 (`width:210mm; height:297mm`). Usano `logoUrl` (se presente; fallback: nome tenant a testo), `brandColor` (fallback `#0f172a`), `qrDataUrl` come `<img>`, titolo/codice/cliente/indirizzo, riga istruzione "Inquadra il QR per timbrare ingresso/uscita". Export `TEMPLATE_COMPONENTS: Record<string, ComponentType<TemplateProps>>`.
- [ ] **Step 4: `stampa-qr-client.tsx`** (`'use client'`) — switcher chip (`TEMPLATE_QR`, classe `no-print`), stato `template` (init `risolviTemplateQr(templateIniziale)`), anteprima del componente scelto centrata su sfondo grigio, bottone "Stampa / Salva PDF" (`no-print`) → `window.print()`. Stili print globali nel file (styled-jsx o `<style>`):

```css
@media print {
  .no-print { display: none !important; }
  @page { size: A4; margin: 0; }
  html, body { background: #fff; }
}
```

Assicura che in stampa sia visibile **solo** il foglio del template selezionato (renderizza solo quello).

- [ ] **Step 5: Typecheck/build** verde; verifica niente import server-only nel client (il QR è già data URL passato come prop).
- [ ] **Step 6: Commit**

```bash
git add apps/web/app/office/kantiere/qr apps/web/app/_lib/app-origin.ts
git commit -m "feat(kantiere): stampa QR A4 con 3 template + anteprima (window.print)"
```

---

### Task 6: Landing risoluzione `/t/[token]`

**Files:**
- Create: `apps/web/app/t/[token]/page.tsx`

- [ ] **Step 1: Server page** (service client, cross-tenant) — lookup `cantiere_qr` per token; carica commessa per titolo. Stato:
  - non trovato o `attivo=false` → messaggio "QR non valido o revocato".
  - attivo → "Commessa «{titolo}» — la timbratura sarà disponibile a breve." (placeholder Fase E).
  Nessun dato sensibile. Pagina semplice mobile-first.

```tsx
import { createServiceSupabase } from '@kommessa/api/server';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';

export default async function Page({ params }: { params: { token: string } }) {
  const supabase = createServiceSupabase();
  const { data: qr } = await supabase
    .from('cantiere_qr' as never)
    .select('commessa_id, attivo')
    .eq('token', params.token)
    .maybeSingle();
  if (!qr || !(qr as any).attivo) return <Messaggio testo="QR non valido o revocato" />;
  const { data: c } = await supabase
    .from('commesse')
    .select('codice_interno, nome_cartella, descrizione_ai_finale, proposta, note_iniziali')
    .eq('id', (qr as any).commessa_id)
    .maybeSingle();
  const titolo = c ? risolviTitoloCommessa(c as any) : 'Commessa';
  return <Messaggio testo={`Commessa «${titolo}» — la timbratura sarà disponibile a breve.`} />;
}
```

> Verifica il nome esatto del factory service (`createServiceSupabase`) in `@kommessa/api/server`.

- [ ] **Step 2: Typecheck/build** verde.
- [ ] **Step 3: Commit**

```bash
git add apps/web/app/t
git commit -m "feat(kantiere): landing /t/[token] di risoluzione QR (placeholder timbratura)"
```

---

### Task 7: Super-admin — registro QR `/admin/kantiere-qr`

**Files:**
- Create: `apps/web/app/admin/kantiere-qr/page.tsx`
- Modify: sidebar admin (`apps/web/app/admin/_components/admin-shell-client.tsx` — come la voce "Storage R2")

- [ ] **Step 1: Server page** — `requirePlatformAdmin` (verifica l'helper esatto usato dalle altre pagine admin, p.es. `/admin/storage-r2/page.tsx`), `createServiceSupabase`. Query cross-tenant `cantiere_qr` join `tenants(nome)` + `commesse` per titolo; ordina per `created_at` desc; limita (es. 500). Render tabella: Tenant · Commessa · Token (`mascheraToken`) · Stato (`statoQr`) · Creato (Europe/Rome) · Revocato.
- [ ] **Step 2: Voce sidebar** "QR cantiere" nel gruppo admin appropriato (additiva, accanto a "Storage R2").
- [ ] **Step 3: Typecheck/build** verde.
- [ ] **Step 4: Commit**

```bash
git add apps/web/app/admin/kantiere-qr apps/web/app/admin/_components/admin-shell-client.tsx
git commit -m "feat(kantiere): registro super-admin QR cantiere cross-tenant"
```

---

### Task 8: Verifica finale fase

- [ ] **Step 1: Test** — `pnpm -w test` (o turbo) → verde, inclusi i nuovi `kantiere-qr`.
- [ ] **Step 2: Typecheck + build** — `pnpm -w typecheck && pnpm --filter @kommessa/web build` verde.
- [ ] **Step 3:** Nessun commit di codice; il controller applicherà la migration al cloud via MCP e poi gestirà il test manuale con FPM.

---

## Self-review (coperto vs spec)
- §4 dati → Task 1. §5 logica pura → Task 2. §6 actions → Task 3. §7.1 gestione → Task 4. §7.2 stampa+template+anteprima → Task 5. §7.4 landing → Task 6. §7.3 registro admin → Task 7. §9 test → Task 2 + Task 8.
- Permanenza/unicità: vincoli DB (Task 1) + genera idempotente (Task 3) + rigenera con conferma (Task 4). Anteprima fedele: `@media print` + `window.print()` (Task 5).
