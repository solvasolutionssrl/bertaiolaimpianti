# Kantiere Fase E2 — Timbratura reale (actions + scan) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Server Actions di timbratura (QR / cronometro / manuale, con gating capo-squadra via `puoTimbrarePer`) e upgrade di `/t/[token]` da placeholder a **timbratura reale**: l'utente loggato timbra ingresso/uscita; il capo squadra timbra per i membri della sua squadra su quella commessa.

**Architecture:** lookup token con service client (cross-tenant), poi tutto tenant-scoped con `createServerSupabase` (RLS) + autorizzazione fine nelle action. UI scan = client component nel `/t/[token]` con geo best-effort. Dipende da E1 (tabella `timbrature`, helper `prossimoTipoTimbratura`/`puoTimbrarePer`).

**Tech Stack:** Next.js 14, Supabase RLS, `@kommessa/ui` Button, `getTenantContext`, `titoloCase`. Spec: `docs/superpowers/specs/2026-06-18-kantiere-fase-e-timbrature-rapportino.md` §5–6.

**Fatti d'integrazione (verificati):**
- `getTenantContext()` da `@kommessa/api/tenant` → `TenantContext | null` (no redirect). Shape: `{tenantId, tenantSlug, userId, email, role}`.
- `createServerSupabase()` (`@kommessa/api/server`, RLS, cookie-bound) vs `createServiceSupabase()` (`@kommessa/api/service`, bypass RLS — solo per lookup token pubblico).
- `tenantHasModule('kantiere')` da `@/app/_lib/modules`.
- dipendente corrente: `dipendenti` where `user_id = ctx.userId` and `tenant_id`. Squadra: `commessa_squadra` (`commessa_id, dipendente_id, ruolo_commessa 'capo'|'membro'`).
- Client→action: `useTransition`; `createBrowserSupabase` per browser; `titoloCase()` da `@/app/mobile/_lib/display-case`; `Button` da `@kommessa/ui`.
- `cantiere_qr`, `timbrature`, `dipendenti`, `commessa_squadra` NON nei tipi generati → cast `as never` (pattern `dipendenti.ts`).

---

### Task 1: Server Actions timbratura — `apps/web/app/_actions/kantiere-timbra.ts`

**Files:**
- Create: `apps/web/app/_actions/kantiere-timbra.ts`

- [ ] **Step 1: Implementa le tre action** (`'use server'`). Modella errori/stile su `apps/web/app/office/_actions/dipendenti.ts`.

