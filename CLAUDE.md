# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stato produzione

> **L'app è in produzione dal 28/05/2026.** Bertaiola Impianti è il cliente reale attivo. Ogni push su `main` viene deployato automaticamente. Tratta il DB e i dati come produzione — no test casuali, no reset senza conferma esplicita.

### Stack AI (28/05/2026)

| Fase | Modello | Override |
|---|---|---|
| Trascrizione audio dettato | **`gpt-4o-mini-transcribe`** (per-tenant override su Bertaiola) | `tenants.transcribe_model` o env `OPENAI_MODEL_TRANSCRIBE` |
| Estrazione campi strutturati da transcript | `gpt-4o-mini` | env `OPENAI_MODEL_EXTRACT` |
| Suggerimento nome cartella + copilot | `gpt-5-mini` (fallback `gpt-4o-mini`) | env `OPENAI_MODEL_CHAT` |

Il modello di trascrizione è scegliebile per tenant dal pannello super admin (`/admin/tenants/[id]` → tab "AI"): whisper-1 / gpt-4o-mini-transcribe / gpt-4o-transcribe. Bertaiola usa `gpt-4o-mini-transcribe` (più accurato di whisper-1 su rumore di cantiere, costa la metà).

## What this repository is

This is the working repo for the **Bertaiola Impianti × SOLVA (Kommessa)** project. It contains:

1. **Codice di prodotto** (sviluppo attivo):
   - `apps/web/` — Next.js 14 App Router (3 superfici sotto un solo app: `office/`, `mobile/`, `portal/`)
   - `packages/api/`, `packages/ui/`, `packages/integrations/` — pacchetti workspace (`@kommessa/*`)
   - `supabase/migrations/` — schema versionato (49 migrazioni applicate al cloud al 28/05/2026)
   - `supabase/functions/` — Edge Functions (Deno)
   - `scripts/` — script operativi (es. `reset-tenant-data.mjs`, `freshdesk-migration`)
2. **Documentazione di prodotto** sotto `documentazione_generale/` — kickoff, architettura, brand, roadmap, mockup, preventivo, presentazioni.

### Pipeline thumbnail foto (dal 28/05/2026 sera, 50ª migration)

Le gallerie immagini (PWA mobile, office riunioni, foto-tab) servono **thumb 400×400 webp ~30 KB persistenti su R2** invece del full-size 3-5 MB proxato da Nextcloud.

- **Generazione**: hook fire-and-forget nel `/api/upload/media/[id]/complete` chiama `generateAndUploadThumb()` (helper `apps/web/app/_lib/thumbnails.ts`). Solo `mime image/*`, usa `sharp ^0.33.5`.
- **Path R2**: `{stesso_path_originale}/thumbs/{shortId}.webp` — derivato via `deriveThumbKey()`.
- **DB**: colonna `file_refs.r2_thumb_key text` (migration `20260528010000`).
- **Endpoint**: `/api/photo/[id]?size=thumb` redirect 302 a signed GET R2 5min TTL; fallback al full-size proxy se thumb mancante (foto vecchie funzionano comunque).
- **Backfill**: POST `/api/admin/thumbs/backfill` con header `X-Internal-Backfill-Secret: $CRON_SECRET`, body `{limit?, dryRun?}`.
- **Admin osservabilità**: `/admin/media` mostra `% thumb generate` + flag visivo per riga (synced+thumb → riga emerald).
- **Video**: NON gestiti (`sharp` non li supporta). Restano su `<video preload="metadata">`. Futuro: ffmpeg-server o frame extraction client-side.

> **Display titolo commessa**: nelle UI non mostrare mai `nome_cartella` raw (è la directory Nextcloud nel formato `{codice}_{cliente}_{lavoro}`). Usare sempre `risolviTitoloCommessa()` da `apps/web/app/_lib/commessa-display.ts` che pesca da `descrizione_ai_finale → proposta → note_iniziali` con fallback estrattivo da nome_cartella (CamelCase → spazi).

Working language for the app UI is **Italian**. Preserve it.

### Infrastruttura produzione

| Servizio | Dettaglio |
|---|---|
| **Vercel** | team `solvasolutions`, progetto `bertaiolaimpianti`. Deploy automatico da `main`. URL: `https://bertaiolaimpianti.vercel.app` |
| **Supabase** | progetto `BertaiolaImpianti_GestioneCommesse`, ref `vuhqioixvgaadyxnerfg`, region **West EU (Ireland)**. Dashboard: `https://supabase.com/dashboard/project/vuhqioixvgaadyxnerfg` |
| **Nextcloud** | Hetzner Storage Share managed, già acquistato e configurato dal cliente. `basePath` e credenziali in `apps/web/.env.local` sotto `STORAGE_*`. |
| **Cloudflare R2** | Bucket staging per upload media. Credenziali `R2_*` in `.env.local`. I file vengono inviati prima su R2 poi sincronizzati su Nextcloud. |

**Credenziali**: tutte in `apps/web/.env.local` (gitignored). **Mai citare password in chiaro in prompt/transcript/commit.**

**Migrazioni DB**: scrivere solo il file SQL in `supabase/migrations/` — l'apply al DB cloud lo esegue l'umano con `supabase db push` o `psql`.

**Deploy**: solo `git push origin main`. La GitHub integration Vercel fa tutto. Non usare `vercel deploy --prod` manualmente (raddoppia la build sul piano Hobby).

