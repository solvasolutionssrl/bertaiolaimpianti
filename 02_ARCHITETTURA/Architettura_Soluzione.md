# Architettura della soluzione
**Versione**: 1.0
**Stato**: Bozza pre-validazione cliente

---

## 1. Visione

Una **piattaforma SaaS multitenant** che digitalizza il ciclo di vita della commessa per le PMI termoidrauliche e impiantistiche, con tre superfici utente:

1. **Web Ufficio** (5 PC Windows Bertaiola): dashboard, gestione commesse, ricerca, amministrazione utenti, configurazione
2. **App Mobile Tecnici** (15 iPhone): consultazione commesse, scatto foto cantiere con tag fase, checklist
3. **Portale Cliente Finale**: consultazione documenti e (in roadmap) pagamenti

Sotto, un **archivio file gestito** (Nextcloud su Hetzner) che fa anche da disco di rete sincronizzato per i PC ufficio (esperienza "cartella alla vecchia" richiesta).

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
   │  Web Office (PWA)  │  │  Mobile App (Expo) │  │  Portale Cliente   │
   │  Next.js / Vercel  │  │  iOS + Android     │  │  Next.js / Vercel  │
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
       │ multi-   │  │             │  │  thumbnail)│  │  push)       │
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

                  ┌────────────────────────┐
                  │  Freshdesk (esistente) │ ── webhook ──► Edge Function
                  └────────────────────────┘                (crea commessa
                                                             + cartella)
```

## 3. Tenant model

```
solva_saas (org Supabase)
└── progetto Postgres condiviso (Frankfurt)
    └── schema "app"
        ├── tabella tenants (id, nome, slug, brand_color, logo_url, plan, nextcloud_base_url, ...)
        ├── tabella users (id, tenant_id, email, role, ...)
        ├── tabella commesse (id, tenant_id, codice, cliente, ...)
        ├── tabella fasi (id, commessa_id, tipo, stato, ...)
        ├── tabella file_refs (id, commessa_id, fase_id, nextcloud_path, sha, mime, taken_at, geo, ...)
        ├── tabella notifiche (id, tenant_id, user_id, type, payload, read_at, ...)
        └── tabella freshdesk_events (raw + parsed)
    └── RLS policies su ogni tabella: USING (tenant_id = auth.jwt() ->> 'tenant_id')
```

Ogni utente, una volta autenticato, riceve un JWT che contiene `tenant_id` come custom claim → Postgres RLS filtra automaticamente i dati visibili. **Zero rischio di cross-tenant data leak**.

Lato storage: **una istanza Nextcloud per tenant** (es. `cloud.bertaiolaimpianti.it`). La app SOLVA conosce per ogni tenant la URL e le credenziali di servizio (vault Supabase), e parla via WebDAV/REST.

## 4. Modello dati (estratto)

### Tabella `commesse`

| Campo | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | RLS scope |
| codice | text | es. `BER-2026-001` |
| cliente_nome | text | |
| cliente_indirizzo | text | |
| stato | enum | `bozza`, `aperta`, `in_corso`, `collaudo`, `chiusa`, `archiviata` |
| responsabile_user_id | uuid FK | |
| freshdesk_ticket_id | int | nullable |
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

## 6. Integrazione Freshdesk

**Approccio MVP (settimana 3-4)**:
- Webhook Freshdesk su evento `ticket created` → POST a Edge Function Supabase
- Edge Function: parse payload, crea record `commessa` con stato `bozza`, crea alberatura Nextcloud, scrive `freshdesk_ticket_id` per linking bidirezionale
- Risposta: aggiorna campo custom su ticket Freshdesk con link diretto alla commessa nel pannello SOLVA

**Approccio Fase 1 (alternativo, se MVP troppo stretto)**:
- Import manuale CSV / pulsante "Crea da ticket" in app web (l'operatore incolla l'ID Freshdesk e tira giù dati via API)

## 7. Flusso "foto cantiere" (mobile)

1. Tecnico apre app, vede lista commesse a lui assegnate
2. Tap su commessa → vede fasi (es. "Impianto sanitario", "Posa pavimento")
3. Tap su fase → "Aggiungi foto"
4. Scatto via camera nativa iOS
5. Upload in background:
   - File originale → Nextcloud (path `/commesse/<X>/04_foto_in_corso/<fase>/<timestamp>.jpg`)
   - Thumbnail compressa → Supabase Storage (per UI veloce)
   - Metadata (geo, exif, fase, user) → tabella `file_refs`
6. Contatore foto nella checklist si aggiorna in tempo reale (Realtime Supabase)
7. Notifica all'ufficio se la fase è "completata" (count ≥ min_foto_richieste)

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
- Offline reale mobile (sync al rientro): rinviato a fase 2 se necessario
- Integrazione gestionale/ERP (cliente non ne ha)
- Magazzino, materiali
- Manutenzioni programmate caldaie (valutiamo integrazione futura con impiantix.app o modulo nativo)
- BIM e CAD heavy (occasionali, gestiti come file PDF/DWG normali)
