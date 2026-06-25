# Kontabilità — Fase 1 (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Un tecnico FPM fotografa uno scontrino dalla PWA, l'AI vision estrae i campi, l'utente conferma, e la spesa viene salvata e agganciata al cantiere del turno attivo; l'office vede tutte le spese in una nuova sezione "Kontabilità".

**Architecture:** Nuova tabella `spese` (gated dal modulo kantiere → Bertaiola intatta). Foto su R2 (riuso pipeline media + thumbnail), namespace `tenants/{slug}/kantiere/spese/...`. Estrazione via `OPENAI_MODEL_VISION` con `reasoning_effort: 'low'`. Aggancio cantiere via `mioTurnoAttivo()`. UI: PWA `/mobile/kantiere/spese`, office `/office/kantiere/kontabilita`.

**Tech Stack:** Next.js 14 App Router, Supabase (RLS + service role), Zod, OpenAI vision (raw fetch), R2 (S3 SDK), sharp thumbnails, Recharts (fasi successive).

**Branch:** `feat/kontabilita` — NESSUN push su main finché non testato in locale.

**Spec:** `docs/superpowers/specs/2026-06-25-kontabilita-design.md`

---

## File map

- Create `supabase/migrations/20260625120000_kontabilita_spese.sql` — tabella `spese` + RLS + indici.
- Create `packages/api/src/spese.ts` — logica pura: enum categorie, parsing importi IT, validazione soglia minima. **Testabile.**
- Create `packages/api/src/spese.test.ts` — test della logica pura.
- Modify `apps/web/app/_lib/openai.ts` — aggiungere `reasoningEffort` + supporto messaggi multimodali a `chatCompletion`.
- Create `apps/web/app/_lib/kontabilita-config.ts` — `leggiKontabilita()` (flag attivazione).
- Create `apps/web/app/api/kantiere/spese/extract/route.ts` — vision extraction da `file_ref_id`.
- Create `apps/web/app/_actions/kantiere-spese.ts` — `creaSpesa`, `aggiornaSpesa`, `eliminaSpesa`, helper aggancio cantiere.
- Create `apps/web/app/_components/spese/categoria.ts` — costante condivisa categorie + colori.
- Create PWA: `apps/web/app/mobile/kantiere/spese/page.tsx` + `_components/spese-client.tsx` + `_components/nuova-spesa.tsx`.
- Modify `apps/web/app/mobile/_components/bottom-nav-shell.tsx` — slot `Spese` (tecnico+capo), capo "Squadra" assorbe le ore.
- Create office: `apps/web/app/office/kantiere/kontabilita/page.tsx` + `_components/spese-table.tsx` + filtri.
- Modify `apps/web/app/office/_components/office-shell-client.tsx` — voce sidebar "Kontabilità".
- Modify `apps/web/app/mobile/kantiere/gestione-squadra/...` — sotto-sezione "Le mie ore" (capo).

---

## Task 1: Migration tabella `spese`

**Files:**
- Create: `supabase/migrations/20260625120000_kontabilita_spese.sql`

- [ ] **Step 1: Scrivere la migration** (pattern RLS allineato a `20260622000000_kantiere_timbrature_rapportini.sql`)