Working language for all documents is **Italian**. Preserve it when editing; do not translate existing content unless asked.

> **Product name**: `Kommessa` (rebrand definitivo da `impiantiXplus`, maggio 2026). Pacchetti workspace: `@kommessa/api`, `@kommessa/ui`, `@kommessa/integrations`, `@kommessa/web`.

## Repository layout (purpose-ordered, not alphabetical)

- `README.md`, `CLAUDE.md` — root-level docs
- `documentazione_generale/` — all kickoff documentation, consolidated:
  - `00_input_cliente/` — original client meeting PDFs (14/11 and 28/11/2025), source-of-truth raw input
  - `01_KICKOFF/` — Documento Zero (vision/context), Report Riunione (decisions log), Flusso_Operativo (product flow), Domande_Cliente_SOLVA.md (compiled client questionnaire)
  - `02_ARCHITETTURA/` — technical architecture, stack choices, storage comparison, infra cost estimate
  - `03_BRAND/` — three legacy candidate names (Cantiera, Posa, ImpiantOS) kept as historical material; current working name `impiantiXplus` is in the top-of-file note
  - `04_ROADMAP/` — Sprint 0 → Sprint 5 plan with effort estimates
  - `05_MOCKUP/` — UI wireframes (6 priority screens)
  - `06_PREVENTIVO/` — commercial quote with 3 package tiers
  - `07_PRESENTAZIONI/` — generated `.pptx` slide decks (Executive, Tecnica; Commerciale TBD) — **out of date with current product name, need regeneration**

The `README.md` reading order (Documento_Zero → Report_Riunione → Flusso_Operativo → Comparativa_Storage → Architettura_Soluzione → Roadmap → Preventivo → PPTs) is the canonical onboarding path. All paths there are now relative to `documentazione_generale/`.

## Load-bearing architectural decisions (do not silently contradict)

These decisions evolved across versions — the current state is **v3** (commit `5000547`: "v3: abbandono Freshdesk + PWA tecnici al posto di Expo"). When editing any document, keep these aligned:

| Decision | Status |
|---|---|
| **Product name** | **Kommessa** (definitivo dal maggio 2026, rebrand da `impiantiXplus`). Legacy alternatives in `03_BRAND/` sono solo contesto storico. |
| **Freshdesk** | **Abandoned** post go-live. One-time API migration script, then native ticketing in the new app. Do not describe it as "integrated". |
| **Mobile tecnici** | **PWA** (Next.js + Service Worker + Web App Manifest). **Not** Expo, **not** React Native, **not** native iOS/Android. No App Store / Play Store. |
| **Storage cloud** | ✅ **Nextcloud confirmed** (Hetzner Storage Share managed). Decisione chiusa: il cliente Bertaiola ha già acquistato e configurato Nextcloud, il file browser mobile vede i file reali. Mantenere comunque l'astrazione `StorageProvider` nel codice per supportare in futuro altri tenant con provider diversi. |
| **Backend** | Supabase Pro, region **Frankfurt EU** (GDPR). Postgres + Auth + Realtime + Edge Functions. |
| **Web** | Next.js 14 on Vercel. Monorepo with shared codebase across web office / PWA tecnici / portale cliente. |
| **Multitenant** | From day 1. Bertaiola is the **pilot tenant** of a SaaS product (working name **impiantiXplus**). |
| **Hosting** | 100% EU. GDPR compliance is a hard requirement. |
| **Pricing reference** | Pacchetto B ≈ €20.020 + IVA year 1; ≈ €3.920/year recurring. Update `documentazione_generale/06_PREVENTIVO/Preventivo_Base.md` if numbers change anywhere else. |

## Cross-document consistency

These files cite each other and must stay in sync — when changing one, check the others:

- Scope/decisions: `README.md` ↔ `documentazione_generale/01_KICKOFF/Documento_Zero.md` ↔ `documentazione_generale/01_KICKOFF/Report_Riunione.md` ↔ `documentazione_generale/01_KICKOFF/Flusso_Operativo.md`
- Tech choices: `documentazione_generale/02_ARCHITETTURA/Stack_Tecnico.md` ↔ `documentazione_generale/02_ARCHITETTURA/Architettura_Soluzione.md` ↔ `documentazione_generale/07_PRESENTAZIONI/Bertaiola_Tecnica.pptx`
- Costs: `documentazione_generale/02_ARCHITETTURA/Stima_Costi_Infrastruttura.md` ↔ `documentazione_generale/06_PREVENTIVO/Preventivo_Base.md`
- High-level pitch: both PPTs in `documentazione_generale/07_PRESENTAZIONI/` reflect the choices above and need to be regenerated when those choices change (see open-items list at the bottom of `README.md`).

## Document conventions

- Versioned headers (`**Versione**: 1.0`, `**Stato**: …`) at the top of each `.md` — bump them when making substantive changes.
- Pricing or third-party-claim text is wrapped in `<span class="cite">…</span>` to flag it as needing a citation/source — preserve these spans.
- Tables are used heavily for decisions and trade-offs; keep that format rather than converting to prose.
- `.pptx` files are binary artifacts generated from the markdown — editing them by hand is out of scope; regenerate from source when content drifts.
- The word "**cantiere/cantieri**" (with the "e") is the working domain ("construction site/job site") and must NOT be confused with the obsolete product name "Cantiera". Do not rename `cantiere` occurrences.
