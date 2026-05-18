# `supabase/` — schema, migrazioni, Edge Functions

**Versione**: 1.0
**Stato**: attivo (Sprint 0)

Tutto il backend di impiantiXplus vive su Supabase Pro, region **Frankfurt EU** (GDPR). Questo folder contiene:

- `migrations/` — schema SQL versionato. Una migrazione = un cambio strutturale. **Mai modificare** migrazioni già pushate.
- `functions/` — Edge Functions Deno (webhook inbound email, notifyOnEvent, ...). TBD.
- `seed.sql` — dati di bootstrap per ambiente locale (tenant `bertaiola`, utenti demo, voci catalogo).
- `config.toml` — config CLI Supabase per ambiente locale.

---

## Prerequisiti

- CLI Supabase aggiornata: `brew install supabase/tap/supabase` (o equivalente).
- Docker in esecuzione (per stack locale: Postgres + Auth + Storage + Studio).
- Account Supabase + Personal Access Token (per `supabase link`) — solo per push remoto.

---

## Migrazioni — ambiente locale

```bash
# Avvia lo stack locale (Postgres + Studio + Auth + Storage)
supabase start
# oppure dal root del repo:
pnpm supabase:start

# Reset completo: droppa il volume, riapplica TUTTE le migrazioni + seed.sql
# Idempotente, distruttivo solo per dati locali. Usalo liberamente in dev.
supabase db reset
# oppure:
pnpm supabase:reset

# Apri Supabase Studio
open http://localhost:54323
```

### Creare una nuova migrazione

```bash
# Genera un nuovo file timestampato in supabase/migrations/
supabase migration new <descrizione_breve>
# es. supabase migration new add_preventivi_tabella
```

Convenzione del progetto: i file sono numerati `YYYYMMDDHHMMSS_<descrizione>.sql`. Le migrazioni attuali partono da `20260101000000_*` e sono ordinate logicamente (estensioni → tenants → users → clienti → tickets → commesse → ... → RLS → search).

### Rigenerare i tipi TypeScript

Ad ogni cambio di schema:

```bash
pnpm supabase:types
# scrive in packages/api/src/types/database.generated.ts
```

---

## Migrazioni — ambiente remoto (Supabase Pro Frankfurt)

```bash
# Una tantum: collega il progetto remoto
supabase link --project-ref <project-ref>

# Verifica diff fra locale e remoto prima di push
supabase db diff --linked

# Push delle migrazioni nuove
supabase db push

# Pull se qualcuno ha modificato remoto fuori da CI (sconsigliato)
supabase db pull
```

**Regola**: in produzione non si applica `db reset`. Solo `db push` di migrazioni forward-only.

---

## Edge Functions

Le funzioni Deno vivono in `supabase/functions/<name>/index.ts`. Esempi previsti:

| Funzione | Trigger | JWT |
|---|---|---|
| `parseInboundEmail` | Webhook Resend inbound | **no** (webhook pubblico, verificato da `RESEND_INBOUND_SECRET`) |
| `notifyOnEvent` | Postgres webhook su INSERT `file_refs`, `tickets`, `commessa_voci` | **no** (webhook interno DB) |
| `commessaScaffold` | RPC chiamata da client autenticato | **sì** (default) |

### Sviluppo locale

```bash
# Avvia la funzione in hot-reload (richiede supabase start già attivo)
supabase functions serve <name> --env-file .env.local

# Invocala
curl -X POST http://localhost:54321/functions/v1/<name> \
  -H "Authorization: Bearer <anon-key>" \
  -d '{...}'
```

### Deploy

```bash
# Funzione con JWT obbligatorio (default)
supabase functions deploy <name>

# Funzione webhook pubblica (es. inbound email): no JWT
supabase functions deploy parseInboundEmail --no-verify-jwt

# Setta secrets in remoto (non si leggono da .env.local in prod)
supabase secrets set RESEND_INBOUND_SECRET=<...>
```

Tieni le secrets fuori dal repo. Per audit di quelle attive: `supabase secrets list`.

---

## RLS e tenant isolation

Tutte le tabelle hanno RLS abilitato (vedi `migrations/20260101001300_rls.sql`). Il filtro standard è `tenant_id = current_tenant_id()` dove `current_tenant_id()` è una `SECURITY DEFINER` function che legge il claim JWT.

Bypass RLS solo da:

- Edge Functions con service-role key
- Script one-time (vedi `scripts/migrate-freshdesk.ts` → usa `createServiceSupabase()`)

Non importare mai `@impiantixplus/api/service` da componenti client.

---

## Troubleshooting comune

| Problema | Soluzione |
|---|---|
| `supabase start` blocca su "Pulling images" | Verifica Docker attivo + connessione; in alternativa `supabase stop --no-backup` e ripeti. |
| `db reset` fallisce su una migrazione | Apri il file SQL incriminato, fixa, **non rinominare** se già in remoto; se è solo locale puoi rinominarlo. |
| Tipi non aggiornati in `apps/web` | Rilanciare `pnpm supabase:types` dopo ogni modifica schema. |
| Edge Function in prod ritorna 401 su webhook | Hai dimenticato `--no-verify-jwt` al deploy. Ridistribuiscila. |
