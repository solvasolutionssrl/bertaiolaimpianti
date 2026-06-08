# Design: Bozze + autosave offline-first per la creazione commesse

**Versione**: 1.0
**Stato**: Approvato (design), in attesa di piano di implementazione
**Data**: 2026-06-08
**Autore**: Luca + Claude

## Problema

Oggi la creazione di una commessa (office e PWA mobile voice-intake) vive **solo in memoria React**. Non esiste autosave, ne persistenza locale (localStorage/IndexedDB), ne stato bozza usato. Conseguenze verificate sul codice attuale:

- Se l'utente chiude il tab, ricarica, o cade la connessione mentre compila, **si perde tutto**.
- Il dettato vocale e' il punto piu' fragile: audio in RAM (non salvato), transcript e campi estratti dall'AI vivono solo nello state `voiceResult`. Se la rete cade tra la risposta dell'AI e il "Salva", il transcript e' perso e il DB e' ancora vuoto.
- I file non si possono caricare finche' la commessa non e' salvata: `/api/upload/media/init` richiede `commessa_id` + `cloud_folder_path`.

Lo stato `bozza` esiste gia' nell'enum `stato_commessa` e nel filtro UI dell'elenco, ma `creaCommessa()` forza `stato='aperta'`: nessuna commessa raggiunge mai "bozza".

## Obiettivo

La commessa nasce come **bozza al primo contenuto reale**, da li in poi **ogni modifica si salva da sola** (offline-first). L'utente puo' uscire, perdere la rete, o riprendere domani (anche da altro dispositivo) e ritrovare la bozza "da completare". Diventa commessa ufficiale solo con un gesto esplicito di finalizzazione.

## Decisioni di prodotto (fissate)

| Tema | Decisione |
|---|---|
| Persistenza | Offline-first completo: IndexedDB locale + sync server quando c'e' rete |
| Nascita bozza | Al primo contenuto reale (prima dettatura AI o primo campo compilato). Niente bozze vuote |
| Visibilita' bozze | Solo autore + super admin. Mai nell'elenco/conteggi/kanban delle commesse vere |
| Finalizzazione | Pulsante "Crea commessa" + campi minimi (cliente + descrizione) |
| Numerazione | Numero bozza separato (buchi ammessi); codice ufficiale gapless assegnato solo alla finalizzazione |
| File | R2 staging durante la bozza; alla finalizzazione l'oggetto R2 viene spostato nella cartella vera (clone Nextcloud) e poi sincronizzato su Nextcloud |
| Esperienza online (90%) | Tutta l'interattivita' live resta intatta (autocomplete cliente con dedup, catalogo voci, AI). L'offline-first e' uno strato di sicurezza sotto, non un degrado |
| Fuori scope | Edit completo di una commessa gia' finalizzata (con rinomina cartella Nextcloud): progetto separato successivo |

## Approccio scelto

**Tabella `commessa_bozze` separata** (Approccio A). La bozza vive in una tabella dedicata, isolata da `commesse`. Alla finalizzazione il sistema "materializza" la commessa reale riusando la logica di `creaCommessa()`, ri-aggancia i file, e marca la bozza come finalizzata.

Motivazione: la tabella `commesse` resta "solo commesse vere" (nessuna query/conteggio/kanban esistente da toccare o a rischio leak), il codice ufficiale e' gapless gratis (`genera_codice_commessa()` gira solo alla finalizzazione), nessun vincolo NOT NULL da allentare. Scartati: riuso di `commesse` con `stato='bozza'` (alto rischio leak in produzione, NOT NULL da allentare, filtri ovunque) e bozze solo locali (perde cross-device, super admin, durabilita').

## Sezione 1 — Modello dati e ciclo dei file

### Tabella `commessa_bozze`
- `id uuid` PK — generato dal client (la bozza esiste anche offline prima del sync)
- `tenant_id uuid`, `created_by uuid`
- `numero_bozza int` — assegnato dal server al primo sync, sequenza per-tenant; buchi ammessi (bozze effimere). Prima del sync la UI mostra "Bozza" senza numero
- `payload jsonb` — stato completo del form: cliente (`clienteId` o `clienteNew`), `voci[]`, `descrizione`, `note`/`transcript`, `indirizzoCantiere`, `referenti[]`, `presetId`
- `stato text` — `attiva` | `finalizzata`
- `created_at`, `updated_at`, `last_synced_at timestamptz`

