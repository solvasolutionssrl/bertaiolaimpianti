# Design — Fase B: Storage R2-only + creazione tenant FPM

**Versione**: 1.0
**Stato**: Bozza in revisione
**Data**: 2026-06-18
**Dipende da**: Fase A (moduli per tenant) — già implementata sul branch `feat/kantiere-tesserino-digitale`.
**Spec madre**: `docs/superpowers/specs/2026-06-18-kantiere-tesserino-digitale-design.md` (sez. 3 Storage).

> **Raffinamento rispetto allo spec madre**: lo spec madre ipotizzava un nuovo `storage_mode`. L'esplorazione del codice ha mostrato che `storage_provider` (enum `supabase|nextcloud`) è GIÀ l'interruttore su cui fanno switch `getStorageProvider()`, `provisionaCartelle()` e `crea-commessa`. Quindi NON introduciamo `storage_mode`: **estendiamo l'enum esistente con `'r2'`** e teniamo un flag ortogonale `crea_cartelle`. Meno concetti, si innesta sul codice esistente.

---

## 1. Obiettivo

Permettere a un tenant di vivere **solo su Cloudflare R2**, senza Nextcloud e senza provisioning di cartelle, mantenendo intatto il flusso attuale di Bertaiola (`storage_provider='nextcloud'` + R2 staging). Predisporre la creazione del nuovo tenant **FPM Impianti** in questa modalità.

Perimetro: **solo codice abilitante**. La creazione reale del tenant FPM è un passo **operativo** (super-admin dal wizard, al momento del deploy di prova) — non hardcodata nel repo.

---

## 2. Stato attuale (dall'esplorazione)

- `StorageProvider` (`packages/integrations/src/storage/types.ts`): interfaccia a 8 metodi (`createFolder`, `createFolderTree`, `uploadFile`, `uploadStream?`, `listFolder`, `getDownloadUrl`, `delete`, `move`, `exists`). `StorageProviderName = 'supabase' | 'nextcloud'`.
- `getStorageProvider()` (`storage/index.ts`): factory che fa switch su `provider`.
- `NextcloudStorageProvider` e `SupabaseStorageProvider`: implementano TUTTA l'interfaccia.
- `R2StorageProvider` (`storage/r2.ts`): **NON** implementa l'interfaccia. Ha solo presigned PUT/GET, multipart, `head`, `delete`, `putObject`, `copyObject`. Usa `@aws-sdk/client-s3`. Bucket **unico condiviso**, isolamento per-tenant via prefisso chiave `tenants/{tenantId}/...` (`buildR2Key()`).
- Config R2 per-tenant: colonna `tenants.r2_config` (jsonb) già esistente (oggi solo staging media).
- Enum DB `public.storage_provider_name` = `'supabase' | 'nextcloud'` (`20260101000100_tenants.sql`).
- Provisioning cartelle: `provisionaCartelle()` (`_actions/_lib/provisiona-cartelle.ts`) + `ensureStatusFolders()` in `crea-commessa.ts`, entrambi switchano su `storage_provider`.
- Creazione tenant: action `creaTenant` (`admin/_actions/tenants.ts`, schema Zod `storage_provider: z.enum(['supabase','nextcloud'])`) + wizard `admin/tenants/nuovo/_components/wizard.tsx` (step Storage con test connessione `testaConnessioneStorage`).

---

## 3. Decisioni di design

1. **Modalità storage = valore `'r2'` nell'enum `storage_provider`** (NON un nuovo `storage_mode`).
   - `r2` → solo R2 (FPM). `nextcloud` (+ r2 staging) → r2+nextcloud (Bertaiola, invariato). `supabase` resta com'è.
