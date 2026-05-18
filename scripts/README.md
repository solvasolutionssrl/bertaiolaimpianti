# `scripts/` — utility one-time per impiantiXplus

**Versione**: 1.0
**Stato**: attivo

Contenitore degli script operativi (migrazioni, seeding straordinari, manutenzioni una tantum) che vivono fuori dal ciclo applicativo. Ogni script è eseguibile via `pnpm` con `tsx`.

---

## `migrate-freshdesk.ts` — migrazione one-time Freshdesk → impiantiXplus

### Cosa fa

Importa nel database e nello storage del tenant **tutto lo storico Freshdesk**:

- ticket (in `tickets`, con `source='imported_from_freshdesk'` e `freshdesk_legacy_id`)
- conversazioni (in `ticket_messages`)
- allegati (re-upload sul provider storage del tenant sotto `/import/freshdesk/TKT-<id>/`)
- clienti (in `clienti`, con dedupe per email / telefono)

Mappa enum:

| Freshdesk | impiantiXplus |
|---|---|
| status=2 (Open) | `aperto` |
| status=3 (Pending) | `attesa_cliente` |
| status=4 (Resolved) | `chiuso` |
| status=5 (Closed) | `chiuso` |
| priority=1 (Low) | `bassa` |
| priority=2 (Medium) | `media` |
| priority=3 (High) | `alta` |
| priority=4 (Urgent) | `urgente` |

### Prerequisiti

1. Tenant esistente in tabella `tenants` con slug uguale al parametro `--tenant`.
2. Variabili ambiente in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL` (o `SUPABASE_URL`)
   - `SUPABASE_SERVICE_ROLE_KEY` (lo script bypassa RLS, vedi `@impiantixplus/api/service`)
   - Eventuali credenziali storage (se tenant usa `nextcloud`) presenti come colonne sul record `tenants` oppure come env fallback.
3. API key Freshdesk con permesso "View Tickets" + "View Contacts" + "View Attachments".
4. Subdomain Freshdesk (es. `bertaiolaimpianti` per `bertaiolaimpianti.freshdesk.com`).

### Uso

```bash
# Dry-run sui primi 20 ticket per validazione mapping
pnpm migrate:freshdesk \
  --tenant=bertaiola \
  --api-key=<FD_API_KEY> \
  --domain=bertaiolaimpianti \
  --dry-run \
  --limit=20

# Migrazione completa
pnpm migrate:freshdesk \
  --tenant=bertaiola \
  --api-key=<FD_API_KEY> \
  --domain=bertaiolaimpianti

# Resume da una pagina specifica (es. dopo un crash a pagina 7)
pnpm migrate:freshdesk \
  --tenant=bertaiola \
  --api-key=<FD_API_KEY> \
  --domain=bertaiolaimpianti \
  --from-page=7
```

### Argomenti CLI

| Flag | Tipo | Default | Descrizione |
|---|---|---|---|
| `--tenant=<slug>` | string | `bertaiola` | Slug del tenant target (deve esistere in `tenants`). |
| `--api-key=<key>` | string | `$FRESHDESK_API_KEY` | API key Freshdesk. Obbligatorio. |
| `--domain=<sub>` | string | `$FRESHDESK_DOMAIN` | Subdomain Freshdesk. Obbligatorio. |
| `--dry-run` | bool | false | Non scrive nulla su DB o storage. Stampa solo il piano. |
| `--limit=<n>` | int | — | Limita il numero totale di ticket processati (utile per test). |
| `--from-page=<n>` | int | 1 | Riparte dalla pagina N (Freshdesk usa `per_page=100`). |

### Rate limit

Lo script throttla automaticamente quando l'header `X-Ratelimit-Remaining` scende sotto 5 e gestisce `HTTP 429` rispettando l'header `Retry-After`. Retry esponenziale per ogni ticket (max 3 tentativi, backoff 0.5s → 1s → 2s).

### Idempotenza

Ogni ticket viene cercato per `freshdesk_legacy_id` prima dell'insert: se già migrato, viene saltato. Lo script è quindi sicuro da rilanciare.

### Output

- **stdout**: log per ticket (`[OK]`, `[FAIL]`, `[skipped]`) + tabella riepilogativa finale.
- **`scripts/.migrate-freshdesk-errors.json`**: errori persistenti dopo retry — review SOLVA.
- **`scripts/.migrate-freshdesk-report.csv`**: una riga per ticket con esito (imported / skipped / error). Audit cliente.

Entrambi i file sono gitignorati (vedi `.gitignore`).

### Note operative

- Gli **allegati** vengono caricati su `<storage>/import/freshdesk/TKT-<fd_id>/<filename>` e referenziati come array di path nella colonna `attachments` di `ticket_messages` (jsonb). Per ora **non** vengono inseriti in `file_refs` perché quella tabella richiede `commessa_id NOT NULL`; un ticket migrato non ha ancora una commessa associata. Se in futuro vogliamo navigarli da `file_refs`, va rilassato lo schema.
- I **clienti** vengono dedotti per match esatto su email lowercased o telefono. Match ambigui (stessa email su due requester diversi) vengono risolti riusando il primo cliente trovato — caso da gestire eventualmente nella dashboard di review SOLVA (Sprint 2).
- L'utente Freshdesk autore di ogni conversazione **non** viene mappato a `users`: salviamo solo `sender_external_email` o lasciamo `null`. Ricostruire l'identità storica esce dallo scope del migration script.

### Volume atteso (Bertaiola)

Da audit pre-kickoff: qualche migliaio di ticket storici + ~5 GB allegati. Durata stimata 30-60 min con rate limit di 50 req/min.

### Post-migrazione

Una volta validato l'esito (review CSV + spot-check UI):

1. Concordare con cliente data target di disdetta Freshdesk.
2. Spegnere inoltri email verso Freshdesk (cliente passa a `ticket@bertaiolaimpianti.it` → Resend inbound → Edge Function nativa).
3. Conservare `scripts/.migrate-freshdesk-report.csv` insieme alla documentazione del passaggio.
