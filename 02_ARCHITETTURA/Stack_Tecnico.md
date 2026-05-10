# Stack tecnico
**Versione**: 1.0

---

## Stack scelto

| Layer | Tecnologia | Motivazione |
|---|---|---|
| **Frontend Web (ufficio + portale cliente)** | Next.js 14 + Tailwind CSS + shadcn/ui | SSR/CSR ibrido, deploy zero-config su Vercel, file-routing, ottima DX, SEO-friendly per il portale cliente |
| **Mobile (tecnici)** | **Expo (React Native)** | Stack JS condiviso col web (refactor team), <span class="cite">over-the-air updates senza review App Store</span>, build cloud via EAS, ideale per MVP rapido |
| **Backend / API** | Supabase Edge Functions (Deno) + REST/RPC Postgres | Funzioni serverless per webhook Freshdesk, callable RPC per logica custom |
| **Database** | Postgres 15 (Supabase) — region Frankfurt | RLS multitenant, full-text search incluso, vector ready se servirà AI search |
| **Auth** | Supabase Auth (email + password) | Custom UX, magic link disponibile, JWT con custom claims (tenant_id, role) |
| **Storage file primario** | Hetzner Storage Share (Nextcloud managed, Falkenstein DE) | UE, GDPR, sync desktop nativo, WebDAV+REST, costo bassissimo, multitenant |
| **Storage cache/thumbnail** | Supabase Storage (S3-like) | Thumbnail compresse + asset statici app |
| **Realtime / push** | Supabase Realtime + Expo Push Notifications | Aggiornamenti UI live (foto caricate, fasi completate) + push iOS/Android |
| **Email transactional** | Resend (oppure Supabase SMTP) | Notifiche email a ufficio e cliente |
| **OCR** | <span class="cite">Mistral OCR API ($1 per 1.000 pagine via Batch)</span> | Pochi volumi richiesti dal cliente, costo trascurabile |
| **AI search (fase 3, opz.)** | Anthropic Claude Haiku 4.5 ($1/$5 M tokens) | Ricerca semantica documenti |
| **CI/CD** | GitHub Actions + Vercel auto-deploy + EAS Build (Expo) | Pipeline standard, low-friction |
| **Monitoring** | Sentry (free tier sufficiente) + Vercel Analytics | Errori frontend/backend + traffic |
| **DNS** | Cloudflare (free) | CDN, DDoS, gestione CNAME multi-tenant |

## Perché Supabase

- **Postgres "vero"**: schema relazionale completo, niente lock-in NoSQL
- **Auth + Storage + Realtime integrati**: meno servizi da gestire = meno punti di rottura
- <span class="cite">Pro plan a $25/mese</span> include 8 GB DB + 100 GB storage + 100K MAU + 250 GB egress
- <span class="cite">Egress aggiuntivo $0.09/GB</span>, sotto controllo grazie a thumbnail cache
- Region UE Frankfurt → GDPR

## Perché Expo (e non Flutter)

- <span class="cite">Per MVP rapidi, Expo è quasi sempre la scelta giusta — ship, learn, iterate</span>
- Stack JS condiviso con frontend web: il team SOLVA riusa skill e componenti
- <span class="cite">EAS Build elimina il bisogno di Xcode/Android Studio locale</span>
- <span class="cite">EAS Update permette di pushare fix JavaScript bypassando review App Store</span> → critico per iterare velocemente nella fase post-go-live
- Comunità grande + libreria pre-built per camera/foto/push/geolocation

## Perché Hetzner Storage Share

→ Vedi `Comparativa_Storage.md` per il confronto completo. Sintesi:
- ~€5/mese per 1TB (vs ~€200/mese SharePoint v1)
- UE, GDPR
- Sync desktop ufficiale "alla vecchia"
- WebDAV + REST API → integrazione app diretta
- Open source: niente lock-in

## Repo & ambienti

```
solva-cantiera/  (mono-repo)
├── apps/
│   ├── web/              # Next.js (ufficio + portale cliente, multitenant via path)
│   ├── mobile/           # Expo React Native
│   └── docs/             # documentazione interna
├── packages/
│   ├── api/              # tipi condivisi, client Supabase, helper
│   ├── ui/               # componenti React condivisi web/mobile
│   └── integrations/     # webhook Freshdesk, Nextcloud WebDAV client
└── supabase/
    ├── migrations/       # schema SQL versionato
    ├── functions/        # Edge functions
    └── seed.sql
```

Ambienti:
- `local`  → Supabase local dev (Docker) + Nextcloud sandbox
- `staging` → progetto Supabase + Storage Share NX11 dedicato
- `prod`   → progetto Supabase + Storage Share NX11 per tenant Bertaiola

## Versioni di riferimento

| Tool | Versione |
|---|---|
| Node.js | 22 LTS |
| Next.js | 14.x |
| Expo SDK | 54+ (New Architecture default) |
| React Native | 0.84+ |
| Supabase JS | 2.x |
| Tailwind | 3.4+ |
| TypeScript | 5.x |

## Dipendenze da terze parti — riepilogo SLA / impegni

| Servizio | Tier scelto | SLA dichiarata | Failover plan |
|---|---|---|---|
| Vercel | Pro | <span class="cite">99,99% Enterprise / Pro non garantito</span> | DNS Cloudflare può puntare a fallback statico |
| Supabase | Pro $25/mo | best-effort | PITR backup, possibilità self-host Postgres se serve |
| Hetzner Storage Share | NX11/NX21 | High-availability cluster | Backup ZFS multipli + script export periodico verso S3 |
| Resend (email) | Free → Pro $20/mo | 99.9% | Fallback Supabase SMTP |
| Mistral OCR | API pay-per-use | best effort | Tesseract self-hosted fallback |
| Expo EAS | Production plan | best effort | Build locale possibile in caso di outage |