2. **Flag `crea_cartelle boolean` (default `true`) sul tenant**, ortogonale al provider. Gate sul solo scaffold cartelle commessa (voci/tipologie + cartelle di stato). FPM = `r2` + `crea_cartelle=false`. Predispone un futuro tenant R2 con cartelle (prefissi R2) per attestati/DURC senza migrazioni.
3. **FPM creato via wizard super-admin** al deploy di prova (email owner + credenziali bucket R2 reali inserite lì, fuori dal repo).
4. **R2 promosso a `StorageProvider` completo**: i metodi cartella usano semantica a **prefisso di chiave** (R2/S3 non ha directory reali):
   - `createFolder`/`createFolderTree`: **no-op** (le prefix esistono implicitamente alla prima `putObject`).
   - `listFolder(path)`: `ListObjectsV2` con `Prefix` + `Delimiter='/'` → `CommonPrefixes` (sottocartelle) + `Contents` (file) mappati in `StorageObject[]`.
   - `getDownloadUrl`: presigned GET (già esiste).
   - `uploadFile`/`uploadStream`: `putObject` (già esiste, wrappato all'interfaccia).
   - `move(from,to)`: `copyObject` + `delete` (già esistono).
   - `exists(path)`: `head` → true; 404 → false.
   - `delete(path)`: cancella la chiave; se è un "prefisso" (folder) lista e cancella in batch.
   - Isolamento per-tenant: il provider riceve un `keyPrefix`/`basePath` (es. `tenants/{tenantId}`) e lo antepone a ogni path (come `withBase` di Nextcloud), coerente con `buildR2Key()`.

---

## 4. Punti d'innesto (file → modifica)

| Compito | File |
|---|---|
| Enum `+'r2'` + colonna `crea_cartelle` | nuova migration `supabase/migrations/2026061900*_storage_r2_mode.sql` |
| `StorageProviderName += 'r2'` | `packages/integrations/src/storage/types.ts` |
| `StorageProviderConfig` campi R2 + factory case `'r2'` | `packages/integrations/src/storage/index.ts` |
| `R2StorageProvider implements StorageProvider` (metodi mancanti) | `packages/integrations/src/storage/r2.ts` |
| Helper `resolveStorageConfig(tenantRow)` + predicato `shouldProvisionFolders(tenantRow)` | nuovo `packages/integrations/src/storage/resolve.ts` (puro, testabile) |
| Gating provisioning (`crea_cartelle`/`r2` no-op) | `app/_actions/_lib/provisiona-cartelle.ts`, `app/_actions/crea-commessa.ts` |
| `creaTenant` schema + insert (`'r2'`, `r2_config`, `crea_cartelle`) | `app/admin/_actions/tenants.ts` |
| Wizard step Storage: opzione `r2` + campi + toggle cartelle + test conn. R2 | `app/admin/tenants/nuovo/_components/wizard.tsx`, `testaConnessioneStorage` |
| Vitest in `packages/integrations` (per TDD helper puri) | `packages/integrations/{package.json,vitest.config.ts}` |

---

## 5. Sicurezza / produzione

- **Additivo e non distruttivo per Bertaiola**: aggiungere `'r2'` all'enum e una colonna `crea_cartelle` con default `true` non cambia nulla per `nextcloud`. I rami `r2` sono nuovi codepath, mai presi da Bertaiola.
- **Enum gotcha**: `ALTER TYPE ... ADD VALUE IF NOT EXISTS 'r2'` in una migration **dedicata** che NON usa il nuovo valore nello stesso file (il nuovo valore enum non è utilizzabile nella stessa transazione che lo crea).
- **Bucket R2 condiviso** con isolamento per prefisso `tenants/{tenantId}/`: nessun accesso cross-tenant (le chiavi sono per-tenant; le credenziali R2 sono server-side).
- Migration applicata al cloud **dall'umano**. La creazione del tenant FPM è manuale via wizard.

---

## 6. Fuori scope Fase B (annotato, non silenzioso)

- **Skip della sync R2→Nextcloud per i tenant `r2`**: FPM non avrà media finché non arrivano QR/foto (Fasi D/E). Verrà gestito allora (la query della sync escluderà `storage_provider='r2'`). Annotato qui per non dimenticarlo.
- File browser R2 in UI office/PWA: non necessario per FPM v1 (modulo presenze). `listFolder` viene implementato comunque per completezza dell'interfaccia.
- Creazione effettiva del tenant FPM (operativa).

---

## 7. Testing

- Unit (Vitest in `packages/integrations`): `resolveStorageConfig` (mappa tenantRow→config per ogni provider), `shouldProvisionFolders` (false se `crea_cartelle=false` o provider `r2`), key-prefixing R2 (`withBase`), parsing `ListObjectsV2`→`StorageObject[]`.
- Verifica: typecheck + build verdi. I metodi R2 di rete (putObject/list/head reali) non unit-testati (dipendono da R2) — verificati manualmente al deploy di prova quando crei FPM.