```ts
'use server';

import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { getTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import { prossimoTipoTimbratura } from '@kommessa/api/kantiere-ore';
import { puoTimbrarePer } from '@kommessa/api/kantiere';

type Ok = { ok: true; tipo: 'ingresso' | 'uscita'; ts: string };
type Result = Ok | { ok: false; error: string };

const GeoSchema = z.object({ lat: z.number(), lng: z.number() }).partial().optional();

// ── lookup token (pubblico, service) → commessa+tenant ──────────────────
async function risolviToken(token: string) {
  const svc = createServiceSupabase();
  const { data } = await svc
    .from('cantiere_qr' as never)
    .select('commessa_id, tenant_id, attivo')
    .eq('token', token)
    .maybeSingle();
  return data as { commessa_id: string; tenant_id: string; attivo: boolean } | null;
}

// ── helper comune: contesto + dipendente corrente ───────────────────────
async function ctxConModulo() {
  const ctx = await getTenantContext();
  if (!ctx) return { error: 'NON_AUTENTICATO' as const };
  if (!(await tenantHasModule('kantiere'))) return { error: 'MODULO_OFF' as const };
  return { ctx };
}

async function dipendenteDi(
  supabase: ReturnType<typeof createServerSupabase>,
  tenantId: string,
  userId: string,
): Promise<{ id: string; nome: string; cognome: string } | null> {
  const { data } = await supabase
    .from('dipendenti' as never)
    .select('id, nome, cognome')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { id: string; nome: string; cognome: string } | null) ?? null;
}

async function prossimoTipo(
  supabase: ReturnType<typeof createServerSupabase>,
  dipendenteId: string,
  commessaId: string,
): Promise<'ingresso' | 'uscita'> {
  // timbrature di oggi (UTC day boundary va bene: confronto solo per ordinamento toggle)
  const inizioGiorno = new Date();
  inizioGiorno.setHours(0, 0, 0, 0);
  const { data } = await supabase
    .from('timbrature' as never)
    .select('tipo, ts')
    .eq('dipendente_id', dipendenteId)
    .eq('commessa_id', commessaId)
    .gte('ts', inizioGiorno.toISOString())
    .order('ts', { ascending: true });
  return prossimoTipoTimbratura((data as { tipo: 'ingresso' | 'uscita' }[]) ?? []);
}

// ── 1) timbra da QR (sé o, per il capo, un membro) ──────────────────────
const TimbraSchema = z.object({
  token: z.string().min(1),
  dipendenteId: z.string().uuid().optional(),
  geo: GeoSchema,
});

export async function timbra(input: unknown): Promise<Result> {
  const parsed = TimbraSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  const r = await ctxConModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;

  const qr = await risolviToken(parsed.data.token);
  if (!qr || !qr.attivo) return { ok: false, error: 'QR_NON_VALIDO' };
  if (qr.tenant_id !== ctx.tenantId) return { ok: false, error: 'QR_ALTRO_TENANT' };

  const supabase = createServerSupabase();
  const me = await dipendenteDi(supabase, ctx.tenantId, ctx.userId);

  const bersaglioId = parsed.data.dipendenteId ?? me?.id;
  if (!bersaglioId) return { ok: false, error: 'NESSUN_DIPENDENTE' };

  // autorizzazione
  const self = !!me && bersaglioId === me.id;
  let capoSquadra = false;
  let bersaglioInSquadra = false;
  if (!self) {
    if (!me) return { ok: false, error: 'NON_CAPO' };
    const { data: righe } = await supabase
      .from('commessa_squadra' as never)
      .select('dipendente_id, ruolo_commessa')
      .eq('commessa_id', qr.commessa_id);
    const rows = (righe as { dipendente_id: string; ruolo_commessa: 'capo' | 'membro' }[]) ?? [];
    capoSquadra = rows.some((x) => x.dipendente_id === me.id && x.ruolo_commessa === 'capo');
    bersaglioInSquadra = rows.some((x) => x.dipendente_id === bersaglioId);
  }
  if (!puoTimbrarePer({ self, capoSquadra, bersaglioInSquadra }))
    return { ok: false, error: 'NON_AUTORIZZATO' };

  const tipo = await prossimoTipo(supabase, bersaglioId, qr.commessa_id);
  const ts = new Date().toISOString();
  const { error } = await supabase.from('timbrature' as never).insert({
    tenant_id: ctx.tenantId,
    dipendente_id: bersaglioId,
    commessa_id: qr.commessa_id,
    tipo,
    origine: self ? 'qr' : 'capo',
    ts,
    geo_lat: parsed.data.geo?.lat ?? null,
    geo_lng: parsed.data.geo?.lng ?? null,
    creato_da: ctx.userId,
  } as never);
  if (error) return { ok: false, error: error.message };
  return { ok: true, tipo, ts };
}

// ── 2) cronometro (solo sé, senza QR) ───────────────────────────────────
const CronoSchema = z.object({
  commessaId: z.string().uuid(),
  azione: z.enum(['start', 'stop']),
  geo: GeoSchema,
});

export async function timbraCronometro(input: unknown): Promise<Result> {
  const parsed = CronoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  const r = await ctxConModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;
  const supabase = createServerSupabase();
  const me = await dipendenteDi(supabase, ctx.tenantId, ctx.userId);
  if (!me) return { ok: false, error: 'NESSUN_DIPENDENTE' };
  const tipo = parsed.data.azione === 'start' ? 'ingresso' : 'uscita';
  const ts = new Date().toISOString();
  const { error } = await supabase.from('timbrature' as never).insert({
    tenant_id: ctx.tenantId,
    dipendente_id: me.id,
    commessa_id: parsed.data.commessaId,
    tipo,
    origine: 'cronometro',
    ts,
    geo_lat: parsed.data.geo?.lat ?? null,
    geo_lng: parsed.data.geo?.lng ?? null,
    creato_da: ctx.userId,
  } as never);
  if (error) return { ok: false, error: error.message };
  return { ok: true, tipo, ts };
}

// ── 3) manuale (office/admin o capo) ────────────────────────────────────
const ManualeSchema = z.object({
  commessaId: z.string().uuid(),
  dipendenteId: z.string().uuid(),
  tipo: z.enum(['ingresso', 'uscita']),
  ts: z.string().min(1),
});

export async function timbraManuale(input: unknown): Promise<Result> {
  const parsed = ManualeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  const r = await ctxConModulo();
  if ('error' in r) return { ok: false, error: r.error };
  const { ctx } = r;
  if (!['admin', 'office'].includes(ctx.role)) return { ok: false, error: 'FORBIDDEN' };
  const supabase = createServerSupabase();
  const { error } = await supabase.from('timbrature' as never).insert({
    tenant_id: ctx.tenantId,
    dipendente_id: parsed.data.dipendenteId,
    commessa_id: parsed.data.commessaId,
    tipo: parsed.data.tipo,
    origine: 'manuale',
    ts: parsed.data.ts,
    creato_da: ctx.userId,
  } as never);
  if (error) return { ok: false, error: error.message };
  return { ok: true, tipo: parsed.data.tipo, ts: parsed.data.ts };
}
```

