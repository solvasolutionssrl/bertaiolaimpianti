# Flusso Media Upload — Kommessa

**Versione**: 1.0
**Stato**: In produzione (maggio 2026)
**Autore**: SOLVA

---

## Panoramica

Il sistema gestisce due tipi di file:

1. **Foto/video cantiere** — scattate dal tecnico dalla PWA mobile
2. **Documenti** — PDF, fogli Excel, ecc. caricati dall'ufficio

Ogni tenant ha il proprio provider di storage. Il tenant pilota **Bertaiola Impianti** usa **Nextcloud** (Hetzner). L'astrazione `StorageProvider` in `packages/integrations/src/storage/` permette di supportare Supabase Storage o altri provider per tenant futuri.

---

## Flusso upload foto (PWA mobile) — 3 fasi

```
Tecnico (browser)
    │
    │  1. Scatta foto / seleziona da galleria
    │
    ▼
[/mobile/commessa/[id]/scatto]   ← ScattoForm client component
    │
    │  2. POST FormData → Server Action uploadFotoFromForm()
    │     apps/web/app/mobile/_actions/foto.ts
    │
    ▼
[Server Action]
    ├─ Verifica auth + tenant (requireTenantContext)
    ├─ Legge commessa.cloud_folder_path da DB
    ├─ Costruisce path: <root>/Foto/<momento>/<voce?>/<timestamp>_<rand>.ext
    ├─ Risolve provider: tenants.storage_provider + tenants.storage_config
    ├─ Upload binario via StorageProvider.uploadFile()
    ├─ INSERT file_refs (path, mime, size, geo, taken_at, uploaded_by)
    ├─ INSERT file_annotations se presente (layer_json, width_px, height_px)
    └─ INSERT audit_events
    │
    ▼
[Nextcloud] ← file fisico archiviato definitivamente
[Supabase]  ← metadata in file_refs, annotazioni in file_annotations
```

### Path di destinazione Nextcloud
```
<cloud_folder_path>/Foto/<momento>/<voce?>/<YYYYMMDD_HHmmss>_<rand6>.<ext>
```
Dove:
- `cloud_folder_path` = es. `/Bertaiola Impianti/2026/BER-001 - Nome Commessa`
- `momento` = `Sopralluogo` | `In corso` | `Finali`
- `voce` = nome della voce catalogo sanitizzato (es. `Impianto_Elettrico`)

### Tabelle DB coinvolte
| Tabella | Ruolo |
|---|---|
| `file_refs` | Metadata del file: path, mime, size, geo, voce_id, momento, uploaded_by |
| `file_annotations` | Overlay di disegno/annotazione (layer_json) opzionale per file |
| `audit_events` | Log `file.upload` + `annotation.create` |

---

## Flusso upload R2 (media staging)

Per file grandi o upload multipli dalla PWA, esiste un secondo flusso via **Cloudflare R2** come buffer:

```
Client → GET /api/media/presign → Presigned PUT URL (R2, TTL 15 min)
Client → PUT diretto su R2 (no Vercel, no size limit)
Client → POST /api/media/complete → server aggiorna file_refs.status = 'uploaded'
```

La colonna `file_refs.r2_key` + enum `media_status` (`pending`/`uploaded`/`synced`/`error`) tracciano lo stato nel pipeline.

Serving: `GET /api/media/[id]` → verifica RLS → genera signed GET URL R2 (TTL 5 min) → redirect.

> **Nota**: il sync R2 → Nextcloud (worker idempotente con SHA-256) è pianificato ma non ancora implementato. Oggi i due flussi (upload diretto Nextcloud e R2 staging) coesistono.

---

## Flusso documenti (Nextcloud file browser)

Il tab "File" in ogni commessa (mobile + office) mostra la cartella Nextcloud in tempo reale:

```
page.tsx (Server Component)
    │
    ├─ getStorageProvider({ provider: 'nextcloud', ... })
    ├─ storage.listFolder(commessa.cloud_folder_path)
    └─ Renders <CartellaEntries entries={...} />
```

La navigazione sub-cartelle avviene tramite route `/mobile/commessa/[id]/cartella/[...path]` che richiama di nuovo `listFolder` con il path relativo.

**ACL cartelle**: la tabella `folder_acl` + helper `canView()` in `apps/web/app/_lib/folder-acl.ts` filtrano le entry visibili in base al ruolo dell'utente. I tecnici non vedono, per esempio, la sottocartella "Preventivi".

---

## StorageProvider — interfaccia

Definita in `packages/integrations/src/storage/index.ts`:

```typescript
interface StorageProvider {
  uploadFile(path: string, data: Uint8Array, opts): Promise<{ path: string }>
  listFolder(path: string): Promise<StorageObject[]>
  getDownloadUrl(path: string): Promise<string>
  delete(path: string): Promise<void>
}
```

Implementazioni:
- `NextcloudProvider` — WebDAV + OCS API Nextcloud
- `SupabaseStorageProvider` — Supabase Storage bucket

La risoluzione del provider avviene sempre lato server leggendo `tenants.storage_provider` + `tenants.storage_config` (service role per bypassare RLS).

---

## Thumbnail

Le thumbnail non vengono generate lato server (TODO aperto). Oggi:
- Foto caricate via `uploadFoto()` diretta: `file_refs.thumbnail_url = null`
- La gallery mobile/office fa fallback a serving diretto del file originale via `/api/media/[id]` (presigned URL R2 o URL Nextcloud diretto)
- Precedente logica usava URL Nextcloud con `?preview=true` (rimosso perché lento)

Implementazione futura: sharp/squoosh lato server → Supabase Storage `commesse-thumbs` bucket → popola `file_refs.thumbnail_url`.

---

## File chiave nel codice

| File | Ruolo |
|---|---|
| `apps/web/app/mobile/_actions/foto.ts` | Server Action upload foto + annotazioni |
| `apps/web/app/mobile/commessa/[id]/scatto/` | Form di scatto mobile |
| `apps/web/app/mobile/commessa/[id]/cartella/` | File browser mobile (Nextcloud) |
| `apps/web/app/mobile/commessa/[id]/_components/foto-tab.tsx` | Gallery foto per tab mobile |
| `apps/web/app/api/media/[id]/route.ts` | Serving presigned URL R2 |
| `apps/web/app/api/media/presign/route.ts` | Generazione presigned PUT R2 |
| `packages/integrations/src/storage/` | StorageProvider abstraction |
| `supabase/migrations/20260101000900_file_refs.sql` | Schema file_refs |
| `supabase/migrations/20260101002200_file_annotations.sql` | Schema annotazioni |
| `supabase/migrations/20260101002800_media_r2_staging.sql` | Schema R2 pipeline |