Conflitti: autore singolo, last-write-wins su `updated_at`.

### File durante la bozza
- Nuova colonna `file_refs.bozza_id uuid` (nullable, FK `commessa_bozze(id)` ON DELETE CASCADE)
- `/api/upload/media/init` accetta `bozza_id` al posto di `commessa_id`
- R2 staging key: `tenants/{tenant}/bozze/{bozza_id}/media/...`, stato `uploaded`, **senza** sync Nextcloud
- La coda upload IndexedDB esistente viene riusata tale e quale, agganciata a `bozza_id`

### Alla finalizzazione, per ogni file
1. CopyObject R2 staging key -> chiave definitiva (sotto la cartella vera della commessa, mirror Nextcloud)
2. Delete della chiave staging (niente residui)
3. Update `file_refs`: `bozza_id=null`, `commessa_id=<vero>`, `r2_key=<definitiva>`, `path=<path Nextcloud>`, `r2_thumb_key` ricalcolata, `status='uploaded'` -> il sync worker esistente copia su Nextcloud

Risultato: R2 e Nextcloud finiscono entrambi con la struttura cartelle vera; lo staging si svuota.

### Pulizia bozze abbandonate
Cron (riuso del pattern purge esistente) elimina bozze `attiva` non toccate da **30 giorni** + relativi oggetti R2 staging.

## Sezione 2 — Client offline-first

- **Store locale (IndexedDB)**: nuovo store `bozze` nel DB `kommessa-uploads` esistente (pattern di `idb-store.ts`). Fonte di verita' locale; l'utente lavora sempre contro IndexedDB.
- **Autosave locale**: ogni modifica del form scrive su IndexedDB con debounce ~600ms. Elimina la perdita dati da chiusura/refresh anche completamente offline.
- **Sync engine verso server**: motore separato (pattern gemello alla coda upload: coda + retry con backoff) che spinge la bozza con `PUT /api/bozze/[id]` (upsert) quando c'e' rete, debounce ~2s. Se offline, resta in coda e parte al recupero connessione. `last_synced_at` traccia l'allineamento.
- **Boot e rientro**: all'avvio leggo le bozze locali + `GET /api/bozze` (le mie) e fondo con LWW su `updated_at`. Riprendere da altro dispositivo funziona.
- **Provider React** `BozzaProvider` + hook `useBozza()`: espone `bozzaCorrente`, `aggiorna(patch)`, elenco bozze, `scarta(id)`. Montato al root come `UploadQueueProvider`.

## Sezione 3 — Persistenza del dettato (fix critico)

1. L'utente detta -> `/api/voice/extract` torna transcript + campi estratti.
2. **Appena torna la risposta**, se non esiste ancora una bozza la creo (primo contenuto reale) e scrivo subito transcript + suggeriti nel payload -> persistito su IndexedDB all'istante, poi sync server.
3. Solo dopo l'utente rivede/accetta i suggerimenti, che a quel punto sono gia' al sicuro.

Anche se la rete cade subito dopo il dettato o l'utente chiude l'app, il transcript e' gia' salvato in locale e sincronizzato appena possibile.

## Sezione 4 — Finalizzazione (bozza -> commessa vera)

- **Refactor**: estrarre il cuore dell'insert di `crea-commessa.ts` in `materializzaCommessa(payload, fileRefs)` (logica identica: risoluzione/dedup cliente, `genera_codice_commessa()`, nome_cartella, INSERT commessa + voci + referenti, creazione cartelle, audit).
- **Server action `finalizzaBozza(bozzaId)`**:
  1. Valida campi minimi (cliente + descrizione). Se mancano -> errore al form, nessun codice bruciato.
  2. `materializzaCommessa()` -> `commessaId` + `cloud_folder_path`.
  3. Per ogni file: CopyObject R2 staging -> definitiva, delete staging, update `file_refs` (vedi Sezione 1).
  4. Bozza `stato='finalizzata'` + pulizia store locale.
  5. Ritorna `commessaId`; la UI naviga alla commessa vera.
