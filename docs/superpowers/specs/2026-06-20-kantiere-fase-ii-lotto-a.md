# Kantiere Fase II — Lotto A (login 3 campi · parco mezzi · sedi · flusso viaggio)

**Data**: 2026-06-20 · **Stato**: approvato, in implementazione · **Branch**: `feat/kantiere-fase-ii-lotto-a`

Estensione del modulo Kantiere. Tutto gated da modulo `kantiere` + `app_mode` ∈ {kantiere, full}. **Bertaiola (`kommessa`, modulo off) resta invariata.** Migration additive applicate al cloud prod via MCP.

## Decisioni del cliente (questa iterazione)

- **Ore tecnico**: editabili dal tecnico **fino all'approvazione ufficio**; dopo, solo l'ufficio le modifica (su richiesta). *(già il comportamento attuale: bozza editabile, inviato/approvato no. La modifica post-invio dal tecnico è del Lotto B.)*
- **Codice azienda**: colonna dedicata robusta, indipendente dallo slug. Bertaiola retrocompatibile (login senza codice → default Bertaiola).
- **Tempo di viaggio**: la stima confermata **compila in automatico il rapportino del giorno**. La giornata del dipendente = **viaggio (andata) + ore lavoro + viaggio (ritorno)**. Gli **straordinari si calcolano solo sulle ore di lavoro** (es. 9h lavoro → 8 ord + 1 straord); il **viaggio è sempre extra**, fuori dalla soglia.

## Dati produzione (rilevati)

- Bertaiola: slug `BER`, id `9fe4d24b-3846-4166-8163-babeb023b8cb`, app_mode `kommessa`.
- FPM: slug `FPMIMP`, id `c5c285f0-54c8-4268-a701-d302f28e362e`, app_mode `kantiere`.
- Utenti FPM: solo `fpmtecnico@fpmimp.kommessa.local` (tecnico) + `p.franchini@fpmimpianti.it` (admin). **Nessun account demo extra → niente da eliminare.**
- Codici: Bertaiola=`BERTAIOLA` (+ `login_senza_codice=true`), FPM=`FPM`.

## Workstream A1 — Login a 3 campi + codice azienda

**DB**: `tenants.codice_azienda citext unique`, `tenants.login_senza_codice boolean not null default false` con indice parziale unico (un solo tenant può essere il default). Set: BER→`BERTAIOLA`+default, FPM→`FPM`.

**Risoluzione login** (nuova action `login/_actions/risolvi-login.ts`):
1. username contiene `@` → è già email completa, usala (ignora codice). *(copre owner/luca/p.franchini)*
2. codice vuoto → tenant con `login_senza_codice=true` (Bertaiola). *(retrocompat)*
3. codice valorizzato → tenant con `codice_azienda = codice` (citext, case-insensitive).
4. email sintetica = `${username}@${slug.toLowerCase()}.kommessa.local`.
5. errori generici (no enumerazione): `codice_non_valido` / `non_valido`.

Sostituisce lo scan `listUsers` di `risolvi-username.ts` (deterministico → niente ambiguità). Form: 3° campo "Codice azienda" (opzionale, in cima), placeholder che spiega "lascia vuoto se Bertaiola".

**Gestione**: super admin (tab tenant) editabile; office impostazioni read-only (l'admin legge il codice da comunicare ai tecnici).

## Workstream A2 — Parco mezzi (admin/office)

**DB**: `mezzi (id, tenant_id, targa text, modello text, attivo bool, note text, created_at, updated_at)` + RLS standard kantiere (tenant read, admin/office write, platform-admin read).

**UI**: pagina office `/office/kantiere/mezzi` (lista + CRUD inline). Voce sidebar nel gruppo Kantiere. Action `office/_actions/kantiere-mezzi.ts` (guard admin/office). Selezionabile nel flusso timbratura quando "ero l'autista".

## Workstream A3 — Sedi (admin/office)

**DB**:
- `sedi (id, tenant_id, nome, tipo ['sede_principale'|'sede_secondaria'|'hotel'|'altro'], indirizzo, lat, lng, is_default bool, attivo bool, note, timestamps)` + indice parziale unico `is_default` per tenant.
- `cantiere_sede (cantiere_id, sede_id, tenant_id, primary key(cantiere_id, sede_id))` — sedi extra selezionabili per quel cantiere oltre alla default.

**UI**: pagina office `/office/kantiere/sedi` (CRUD sedi + autocomplete indirizzo già esistente per geocodifica). Nel dettaglio cantiere: associa sedi disponibili. Action `office/_actions/kantiere-sedi.ts`.

## Workstream A4 — Flusso viaggio + stima API

**Routing**: astrazione `RoutingProvider` (`apps/web/app/_lib/routing/`) + impl **OpenRouteService Directions** (`ORS_API_KEY` env, fail-soft → null se assente/errore). Cache coppie in `routing_cache (origin_lat, origin_lng, dest_lat, dest_lng, profile, durata_min, created_at)`. Durata arrotondata a **15 min** (`arrotonda15`). Endpoint `POST /api/routing/stima` (auth) input sede_id+cantiere_id+direzione → minuti.

**DB**: `timbratura_viaggio (id, tenant_id, timbratura_id unique fk, dipendente_id, direzione ['andata'|'ritorno'], sede_id fk, durata_stimata_min, durata_confermata_min, giustificazione text, autista bool default false, mezzo_id fk null, created_at)`.

**Flusso timbratura** (estende `TimbraClient` self-timbratura su cantiere):
- **Ingresso (andata)**: "Da dove sei partito?" = sede default + sedi del cantiere → stima (loading) → conferma o correggi (correzione obbliga `giustificazione`) → "Eri l'autista?" (default no) → se sì, scegli mezzo (targa+modello).
- **Uscita (ritorno)**: "Dove vai adesso?" = una delle sedi (no casa) → stima → conferma/correggi+giustificazione → autista+mezzo.
- Capo che timbra per i membri: flusso rapido invariato (il viaggio è personale).

**Integrazione rapportino**: `precompilaMioRapportino` (alla prima apertura del giorno) somma i minuti di viaggio da `timbratura_viaggio` per target → `ore_viaggio` della riga. Lo split ord/straord resta solo sul lavoro (invariato). UI scheda giornata (PWA `ore-client` + dettaglio office rapportini): mostra viaggio andata + ore (ord/straord) + viaggio ritorno. Ritorno correggibile dall'ufficio il giorno dopo.

## Garanzia Bertaiola

Modulo `kantiere` off + `app_mode='kommessa'`: nessuna delle nuove voci/aree è raggiungibile; login senza codice → Bertaiola (comportamento identico). Tutte le tabelle nuove con RLS tenant-scoped.

## Test

Unit (vitest): `arrotonda15`, merge viaggio per target, risoluzione email login (codice/default/email-completa), giustificazione-obbligatoria. Typecheck web+ui+api. `next build`. Advisor security 0 nuovi lint.

## Ordine

A1 fondamenta+login → A2/A3 CRUD office (paralleli) → A4 flusso+integrazione → test → merge.
