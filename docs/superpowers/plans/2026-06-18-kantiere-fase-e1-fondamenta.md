# Kantiere Fase E1 — Fondamenta (dati + calcolo ore) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Tabelle `timbrature`/`rapportini`/`rapportino_righe` + la **logica pura di calcolo ore** (coppie timbrature → minuti, split ordinarie/straordinario/viaggio con soglia) interamente testata, e l'helper di autorizzazione `puoTimbrarePer`.

**Architecture:** migration additiva (RLS tenant-scoped, write esteso a `tecnico` per le timbrature); logica pura in `@kommessa/api/kantiere-ore` (nuovo) + `puoTimbrarePer` in `@kommessa/api/kantiere` (esistente). Nessuna UI in E1.

**Tech Stack:** Supabase, TypeScript strict (`noUncheckedIndexedAccess` → usa `!`/guardie), Vitest. Spec: `docs/superpowers/specs/2026-06-18-kantiere-fase-e-timbrature-rapportino.md`.

---

### Task 1: Migration `timbrature` + `rapportini` + `rapportino_righe`

**Files:**
- Create: `supabase/migrations/20260622000000_kantiere_timbrature_rapportini.sql`

- [ ] **Step 1: Scrivi la migration** (stile come `20260621000000_cantiere_qr.sql` e `20260620000000_kantiere_dipendenti_squadre.sql`; usa `tg_set_updated_at` per `rapportini`)

```sql
-- =====================================================================
-- 20260622000000_kantiere_timbrature_rapportini.sql
-- Fase E modulo Kantiere: timbrature + rapportino giornaliero a righe.
-- Additivo. Gating app via modulo kantiere.
-- =====================================================================

-- ---------- timbrature ------------------------------------------------
create table if not exists public.timbrature (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  dipendente_id uuid not null references public.dipendenti(id) on delete cascade,
  commessa_id   uuid not null references public.commesse(id) on delete cascade,
  tipo          text not null check (tipo in ('ingresso','uscita')),
  origine       text not null check (origine in ('qr','cronometro','manuale','capo')),
  ts            timestamptz not null default now(),
  geo_lat       numeric(9,6),
  geo_lng       numeric(9,6),
  creato_da     uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists timbrature_dip_ts_idx on public.timbrature (tenant_id, dipendente_id, ts);
create index if not exists timbrature_commessa_ts_idx on public.timbrature (tenant_id, commessa_id, ts);

alter table public.timbrature enable row level security;

drop policy if exists timbrature_tenant_read on public.timbrature;
create policy timbrature_tenant_read on public.timbrature
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists timbrature_tenant_write on public.timbrature;
create policy timbrature_tenant_write on public.timbrature
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role, 'tecnico'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role, 'tecnico'::public.app_role)
  );

drop policy if exists timbrature_platform_admin_read on public.timbrature;
create policy timbrature_platform_admin_read on public.timbrature
  for select using (public.is_platform_admin());

-- ---------- rapportini (testata) -------------------------------------
create table if not exists public.rapportini (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  dipendente_id uuid not null references public.dipendenti(id) on delete cascade,
  data          date not null,
  stato         text not null default 'bozza'
                check (stato in ('bozza','inviato','verificato','approvato','respinto','esportato')),
  inviato_da    uuid references public.users(id) on delete set null,
  inviato_at    timestamptz,
  approvato_da  uuid references public.users(id) on delete set null,
  approvato_at  timestamptz,
  respinto_motivo text,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (dipendente_id, data)
);
create index if not exists rapportini_tenant_data_idx on public.rapportini (tenant_id, data);

drop trigger if exists trg_rapportini_updated_at on public.rapportini;
create trigger trg_rapportini_updated_at
  before update on public.rapportini
  for each row execute function public.tg_set_updated_at();

alter table public.rapportini enable row level security;

drop policy if exists rapportini_tenant_read on public.rapportini;
create policy rapportini_tenant_read on public.rapportini
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists rapportini_tenant_write on public.rapportini;
create policy rapportini_tenant_write on public.rapportini
  for all
  using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role, 'tecnico'::public.app_role)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role, 'tecnico'::public.app_role)
  );

drop policy if exists rapportini_platform_admin_read on public.rapportini;
create policy rapportini_platform_admin_read on public.rapportini
  for select using (public.is_platform_admin());

-- ---------- rapportino_righe -----------------------------------------
create table if not exists public.rapportino_righe (
  id               uuid primary key default gen_random_uuid(),
  rapportino_id    uuid not null references public.rapportini(id) on delete cascade,
  commessa_id      uuid not null references public.commesse(id) on delete cascade,
  ore_ordinarie    numeric(4,2) not null default 0,
  ore_straordinarie numeric(4,2) not null default 0,
  ore_viaggio      numeric(4,2) not null default 0,
  note             text
);
create index if not exists rapportino_righe_rapportino_idx on public.rapportino_righe (rapportino_id);

alter table public.rapportino_righe enable row level security;

drop policy if exists rapportino_righe_tenant_read on public.rapportino_righe;
create policy rapportino_righe_tenant_read on public.rapportino_righe
  for select using (
    exists (select 1 from public.rapportini r
            where r.id = rapportino_id and r.tenant_id = public.current_tenant_id())
  );

drop policy if exists rapportino_righe_tenant_write on public.rapportino_righe;
create policy rapportino_righe_tenant_write on public.rapportino_righe
  for all
  using (
    exists (select 1 from public.rapportini r
            where r.id = rapportino_id and r.tenant_id = public.current_tenant_id()
              and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role, 'tecnico'::public.app_role))
  )
  with check (
    exists (select 1 from public.rapportini r
            where r.id = rapportino_id and r.tenant_id = public.current_tenant_id()
              and public.current_role() in ('owner'::public.app_role, 'admin'::public.app_role, 'office'::public.app_role, 'tecnico'::public.app_role))
  );

drop policy if exists rapportino_righe_platform_admin_read on public.rapportino_righe;
create policy rapportino_righe_platform_admin_read on public.rapportino_righe
  for select using (public.is_platform_admin());
```

