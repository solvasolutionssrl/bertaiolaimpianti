# Kantiere — Fase B: Storage R2-only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere a un tenant di vivere solo su Cloudflare R2 (niente Nextcloud, niente cartelle), promuovendo R2 a `StorageProvider` completo via adapter, senza cambiare il comportamento di Bertaiola.

**Architecture:** Estende l'enum `storage_provider` con `'r2'` (non un nuovo `storage_mode`) + colonna `crea_cartelle`. Aggiunge un adapter `R2FileStorageProvider implements StorageProvider` che compone la classe `R2StorageProvider` grezza esistente (INTATTA, usata dal flusso media/staging di Bertaiola) con un `basePath` per-tenant. Logica pura (resolve config, gating cartelle, path/list mapping) isolata e unit-testata con Vitest.

**Tech Stack:** TypeScript, `@aws-sdk/client-s3`, Supabase (Postgres enum + colonna), Next.js server actions + wizard, Vitest (introdotto in `packages/integrations`).

**Riferimento spec:** `docs/superpowers/specs/2026-06-18-kantiere-fase-b-storage-r2.md`.

**Vincolo produzione:** branch `feat/kantiere-tesserino-digitale`. `main`/Bertaiola NON si tocca. La classe `R2StorageProvider` grezza (`packages/integrations/src/storage/r2.ts`) e il provider `nextcloud` restano invariati → staging R2→Nextcloud di Bertaiola continua. Migration additiva applicata al cloud dall'umano. Creazione tenant FPM = passo operativo via wizard.

---

### Task 1: Vitest in `packages/integrations`

**Files:**
- Modify: `packages/integrations/package.json`
- Create: `packages/integrations/vitest.config.ts`
- Create + remove: `packages/integrations/src/sanity.test.ts`

(Il task `test` in `turbo.json` e lo script root `test` esistono già dalla Fase A.)

- [ ] **Step 1: Aggiungi Vitest**

```bash
pnpm --filter @kommessa/integrations add -D vitest@^2.1.0
```

- [ ] **Step 2: Crea `packages/integrations/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Aggiungi gli script test a `packages/integrations/package.json`**

Dentro `"scripts"`, aggiungi (accanto a quelli esistenti):

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 4: Sanity test**

Create `packages/integrations/src/sanity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('vitest sanity (integrations)', () => {
  it('runs', () => {
    expect(2 + 2).toBe(4);
  });
});
```

- [ ] **Step 5: Esegui e verifica PASS**

Run: `pnpm --filter @kommessa/integrations test`
Expected: 1 test PASS.

- [ ] **Step 6: Rimuovi il sanity test**

```bash
rm "packages/integrations/src/sanity.test.ts"
```

- [ ] **Step 7: Commit**

```bash
git add packages/integrations/package.json packages/integrations/vitest.config.ts pnpm-lock.yaml
git commit -m "chore(test): setup Vitest in @kommessa/integrations"
```

---

### Task 2: Migration — enum `'r2'` + colonna `crea_cartelle`

**Files:**
- Create: `supabase/migrations/20260619010000_storage_r2_mode.sql`

- [ ] **Step 1: Scrivi il file SQL**

Create `supabase/migrations/20260619010000_storage_r2_mode.sql`:

```sql
-- =====================================================================
-- 20260619010000_storage_r2_mode.sql
--
-- Fase B modulo Kantiere: storage solo-R2 per tenant.
--
-- 1) Aggiunge 'r2' all'enum storage_provider_name (R2 diventa provider di
--    prima classe, via adapter R2FileStorageProvider lato codice).
-- 2) Aggiunge tenants.crea_cartelle (default true): se false, la creazione
--    commessa/voci NON crea lo scaffold cartelle (tenant solo-R2).
--
-- Additivo e non distruttivo: Bertaiola resta 'nextcloud' + crea_cartelle=true.
-- Il nuovo valore enum NON viene usato in questa stessa migration.
-- =====================================================================

alter type public.storage_provider_name add value if not exists 'r2';

alter table public.tenants
  add column if not exists crea_cartelle boolean not null default true;

