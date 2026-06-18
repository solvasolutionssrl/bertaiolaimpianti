# Revisione modifica commessa — editor completo, versioning, azione rapida tipologie

**Versione**: 1.0
**Stato**: In review
**Data**: 2026-06-18
**Contesto**: app in produzione (Bertaiola Impianti). Ogni modifica al DB e ai flussi è produzione reale.

## Obiettivo

Trasformare la modifica commessa da edit di pochi campi a **modifica completa** che riapre il flusso/editor di creazione, aggiungere un **versioning** consultabile (chi/quando/cosa + ripristino) e un'**azione rapida per aggiungere tipologie impianto** (solo-aggiunta, con creazione cartelle).

## Decisioni prese (con l'utente)

1. **PWA edit** → riapre il **wizard a 3 step** precompilato; dettatura vocale **opzionale** (non si riparte da zero).
2. **Desktop edit** → **editor globale completo**; il mini-dialog a 3 campi attuale viene **rimosso**.
3. **Versioning** → **tabella snapshot dedicata** `commessa_versioni`; **ripristino solo dei campi contenuto** (non tocca voci/cartelle fisiche).
4. **Accesso storico** → admin tenant **in sola lettura**; **ripristino solo superadmin**.
5. **Azione rapida tipologie** disponibile su: scheda office (desktop), scheda PWA (mobile), e dentro l'editor completo.

## Regole trasversali (load-bearing)

- **Campi congelati per sempre**: `codice_interno`, `nome_cartella`, `cloud_folder_path`. Mai rigenerati in modifica. Mostrati read-only con avviso ("il nome della cartella resta invariato per sempre").
- **Voci/tipologie = append-only**: si possono solo aggiungere, mai rimuovere (le cartelle Nextcloud sono fisiche). Vale nell'editor completo e nell'azione rapida: le voci presenti appaiono selezionate e bloccate.
- **Cambio cliente consentito**, ma il `nome_cartella` resta invariato (avviso in UI).
- **Modifica = online-only**: serve il server per versioning + provisioning cartelle. Su PWA: banner offline esistente + salvataggio/voce disabilitati offline. Nessun draft offline per l'edit (a differenza della creazione).
- **Copy italiano**: mai "col/coi"; mai trattino lungo "—" nei testi. Date sempre in `Europe/Rome` (formatter UI espliciti).
- **Display titolo**: mai mostrare `nome_cartella` raw nelle UI utente; usare `risolviTitoloCommessa()`.

## Architettura

### Componenti riusati
- `apps/web/app/_components/voice-review.tsx` (con `VociPicker` interno) — core editor dei campi.
- `apps/web/app/office/commesse/nuova/_components/media-attach-section.tsx` — gestione media.
- `calcolaCartelleVoci()` + `provisionaCartelle()` da `apps/web/app/_actions/crea-commessa.ts` — **solo** la parte di creazione cartelle dalle voci. Mai `genera_codice_commessa` / `trovaNomeCartellaLibero` / costruzione `cloud_folder_path`.
- Pattern RLS (`current_tenant_id()`, `current_role()`, `is_platform_admin()`) e `audit_events`.

### Parte A — Editor completo

Core editor condiviso costruito sui componenti esistenti, precompilato dai dati commessa. Due chrome:

- **Desktop**: pagina `/office/commesse/[id]/modifica` — tutte le sezioni in vista (cliente, indirizzo cantiere, descrizione, note, referenti, voci append-only, media). Sostituisce `commessa-edit-dialog.tsx`.
- **PWA**: `/mobile/commessa/[id]/modifica` — wizard 3 step: (1) Rivedi precompilato + voce opzionale, (2) Media, (3) Conferma e salva.

Entrambi → server action **`aggiornaCommessaCompleta(input)`**.

#### `aggiornaCommessaCompleta` (nuovo, `apps/web/app/_actions/aggiorna-commessa-completa.ts`)
1. Auth: `admin`/`office` + tenant scope.
2. Carica commessa esistente + voci + referenti. Costruisce **snapshot "prima"** (campi contenuto).
3. UPDATE `commesse`: `descrizione_ai_finale`, `cliente_indirizzo_cantiere`, `note_iniziali`, `is_critica`, `stato`, `responsabile_id`, `cliente_id` (se cambiato), `data_apertura` (se previsto). **MAI** `codice_interno` / `nome_cartella` / `cloud_folder_path`.
4. Cliente: gestione `clienteId` esistente o `clienteNew` con dedup (come `creaCommessa`). Reassign `cliente_id` se cambia.
5. Referenti: upsert `contatto_cliente` (scope commessa).
6. Voci: `added = input.voci − esistenti`. INSERT in `commessa_voci` (stato `da_iniziare`). Provisioning cartelle per le sole nuove (`calcolaCartelleVoci` + `provisionaCartelle` su union). **Mai** delete voci. (Helper condiviso con `aggiungiTipologie`.)
7. Media: nuovi upload vanno **direttamente** sulla commessa (target `commessaId` già supportato da `/api/upload/media/init`); nessun move da staging.
8. Snapshot "dopo" + diff. Se ≥1 campo cambiato → INSERT in `commessa_versioni` (`azione='modifica'`). Audit event come oggi.
9. Revalidate `/office/commesse/[id]`, `/mobile/commessa/[id]`, tab correlate.

### Parte B — Versioning

#### Migration `commessa_versioni`
Colonne: `id uuid pk`, `tenant_id uuid`, `commessa_id uuid FK ON DELETE CASCADE`, `versione int` (progressiva per commessa), `snapshot jsonb` (stato contenuto dopo questa versione → abilita restore), `diff jsonb` (array `{campo, da, a}`), `modificato_da uuid` (FK users, nullable), `modificato_da_nome text` (denormalizzato per display cross-tenant), `azione text` (`creazione`|`modifica`|`aggiunta_tipologie`|`ripristino`), `created_at timestamptz default now()`.