- **Unificazione creazione**: office e PWA passano sempre per bozza -> finalizza. Il pulsante "Crea commessa" diventa il trigger di `finalizzaBozza`. L'attuale upload-dopo-create sparisce (i file sono gia' caricati durante la bozza).
- **Atomicita'**: se la copia R2 di un file fallisce, la commessa e' comunque creata (file riagganciabili con retry), errore registrato, nulla perso. Stesso spirito best-effort delle cartelle cloud.

## Sezione 5 — UI bozze ("Da completare")

- **Sezione "Da completare"** in PWA mobile e office: elenco delle mie bozze (locali + server fuse), titolo derivato con `risolviTitoloCommessa()` sul payload, data, badge "Bozza".
- **Ripresa**: tap -> riapre il form di creazione precompilato in modalita' "edit bozza" (i componenti form accettano un payload iniziale).
- **Scarta**: azione per eliminare (locale + `DELETE /api/bozze/[id]` + cleanup R2 staging).
- **Visibilita'**: solo autore + super admin. Mai nell'elenco/conteggi/kanban delle commesse vere (tabella separata, gratis).
- **Super admin**: vista in `/admin` per ispezionare le bozze attive di tutti i tenant (sola lettura, supporto/debug).
- **Online (90%)**: autocomplete cliente con dedup, catalogo voci e AI restano live contro il server come oggi.

## Sezione 6 — Edge case, errori, test

### Edge case
- **Cliente nuovo vs esistente**: il payload tiene `clienteId` o `clienteNew`; risoluzione/dedup solo alla finalizzazione (nessun cliente orfano).
- **Bozza da due dispositivi**: LWW su `updated_at` (autore singolo, conflitto raro/accettabile).
- **File caricato ma bozza scartata**: `DELETE` bozza -> CASCADE su `file_refs` + cleanup R2 staging (cron di sicurezza per residui).
- **Finalizzazione con sync server indietro**: finalizzo dal payload locale (sempre il piu' aggiornato).
- **Doppio tap su "Crea commessa"**: guardia su `stato='finalizzata'` per evitare doppia materializzazione.
- **Bozza abbandonata**: cron purge a 30 giorni (bozza + staging R2).

### Test
- **Unit**: `materializzaCommessa()` (estratto dal path gia' testato), merge LWW del sync, derivazione chiave R2 staging->definitiva.
- **Integrazione**: init upload con `bozza_id`; `finalizzaBozza()` end-to-end (bozza con 2 file -> commessa vera, file su chiave definitiva, staging vuota, voci/referenti corretti).
- **E2E manuale (produzione-like)**: detta offline -> chiudi app -> riapri -> transcript presente -> completa -> finalizza -> file su Nextcloud.

## File chiave coinvolti (da analisi codice attuale)

- `supabase/migrations/` — nuova migration: `commessa_bozze` + sequenza numero bozza + `file_refs.bozza_id` + cron purge
- `apps/web/app/_actions/crea-commessa.ts` — refactor in `materializzaCommessa()` + nuova `finalizzaBozza()`
- `apps/web/app/api/upload/media/init/route.ts` — accettare `bozza_id`
- `apps/web/app/api/bozze/[id]/route.ts` (nuovo) — `PUT`/`DELETE`; `apps/web/app/api/bozze/route.ts` (nuovo) — `GET` mie bozze
- `apps/web/app/_lib/upload-queue/idb-store.ts` (pattern) -> nuovo store `bozze`
- `apps/web/app/_components/` — nuovo `BozzaProvider` + hook `useBozza()`
- `apps/web/app/office/commesse/nuova/_components/form.tsx` — integrazione draft store + submit = finalizza
- `apps/web/app/mobile/voice-intake/_components/voice-intake-flow.tsx` — dettato persiste subito + draft store
- UI "Da completare" in PWA mobile e office + vista super admin in `/admin`

## Fuori scope (promemoria)

Edit completo di una commessa gia' finalizzata (cliente, descrizione, voci) con rinomina della cartella Nextcloud. Da affrontare come progetto separato a valle di questo.
