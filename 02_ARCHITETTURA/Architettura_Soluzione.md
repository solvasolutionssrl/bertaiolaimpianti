# Architettura della soluzione
**Versione**: 1.0
**Stato**: Bozza pre-validazione cliente

---

## 1. Visione

Una **piattaforma SaaS multitenant** che digitalizza il ciclo di vita della commessa per le PMI termoidrauliche e impiantistiche, **sostituendo integralmente** Freshdesk con un modulo ticketing nativo integrato. Tre superfici utente:

1. **Web Ufficio** (5 PC Windows Bertaiola): dashboard, **ticket entranti**, gestione commesse, ricerca, amministrazione utenti, configurazione
2. **PWA Tecnici** (15 iPhone): **installabile da browser** ("Aggiungi alla schermata Home"), consultazione commesse, scatto foto cantiere con tag fase, checklist
3. **Portale Cliente Finale**: consultazione documenti, **invio nuove richieste/ticket**, (in roadmap) pagamenti

Sotto, un **archivio file gestito** (Nextcloud su Hetzner) che fa anche da disco di rete sincronizzato per i PC ufficio (esperienza "cartella alla vecchia" richiesta).

> **Cambio strategico**: Freshdesk viene **abbandonato** dopo go-live. Migrazione one-time via API (script SOLVA estrae ticket storici in JSON + allegati, li importa nei tabella `tickets` e nei folder Nextcloud).

## 2. Diagramma logico

```
                            ┌─────────────────────┐
                            │  DOMINI / DNS       │
                            │  app.<brand>.it     │
                            │  cloud.<tenant>.it  │
                            └──────────┬──────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
              ▼                        ▼                        ▼
   ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
   │  Web Ufficio       │  │  PWA Tecnici       │  │  Portale Cliente   │
   │  Next.js / Vercel  │  │  Next.js + SW      │  │  Next.js / Vercel  │
   │  (5 PC Win)        │  │  installabile      │  │  (clienti finali)  │
   └─────────┬──────────┘  └─────────┬──────────┘  └─────────┬──────────┘
             │                       │                       │
             └───────────────┬───────┴───────────────────────┘
                             │
                             ▼
                  ┌────────────────────────┐
                  │   API GATEWAY          │ Supabase Edge Functions
                  │   (REST + Realtime)    │ (Frankfurt EU)
                  └──────────┬─────────────┘
                             │
              ┌──────────────┼──────────────┬─────────────────┐
              ▼              ▼              ▼                 ▼
       ┌──────────┐  ┌─────────────┐  ┌────────────┐  ┌──────────────┐
       │ Postgres │  │  Auth       │  │ Storage    │  │ Realtime     │
       │ + RLS    │  │  (Supabase) │  │ (metadata, │  │ (notifiche   │
       │ multi-   │  │             │  │  thumbnail)│  │  push/SSE)   │
       │ tenant   │  │             │  │            │  │              │
       └──────────┘  └─────────────┘  └────────────┘  └──────────────┘
                             │
                             ▼
                  ┌────────────────────────┐
                  │  HETZNER STORAGE SHARE │
                  │  (Nextcloud managed)   │
                  │  WebDAV + REST API     │
                  └──────────┬─────────────┘
                             │
                             │ sync continua
                             │
                  ┌──────────┴─────────────┐
                  │  5 PC Ufficio Bertaiola│
                  │  Client desktop NC     │
                  └────────────────────────┘

         ┌─────────────────────────────────┐
         │  Freshdesk (LEGACY, una tantum) │ ── script API ──► IMPORT
         │  Da disdire dopo go-live        │  (JSON dump dei
         └─────────────────────────────────┘   ticket + allegati)
```

## 3. Tenant model

```
solva_saas (org Supabase)
└── progetto Postgres condiviso (Frankfurt)
    └── schema "app"
        ├── tabella tenants (id, nome, slug, brand_color, logo_url, plan, nextcloud_base_url, ...)
        ├── tabella users (id, tenant_id, email, role, ...)
        ├── tabella clients (id, tenant_id, nome, email, telefono, indirizzo, ...)
        ├── tabella tickets (id, tenant_id, codice, client_id, oggetto, descrizione, stato, priorita, assegnato_a, source, created_at, ...)
        ├── tabella ticket_messages (id, ticket_id, sender_id, body, attachments, created_at)
        ├── tabella commesse (id, tenant_id, codice, client_id, ticket_id, ...)
        ├── tabella fasi (id, commessa_id, tipo, stato, ...)
        ├── tabella file_refs (id, commessa_id, fase_id, nextcloud_path, sha, mime, taken_at, geo, ...)
        ├── tabella notifiche (id, tenant_id, user_id, type, payload, read_at, ...)
        └── tabella audit_events (chi, cosa, quando, before/after)
    └── RLS policies su ogni tabella: USING (tenant_id = auth.jwt() ->> 'tenant_id')
```