```sql
-- Kontabilità: spese di cantiere (scontrini/ricevute).
-- Gated dal modulo kantiere → tenant kommessa (Bertaiola) non la usa.
create table if not exists public.spese (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  dipendente_id uuid not null references public.dipendenti(id) on delete restrict,
  cantiere_id uuid references public.cantieri(id) on delete set null,
  commessa_id uuid references public.commesse(id) on delete set null,
  categoria text not null default 'varie'
    check (categoria in ('hotel','ristorante','bar','trasporti','carburante','varie')),
  ragione_sociale text,
  importo_totale numeric(12,2) not null,
  importo_iva numeric(12,2),
  imponibile numeric(12,2),
  valuta text not null default 'EUR',
  partita_iva text,
  metodo_pagamento text check (metodo_pagamento in ('contanti','carta','altro')),
  numero_documento text,
  indirizzo_esercente text,
  data_scontrino timestamptz,
  file_ref_id uuid references public.file_refs(id) on delete set null,
  stato text not null default 'bozza' check (stato in ('bozza','confermata')),
  rimborsabile boolean not null default true,
  ai_raw jsonb,
  ai_confidence jsonb,
  note text,
  geo_lat numeric(9,6),
  geo_lng numeric(9,6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists spese_tenant_cantiere_idx on public.spese (tenant_id, cantiere_id, data_scontrino);
create index if not exists spese_tenant_dip_idx on public.spese (tenant_id, dipendente_id, data_scontrino);
create index if not exists spese_tenant_cat_idx on public.spese (tenant_id, categoria);

-- trigger updated_at (riusa public.set_updated_at() già esistente nei moduli kantiere)
drop trigger if exists spese_set_updated_at on public.spese;
create trigger spese_set_updated_at before update on public.spese
  for each row execute function public.set_updated_at();

alter table public.spese enable row level security;

-- Office/admin del tenant: full access al proprio tenant.
-- Tecnico/capo: solo le proprie spese (dipendente collegato allo user).
create policy spese_select on public.spese for select
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('admin','office')
      or dipendente_id in (
        select d.id from public.dipendenti d
        where d.tenant_id = public.current_tenant_id() and d.user_id = auth.uid()
      )
    )
  );

create policy spese_insert on public.spese for insert
  with check (
    tenant_id = public.current_tenant_id()
    and dipendente_id in (
      select d.id from public.dipendenti d
      where d.tenant_id = public.current_tenant_id() and d.user_id = auth.uid()
    )
  );

create policy spese_update on public.spese for update
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_role() in ('admin','office')
      or dipendente_id in (
        select d.id from public.dipendenti d
        where d.tenant_id = public.current_tenant_id() and d.user_id = auth.uid()
      )
    )
  );

create policy spese_delete on public.spese for delete
  using (tenant_id = public.current_tenant_id() and public.current_role() in ('admin','office'));
```

> NB prima di scrivere: verificare i nomi esatti delle helper SQL nel repo (`current_tenant_id()`, `current_role()`, `set_updated_at()`) leggendo una migration kantiere recente. Se i nomi differiscono, adeguare. NON applicare la migration: lo fa l'umano.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260625120000_kontabilita_spese.sql
git commit -m "feat(kontabilita): migration tabella spese + RLS"
```

---

## Task 2: Logica pura spese (parsing importi IT + soglia minima) con test

**Files:**
- Create: `packages/api/src/spese.ts`
- Create: `packages/api/src/spese.test.ts`
- Modify: `packages/api/src/index.ts` (export, se il package ri-esporta da index — verificare)

- [ ] **Step 1: Test che falliscono** (`packages/api/src/spese.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { parseImportoIt, CATEGORIE_SPESA, estrazioneSufficiente } from './spese';

describe('parseImportoIt', () => {
  it('virgola decimale italiana', () => {
    expect(parseImportoIt('15,90')).toBe(15.9);
    expect(parseImportoIt('1.234,50')).toBe(1234.5);
    expect(parseImportoIt('€ 8,00')).toBe(8);
  });
  it('punto decimale anglosassone', () => {
    expect(parseImportoIt('15.90')).toBe(15.9);
  });
  it('valore non parsabile → null', () => {
    expect(parseImportoIt('abc')).toBeNull();
    expect(parseImportoIt('')).toBeNull();
    expect(parseImportoIt(null)).toBeNull();
  });
});

describe('estrazioneSufficiente', () => {
  it('ok se totale + data presenti', () => {
    expect(estrazioneSufficiente({ importo_totale: 10, data_scontrino: '2026-06-25T12:00:00Z' })).toBe(true);
  });
  it('ko se manca il totale', () => {
    expect(estrazioneSufficiente({ importo_totale: null, data_scontrino: '2026-06-25T12:00:00Z' })).toBe(false);
  });
  it('ko se manca la data', () => {
    expect(estrazioneSufficiente({ importo_totale: 10, data_scontrino: null })).toBe(false);
  });
});

