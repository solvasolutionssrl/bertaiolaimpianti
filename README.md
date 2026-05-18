# Bertaiola Impianti × SOLVA · impiantiXplus
**Pacchetto di kickoff completo — v1.1 (Maggio 2026)**

Repository del progetto di digitalizzazione gestione documenti e lavori per Bertaiola Impianti, sviluppato come istanza pilota del SaaS multitenant **impiantiXplus** (SOLVA Solutions, working name).

> 📁 La documentazione di kickoff (analisi, architettura, brand, roadmap, mockup, preventivo, presentazioni) vive sotto `documentazione_generale/`. Il root della repo ospita il monorepo di codice (Next.js + Supabase + pacchetti workspace).

---

## 📁 Struttura del repository

```
.
├── README.md                       → questo file
├── CLAUDE.md                       → istruzioni per Claude Code
├── package.json                    → root del monorepo pnpm + turbo
├── pnpm-workspace.yaml             → workspace (apps/* + packages/*)
├── turbo.json                      → pipeline build/dev/lint/typecheck
├── .env.example                    → variabili ambiente — copiare in .env.local
│
├── apps/
│   └── web/                        → Next.js 14 (App Router) — vedi apps/web/README.md
│
├── packages/
│   ├── api/                        → @impiantixplus/api — client Supabase, schemas zod, tenant utils
│   ├── ui/                         → @impiantixplus/ui — design system (Radix + Tailwind)
│   └── integrations/               → @impiantixplus/integrations — storage, email, push, AI, freshdesk
│
├── supabase/                       → migrazioni SQL + Edge Functions — vedi supabase/README.md
│   ├── migrations/                 → schema versionato (estensioni → tenants → users → ... → RLS)
│   ├── functions/                  → Edge Functions (TBD)
│   ├── seed.sql                    → dati di bootstrap per dev locale
│   └── config.toml                 → config CLI Supabase
│
├── scripts/                        → script one-time (migrazione Freshdesk, ...) — vedi scripts/README.md
│
└── documentazione_generale/        → 📚 background pre-sviluppo (lavoro precedente)
    │
    ├── 00_input_cliente/           → PDF di kickoff cliente (14/11 e 28/11/2025)
    │
    ├── 01_KICKOFF/                 → FASE 1 — Documento Zero, Report Riunione, Flusso, Tassonomia
    │   ├── Documento_Zero.md
    │   ├── Report_Riunione.md
    │   ├── Flusso_Operativo.md          ← flusso operativo prodotto (sopralluogo → commessa)
    │   ├── Tassonomia_Lavori.md         ← le 38 voci dal PDF cliente: default + selezionabili
    │   └── Domande_Cliente_SOLVA.md     ← compilato dal cliente
    │
    ├── 02_ARCHITETTURA/            → FASE 3-4 — Architettura tecnica & infrastruttura
    │   ├── Architettura_Soluzione.md      (schema logico, multitenancy, modello dati)
    │   ├── Stack_Tecnico.md               (tutte le tecnologie scelte)
    │   ├── Comparativa_Storage.md         (perché Nextcloud > SharePoint — scelta storage TBD)
    │   └── Stima_Costi_Infrastruttura.md  (costi annui + giustificazione listini)
    │
    ├── 03_BRAND/                   → Proposta brand SaaS multitenant
    │   └── Proposta_Brand_Prodotto.md     (storico 3 candidati; nome attuale: impiantiXplus)
    │
    ├── 04_ROADMAP/                 → Piano sprint
    │   └── Roadmap_Sprint.md              (Sprint 0 → Sprint 5, durate ed effort)
    │
    ├── 05_MOCKUP/                  → Wireframe UI
    │   └── Mockup_UI.md                   (6 schermate prioritarie)
    │
    ├── 06_PREVENTIVO/              → Base tecnico-economica
    │   └── Preventivo_Base.md             (3 pacchetti commerciali consigliati)
    │
    └── 07_PRESENTAZIONI/           → Slide deck finali (da rigenerare con nuovo nome)
        ├── Bertaiola_Executive.pptx       (10 slide, pubblico tecnico, alto livello)
        └── Bertaiola_Tecnica.pptx         (12 slide, deep dive architetturale)
        └── (Bertaiola_Commerciale.pptx — NON inclusa, da fare in seguito)
```