- [ ] **Step 2: Verifica** — confronta `tg_set_updated_at`, `current_tenant_id`, `current_role`, `is_platform_admin`, `app_role` con la migration C/D: stessi nomi. NON applicare al DB (lo fa l'umano/controller).
- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260622000000_kantiere_timbrature_rapportini.sql
git commit -m "feat(kantiere): migration timbrature + rapportini + rapportino_righe (Fase E1)"
```

---

### Task 2: Logica pura calcolo ore `kantiere-ore.ts` (TDD) + autorizzazione `puoTimbrarePer`

**Files:**
- Create: `packages/api/src/kantiere-ore.ts`
- Test: `packages/api/src/kantiere-ore.test.ts`
- Modify: `packages/api/src/kantiere.ts` (aggiungi `puoTimbrarePer`)
- Modify: `packages/api/src/kantiere.test.ts` (test per `puoTimbrarePer`)
- Modify: `packages/api/package.json` (export subpath `./kantiere-ore`, come `./kantiere-qr`)

- [ ] **Step 1: Scrivi i test che falliscono** — `kantiere-ore.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  minutiPerCommessa,
  calcolaOreGiornata,
  prossimoTipoTimbratura,
  type Timbratura,
} from './kantiere-ore';

describe('minutiPerCommessa', () => {
  it('accoppia ingresso/uscita e somma i minuti', () => {
    const t: Timbratura[] = [
      { commessa_id: 'A', tipo: 'ingresso', ts: '2026-06-22T08:00:00Z' },
      { commessa_id: 'A', tipo: 'uscita', ts: '2026-06-22T12:00:00Z' },
    ];
    expect(minutiPerCommessa(t).get('A')).toBe(240);
  });
  it('pausa pranzo = uscita + successivo ingresso (gap non contato)', () => {
    const t: Timbratura[] = [
      { commessa_id: 'A', tipo: 'ingresso', ts: '2026-06-22T08:00:00Z' },
      { commessa_id: 'A', tipo: 'uscita', ts: '2026-06-22T12:00:00Z' },
      { commessa_id: 'A', tipo: 'ingresso', ts: '2026-06-22T13:00:00Z' },
      { commessa_id: 'A', tipo: 'uscita', ts: '2026-06-22T17:00:00Z' },
    ];
    expect(minutiPerCommessa(t).get('A')).toBe(480);
  });
  it('ignora la coda orfana (ingresso senza uscita)', () => {
    const t: Timbratura[] = [
      { commessa_id: 'A', tipo: 'ingresso', ts: '2026-06-22T08:00:00Z' },
    ];
    expect(minutiPerCommessa(t).get('A') ?? 0).toBe(0);
  });
  it('ignora uscita orfana iniziale', () => {
    const t: Timbratura[] = [
      { commessa_id: 'A', tipo: 'uscita', ts: '2026-06-22T08:00:00Z' },
      { commessa_id: 'A', tipo: 'ingresso', ts: '2026-06-22T09:00:00Z' },
      { commessa_id: 'A', tipo: 'uscita', ts: '2026-06-22T10:00:00Z' },
    ];
    expect(minutiPerCommessa(t).get('A')).toBe(60);
  });
  it('doppio ingresso: tiene il primo aperto, ignora il secondo', () => {
    const t: Timbratura[] = [
      { commessa_id: 'A', tipo: 'ingresso', ts: '2026-06-22T08:00:00Z' },
      { commessa_id: 'A', tipo: 'ingresso', ts: '2026-06-22T09:00:00Z' },
      { commessa_id: 'A', tipo: 'uscita', ts: '2026-06-22T10:00:00Z' },
    ];
    expect(minutiPerCommessa(t).get('A')).toBe(120);
  });
  it('separa per commessa e ordina per ts', () => {
    const t: Timbratura[] = [
      { commessa_id: 'B', tipo: 'uscita', ts: '2026-06-22T11:00:00Z' },
      { commessa_id: 'A', tipo: 'ingresso', ts: '2026-06-22T08:00:00Z' },
      { commessa_id: 'B', tipo: 'ingresso', ts: '2026-06-22T10:00:00Z' },
      { commessa_id: 'A', tipo: 'uscita', ts: '2026-06-22T09:00:00Z' },
    ];
    const m = minutiPerCommessa(t);
    expect(m.get('A')).toBe(60);
    expect(m.get('B')).toBe(60);
  });
});