describe('CATEGORIE_SPESA', () => {
  it('contiene le 6 categorie', () => {
    expect(CATEGORIE_SPESA).toEqual(['hotel','ristorante','bar','trasporti','carburante','varie']);
  });
});
```

- [ ] **Step 2: Eseguire i test → falliscono** `pnpm --filter @kommessa/api test` → FAIL (modulo inesistente).

- [ ] **Step 3: Implementare** (`packages/api/src/spese.ts`)

```ts
export const CATEGORIE_SPESA = [
  'hotel', 'ristorante', 'bar', 'trasporti', 'carburante', 'varie',
] as const;
export type CategoriaSpesa = (typeof CATEGORIE_SPESA)[number];

export function isCategoriaSpesa(s: unknown): s is CategoriaSpesa {
  return typeof s === 'string' && (CATEGORIE_SPESA as readonly string[]).includes(s);
}

/** Converte un importo testuale (it: "1.234,50" / "€ 8,00", en: "15.90") in number, o null. */
export function parseImportoIt(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  let s = raw.replace(/[^0-9.,-]/g, '').trim();
  if (!s) return null;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // l'ultimo separatore è il decimale; l'altro è migliaia
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    s = s.replace(',', '.');
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Soglia minima: per salvare serve almeno totale + data scontrino. */
export function estrazioneSufficiente(x: {
  importo_totale: number | null;
  data_scontrino: string | null;
}): boolean {
  return typeof x.importo_totale === 'number' && x.importo_totale > 0 && !!x.data_scontrino;
}
```

- [ ] **Step 4: Eseguire i test → passano** `pnpm --filter @kommessa/api test` → PASS.

- [ ] **Step 5: Export dal package** se `packages/api/src/index.ts` esiste e ri-esporta i moduli, aggiungere `export * from './spese';` (verificare prima il pattern usato da `kantiere-ore`).

- [ ] **Step 6: Commit** `git commit -am "feat(kontabilita): logica pura spese (parse importi IT, soglia minima) + test"`

---

## Task 3: Estendere `chatCompletion` per vision + reasoning_effort

**Files:**
- Modify: `apps/web/app/_lib/openai.ts:106-179`

- [ ] **Step 1: Allargare i tipi** — `ChatMessage.content` accetta anche array multimodale; opzione `reasoningEffort`.

```ts
export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
}

export interface ChatCompletionOptions {
  model?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'json_object' | 'text';
  /** Solo modelli reasoning (gpt-5-*). 'minimal'|'low'|'medium'|'high'. */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
}
```

- [ ] **Step 2: Passare il parametro nel body** dentro `chatCompletion()` (dopo il blocco `responseFormat`):

```ts
  if (opts.reasoningEffort) {
    body.reasoning_effort = opts.reasoningEffort;
  }
```

- [ ] **Step 3: Typecheck** `pnpm --filter @kommessa/web typecheck` → nessun errore nei chiamanti esistenti (content string resta valido).

- [ ] **Step 4: Commit** `git commit -am "feat(openai): chatCompletion supporta vision multimodale + reasoning_effort"`

---

## Task 4: Config flag Kontabilità

**Files:**
- Create: `apps/web/app/_lib/kontabilita-config.ts`

- [ ] **Step 1: Implementare** (pattern di `kantiere-config.ts`)

```ts
import 'server-only';
import { createServerSupabase } from '@kommessa/api/server';

type Supa = ReturnType<typeof createServerSupabase>;