---

## 🎯 TL;DR — punti chiave decisi

| Tema | Decisione |
|---|---|
| **Scope MVP** | Web ufficio · **PWA tecnici (installabile)** · Sync cartelle ufficio · Multitenancy · **Ticketing nativo base** |
| **Freshdesk** | **Abbandonato dopo go-live** · migrazione one-time via API (Sprint 2) |
| **Storage file** | 🟡 **TBD** — decisione rimandata (opzioni: Hetzner Storage Share, alternative cloud da rivalutare insieme) |
| **Backend** | Supabase Pro (Frankfurt EU) — Postgres + Auth + Realtime + Edge Functions |
| **Web** | Next.js 14 su Vercel |
| **Mobile tecnici** | **PWA** (Next.js + Service Worker + Web App Manifest) — no App Store, no Play Store, installabile via "Aggiungi alla schermata Home" |
| **Brand** | Doppio brand SOLVA + Bertaiola, prodotto SaaS proposto: **impiantiXplus** (working name) |
| **Hosting** | 100% UE — GDPR compliant |
| **Go-live MVP** | 1 mese dal kickoff sviluppo |
| **Costo anno 1 (Pacchetto B)** | ~€ 20.020 + IVA (chiavi in mano) |
| **Anno 2 a regime** | ~€ 3.920/anno (infra + manutenzione Standard) |

---

## 🚀 Quickstart sviluppo

Requisiti: Node ≥ 22, `pnpm@9`, Docker (per Supabase locale), CLI `supabase`.

```bash
# 1. Installa dipendenze workspace
pnpm install

# 2. Copia env e popolale (vedi sezione "Variabili ambiente")
cp .env.example .env.local

# 3. Avvia Supabase locale (Postgres + Auth + Storage + Studio)
pnpm supabase:start

# 4. Applica migrazioni + seed di sviluppo (idempotente, reset volume)
pnpm supabase:reset

# 5. Genera tipi TypeScript dal DB (rifare ad ogni modifica schema)
pnpm supabase:types

# 6. Lancia tutte le app/package in dev (turbo --parallel)
pnpm dev
```

App Next.js disponibile su <http://localhost:3000>. Supabase Studio su <http://localhost:54323>.

Altri script root utili:

| Comando | Cosa fa |
|---|---|
| `pnpm build` | Build di tutto il workspace |
| `pnpm lint` | Lint di tutto il workspace |
| `pnpm typecheck` | Typecheck di tutto il workspace |
| `pnpm format` | Prettier su tutti i `.ts/.tsx/.md/.json` |
| `pnpm supabase:stop` | Ferma i container Supabase locali |
| `pnpm migrate:freshdesk` | Migrazione one-time Freshdesk (vedi sezione dedicata) |

---

## 🏗️ Architettura del codice

Monorepo `pnpm` + `turbo`. Tutte le 3 superfici prodotto vivono dentro **una** Next.js app (`apps/web`), separate per route group e selezionate dal `middleware.ts` in base all'host (`m.<dominio>` → `/mobile`, `cliente.<dominio>` → `/portal`, dominio principale → `/office`).

```
apps/web/                       # Next.js 14, App Router
  app/
    (office)/                   # 🖥️ dashboard ufficio — commesse, ticket, clienti
    (mobile)/                   # 📱 PWA tecnici — foto cantiere, checklist
    (portal)/                   # 👤 portale cliente finale — magic-link, stato lavori
  middleware.ts                 # routing per host + refresh sessione Supabase

packages/api/                   # @impiantixplus/api
  src/
    client.ts                   # Supabase client browser (SSR-safe)
    server.ts                   # Supabase client per server components + updateSession
    service.ts                  # service-role (bypass RLS) — solo Edge / scripts
    tenant.ts                   # risoluzione tenant da host/cookie
    schemas/                    # zod schemas condivisi (input forms)
    types/                      # tipi generati da Supabase + tipi domain

packages/ui/                    # @impiantixplus/ui — Radix + Tailwind, components condivisi
packages/integrations/          # @impiantixplus/integrations
  src/
    storage/                    # abstraction Supabase / Nextcloud (storage TBD)
    email/                      # Resend (outbound + inbound parser)
    push/                       # Web Push VAPID
    ai/                         # Anthropic Claude (naming, OCR support)

supabase/
  migrations/                   # schema SQL versionato — un file = un cambiamento
  functions/                    # Edge Functions (parseInboundEmail, notifyOnEvent, ...)
  seed.sql                      # dati di sviluppo locale

scripts/
  migrate-freshdesk.ts          # migrazione one-time (vedi sezione + scripts/README.md)
```