describe('calcolaOreGiornata', () => {
  it('0h → righe a zero', () => {
    const r = calcolaOreGiornata({ minutiLavoratiPerCommessa: [] });
    expect(r.righe).toEqual([]);
    expect(r.ore_viaggio).toBe(0);
  });
  it('solo viaggio', () => {
    const r = calcolaOreGiornata({ minutiLavoratiPerCommessa: [], minutiViaggio: 90 });
    expect(r.righe).toEqual([]);
    expect(r.ore_viaggio).toBe(1.5);
  });
  it('sotto soglia → tutto ordinario', () => {
    const r = calcolaOreGiornata({ minutiLavoratiPerCommessa: [{ commessa_id: 'A', minuti: 300 }] });
    expect(r.righe[0]).toEqual({ commessa_id: 'A', ore_ordinarie: 5, ore_straordinarie: 0 });
  });
  it('esattamente soglia 8h → tutto ordinario', () => {
    const r = calcolaOreGiornata({ minutiLavoratiPerCommessa: [{ commessa_id: 'A', minuti: 480 }] });
    expect(r.righe[0]).toEqual({ commessa_id: 'A', ore_ordinarie: 8, ore_straordinarie: 0 });
  });
  it('sfora soglia → eccedenza straordinario', () => {
    const r = calcolaOreGiornata({ minutiLavoratiPerCommessa: [{ commessa_id: 'A', minuti: 600 }] });
    expect(r.righe[0]).toEqual({ commessa_id: 'A', ore_ordinarie: 8, ore_straordinarie: 2 });
  });
  it('multi-commessa: riempimento sequenziale fino a soglia', () => {
    const r = calcolaOreGiornata({
      minutiLavoratiPerCommessa: [
        { commessa_id: 'A', minuti: 300 }, // 5h → 5 ord
        { commessa_id: 'B', minuti: 300 }, // 5h → 3 ord + 2 straord
      ],
    });
    expect(r.righe[0]).toEqual({ commessa_id: 'A', ore_ordinarie: 5, ore_straordinarie: 0 });
    expect(r.righe[1]).toEqual({ commessa_id: 'B', ore_ordinarie: 3, ore_straordinarie: 2 });
  });
  it('soglia custom (tenant 6h)', () => {
    const r = calcolaOreGiornata({
      minutiLavoratiPerCommessa: [{ commessa_id: 'A', minuti: 480 }],
      sogliaOreOrdinarie: 6,
    });
    expect(r.righe[0]).toEqual({ commessa_id: 'A', ore_ordinarie: 6, ore_straordinarie: 2 });
  });
});