> Nota: `tickets` è la **tabella nativa** che sostituisce Freshdesk. `tickets.source` distingue origine ("manual", "email", "portal", "imported_from_freshdesk").

Ogni utente, una volta autenticato, riceve un JWT che contiene `tenant_id` come custom claim → Postgres RLS filtra automaticamente i dati visibili. **Zero rischio di cross-tenant data leak**.

Lato storage: **una istanza Nextcloud per tenant** (es. `cloud.bertaiolaimpianti.it`). La app SOLVA conosce per ogni tenant la URL e le credenziali di servizio (vault Supabase), e parla via WebDAV/REST.

## 4. Modello dati (estratto)

### Tabella `tickets` (nativa, sostituisce Freshdesk)

| Campo | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | RLS scope |
| codice | text | es. `TKT-2026-0042` |
| client_id | uuid FK | → `clients` |
| oggetto | text | |
| descrizione | text | corpo iniziale |
| stato | enum | `aperto`, `in_lavorazione`, `attesa_cliente`, `chiuso` |
| priorita | enum | `bassa`, `media`, `alta`, `urgente` |
| assegnato_a | uuid FK | utente ufficio |
| source | enum | `manual`, `email`, `portal_cliente`, `imported_from_freshdesk` |
| commessa_id | uuid FK | nullable; popolato se ticket → commessa |
| freshdesk_legacy_id | int | nullable, solo per import storico |
| created_at, updated_at, closed_at | timestamp | |

### Tabella `clients`

| Campo | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| nome | text | persona o ragione sociale |
| email, telefono | text | |
| indirizzo_fatt | text | |
| note | text | |
| created_at | timestamp | |

### Tabella `commesse`

| Campo | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | RLS scope |
| codice | text | es. `BER-2026-001` |
| client_id | uuid FK | → `clients` |
| cliente_indirizzo_cantiere | text | nullable |
| stato | enum | `bozza`, `aperta`, `in_corso`, `collaudo`, `chiusa`, `archiviata` |
| responsabile_user_id | uuid FK | |
| ticket_id | uuid FK | nullable; origine se nata da ticket |
| created_at, updated_at | timestamp | |
| nextcloud_folder_path | text | es. `/commesse/BER-2026-001-RossiMario/` |

### Tabella `fasi` (38 tipi possibili)

| Campo | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| commessa_id | uuid FK | |
| tipo | enum/text | 1 dei 38 tipi (vedi `Report_Riunione.md` §"Mappatura processo") |
| stato | enum | `da_fare`, `in_corso`, `fatto`, `non_applicabile` |
| min_foto_richieste | int | regola checklist (es. 3 foto per "impianto sanitario") |
| foto_caricate_count | int (computed) | |
| note | text | |

### Tabella `file_refs`

| Campo | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| commessa_id | uuid FK | |
| fase_id | uuid FK | nullable |
| nextcloud_path | text | path completo dentro NC |
| filename | text | |
| mime_type | text | |
| size_bytes | bigint | |
| sha256 | text | |
| uploaded_by | uuid FK | |
| uploaded_at | timestamp | |
| taken_at | timestamp | da EXIF foto |
| geo_lat, geo_lng | numeric | da EXIF foto |
| thumbnail_url | text | mini cache per UI veloce |
| ocr_status | enum | `none`, `pending`, `done`, `error` |
| ocr_text | text | nullable, indicizzato full-text Postgres |

## 5. Alberatura cartelle automatica

Quando si crea una commessa, il backend crea su Nextcloud la struttura:

```
/commesse/<CODICE>-<ClienteSlug>/
├── 00_anagrafica/
├── 01_preventivo/
├── 02_disegni_DICO/
├── 03_foto_prima_lavoro/
├── 04_foto_in_corso/
├── 05_foto_fine_lavoro/
├── 06_DICO_compilato/
├── 07_allacci/             # CIRCE, CURIT, SAT
├── 08_collaudi/
└── 99_archivio/
```

Le cartelle compaiono **istantaneamente** sui 5 PC ufficio via sync Nextcloud. La app crea sotto-cartelle aggiuntive per le fasi attive (es. se la commessa ha "impianto solare", aggiunge `/05_impianto_solare/`).

## 6. Migrazione Freshdesk (one-time) + Ticketing nativo

Bertaiola **abbandona** Freshdesk. La migrazione è uno script SOLVA da eseguire una sola volta, prima del go-live.

### 6.1 Script di migrazione (one-time)