comment on column public.tenants.crea_cartelle is
  'Se false, creazione commessa/voci NON crea cartelle (tenant solo-R2 senza scaffold). Default true.';
```

- [ ] **Step 2: Validazione statica (NO DB apply)**

Conferma che l'enum target esista e i valori attuali:

```bash
grep -rn "storage_provider_name" supabase/migrations | head
```

Expected: definizione enum in `20260101000100_tenants.sql` con `'supabase'`,`'nextcloud'`. Conferma che il timestamp `20260619010000` ordini dopo `20260619000000_tenant_modules.sql`:

```bash
ls supabase/migrations | sort | tail -4
```

NON applicare al DB (apply cloud = umano).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260619010000_storage_r2_mode.sql
git commit -m "feat(kantiere): migration storage 'r2' + flag crea_cartelle"
```

---

### Task 3: Logica pura — type, resolve config, gating, path helpers (TDD)

**Files:**
- Modify: `packages/integrations/src/storage/types.ts`
- Modify: `packages/integrations/src/storage/index.ts` (solo `StorageProviderConfig`, campi R2)
- Create: `packages/integrations/src/storage/resolve.ts` (+ `.test.ts`)
- Create: `packages/integrations/src/storage/r2-paths.ts` (+ `.test.ts`)

- [ ] **Step 1: Estendi `StorageProviderName`**

In `packages/integrations/src/storage/types.ts:7`, cambia:

```ts
export type StorageProviderName = 'supabase' | 'nextcloud' | 'r2';
```

- [ ] **Step 2: Estendi `StorageProviderConfig` con i campi R2**

In `packages/integrations/src/storage/index.ts`, sostituisci l'interfaccia `StorageProviderConfig` con:

```ts
export interface StorageProviderConfig {
  provider: StorageProviderName;
  bucket?: string; // supabase + r2
  baseUrl?: string; // nextcloud
  user?: string; // nextcloud
  appPassword?: string; // nextcloud
  /**
   * Nextcloud: sotto-cartella radice del tenant. R2: prefisso chiave di
   * isolamento per-tenant (es. "tenants/FPM"). Se omesso, root.
   */
  basePath?: string;
  // r2
  accountId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
}
```

- [ ] **Step 3: Scrivi i test di `r2-paths` (falliscono)**

Create `packages/integrations/src/storage/r2-paths.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeBasePath, joinKey, mapListToStorageObjects } from './r2-paths';

describe('normalizeBasePath', () => {
  it('vuoto resta vuoto', () => {
    expect(normalizeBasePath()).toBe('');
    expect(normalizeBasePath('')).toBe('');
  });
  it('toglie slash iniziali e finali', () => {
    expect(normalizeBasePath('/tenants/FPM/')).toBe('tenants/FPM');
  });
});

describe('joinKey', () => {
  it('unisce base + path', () => {
    expect(joinKey('tenants/FPM', 'commesse/x/foto.jpg')).toBe(
      'tenants/FPM/commesse/x/foto.jpg',
    );
  });
  it('toglie slash iniziale del path', () => {
    expect(joinKey('tenants/FPM', '/a/b')).toBe('tenants/FPM/a/b');
  });
  it('senza base ritorna il path relativo', () => {
    expect(joinKey('', 'a/b')).toBe('a/b');
  });
});

describe('mapListToStorageObjects', () => {
  it('mappa prefissi (cartelle) e chiavi (file) relativi al basePath', () => {
    const out = mapListToStorageObjects('tenants/FPM', 'tenants/FPM/c/', {
      keys: [
        { key: 'tenants/FPM/c/', size: 0, lastModified: null }, // marker, escluso
        { key: 'tenants/FPM/c/foto.jpg', size: 123, lastModified: '2026-06-18T00:00:00.000Z' },
      ],
      prefixes: ['tenants/FPM/c/sub/'],
    });
    expect(out).toEqual([
      {
        path: 'c/sub',
        name: 'sub',
        size: 0,
        mimeType: '',
        isDirectory: true,
        modifiedAt: '',
      },
      {
        path: 'c/foto.jpg',
        name: 'foto.jpg',
        size: 123,
        mimeType: '',
        isDirectory: false,
        modifiedAt: '2026-06-18T00:00:00.000Z',
      },
    ]);
  });
});
```