describe('prossimoTipoTimbratura', () => {
  it('nessuna timbrata → ingresso', () => expect(prossimoTipoTimbratura([])).toBe('ingresso'));
  it('ultima ingresso → uscita', () =>
    expect(prossimoTipoTimbratura([{ tipo: 'ingresso' }])).toBe('uscita'));
  it('ultima uscita → ingresso', () =>
    expect(prossimoTipoTimbratura([{ tipo: 'ingresso' }, { tipo: 'uscita' }])).toBe('ingresso'));
});
```

- [ ] **Step 2: Esegui → FAIL** (`cd packages/api && pnpm test kantiere-ore`).
- [ ] **Step 3: Implementa `kantiere-ore.ts`**

```ts
export type Timbratura = {
  commessa_id: string;
  tipo: 'ingresso' | 'uscita';
  ts: string; // ISO
};

/** Accoppia ingresso→uscita per commessa e somma i minuti lavorati. */
export function minutiPerCommessa(timbrature: Timbratura[]): Map<string, number> {
  const perCommessa = new Map<string, Timbratura[]>();
  for (const t of timbrature) {
    const arr = perCommessa.get(t.commessa_id) ?? [];
    arr.push(t);
    perCommessa.set(t.commessa_id, arr);
  }
  const out = new Map<string, number>();
  for (const [commessa, arr] of perCommessa) {
    const sorted = [...arr].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    let aperto: number | null = null;
    let minuti = 0;
    for (const t of sorted) {
      if (t.tipo === 'ingresso') {
        if (aperto === null) aperto = Date.parse(t.ts);
        // doppio ingresso: ignora il secondo (resta aperto il primo)
      } else {
        if (aperto !== null) {
          minuti += Math.round((Date.parse(t.ts) - aperto) / 60000);
          aperto = null;
        }
        // uscita orfana: ignorata
      }
    }
    out.set(commessa, minuti);
  }
  return out;
}

export type RigaOre = {
  commessa_id: string;
  ore_ordinarie: number;
  ore_straordinarie: number;
};
export type RisultatoOre = { righe: RigaOre[]; ore_viaggio: number };

function oreDaMinuti(min: number): number {
  return Math.round((min / 60) * 100) / 100;
}

/** Suggerimento ore giornata: prime `soglia` ore ordinarie (riempimento
 *  sequenziale per ordine input), eccedenza straordinario, viaggio separato. */