Pacchetti workspace consumati come `@impiantixplus/*` (vedi `pnpm-workspace.yaml`).

---

## 🔐 Variabili ambiente

Tutto in `.env.local` (non versionato). Schema completo in [`.env.example`](.env.example). Chiavi obbligatorie:

| Chiave | Scope | Note |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | web | URL base dell'app |
| `NEXT_PUBLIC_TENANT_DEFAULT` | web | Tenant fallback se host non match (dev: `bertaiola`) |
| `NEXT_PUBLIC_SUPABASE_URL` | web + server | Endpoint Supabase (locale o Frankfurt EU in prod) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web | Anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | server + scripts | **Mai** esposta al client. Bypass RLS. |
| `ANTHROPIC_API_KEY` | server | Claude Haiku per naming AI commesse |
| `RESEND_API_KEY` | server | Outbound email + ricezione webhook inbound |
| `RESEND_INBOUND_SECRET` | server | Firma webhook Resend inbound |
| `STORAGE_PROVIDER` | server | `supabase` (default dev) o `nextcloud` — TBD, vedi `CLAUDE.md` |
| `NEXTCLOUD_*` | server | Solo se `STORAGE_PROVIDER=nextcloud` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | server + web | Web Push |
| `FRESHDESK_API_KEY` / `FRESHDESK_DOMAIN` | scripts | Solo per migrazione one-time |

Per ambienti Vercel: configurare le stesse chiavi (con `NEXT_PUBLIC_` ben distinte) tramite `vercel env` o dashboard.

---

## 🚢 Deploy

### Web (Next.js → Vercel)

Project Vercel collegato al repo, branch `main` = production, PR = preview deploy.

```bash
# Promote di una build già preparata (CI)
vercel deploy --prebuilt --prod

# Deploy diretto da locale (solo emergenze)
vercel --prod
```

Domini configurati:

- `app.impiantixplus.app` (working) → office
- `m.impiantixplus.app` → PWA tecnici (route group `/mobile`)
- `cliente.impiantixplus.app` → portale cliente (route group `/portal`)

### Backend (Supabase Pro, region Frankfurt EU)

```bash
# Link al progetto Supabase remoto (una tantum)
supabase link --project-ref <ref>

# Push delle migrazioni in remoto
supabase db push

# Deploy di una Edge Function
supabase functions deploy <name>

# Webhook pubblici (Resend inbound, ...) — disabilita verifica JWT
supabase functions deploy parseInboundEmail --no-verify-jwt
```

Region GDPR-compliant: Frankfurt EU. Tutto il dato cliente vive in UE.

---

## 📥 Migrazione Freshdesk

> **Una tantum.** Decisione v3 (vedi `CLAUDE.md`): Freshdesk viene **abbandonato dopo go-live**. Lo script importa tutto lo storico (ticket + conversazioni + allegati + clienti) nelle tabelle native, marcando le righe con `source='imported_from_freshdesk'` e `freshdesk_legacy_id`.

```bash
# Dry-run di validazione (primi 20 ticket, nessuna scrittura)
pnpm migrate:freshdesk \
  --tenant=bertaiola \
  --api-key=<FD_API_KEY> \
  --domain=bertaiolaimpianti \
  --dry-run --limit=20

# Migrazione completa
pnpm migrate:freshdesk \
  --tenant=bertaiola \
  --api-key=<FD_API_KEY> \
  --domain=bertaiolaimpianti
```

Dettaglio CLI, idempotenza, mapping enum e gestione rate limit: vedi [`scripts/README.md`](scripts/README.md).