- [ ] **Step 4: Implementa `r2-paths.ts`**

Create `packages/integrations/src/storage/r2-paths.ts`:

```ts
import type { StorageObject } from './types';

/** Normalizza un basePath in prefisso chiave senza slash iniziale/finale. */
export function normalizeBasePath(basePath?: string): string {
  if (!basePath) return '';
  return basePath.replace(/^\/+|\/+$/g, '');
}

/** Unisce basePath + path relativo in una chiave R2 (no slash iniziali doppi). */
export function joinKey(basePath: string, path: string): string {
  const rel = path.replace(/^\/+/, '');
  return basePath ? `${basePath}/${rel}` : rel;
}

/**
 * Mappa il risultato ListObjectsV2 (chiavi + common prefixes) in
 * `StorageObject[]` con path relativi al basePath. `requestPrefix` è la
 * chiave completa con slash finale (la "cartella" richiesta), esclusa dai file.
 */
export function mapListToStorageObjects(
  basePath: string,
  requestPrefix: string,
  res: {
    keys: { key: string; size: number; lastModified: string | null }[];
    prefixes: string[];
  },
): StorageObject[] {
  const strip = (full: string) =>
    basePath && full.startsWith(`${basePath}/`)
      ? full.slice(basePath.length + 1)
      : full;

  const dirs: StorageObject[] = res.prefixes.map((p) => {
    const rel = strip(p.replace(/\/$/, ''));
    const name = rel.split('/').filter(Boolean).pop() ?? rel;
    return { path: rel, name, size: 0, mimeType: '', isDirectory: true, modifiedAt: '' };
  });

  const files: StorageObject[] = res.keys
    .filter((k) => k.key !== requestPrefix)
    .map((k) => {
      const rel = strip(k.key);
      const name = rel.split('/').filter(Boolean).pop() ?? rel;
      return {
        path: rel,
        name,
        size: k.size,
        mimeType: '',
        isDirectory: false,
        modifiedAt: k.lastModified ?? '',
      };
    });

  return [...dirs, ...files];
}
```

- [ ] **Step 5: Scrivi i test di `resolve` (falliscono)**

Create `packages/integrations/src/storage/resolve.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveStorageConfig, shouldProvisionFolders } from './resolve';

describe('resolveStorageConfig', () => {
  it('nextcloud: legge da storage_config', () => {
    expect(
      resolveStorageConfig({
        slug: 'BER',
        storage_provider: 'nextcloud',
        storage_config: { baseUrl: 'https://nc', user: 'u', appPassword: 'p', basePath: '/BER' },
        r2_config: {},
      }),
    ).toEqual({
      provider: 'nextcloud',
      baseUrl: 'https://nc',
      user: 'u',
      appPassword: 'p',
      basePath: '/BER',
    });
  });

  it('r2: legge da r2_config e deriva basePath dallo slug', () => {
    expect(
      resolveStorageConfig({
        slug: 'FPM',
        storage_provider: 'r2',
        storage_config: {},
        r2_config: {
          account_id: 'acc',
          bucket: 'b',
          access_key_id: 'ak',
          secret_access_key: 'sk',
          endpoint: 'https://e',
        },
      }),
    ).toEqual({
      provider: 'r2',
      accountId: 'acc',
      bucket: 'b',
      accessKeyId: 'ak',
      secretAccessKey: 'sk',
      endpoint: 'https://e',
      basePath: 'tenants/FPM',
    });
  });

  it('supabase: default bucket commesse', () => {
    expect(
      resolveStorageConfig({ slug: 'X', storage_provider: 'supabase', storage_config: {}, r2_config: {} }),
    ).toEqual({ provider: 'supabase', bucket: 'commesse' });
  });
});

describe('shouldProvisionFolders', () => {
  it('true di default', () => {
    expect(shouldProvisionFolders({ crea_cartelle: true })).toBe(true);
    expect(shouldProvisionFolders({ crea_cartelle: null })).toBe(true);
    expect(shouldProvisionFolders({})).toBe(true);
  });
  it('false se crea_cartelle=false', () => {
    expect(shouldProvisionFolders({ crea_cartelle: false })).toBe(false);
  });
});
```