export function calcolaOreGiornata(input: {
  minutiLavoratiPerCommessa: { commessa_id: string; minuti: number }[];
  minutiViaggio?: number;
  sogliaOreOrdinarie?: number;
}): RisultatoOre {
  const sogliaMin = (input.sogliaOreOrdinarie ?? 8) * 60;
  let restanteOrd = sogliaMin;
  const righe: RigaOre[] = input.minutiLavoratiPerCommessa.map(({ commessa_id, minuti }) => {
    const ord = Math.min(restanteOrd, minuti);
    const straord = minuti - ord;
    restanteOrd -= ord;
    return {
      commessa_id,
      ore_ordinarie: oreDaMinuti(ord),
      ore_straordinarie: oreDaMinuti(straord),
    };
  });
  return { righe, ore_viaggio: oreDaMinuti(input.minutiViaggio ?? 0) };
}

/** Toggle del bottone Timbra dalle timbrature odierne (ordinate asc). */
export function prossimoTipoTimbratura(
  odierne: { tipo: 'ingresso' | 'uscita' }[],
): 'ingresso' | 'uscita' {
  const ultima = odierne[odierne.length - 1];
  return ultima?.tipo === 'ingresso' ? 'uscita' : 'ingresso';
}
```

- [ ] **Step 4: Aggiungi `puoTimbrarePer` a `kantiere.ts`** (in coda al file)

```ts
/** Autorizzazione pura: chi può timbrare per chi.
 *  - sé stesso: sempre;
 *  - capo squadra su quella commessa: solo per membri della sua squadra. */
export function puoTimbrarePer(args: {
  self: boolean;
  capoSquadra: boolean;
  bersaglioInSquadra: boolean;
}): boolean {
  return args.self || (args.capoSquadra && args.bersaglioInSquadra);
}
```

- [ ] **Step 5: Test per `puoTimbrarePer` in `kantiere.test.ts`** (aggiungi un `describe`)

```ts
import { puoTimbrarePer } from './kantiere';
describe('puoTimbrarePer', () => {
  it('sé stesso sempre', () =>
    expect(puoTimbrarePer({ self: true, capoSquadra: false, bersaglioInSquadra: false })).toBe(true));
  it('capo per membro della sua squadra', () =>
    expect(puoTimbrarePer({ self: false, capoSquadra: true, bersaglioInSquadra: true })).toBe(true));
  it('capo per chi è fuori squadra → no', () =>
    expect(puoTimbrarePer({ self: false, capoSquadra: true, bersaglioInSquadra: false })).toBe(false));
  it('estraneo → no', () =>
    expect(puoTimbrarePer({ self: false, capoSquadra: false, bersaglioInSquadra: true })).toBe(false));
});
```

- [ ] **Step 6: Export subpath** — in `packages/api/package.json` aggiungi `"./kantiere-ore": "./src/kantiere-ore.ts"` all'`exports` (come fatto per `./kantiere-qr`).
- [ ] **Step 7: Esegui i test** — `pnpm test` nel package → tutti verdi (kantiere, kantiere-qr, kantiere-ore, modules). Poi `pnpm --filter @kommessa/api typecheck` verde.
- [ ] **Step 8: Commit**

```bash
git add packages/api/src/kantiere-ore.ts packages/api/src/kantiere-ore.test.ts packages/api/src/kantiere.ts packages/api/src/kantiere.test.ts packages/api/package.json
git commit -m "feat(kantiere): calcolo ore puro (timbrature→minuti, split ord/straord/viaggio) + puoTimbrarePer + test"
```

---

### Task 3: Verifica E1
- [ ] `pnpm --filter @kommessa/api test` verde; `pnpm --filter @kommessa/web typecheck` verde (nessun consumo nuovo ancora, deve restare verde).
- [ ] Nessun apply al cloud (lo fa il controller).

## Self-review
- §3 dati → Task 1. §4 logica pura (minutiPerCommessa, calcolaOreGiornata, prossimoTipoTimbratura) → Task 2. §2/§5 autorizzazione (`puoTimbrarePer`) → Task 2. §8 testing → Task 2.