```
┌─────────────────┐  GET /api/v2/tickets        ┌──────────────────┐
│   Freshdesk     │ ────────────────────────►   │  Migration       │
│   (account      │                              │  Script (Node)   │
│   Bertaiola)    │ ◄────────────────────────   │  /scripts/       │
└─────────────────┘   JSON paginato              │  migrate-fd.ts   │
                                                  └────────┬─────────┘
                                                           │
                            ┌──────────────────────────────┼────────────┐
                            ▼                              ▼            ▼
                    ┌──────────────┐             ┌──────────────┐  ┌──────────┐
                    │  clients     │             │  tickets     │  │ Nextcloud│
                    │  (dedupe)    │             │  (source=    │  │ /import/ │
                    │              │             │   imported)  │  │ allegati │
                    └──────────────┘             └──────────────┘  └──────────┘
```

**Step dello script** (`pnpm run migrate:freshdesk --tenant=bertaiola`):

1. `GET /api/v2/tickets?per_page=100&page=N` → enumera tutti i ticket (rate limit 50/min su Freshdesk)
2. Per ogni ticket:
   - `GET /api/v2/tickets/<id>/conversations` → recupera storico messaggi
   - `GET` allegati (S3 URL pre-signed Freshdesk) → re-upload su Nextcloud `/import/freshdesk/TKT-<id>/`
3. Dedupe clienti (matching email/telefono) → INSERT su `clients`
4. INSERT su `tickets` con `source='imported_from_freshdesk'` e `freshdesk_legacy_id` per tracciamento
5. INSERT su `ticket_messages` per ogni conversazione
6. Report finale: # ticket importati, # clienti, # allegati, # errori
7. UI di review in dashboard SOLVA per casi ambigui (matching cliente, ticket duplicati)

**Volume stimato** (da confermare con cliente): qualche migliaio di ticket storici + ~5 GB allegati → eseguito in ~30-60 min.

**Dopo la migrazione**: cliente disdice Freshdesk a fine periodo fatturazione corrente.

### 6.2 Ticketing nativo (post go-live)

Tre canali di ingresso ticket:

| Canale | Come funziona |
|---|---|
| **Manuale** | Ufficio crea ticket via web dashboard ("Nuovo ticket") |
| **Email** | Indirizzo `ticket@bertaiolaimpianti.it` (Resend inbound o forward dall'email aziendale) → Edge Function parse → INSERT ticket con `source='email'` |
| **Portale cliente** | Cliente loggato via magic-link compila form "Richiedi intervento" → INSERT ticket con `source='portal_cliente'` |

Workflow operativo:
1. Ticket arriva → assegnato a un utente ufficio (auto-routing semplice: round-robin o per area)
2. Ufficio valuta → 3 esiti:
   - Risolto via chat (ticket_messages): chiude
   - Diventa **commessa**: pulsante "Converti in commessa" → crea record `commesse` con `ticket_id` valorizzato, crea alberatura Nextcloud
   - Rimandato in attesa cliente
3. Tutta la conversazione email cliente ↔ ufficio resta dentro `ticket_messages` (no Freshdesk).

## 7. Flusso "foto cantiere" (PWA mobile)

> **PWA = Progressive Web App**. Next.js servito con manifest + Service Worker. Tecnico apre il link `m.cantiera.app` da Safari iPhone → "Condividi" → "Aggiungi alla schermata Home" → icona Cantiera in home screen, esperienza full-screen come una app nativa. Niente App Store, niente Play Store, niente review.

1. Tecnico tocca l'icona Cantiera nella home iPhone → si apre PWA full-screen
2. Login persistente (token JWT in IndexedDB, durata 30 giorni)
3. Lista commesse a lui assegnate
4. Tap su commessa → vede fasi (es. "Impianto sanitario", "Posa pavimento")
5. Tap su fase → "Aggiungi foto"
6. Scatto via **`<input type="file" accept="image/*" capture="environment">`** (apre camera nativa iOS/Android)
7. Upload in background tramite **Service Worker** + Background Sync API:
   - File originale → Nextcloud (path `/commesse/<X>/04_foto_in_corso/<fase>/<timestamp>.jpg`)
   - Thumbnail compressa → Supabase Storage (per UI veloce)
   - Metadata (geo via Geolocation API, EXIF, fase, user) → tabella `file_refs`
8. Contatore foto nella checklist si aggiorna in tempo reale (Realtime Supabase via WebSocket)
9. Notifica all'ufficio se la fase è "completata" (count ≥ min_foto_richieste)

**Capabilities PWA usate**:

| API browser | Uso |
|---|---|
| `<input capture="environment">` | Apre camera per scatto foto (iOS/Android nativo) |
| Geolocation API | Geo-tag scatto |
| File API + FormData | Upload multipart |
| Service Worker | Cache assets + offline shell + background upload |
| IndexedDB | Token sessione + queue upload offline (post-MVP) |
| Web Push API | Notifiche push (iOS 16.4+ richiede PWA installata) |
| Web App Manifest | Icona home, splash screen, theme color, display "standalone" |

**Trade-off vs app nativa Expo** (perché scegliamo PWA):

| | PWA (scelto) | App Expo (scartato) |
|---|---|---|
| Distribuzione | URL pubblico, "Aggiungi a Home" | App Store + Play Store + EAS |
| Aggiornamenti | Istantanei (deploy Vercel) | Review Apple 24-72h (mitigato da EAS Update solo su JS) |
| Account dev | Nessuno | Apple Developer $99/anno + Google Play |
| Sviluppo | Riusa codebase web (Next.js) | Codebase separato React Native |
| Camera/Geo | API browser standard | Plugin Expo |
| Push iOS | OK ma solo se PWA installata da utente | Native, sempre disponibile |
| Onboarding tecnici | 1 link da WhatsApp + Aggiungi a Home | TestFlight invite, profilo dev, ecc. |
| Costo annuale | €0 aggiuntivi | ~€90 Apple Dev + €204 EAS |

**Limite noto**: Push notifications su iOS richiedono che l'utente abbia aggiunto la PWA alla Home (Safari da iOS 16.4+). Backup: notifiche **email** sempre disponibili. Per Bertaiola — flusso "foto" mostly dal capo titolare → push è "nice to have", non bloccante.

## 8. Notifiche

| Trigger | Destinatario | Canale |
|---|---|---|
| Nuovo ticket Freshdesk → commessa creata | Ufficio | Email + push |
| Fase con 0 foto e commessa "in_corso" da >3 giorni | Capo cantiere + responsabile | Push + email |
| Tutte le fasi obbligatorie complete → "pronta per chiusura" | Responsabile | Push |
| DICO non caricato a 7 giorni dal collaudo | Responsabile | Email |
| Note libere da tecnico in cantiere | Ufficio | Push |

Implementazione: **Expo Notifications** (gratuito, push iOS + Android) + email transactional (Resend o Supabase email).

## 9. Ricerca documenti

**MVP**: ricerca per nome file, cliente, codice commessa, data → query Postgres con index trigram.

**Fase 2**: full-text su `ocr_text` (popolato da Mistral OCR sui PDF caricati) — costo trascurabile dato che il cliente ha poche scansioni.

**Fase 3 (opzionale)**: ricerca semantica con embeddings (Anthropic Claude Haiku 4.5 o OpenAI text-embedding-3-small).

## 10. Sicurezza & GDPR

- Hosting Frankfurt (Supabase) + Falkenstein (Hetzner) → 100% UE
- TLS ovunque (HTTPS + WebDAV over HTTPS)
- Password hash via Supabase Auth (bcrypt/argon2)
- MFA opzionale per utenti admin
- RLS Postgres per isolamento tenant
- Backup automatici (Supabase PITR Pro + Hetzner ZFS snapshot)
- DPA disponibili da entrambi i provider
- Audit log (chi ha modificato/cancellato cosa) → tabella `audit_events`
- Retention: file commesse archiviate per 10 anni (DICO compliance)
- Cancellazione su richiesta: API admin che elimina record + file Nextcloud

## 11. Multitenancy operativa

**Onboarding nuovo tenant** (script automatizzato SOLVA, ~10 min):
1. Crea record `tenants` su Postgres
2. Provisiona istanza Hetzner Storage Share via API
3. Crea utenti admin iniziali
4. Configura custom domain (CNAME)
5. Carica logo/colori brand
6. Genera URL onboarding per cliente

→ Stesso codebase serve N clienti. Cambia solo configurazione per tenant.

## 12. Non-functional requirements

| NFR | Target |
|---|---|
| Disponibilità | 99,5% (best effort SOLVA) |
| Latenza media API | < 300 ms (UE region) |
| Upload foto medio iPhone 5 MB | < 10 s su 4G/5G |
| Sync desktop ufficio | < 1 min dopo upload |
| Backup RPO | 24h (Hetzner ZFS) / 1h (Supabase PITR Pro) |
| Cifratura | TLS in transito + AES-256 at rest |

## 13. Cosa **non** facciamo (out of scope MVP)

- Editing concomitante real-time Office (basta lock + versioning di Nextcloud)
- Offline reale mobile (sync al rientro): rinviato a fase 2 se necessario (PWA è pronta per evolvere)
- Integrazione gestionale/ERP (cliente non ne ha)
- Magazzino, materiali
- Manutenzioni programmate caldaie (valutiamo integrazione futura con impiantix.app o modulo nativo)
- BIM e CAD heavy (occasionali, gestiti come file PDF/DWG normali)
- App nativa Expo iOS/Android (scartata in favore di PWA — vedi §7)
- Mantenere Freshdesk attivo dopo go-live (la nuova app sostituisce, non integra)