- [ ] **Step 6: Implementa `resolve.ts`**

Create `packages/integrations/src/storage/resolve.ts`:

```ts
import type { StorageProviderName } from './types';
import type { StorageProviderConfig } from './index';

/** Sottoinsieme della riga `tenants` necessario a derivare lo storage. */
export interface TenantStorageRow {
  slug?: string | null;
  storage_provider: StorageProviderName;
  storage_config?: Record<string, unknown> | null;
  r2_config?: Record<string, unknown> | null;
  crea_cartelle?: boolean | null;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** Deriva la config del provider storage dalla riga tenant. */
export function resolveStorageConfig(t: TenantStorageRow): StorageProviderConfig {
  const sc = (t.storage_config ?? {}) as Record<string, unknown>;
  const rc = (t.r2_config ?? {}) as Record<string, unknown>;
  switch (t.storage_provider) {
    case 'nextcloud':
      return {
        provider: 'nextcloud',
        baseUrl: str(sc.baseUrl),
        user: str(sc.user),
        appPassword: str(sc.appPassword),
        basePath: str(sc.basePath),
      };
    case 'r2':
      return {
        provider: 'r2',
        accountId: str(rc.account_id),
        bucket: str(rc.bucket),
        accessKeyId: str(rc.access_key_id),
        secretAccessKey: str(rc.secret_access_key),
        endpoint: str(rc.endpoint),
        basePath: `tenants/${str(t.slug) ?? 'unknown'}`,
      };
    case 'supabase':
    default:
      return { provider: 'supabase', bucket: str(sc.bucket) ?? 'commesse' };
  }
}

/** True se per questo tenant va creato lo scaffold cartelle commessa. */
export function shouldProvisionFolders(
  t: Pick<TenantStorageRow, 'crea_cartelle'>,
): boolean {
  return t.crea_cartelle !== false;
}
```

- [ ] **Step 7: Esegui i test e verifica PASS**

Run: `pnpm --filter @kommessa/integrations test`
Expected: tutti verdi (r2-paths + resolve).

- [ ] **Step 8: Typecheck del package**

Run: `pnpm --filter @kommessa/integrations typecheck`
Expected: clean. (Se `@kommessa/integrations` non ha script `typecheck`, salta — verrà coperto dal typecheck di `@kommessa/web` che lo consuma in Task 8.)

- [ ] **Step 9: Commit**

```bash
git add packages/integrations/src/storage/types.ts packages/integrations/src/storage/index.ts packages/integrations/src/storage/resolve.ts packages/integrations/src/storage/resolve.test.ts packages/integrations/src/storage/r2-paths.ts packages/integrations/src/storage/r2-paths.test.ts
git commit -m "feat(kantiere): logica pura storage R2 (resolve config, gating, path mapping)"
```

---

### Task 4: R2 adapter completo + factory `'r2'`

**Files:**
- Modify: `packages/integrations/src/storage/r2.ts` (aggiunge `listObjects`, additivo)
- Create: `packages/integrations/src/storage/r2-provider.ts`
- Modify: `packages/integrations/src/storage/index.ts` (export + factory case `'r2'`)

- [ ] **Step 1: Aggiungi `listObjects` a `R2StorageProvider` (raw-key, additivo)**

In `packages/integrations/src/storage/r2.ts`, aggiungi `ListObjectsV2Command` agli import da `@aws-sdk/client-s3`:

```ts
  ListObjectsV2Command,
```

Poi aggiungi questo metodo dentro la classe `R2StorageProvider` (es. dopo `head`):