- [ ] **Step 2: Verifica import** — conferma che `getTenantContext` sia esportato da `@kommessa/api/tenant` e `puoTimbrarePer` da `@kommessa/api/kantiere`, `prossimoTipoTimbratura` da `@kommessa/api/kantiere-ore` (E1). Allinea se i path differiscono.
- [ ] **Step 3: Typecheck** — `pnpm --filter @kommessa/web typecheck` verde. NON fare `next build`.
- [ ] **Step 4: Commit**

```bash
git add apps/web/app/_actions/kantiere-timbra.ts
git commit -m "feat(kantiere): server actions timbratura (qr/cronometro/manuale) con gating capo-squadra"
```

---

### Task 2: Upgrade `/t/[token]` a timbratura reale

**Files:**
- Modify: `apps/web/app/t/[token]/page.tsx`
- Create: `apps/web/app/t/[token]/_components/timbra-client.tsx`

- [ ] **Step 1: Server page** — mantieni la risoluzione token col service client (i messaggi "QR non valido o revocato" restano). Aggiungi:
  - `const ctx = await getTenantContext();`
  - Se QR valido **e** `ctx` **e** `ctx.tenantId === qr.tenant_id`:
    - con `createServerSupabase()` (RLS): trova `me` (dipendente per `user_id=ctx.userId`); calcola se sono **capo** su questa commessa e — se sì — carica i **membri** della squadra (`commessa_squadra` join `dipendenti` per nome/cognome) con, per ciascuno, il `prossimoTipo` di oggi; calcola anche il mio `prossimoTipo`.
    - passa a `<TimbraClient token=... commessaTitolo=... me={{id,nome}|null} prossimoTipoSelf=... capo={boolean} membri={[{id,nome,prossimoTipo}]} />`.
  - Se QR valido ma **non loggato** (`!ctx`): mostra il titolo commessa + bottone "Accedi per timbrare" → `Link` a `/login?next=/t/${token}`.
  - Se QR valido ma **tenant diverso**: messaggio "Questo QR appartiene a un altro spazio. Esci e accedi con l'account giusto." (no dati sensibili).
  - Mantieni `export const dynamic = 'force-dynamic'`.

- [ ] **Step 2: Client `timbra-client.tsx`** (`'use client'`):
  - Bottone grande **"Timbra {prossimoTipoSelf}"** (Ingresso/Uscita) → `useTransition` → ottiene geo best-effort con `navigator.geolocation.getCurrentPosition` (timeout breve, opzionale: se nega/non disponibile procede senza geo) → chiama `timbra({ token, geo })` → su `ok` mostra conferma "Ingresso registrato alle HH:MM" (orario in `Europe/Rome`) e `router.refresh()` per ricalcolare il prossimo tipo; su errore mostra messaggio leggibile (mappa i codici: `NON_AUTORIZZATO`→"Non sei autorizzato", `QR_NON_VALIDO`→"QR non valido", ecc.).
  - Se `capo && membri.length`: sezione **"La mia squadra"** con una riga per membro (nome via `titoloCase`, stato prossimo tipo) e bottone per timbrare quel membro → `timbra({ token, dipendenteId: membro.id, geo })`. Opzionale: checkbox multi-selezione + "Timbra selezionati" (esegue le chiamate in sequenza). Mantieni semplice e robusto.
  - Stile mobile-first coerente con le pagine `/mobile/*` (usa `Button` da `@kommessa/ui`; card come la `Schermo` esistente). Copy IT, niente "col", niente trattino lungo "—".
  - Import azione: `import { timbra } from '@/app/_actions/kantiere-timbra';`.

- [ ] **Step 3: Typecheck** — `pnpm --filter @kommessa/web typecheck` verde.
- [ ] **Step 4: Commit**

```bash
git add apps/web/app/t
git commit -m "feat(kantiere): /t/[token] timbratura reale (self + capo-squadra) con geo best-effort"
```

---

### Task 3: Verifica E2
- [ ] `pnpm --filter @kommessa/web typecheck` verde; `pnpm --filter @kommessa/web build` verde (route `/t/[token]` ancora dinamica, ora interattiva).
- [ ] Smoke test online (dopo restart dev pulito): `/t/token-inesistente` → "QR non valido"; con un token reale e sessione FPM → bottone Timbra (test funzionale cumulativo lato utente più avanti).

## Self-review
- §5 actions (timbra/cronometro/manuale + auth `puoTimbrarePer`) → Task 1. §6 scan PWA (self + capo squadra, geo) → Task 2. Gating modulo + tenant-match in entrambe.