export async function kontabilitaAttiva(supabase: Supa, tenantId: string): Promise<boolean> {
  const { data } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('module_code', 'kantiere')
    .maybeSingle();
  const config = (data as { config: Record<string, unknown> | null } | null)?.config ?? {};
  // default true: i tenant kantiere hanno Kontabilità attiva salvo opt-out esplicito
  return config['kontabilita_attiva'] !== false;
}
```

- [ ] **Step 2: Commit** `git commit -am "feat(kontabilita): config flag attivazione per-tenant"`

---

## Task 5: Costante categorie + colori (condivisa)

**Files:**
- Create: `apps/web/app/_components/spese/categoria.ts`

- [ ] **Step 1: Implementare** (badge color classes coerenti con la palette Tailwind del repo)

```ts
import type { CategoriaSpesa } from '@kommessa/api/spese';

export const CATEGORIA_META: Record<CategoriaSpesa, { label: string; badge: string; dot: string }> = {
  hotel:      { label: 'Hotel',      badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500' },
  ristorante: { label: 'Ristorante', badge: 'bg-amber-50 text-amber-700 border-amber-200',    dot: 'bg-amber-500' },
  bar:        { label: 'Bar',        badge: 'bg-rose-50 text-rose-700 border-rose-200',        dot: 'bg-rose-500' },
  trasporti:  { label: 'Trasporti',  badge: 'bg-sky-50 text-sky-700 border-sky-200',          dot: 'bg-sky-500' },
  carburante: { label: 'Carburante', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  varie:      { label: 'Varie',      badge: 'bg-slate-100 text-slate-700 border-slate-200',    dot: 'bg-slate-400' },
};
```

- [ ] **Step 2: Commit** `git commit -am "feat(kontabilita): meta categorie (label+colori) condivise"`

---

## Task 6: Upload ricevuta su R2

**Files:**
- Modify/Create: rotta upload per scontrini. **Prima leggere** `apps/web/app/api/upload/media/init/route.ts` e `[id]/complete/route.ts` per decidere fra: (a) variante `scope:'spesa'` nella rotta esistente (rimuovere il refine `commessaId XOR bozzaId` quando `scope==='spesa'`, key `tenants/{slug}/kantiere/spese/{YYYY}/{MM}/{fileRefId}/{filename}`, **niente** sync Nextcloud, sì thumbnail), oppure (b) nuova rotta dedicata `apps/web/app/api/kantiere/spese/upload/(init|[id]/complete)`.

- [ ] **Step 1:** Implementare la via scelta (preferenza: estendere la rotta esistente con `scope` per riusare thumbnail + `waitUntil`, saltando `syncOneFile` quando `scope==='spesa'`). Il `file_refs` row avrà `commessa_id=null`, `bozza_id=null`, un nuovo marcatore (es. colonna esistente `momento` lasciata null + r2_key nel namespace spese). Se serve una colonna per distinguere, valutare `file_refs.scope` in una migration separata; altrimenti il legame autorevole è la riga `spese.file_ref_id`.

> Decisione di dettaglio da prendere leggendo il route: se `file_refs` ha un `NOT NULL` su `commessa_id` la via (a) non basta e serve mini-migration per renderlo nullable o aggiungere `scope`. Verificare nello schema `file_refs`.

- [ ] **Step 2:** Test manuale: dalla PWA (Task 8) lo scatto deve produrre un `file_refs` con `status='uploaded'`/`synced-skipped` e una thumbnail.

- [ ] **Step 3: Commit** `git commit -m "feat(kontabilita): upload ricevuta su R2 (namespace spese, no sync nextcloud)"`

---

## Task 7: Route estrazione vision + server actions

**Files:**
- Create: `apps/web/app/api/kantiere/spese/extract/route.ts`
- Create: `apps/web/app/_actions/kantiere-spese.ts`

- [ ] **Step 1: Route `/extract`** — input `{ fileRefId }`. Carica il `file_ref` (service role), genera signed GET R2, fetch → base64 data URI, chiama `chatCompletion`:

```ts
const completion = await chatCompletion({
  model: getVisionModel(),
  reasoningEffort: 'low',
  responseFormat: 'json_object',
  maxTokens: 800,
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: PROMPT_SCONTRINO },
      { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}`, detail: 'high' } },
    ],
  }],
});
```

`PROMPT_SCONTRINO` chiede JSON con: `ragione_sociale, categoria(hotel|ristorante|bar|trasporti|carburante|varie), importo_totale, importo_iva, valuta, data_scontrino(ISO 8601), partita_iva, metodo_pagamento(contanti|carta|altro), numero_documento, indirizzo_esercente`. Parsing importi con `parseImportoIt`, validazione Zod `.catch(undefined)`.

Dopo il parse: se `!estrazioneSufficiente({importo_totale, data_scontrino})` → `return NextResponse.json({ ok:false, code:'RICEVUTA_NON_LEGGIBILE' }, { status: 422 })`. Altrimenti `{ ok:true, dati, aiConfidence }`. Salvare `ai_raw` lo fa l'action al salvataggio.

- [ ] **Step 2: Server actions** (`kantiere-spese.ts`): 
  - `agganciaCantiere(supabase, tenantId, dipId, dataScontrino)`: usa `mioTurnoAttivo()` (turno o pausa → cantiereId); fallback "un solo cantiere nel giorno di data_scontrino".
  - `creaSpesa(input)`: risolve dipendente dello user, calcola `imponibile` se totale+iva, aggancia cantiere/commessa, inserisce `stato='confermata'`, salva `ai_raw`. Revalida.
  - `aggiornaSpesa(id, patch)`: office o proprietario; ricalcola imponibile; valida categoria.
  - `eliminaSpesa(id)`: office/admin.

- [ ] **Step 3: Typecheck + commit** `git commit -m "feat(kontabilita): route vision /extract + server actions spese"`

---

## Task 8: PWA — "Le mie spese"

**Files:**
- Create: `apps/web/app/mobile/kantiere/spese/page.tsx`
- Create: `apps/web/app/mobile/kantiere/spese/_components/spese-client.tsx`
- Create: `apps/web/app/mobile/kantiere/spese/_components/nuova-spesa.tsx`

- [ ] **Step 1:** `page.tsx` (server): `guardMobile()`, gate `tenantHasModule('kantiere')` (già nel layout), carica le proprie spese (RLS le filtra), passa al client. Usa `titoloCase()` per i nomi.

- [ ] **Step 2:** `nuova-spesa.tsx` (client): pulsante "Scatta foto" `<input type="file" accept="image/*" capture="environment">` + "Allega". Flusso: upload R2 → loading "Analizzo la ricevuta…" → POST `/api/kantiere/spese/extract`. Se `422 RICEVUTA_NON_LEGGIBILE` → messaggio "Ricevuta non leggibile, riprova" + reset. Se ok → form revisione (importo, IVA, categoria con badge, esercente, data, metodo) → "Salva" → `creaSpesa`.

- [ ] **Step 3:** `spese-client.tsx`: lista delle proprie spese con thumbnail (`/api/photo/[id]?size=thumb`), importo, badge categoria, cantiere, data, stato.

- [ ] **Step 4:** Commit `git commit -m "feat(kontabilita): PWA Le mie spese (cattura, revisione, lista)"`

---

## Task 9: Bottom nav — slot Spese + capo tab unica

**Files:**
- Modify: `apps/web/app/mobile/_components/bottom-nav-shell.tsx:71-83`
- Modify: header PWA (campanella notifiche) — individuare il componente header mobile e aggiungere l'icona `Bell` con badge unread, link `/mobile/notifiche`.
- Modify: `apps/web/app/mobile/kantiere/gestione-squadra/page.tsx` — aggiungere sotto-sezione "Le mie ore" (riuso del contenuto di `/mobile/kantiere/ore` per il capo).

- [ ] **Step 1:** Tecnico (non capo): sostituire lo slot `notifiche` con `{ id: 'spese', label: 'Spese', icon: ReceiptText, href: '/mobile/kantiere/spese' }`. Capo: tenere `squadra` ma aggiungere lo slot `spese` al posto di `ore` (Ore vive dentro Squadra). Risultato 5 slot: Cantieri, Squadra, Scansiona(FAB), Spese, Profilo.

```ts
// import: ReceiptText da 'lucide-react'
// aggiungere 'spese' a MobileTabId in packages/ui/src/components/mobile-bottom-nav.tsx
```

- [ ] **Step 2:** Aggiungere `'spese'` al union `MobileTabId` in `packages/ui/src/components/mobile-bottom-nav.tsx`.

- [ ] **Step 3:** Campanella header: aggiungere `Bell` con badge al top-bar mobile kantiere (il count arriva già via realtime; riusare `useRealtimeUnread` o passare initial dal server).

- [ ] **Step 4:** Verifica: `app_mode='kommessa'` (Bertaiola) NON entra mai nel ramo `shell==='kantiere'` → zero diff. Confermare a mano leggendo il file.

- [ ] **Step 5:** Commit `git commit -m "feat(kontabilita): bottom nav slot Spese + capo tab Squadra assorbe Ore + campanella header"`

---

## Task 10: Office — sezione Kontabilità (lista Spese)

**Files:**
- Create: `apps/web/app/office/kantiere/kontabilita/page.tsx`
- Create: `apps/web/app/office/kantiere/kontabilita/_components/spese-table.tsx`
- Create: `apps/web/app/office/kantiere/kontabilita/_components/filtri.tsx`
- Modify: `apps/web/app/office/_components/office-shell-client.tsx` (voce sidebar)

- [ ] **Step 1:** `page.tsx` (server): gate role admin/office + `tenantHasModule('kantiere')` (il layout `office/kantiere` già lo fa). Legge spese del tenant con join dipendente/cantiere, applica filtri da `searchParams` (cantiere, dipendente, categoria, periodo). Passa a `spese-table`.

- [ ] **Step 2:** `spese-table.tsx`: tabella raggruppabile per cantiere; colonne cantiere/chi/importo/IVA/categoria(badge)/data scontrino/data caricamento/thumb. Riga cliccabile → dialog con foto a schermo intero + edit (categoria, riassegna cantiere, note, elimina) via `aggiornaSpesa`/`eliminaSpesa`. Totali per gruppo.

- [ ] **Step 3:** `filtri.tsx`: filtri client che scrivono in `searchParams`. Pulsante **Export CSV** (genera lato client dai dati visibili o endpoint server).

- [ ] **Step 4:** Sidebar: in `office-shell-client.tsx`, per i tenant con kantiere, aggiungere una voce di primo livello `{ id:'kontabilita', label:'Kontabilità', href:'/office/kantiere/kontabilita', icon: ReceiptText }` come pacchetto a sé (fuori dall'accordion "Kantiere", per lo stacco visivo). Gate: solo se `hasKantiere`.

- [ ] **Step 5:** Commit `git commit -m "feat(kontabilita): office sezione Kontabilità (lista spese, filtri, export, sidebar)"`

---

## Task 11: Verifica finale Fase 1

- [ ] **Step 1:** `pnpm --filter @kommessa/api test` → tutti verdi (105 + nuovi).
- [ ] **Step 2:** `pnpm --filter @kommessa/web typecheck` e build → verdi.
- [ ] **Step 3:** Lettura di controllo Bertaiola-safe: nessun ramo nuovo raggiungibile con `app_mode='kommessa'` / senza modulo kantiere. Le route office/mobile kantiere e la sezione Kontabilità sono tutte sotto i layout gated.
- [ ] **Step 4:** Riepilogo al cliente con istruzioni di test locale (env `OPENAI_MODEL_VISION`, applicare la migration in locale, impersonare FPM). NESSUN push.

---

## Note trasversali
- Copy italiano: niente "col", niente trattino lungo "—".
- Display nomi PWA via `titoloCase()`; mai `nome_cartella` raw (non pertinente qui, ma regola globale).
- Soldi: `numeric(12,2)`; parsing virgola IT; revisione obbligatoria; `ai_raw` per audit.
- Tutto gated kantiere → Bertaiola intatta.
- Migration applicata dall'umano; in locale dal dev per testare.