```ts
  /** Lista oggetti per prefisso (raw key). Usato dall'adapter listFolder e dal probe. */
  async listObjects(
    prefix: string,
    opts?: { delimiter?: string; maxKeys?: number },
  ): Promise<{
    keys: { key: string; size: number; lastModified: string | null }[];
    prefixes: string[];
  }> {
    const res = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        Delimiter: opts?.delimiter,
        MaxKeys: opts?.maxKeys,
      }),
    );
    const keys = (res.Contents ?? []).map((o) => ({
      key: o.Key ?? '',
      size: o.Size ?? 0,
      lastModified: o.LastModified?.toISOString() ?? null,
    }));
    const prefixes = (res.CommonPrefixes ?? [])
      .map((p) => p.Prefix ?? '')
      .filter(Boolean);
    return { keys, prefixes };
  }
```

- [ ] **Step 2: Crea l'adapter `r2-provider.ts`**

Create `packages/integrations/src/storage/r2-provider.ts`:

```ts
import type {
  StorageProvider,
  StorageObject,
  UploadResult,
  SignedUrl,
  UploadOptions,
} from './types';
import { R2StorageProvider, type R2Config } from './r2';
import { normalizeBasePath, joinKey, mapListToStorageObjects } from './r2-paths';

async function toUint8Array(
  body: Blob | ArrayBuffer | Uint8Array,
): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(await body.arrayBuffer());
}

/**
 * Adapter che espone R2 come `StorageProvider` completo (semantica a prefisso).
 * Compone `R2StorageProvider` (chiavi grezze, INTATTO) e antepone un basePath
 * per-tenant. R2 non ha directory reali: i prefissi nascono col primo upload.
 */
export class R2FileStorageProvider implements StorageProvider {
  readonly name = 'r2' as const;
  private readonly r2: R2StorageProvider;
  private readonly basePath: string;

  constructor(config: R2Config & { basePath?: string }) {
    this.r2 = new R2StorageProvider(config);
    this.basePath = normalizeBasePath(config.basePath);
  }

  private key(path: string): string {
    return joinKey(this.basePath, path);
  }

  async createFolder(): Promise<void> {}
  async createFolderTree(): Promise<void> {}

  async uploadFile(
    path: string,
    body: Blob | ArrayBuffer | Uint8Array,
    opts?: UploadOptions,
  ): Promise<UploadResult> {
    const bytes = await toUint8Array(body);
    await this.r2.putObject(
      this.key(path),
      bytes,
      opts?.contentType ?? 'application/octet-stream',
    );
    return { path, size: bytes.byteLength };
  }

  async listFolder(path: string): Promise<StorageObject[]> {
    const prefix = this.key(path).replace(/\/?$/, '/');
    const res = await this.r2.listObjects(prefix, { delimiter: '/' });
    return mapListToStorageObjects(this.basePath, prefix, res);
  }

  async getDownloadUrl(path: string, expiresInSec?: number): Promise<SignedUrl> {
    const signed = await this.r2.createPresignedGetUrl(this.key(path), {
      ttlSec: expiresInSec,
    });
    return { url: signed.url, expiresAt: signed.expiresAt };
  }

  async delete(path: string): Promise<void> {
    await this.r2.delete(this.key(path));
  }

  async move(from: string, to: string): Promise<void> {
    await this.r2.copyObject(this.key(from), this.key(to));
    await this.r2.delete(this.key(from));
  }

  async exists(path: string): Promise<boolean> {
    return (await this.r2.head(this.key(path))) !== null;
  }
}
```

- [ ] **Step 3: Esporta l'adapter e aggiungi il case `'r2'` alla factory**

In `packages/integrations/src/storage/index.ts`:

(a) aggiungi gli import in cima:

```ts
import { R2FileStorageProvider } from './r2-provider';
```

(b) aggiungi gli export (accanto a `export * from './r2';`):

```ts
export * from './r2-provider';
export * from './r2-paths';
export * from './resolve';
```

(c) nel `switch` di `getStorageProvider`, aggiungi PRIMA del `default`:

```ts
    case 'r2':
      if (
        !config.accountId ||
        !config.bucket ||
        !config.accessKeyId ||
        !config.secretAccessKey
      ) {
        throw new Error(
          'R2 config incomplete: need accountId/bucket/accessKeyId/secretAccessKey',
        );
      }
      return new R2FileStorageProvider({
        accountId: config.accountId,
        bucket: config.bucket,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        endpoint: config.endpoint,
        basePath: config.basePath,
      });
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @kommessa/web typecheck`
Expected: clean. (`@kommessa/web` consuma `@kommessa/integrations`; questo è il typecheck più affidabile.)