Indici: `(commessa_id, versione desc)`, `(tenant_id)`.

RLS:
- SELECT tenant scope per admin/office: `tenant_id = current_tenant_id() AND current_role() IN ('owner','admin','office')`.
- INSERT tenant scope (scritto dalle action; il restore lo fa il superadmin via service o tenant-scoped).
- Policy additiva `commessa_versioni_platform_admin_read` (`is_platform_admin()`).
- Nessun UPDATE/DELETE: tabella immutabile.

**Versione 1 = creazione**: hook in `creaCommessa` che, dopo l'insert della commessa, scrive la versione 1 (`azione='creazione'`, snapshot iniziale). Non fatale se fallisce (best-effort, come l'audit).

#### UI storico — tab "Cronologia" (office)
Potenzio `apps/web/app/office/commesse/[id]/cronologia` per elencare `commessa_versioni` (chi/quando/cosa cambiato, dal `diff`). Formatter date `Europe/Rome`.
- Admin/office tenant: **sola lettura**.
- Pulsante **"Ripristina"** per versione: visibile **solo** se `is_platform_admin()`.

#### `ripristinaVersione` (nuovo, superadmin only)
Legge lo `snapshot` della versione scelta e chiama internamente la logica di `aggiornaCommessaCompleta` con i **soli campi contenuto** (no voci). Genera una nuova versione `azione='ripristino'`. Guard: `requirePlatformAdmin()`.

> Mobile: nessuna vista storico (lo storico è per office/superadmin).

### Parte C — Azione rapida "Aggiungi tipologie impianto"

Componente condiviso `AggiungiTipologieDialog` (desktop dialog / mobile sheet) che riapre la selezione preset/tipologie della creazione (`VociPicker` + dropdown preset). Voci presenti bloccate (solo aggiunta). Allo **Conferma** → messaggio: *"L'aggiunta di N nuove tipologie creerà le relative cartelle e strutture collegate su Nextcloud. Confermi?"*.

#### `aggiungiTipologie(commessaId, voci[])` (nuovo)
1. Auth admin/office + tenant scope.
2. Diff vs esistenti (ignora già presenti).
3. INSERT nuove `commessa_voci`.
4. Provisioning cartelle per le sole nuove (helper condiviso con A.6).
5. INSERT `commessa_versioni` (`azione='aggiunta_tipologie'`) + audit.
6. Revalidate.

Superfici:
- **Office desktop**: elemento **master nella sidebar** (`commessa-sidebar.tsx`) — card "Tipologie impianto" con le voci selezionate + "Aggiungi tipologie". La tab "Fasi" resta dedicata al monitoraggio avanzamento; il suo `AggiungiFaseButton` viene allineato a `aggiungiTipologie` per provisionare anche le cartelle (oggi NON le crea — gap confermato).
- **PWA mobile**: azione rapida / sezione tipologie sulla scheda commessa (le voci oggi sul mobile non sono mostrate).
- **Editor completo**: stessa logica condivisa (DRY): l'editor usa `aggiungiTipologie` per la parte voci.

## File coinvolti (stima)

**Nuovi**
- `supabase/migrations/<ts>_commessa_versioni.sql`
- `apps/web/app/_actions/aggiorna-commessa-completa.ts`
- `apps/web/app/_actions/aggiungi-tipologie.ts`
- `apps/web/app/_actions/ripristina-versione.ts`
- `apps/web/app/_components/commessa-editor.tsx` (core condiviso) + `aggiungi-tipologie-dialog.tsx`
- `apps/web/app/office/commesse/[id]/modifica/page.tsx`
- `apps/web/app/mobile/commessa/[id]/modifica/page.tsx` (+ `_components/` wizard)

**Modificati**
- `apps/web/app/_actions/crea-commessa.ts` (hook versione 1)
- `apps/web/app/office/commesse/[id]/cronologia/...` (storico + restore)
- `apps/web/app/office/commesse/[id]/fasi/...` (azione rapida tipologie)
- `apps/web/app/office/commesse/[id]/page.tsx` (entrypoint "Modifica" → editor completo; rimuove mini-dialog)
- `apps/web/app/mobile/commessa/[id]/page.tsx` (entrypoint modifica + azione rapida tipologie)

**Rimossi/deprecati**
- `apps/web/app/office/commesse/[id]/_components/commessa-edit-dialog.tsx` (sostituito dall'editor completo)
- valutare `commessa-edit-mobile.tsx` (sostituito dal wizard)

## Rischi / note produzione

- **Provisioning cartelle è best-effort**: l'add tipologie deve riuscire a livello DB anche se Nextcloud è momentaneamente giù (folder creation non-bloccante, come in creazione). Il messaggio UI deve restare onesto.
- **Append-only voci**: nessun percorso (editor o quick action o restore) deve poter rimuovere voci.
- **Migration prima del deploy** del codice che la usa (apply umano via `supabase db push`/`psql`).
- **Snapshot v1 retroattivo (CONFERMATO)**: backfill one-shot che scrive per ogni commessa esistente una versione 1 `creazione` con lo stato attuale come snapshot (`modificato_da` NULL / "sistema"). Eseguito sul DB di produzione in modo mirato e idempotente (solo per commesse senza versioni). Lo storico parte popolato.
- **Test in produzione**: provare un edit reale + un'aggiunta tipologia + un ripristino, su una commessa di test, verificando che codice/nome cartella non cambino mai.

## Fuori scope (YAGNI)

- Draft offline per l'edit (la modifica è online-only).
- Vista storico su mobile.
- Diff visuale ricco (basta elenco campo: da → a).
- Rimozione voci / rinomina cartelle.