Spec di riferimento: `documentazione_generale/02_ARCHITETTURA/Architettura_Soluzione.md` §6.1 + `documentazione_generale/04_ROADMAP/Roadmap_Sprint.md` §"SPRINT 2".

---

## 🛠️ Come leggere questi documenti

**Se sei nuovo al progetto**, leggi in ordine:
1. `documentazione_generale/01_KICKOFF/Documento_Zero.md` — visione e contesto
2. `documentazione_generale/01_KICKOFF/Report_Riunione.md` — cosa è stato discusso e deciso
3. `documentazione_generale/01_KICKOFF/Flusso_Operativo.md` — come funziona il prodotto in pratica
4. `documentazione_generale/01_KICKOFF/Tassonomia_Lavori.md` — le 38 voci/fasi (default + selezionabili dal capo)
5. `documentazione_generale/02_ARCHITETTURA/Comparativa_Storage.md` — perché abbiamo cambiato approccio rispetto a v1
6. `documentazione_generale/02_ARCHITETTURA/Architettura_Soluzione.md` — come funziona tecnicamente
7. `documentazione_generale/04_ROADMAP/Roadmap_Sprint.md` — quando si fa cosa
8. `documentazione_generale/06_PREVENTIVO/Preventivo_Base.md` — quanto costa
9. `documentazione_generale/07_PRESENTAZIONI/*.pptx` — versioni "show and tell" per riunioni

**Se devi presentare al cliente**, apri direttamente le due PPT in `documentazione_generale/07_PRESENTAZIONI`.

**Se devi ricalibrare il preventivo**, modifica `documentazione_generale/06_PREVENTIVO/Preventivo_Base.md` e rigenera la PPT commerciale (da produrre).

---

## 📅 Cronologia di kickoff

| Data | Evento | Output |
|---|---|---|
| 14/11/2025 | Riunione cliente — mappatura processo | PDF v1 (in `documentazione_generale/00_input_cliente/`) |
| 28/11/2025 | Riunione cliente — proposta architettura M365 | PDF v2 (in `documentazione_generale/00_input_cliente/`) |
| Dic 2025 | Compilazione questionario SOLVA + decisione pivot architetturale | `01_KICKOFF/Domande_Cliente_SOLVA.md` compilato |
| Dic 2025 | Produzione pacchetto v2 documentazione | tutti i documenti sotto `documentazione_generale/` |
| Mag 2026 | Consolidamento doc in `documentazione_generale/` + rinomina prodotto in `impiantiXplus` | questo aggiornamento |
| 🟡 Da fare | Validazione cliente su brand + scope MVP + firma preventivo | — |
| 🟡 Da fare | Decisione finale storage cloud | — |
| 🟡 Da fare | Kickoff sviluppo Sprint 0 | — |

---

## 🚨 Cosa manca / da fare prossimamente

- [ ] **Decidere storage cloud** (rimandato — opzioni da rivalutare insieme)
- [ ] **Rigenerare le 2 PPT** (`documentazione_generale/07_PRESENTAZIONI/Bertaiola_Executive.pptx` + `Bertaiola_Tecnica.pptx`) per riflettere: nuovo nome **impiantiXplus**, **PWA** invece di Expo, **abbandono Freshdesk** invece di integrazione
- [ ] **Aggiornare `documentazione_generale/05_MOCKUP/Mockup_UI.md`** per riflettere modulo ticket nativo e PWA tecnici
- [ ] **PPT commerciale** — esclusa esplicitamente, da produrre dopo validazione preventivo
- [ ] Verifica WHOIS domini candidati (`impiantixplus.app`, `impiantixplus.it`, `impiantixplus.com`)
- [ ] Audit account Freshdesk del cliente per stima dimensione migrazione
- [ ] Brief grafico per logo impiantiXplus + icone PWA 192/512
- [ ] Roadmap manutenzioni: modulo nativo o integrazione impiantix.app (post-MVP)

---

**Autore**: SOLVA Solutions — Luca Melchiori & team
**Cliente**: Bertaiola Impianti
**Repository**: solvasolutionssrl/bertaiolaimpianti