Nota: i metodi di rete dell'adapter (putObject/list/head reali) NON sono unit-testati (dipendono da R2). Sono coperti dai test puri di `r2-paths` (Task 3) + dalla verifica manuale al deploy quando si crea FPM.

- [ ] **Step 5: Commit**

```bash
git add packages/integrations/src/storage/r2.ts packages/integrations/src/storage/r2-provider.ts packages/integrations/src/storage/index.ts
git commit -m "feat(kantiere): R2FileStorageProvider (StorageProvider completo via adapter) + factory 'r2'"
```

---

### Task 5: Gating provisioning cartelle (`crea_cartelle`)

**Files:**
- Modify: `apps/web/app/_actions/_lib/provisiona-cartelle.ts`
- Modify: `apps/web/app/_actions/crea-commessa.ts`

Contesto: entrambi leggono la riga `tenants` e creano cartelle solo per `nextcloud`. Vanno fatti uscire SUBITO (no-op) quando `crea_cartelle = false`. Leggi i file per collocare le modifiche con precisione.

- [ ] **Step 1: `provisiona-cartelle.ts` — leggi `crea_cartelle` ed esci no-op**

In `apps/web/app/_actions/_lib/provisiona-cartelle.ts`, nella SELECT della riga tenant (oggi `.select('storage_provider, storage_config')`), aggiungi `crea_cartelle`:

```ts
    .select('storage_provider, storage_config, crea_cartelle')
```

Subito dopo aver letto la riga `tenant` (e prima di costruire qualunque provider), aggiungi il gate:

```ts
  // Tenant senza scaffold cartelle (es. solo-R2): provisioning no-op.
  if ((tenant as { crea_cartelle?: boolean | null }).crea_cartelle === false) {
    return { provisioned: false, provider: 'none', reason: 'crea_cartelle_off' };
  }
```

Usa la forma esatta del tipo di ritorno già presente nel file (`StorageProvisionResult`): se i campi differiscono (es. non esiste `reason`), adatta al tipo reale e riporta l'adattamento. NON inventare campi non esistenti.

- [ ] **Step 2: `crea-commessa.ts` — salta `ensureStatusFolders` se `crea_cartelle=false`**

In `apps/web/app/_actions/crea-commessa.ts`, nel blocco che legge `tenants` per `ensureStatusFolders` (oggi `.select('storage_provider, storage_config')`), aggiungi `crea_cartelle`:

```ts
      .select('storage_provider, storage_config, crea_cartelle')
```

E modifica la condizione che oggi è `if (t?.storage_provider === 'nextcloud')` in modo da NON entrare se le cartelle sono disattivate:

```ts
    if (
      (t as { crea_cartelle?: boolean | null })?.crea_cartelle !== false &&
      t?.storage_provider === 'nextcloud'
    ) {
```

