# Stack tecnico
**Versione**: 1.0

---

## Stack scelto

| Layer | Tecnologia | Motivazione |
|---|---|---|
| **Frontend Web (ufficio + portale cliente)** | Next.js 14 + Tailwind CSS + shadcn/ui | SSR/CSR ibrido, deploy zero-config su Vercel, file-routing, ottima DX, SEO-friendly per il portale cliente |
| **Mobile tecnici** | **PWA — Next.js + Service Worker + Web App Manifest** | Stesso codebase del web, installabile su iPhone/Android via "Aggiungi alla schermata Home", **niente App Store / niente Play Store / niente review** |
| **Backend / API** | Supabase Edge Functions (Deno) + REST/RPC Postgres | Funzioni serverless per email inbound, conversioni ticket→commessa, callable RPC per logica custom |
| **Database** | Postgres 15 (Supabase) — region Frankfurt | RLS multitenant, full-text search incluso, vector ready se servirà AI search |
| **Auth** | Supabase Auth (email + password) | Custom UX, magic link disponibile, JWT con custom claims (tenant_id, role) |
| **Storage file primario** | Hetzner Storage Share (Nextcloud managed, Falkenstein DE) | UE, GDPR, sync desktop nativo, WebDAV+REST, costo bassissimo, multitenant |
| **Storage cache/thumbnail** | Supabase Storage (S3-like) | Thumbnail compresse + asset statici app |
| **Realtime** | Supabase Realtime (WebSocket) | Aggiornamenti UI live (foto caricate, fasi completate, ticket entranti) |
| **Push notifications** | Web Push API (PWA installata) + Email fallback Resend | Notifiche tecnici/ufficio multi-canale |
| **Email transactional + inbound** | Resend | Notifiche outbound + parsing email entranti → ticket nativi |
| **OCR** | <span class="cite">Mistral OCR API ($1 per 1.000 pagine via Batch)</span> | Pochi volumi richiesti dal cliente, costo trascurabile |
| **AI search (fase 3, opz.)** | Anthropic Claude Haiku 4.5 ($1/$5 M tokens) | Ricerca semantica documenti |
| **CI/CD** | GitHub Actions + Vercel auto-deploy | Pipeline standard, low-friction; nessun build mobile (PWA = stesso deploy del web) |
| **Monitoring** | Sentry (free tier sufficiente) + Vercel Analytics | Errori frontend/backend + traffic |
| **DNS** | Cloudflare (free) | CDN, DDoS, gestione CNAME multi-tenant + subdomain mobile (`m.<tenant>.cantiera.app`) |

## Perché Supabase

- **Postgres "vero"**: schema relazionale completo, niente lock-in NoSQL
- **Auth + Storage + Realtime integrati**: meno servizi da gestire = meno punti di rottura
- <span class="cite">Pro plan a $25/mese</span> include 8 GB DB + 100 GB storage + 100K MAU + 250 GB egress
- <span class="cite">Egress aggiuntivo $0.09/GB</span>, sotto controllo grazie a thumbnail cache
- Region UE Frankfurt → GDPR

## Perché PWA (e non app nativa Expo/Flutter)

- **Distribuzione frictionless**: WhatsApp un link → "Aggiungi alla Home" → in 30 secondi i tecnici hanno l'icona Cantiera sull'iPhone. Nessun App Store, nessun TestFlight, nessun account dev Apple/Google ($90+$25 risparmiati).
- **Update istantanei**: ogni deploy Vercel è immediatamente disponibile a tutti, senza review Apple (1-3 giorni).
- **Codebase unificato**: stessa app Next.js per web ufficio + PWA tecnici → componenti riutilizzati, una sola release pipeline, una sola code-review.
- **Capabilities sufficienti** per il caso d'uso Bertaiola: scatto foto, geolocalizzazione, upload background, notifiche push (su iOS richiede PWA installata).
- **Costo €0**: no Apple Developer Program, no Google Play, no Expo EAS Production.
- **Reversibile**: se in futuro serve davvero un'app nativa, lo stack JS si adatta a React Native con minimal refactor.

### Trade-off accettati
| Limitazione PWA | Mitigazione |
|---|---|
| Push iOS solo se PWA installata in home | Sempre disponibile email fallback per notifiche critiche; per Bertaiola il caso d'uso è "tecnici in cantiere che fanno upload", non "tecnici da svegliare con push" |
| Performance leggermente inferiore a native | Sufficiente per upload foto + lista + dettaglio commessa; nessun gioco/3D |
| No accesso ad alcune API native (Bluetooth, NFC) | Non richieste per il caso d'uso |

## Perché Hetzner Storage Share

→ Vedi `Comparativa_Storage.md` per il confronto completo. Sintesi:
- ~€5/mese per 1TB (vs ~€200/mese SharePoint v1)
- UE, GDPR
- Sync desktop ufficiale "alla vecchia"
- WebDAV + REST API → integrazione app diretta
- Open source: niente lock-in

## Repo & ambienti

```
solva-cantiera/  (mono-repo Next.js)
├── apps/
│   ├── web/              # Next.js — host di tutte le superfici
│   │   ├── app/(office)/        # web ufficio (5 PC Bertaiola)
│   │   ├── app/(mobile)/        # PWA tecnici — route m.cantiera.app
│   │   │   ├── manifest.ts      # Web App Manifest
│   │   │   └── sw.ts            # Service Worker
│   │   └── app/(portal)/        # portale cliente finale
│   └── docs/             # documentazione interna
├── packages/
│   ├── api/              # tipi condivisi, client Supabase, helper
│   ├── ui/               # componenti React condivisi tra le superfici
│   └── integrations/     # Nextcloud WebDAV client, email inbound parser
├── scripts/
│   └── migrate-freshdesk.ts  # one-time export Freshdesk → import nativo
└── supabase/
    ├── migrations/       # schema SQL versionato
    ├── functions/        # Edge functions (email inbound, ticket→commessa, OCR)
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
| Next.js | 14.x (PWA via `next-pwa` o Service Worker custom) |
| Supabase JS | 2.x |
| Tailwind | 3.4+ |
| TypeScript | 5.x |
| Service Worker | Workbox 7.x |

## Dipendenze da terze parti — riepilogo SLA / impegni

| Servizio | Tier scelto | SLA dichiarata | Failover plan |
|---|---|---|---|
| Vercel | Pro | <span class="cite">99,99% Enterprise / Pro non garantito</span> | DNS Cloudflare può puntare a fallback statico |
| Supabase | Pro $25/mo | best-effort | PITR backup, possibilità self-host Postgres se serve |
| Hetzner Storage Share | NX11/NX21 | High-availability cluster | Backup ZFS multipli + script export periodico verso S3 |
| Resend (email) | Free → Pro $20/mo | 99.9% | Fallback Supabase SMTP |
| Mistral OCR | API pay-per-use | best effort | Tesseract self-hosted fallback |