(Il flusso `provisionaCartelle()` chiamato altrove in `crea-commessa` è già coperto dal gate del Task 5 Step 1.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @kommessa/web typecheck`
Expected: clean. (`crea_cartelle` potrebbe non essere nei tipi generati: se la select tipizzata protesta, allinea col modo in cui il file già gestisce le colonne tenant — spesso `t as any` o cast locale. Non introdurre `any` nuovi se evitabile; segui il pattern del file.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/_actions/_lib/provisiona-cartelle.ts apps/web/app/_actions/crea-commessa.ts
git commit -m "feat(kantiere): salta provisioning cartelle quando crea_cartelle=false"
```

---

### Task 6: `creaTenant` + `testaConnessioneStorage` per R2

**Files:**
- Modify: `apps/web/app/admin/_actions/tenants.ts`

Leggi prima `creaTenant` (schema `creaTenantSchema` + INSERT) e `testaConnessioneStorage` (+ `testStorageSchema`).

- [ ] **Step 1: Estendi lo schema `creaTenantSchema`**

In `creaTenantSchema`, cambia `storage_provider` e aggiungi due campi:

```ts
  storage_provider: z.enum(['supabase', 'nextcloud', 'r2']).default('supabase'),
  storage_config: z.record(z.unknown()).default({}),
  r2_config: z.record(z.unknown()).default({}),
  crea_cartelle: z.boolean().default(true),
```

- [ ] **Step 2: Includi i nuovi campi nell'INSERT del tenant**

Nell'`.insert({ ... })` di `creaTenant`, aggiungi:

```ts
    r2_config: data.r2_config as never,
    crea_cartelle: data.crea_cartelle,
```

(Mantieni il cast `as never` sull'oggetto insert già usato nel file.)

- [ ] **Step 3: Estendi `testStorageSchema` con i campi R2**

Nei campi di `testStorageSchema` (oggi provider + nextcloud), aggiungi `'r2'` all'enum del provider e i campi R2 opzionali:

```ts
  provider: z.enum(['supabase', 'nextcloud', 'r2']),
  // ... campi nextcloud esistenti ...
  account_id: z.string().optional(),
  bucket: z.string().optional(),
  access_key_id: z.string().optional(),
  secret_access_key: z.string().optional(),
  endpoint: z.string().optional(),
```

- [ ] **Step 4: Aggiungi il probe R2 in `testaConnessioneStorage`**

Importa in cima al file (se non già presente):

```ts
import { R2StorageProvider } from '@kommessa/integrations';
```

Nella funzione `testaConnessioneStorage`, dopo il ramo `supabase` e prima/accanto al ramo Nextcloud, aggiungi il ramo R2:

```ts
  if (data.provider === 'r2') {
    if (!data.account_id || !data.bucket || !data.access_key_id || !data.secret_access_key) {
      return { ok: false, error: 'Compila account_id + bucket + access_key_id + secret_access_key' };
    }
    const start = Date.now();
    try {
      const r2 = new R2StorageProvider({
        accountId: data.account_id,
        bucket: data.bucket,
        accessKeyId: data.access_key_id,
        secretAccessKey: data.secret_access_key,
        endpoint: data.endpoint,
      });
      await r2.listObjects('', { maxKeys: 1 });
      return { ok: true, latencyMs: Date.now() - start, detail: 'Bucket R2 raggiungibile' };
    } catch (e) {
      return { ok: false, error: `R2 non raggiungibile: ${(e as Error).message ?? 'errore'}` };
    }
  }
```

Adatta la forma del valore di ritorno a `TestStorageResult` reale (i campi `ok/latencyMs/detail/error` sono quelli usati dal ramo Nextcloud — copiali identici).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @kommessa/web typecheck`
Expected: clean. (Se `r2_config`/`crea_cartelle` non sono nei tipi generati dell'insert, il cast `as never` sull'oggetto insert già presente li copre.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/admin/_actions/tenants.ts
git commit -m "feat(kantiere): creaTenant supporta 'r2'+crea_cartelle, probe R2 nel test connessione"
```

---

### Task 7: Wizard super-admin — step Storage opzione R2

**Files:**
- Modify: `apps/web/app/admin/tenants/nuovo/_components/wizard.tsx`

Contesto: lo step Storage ha già la scelta `supabase`/`nextcloud` con un blocco condizionale per i campi Nextcloud e un bottone "Test connessione" (`testaConnessioneStorage`). Leggi il file e replica il pattern per `r2`.

- [ ] **Step 1: Aggiungi `'r2'` alle opzioni provider dello step Storage**

Aggiungi un terzo bottone/opzione provider "Cloudflare R2 (solo R2)" accanto a Supabase/Nextcloud, che imposta lo stato `storage_provider = 'r2'`. Segui ESATTAMENTE il markup/handler dei due bottoni esistenti.

- [ ] **Step 2: Blocco condizionale campi R2 (quando provider === 'r2')**

Replica il blocco condizionale Nextcloud per R2, con questi campi controllati (salvati nello stato `r2_config` da inviare a `creaTenant`):
- `account_id`, `bucket`, `access_key_id`, `secret_access_key` (type password), `endpoint` (opzionale).
Usa gli stessi componenti input/label del blocco Nextcloud.

- [ ] **Step 3: Toggle "Crea cartelle"**

Aggiungi un checkbox "Crea struttura cartelle commessa" legato allo stato `crea_cartelle` (default `true`). Mostralo per tutti i provider, ma per `r2` il default consigliato è **deselezionato** (FPM = senza cartelle): quando l'utente seleziona provider `r2`, imposta `crea_cartelle=false` di default (l'utente può riattivarlo).

- [ ] **Step 4: Test connessione R2**

Il bottone "Test connessione" deve chiamare `testaConnessioneStorage` passando `{ provider: 'r2', account_id, bucket, access_key_id, secret_access_key, endpoint }` quando il provider è `r2` (oggi passa i campi Nextcloud). Mostra l'esito come per Nextcloud.

- [ ] **Step 5: Invio a `creaTenant`**

Assicurati che alla submit finale il wizard passi `storage_provider`, `storage_config` (vuoto per r2), `r2_config` (i campi R2), `crea_cartelle` alla action `creaTenant`.

- [ ] **Step 6: Typecheck + build**

Run: `pnpm --filter @kommessa/web typecheck && pnpm --filter @kommessa/web build`
Expected: entrambi PASS.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/admin/tenants/nuovo/_components/wizard.tsx"
git commit -m "feat(kantiere): wizard nuovo tenant — opzione storage R2 + crea_cartelle"
```

---

### Task 8: Verifica finale

- [ ] **Step 1: Test + typecheck + build**

Run:

```bash
pnpm test && pnpm --filter @kommessa/web typecheck && pnpm --filter @kommessa/web build
```

Expected: test verdi (incluso `@kommessa/integrations`: r2-paths + resolve), typecheck e build OK.

- [ ] **Step 2: Sanity diff Bertaiola-safety**

Verifica che i percorsi `nextcloud`/staging NON siano cambiati semanticamente:

```bash
git diff main..HEAD -- packages/integrations/src/storage/r2.ts | grep -E "^[-]" | grep -v "ListObjectsV2\|listObjects\|^---" || echo "Nessuna riga rimossa dalla classe R2 grezza (solo aggiunte) — OK"
```

Expected: nessuna rimozione/modifica ai metodi esistenti di `R2StorageProvider` (solo l'aggiunta di `listObjects` + l'import). Conferma a vista.

---

## Definition of Done (Fase B)

- [ ] Enum `storage_provider` ha `'r2'`; colonna `crea_cartelle` (default true). Migration additiva, non applicata al cloud (umano).
- [ ] `R2FileStorageProvider implements StorageProvider` via adapter; classe `R2StorageProvider` grezza invariata (solo `listObjects` aggiunto). Factory gestisce `'r2'`.
- [ ] `resolveStorageConfig` + `shouldProvisionFolders` puri e testati; provisioning cartelle saltato se `crea_cartelle=false`.
- [ ] `creaTenant` + wizard supportano provider `r2` + `crea_cartelle` + test connessione R2.
- [ ] Bertaiola invariato (`nextcloud` + staging R2). `main` non toccato; branch `feat/kantiere-tesserino-digitale`.
- [ ] `pnpm test`, typecheck, build verdi.

## Self-review

Copertura spec Fase B: enum `'r2'` ✓ (Task 2/3), `crea_cartelle` ✓ (Task 2/5), R2 StorageProvider completo via adapter ✓ (Task 4), resolve/gating puri+testati ✓ (Task 3), creaTenant+wizard ✓ (Task 6/7). Adapter NON modifica la classe grezza → Bertaiola/staging intatto ✓ (Task 8 Step 2 lo verifica). Sync R2→Nextcloud skip per tenant `r2`: deferito a Fasi D/E (annotato nello spec, fuori scope qui). Nessun placeholder; identificatori coerenti tra task (`StorageProviderName`, `StorageProviderConfig`, `resolveStorageConfig`, `shouldProvisionFolders`, `R2FileStorageProvider`, `listObjects`).
