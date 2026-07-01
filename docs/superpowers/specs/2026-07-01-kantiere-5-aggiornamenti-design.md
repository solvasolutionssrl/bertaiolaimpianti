# Kantiere — 5 aggiornamenti post-incontro cliente (01/07/2026)

**Versione**: 1.0
**Stato**: Approvato (design), pronto per implementazione
**Modulo**: Kantiere (presenze/cantieri) — tenant FPM (`app_mode=kantiere`)
**Vincolo trasversale**: tutto gated da `tenantHasModule('kantiere')` → **Bertaiola-safe** (mondo commesse non toccato). UI in italiano. Nessun push su `main` finché le migration di #1 e #4 non sono applicate al cloud.

## Contesto

Cinque richieste emerse dall'incontro cliente del 30/06. Ordine di implementazione: **5 → 3 → 1 → 4 → 2** (dal più isolato/sicuro al più corposo). Ogni feature = commit separato, typecheck + build verdi.

Riferimenti di partenza (mappa codice verificata):
- Pausa: `_actions/kantiere-timbra.ts` (`pausaPranzoMia:482`, `cambiaStatoTurnoMio:438`, `riprendiTurnoMio:486`), `_actions/_lib/viaggio-timbra.ts` (`coppiaPausaCentrata:54`, `inserisciPausaDichiarata:72`), `packages/api/src/kantiere-ore.ts` (`minutiPerCommessa:8`, `esitoAutoApprovazione:225`, `statoTurno:114`), `_actions/_lib/ricomputa-rapportino.ts` (`ricomputaRapportinoAuto:150`), `_lib/kantiere-config.ts` (`leggiSogliaPausaPranzoOre:47`).
- Config office: `office/impostazioni/kantiere/page.tsx`, `office/kantiere/impostazioni/_components/impostazioni-client.tsx`, `office/_actions/kantiere-impostazioni.ts`.
- Modifica ore: `mobile/kantiere/ore/page.tsx` + `_components/ore-client.tsx` + `_components/storico-ore.tsx`; office `office/_actions/kantiere-rapportini.ts` (`registraOrePerDipendente:322`, `aggiungiPausaGiornata:764`); versioning `_actions/_lib/scrivi-versione-rapportino.ts`; azioni tecnico `_actions/kantiere-rapportino.ts` (`registraOreManuali:451`, `salvaMioRapportino:282`, `precompilaMioRapportino:223`).
- Notifiche: tabella `notifiche` (`20260101001000_notifiche.sql`), bell office `office/layout.tsx:71` + `office/notifiche/page.tsx`, bell mobile `mobile/kantiere/_components/notifiche-bell.tsx`.
- Viaggio/km: `timbratura_viaggio` (`20260624000000...` + `20260624040000_viaggio_km.sql` per `distanza_km`), `inserisciViaggioRow` (`_actions/_lib/viaggio-timbra.ts:138`).
- Spese: `spese` (`20260625120000_kontabilita_spese.sql`), scan `api/kantiere/spese/scan/route.ts`, action `_actions/kantiere-spese.ts` (`creaSpesa:110`, `creaSpesaOffice:214`), form `mobile/kantiere/spese/_components/nuova-spesa.tsx`, `office/kantiere/kontabilita/_components/nuova-spesa-office.tsx`, package `packages/api/src/spese.ts`.

---

## Feature 5 — Messaggio chiaro durante analisi scontrino

**Obiettivo**: durante lo scan far capire all'utente che deve attendere e non uscire dalla schermata.

**Stato attuale**: fase `analisi` in `nuova-spesa.tsx:445-464` mostra `ScanningOverlay` + spinner con `Analisi in corso… / Sto leggendo lo scontrino, un attimo.` (righe 460-461).

**Modifica** (solo UI, `nuova-spesa.tsx`):
- Testo principale più grande/visibile: **"Attendi qualche secondo mentre vengono estratti i dati dello scontrino"**.
- Sottotitolo: **"Non chiudere questa schermata"**.
- Mantenere spinner/overlay esistenti.

**Migration**: nessuna. **Push-safe**: sì.
**Test**: manuale (fase analisi visibile durante uno scan).

---

## Feature 3 — KM solo autista/mezzo; ore viaggio anche ai passeggeri

**Obiettivo**: i km si attribuiscono **solo all'autista** (e al mezzo); le **ore di viaggio anche ai passeggeri**.

**Stato attuale**:
- **Ore viaggio → già conformi**: il calcolo (`ricomputa-rapportino.ts`, `viaggioPerTarget`) somma `durata_confermata_min` per ogni persona senza filtrare `autista`. Passeggero riceve già le sue ore. **Non toccare il calcolo ore.**
- **KM → parziale**: dati distinti già presenti (`autista`, `kmGuidati`/`kmPasseggero`, `guidati`/`percorsi`). Le viste "mezzo" sono già driver-only. Ma **5 viste per-persona** mostrano ancora i km da passeggero nel dato headline.

**Modifiche** (display/aggregazione — il dato grezzo `distanza_km` resta salvato anche sulle righe passeggero, per audit "chi era sul mezzo"):
1. `office/kantiere/cantieri/[id]/_components/storico-presenze.tsx:160` — colonna "Km" usa `p.km` (percorsi) → usare `kmGuidati` (già calcolato a `office/kantiere/cantieri/[id]/page.tsx:271-272`). Il tooltip "di cui X come autista" diventa ridondante → rimuovere o trasformare in "0 km da passeggero (non conteggiati)".
2. `office/kantiere/report/page.tsx:274-290` — `viaggiPerDipendente`: sommare `km` **solo se `v.autista`** (aggiungere il flag `autista` alla select viaggi righe 150-156 se assente).
3. `office/kantiere/dipendenti/[id]/page.tsx:242` — `kmPerMese` somma tutti → filtrare `autista`. (Il KPI headline usa già `kmGuidati`.)
4. `mobile/kantiere/cantieri/[id]/_components/analitica-cantiere.tsx:107` — tile "Km percorsi" usa `kmPercorsiOggi` → usare `kmGuidatiOggi` (già calcolato a `page.tsx:207`). Rinominare label in "Km" o "Km guidati".
5. `mobile/kantiere/cruscotto/_components/ultime-timbrature.tsx:118` — le righe `passeggero` non mostrano km: mostrare solo l'etichetta "passeggero" (senza cifra km).

**Robustezza** (richiesta esplicita "verifica che le logiche siano robuste"): verificare che ogni aggregazione km per-persona filtri `autista === true`, e che nessun'altra vista (grep `distanza_km` / `km`) sommi km passeggero per-persona. Le viste per-**mezzo** restano invariate (già driver-only via `mezzo_id`).

**Migration**: nessuna. **Push-safe**: sì.
**Test**: `packages/api` unit se esiste helper km puro; altrimenti verifica manuale su un dato con autista+passeggero.

---

## Feature 1 — Pausa pranzo: auto-spegnimento dopo soglia (default 1h30) → riprende il turno

**Obiettivo**: una pausa avviata e dimenticata si **auto-chiude** dopo una soglia configurabile (default **1h30**); il **turno riprende** (orologio riparte). Vengono scalati esattamente `soglia` minuti. Countdown/avviso in UI. Tracciabilità nei report.

**Stato attuale / bug corretto**: oggi non esiste auto-chiusura. Una pausa lasciata aperta degenera silenziosamente in "uscito a pranzo" (`esitoAutoApprovazione` vede `ingressi===uscite` e può auto-approvare la giornata come chiusa a pranzo, perdendo il pomeriggio). Questa feature corregge il comportamento.

**Modello dati**: la pausa = coppia `timbrature` (`uscita pausa=true` inizio, `ingresso pausa=true` ripresa). Auto-chiudere = inserire l'`ingresso pausa=true` a `inizioPausa + soglia`.

**Config**:
- Nuova chiave jsonb `tenant_modules.config.soglia_auto_spegnimento_pausa_ore` (default **1.5**, min 0.5). **Distinta** da `soglia_pausa_pranzo_ore` (5h, promemoria a fine turno).
- Aggiungere: default in `office/impostazioni/kantiere/page.tsx`; prop+state+input in `impostazioni-client.tsx` (sezione "Approvazione presenze", con la conferma "vale sui turni futuri" già presente); zod + merge in `office/_actions/kantiere-impostazioni.ts`; reader `leggiSogliaAutoSpegnimentoPausa(supabase, tenantId)` in `_lib/kantiere-config.ts` (modello di `leggiSogliaPausaPranzoOre:47`).

**Server (autorevole, rete di sicurezza per app chiusa)**:
- Helper `chiudiPausaScadutaSePresente(supabase, {tenantId, dipendenteId, data, sogliaOre})`: se l'ultimo evento della giornata è `uscita pausa=true` (stato `pausa`) e `now - inizioPausa >= sogliaOre`, inserisce l'`ingresso pausa=true` a `inizioPausa + sogliaOre*3600000` con `origine='manuale'`, `creato_da=null` (sistema) e **`auto_chiusa=true`** (nuova colonna). Idempotente (dopo l'inserimento la pausa è chiusa → nessun doppio inserimento).
- Chiamarlo dentro `ricomputaRapportinoAuto` (prima del calcolo ore) così ogni ricalcolo (LiveRefresh office 60s, azioni tecnico) materializza la chiusura.

**Client (app aperta)**:
- Card pausa `mobile/kantiere/cantieri/[id]/_components/turno-azioni-cantiere.tsx` e banner `mobile/kantiere/_components/turno-pausa-home.tsx`: mostrare un **countdown** basato su `inizioPausaTs + soglia` (prop `soglia` da passare dalle page server, come già fatto per `sogliaPausaPranzoOre` a `cantieri/[id]/page.tsx:110`). Copy compatta: **"La pausa si chiude tra {mm:ss} · ricordati di interromperla a mano"**. A 0 → chiamare l'azione di ripresa (riuso `riprendiTurnoMio`, ma la fonte di verità resta il server: se scaduta, il ricalcolo la chiude comunque a `inizioPausa+soglia`).

**Tracciabilità UI** (richiesta: "riporta questo sempre nei report, frase compatta"):
- Nuova colonna `timbrature.auto_chiusa boolean not null default false` (migration).
- Nel componente dettaglio condiviso `office/kantiere/_components/timbrature-riepilogo.tsx` (`GiornataFlow`/`OrigineLine`): quando una pausa ha `auto_chiusa=true`, mostrare frase compatta tipo **"☕ Pausa {durata} · chiusa automaticamente (dimenticata)"**. La durata riflette la soglia effettiva. Nessuna modifica a storico-presenze/report per i numeri (già derivati dal ricalcolo sulla coppia materializzata).

**Edge cases**:
- Se dopo l'auto-ripresa il tecnico non timbra l'uscita → giornata **aperta = anomalia** (office la vede, niente auto-approvazione silenziosa "uscito a pranzo").
- Auto-chiusura solo su pause **del giorno corrente** (coerente con `terminaTurnoMio` vincolato a oggi). Giorni passati con pausa aperta: li chiude comunque il ricalcolo alla prima esecuzione (safety net) — accettabile.

**Migration** (push-order sensibile): `timbrature.auto_chiusa boolean not null default false`. **Push-safe**: NO — pushare solo dopo aver applicato la migration (l'insert con `auto_chiusa=true` fallirebbe altrimenti).
**Test**: unit su helper puro (dato una lista eventi con pausa aperta > soglia → produce la coppia chiusa a inizioPausa+soglia; ≤ soglia → nessuna azione); manuale UI countdown.

---

## Feature 4 — Spese: campo "numero persone" + conferma

**Obiettivo**: in fase spesa indicare **per quante persone** è stata pagata (stepper −/+ e input manuale, default 1). Se l'utente non tocca il campo → **pop-up full-screen** di conferma alla submit. L'AI propone il numero da coperti/menù.

**Stato attuale**: nessuna colonna persone in `spese`. Form PWA `nuova-spesa.tsx` (fasi `idle|analisi|revisione|errore|fatto`, salva via `creaSpesa`). Office `nuova-spesa-office.tsx` (Dialog, salva via `creaSpesaOffice`).

**Migration**: `spese.numero_persone smallint not null default 1 check (numero_persone >= 1)`. Nuovo file `supabase/migrations/<ts>_spese_numero_persone.sql`.

**AI** (`api/kantiere/spese/scan/route.ts`):
- `PROMPT_SCONTRINO` (:34): aggiungere campo `"numero_persone": number|null` con regola "numero di coperti / menù fissi rilevati; se non deducibile null".
- Schema `Estratto` (:51): `numero_persone: z.union([z.string(), z.number()]).optional().catch(undefined)`.
- `dati` default (:171) + mapping (:239): `numero_persone` (parse int, clamp ≥1, default null). Ritorna in `estratto` (già inoltrato). **Non** entra in `estrazioneSufficiente` (opzionale, non blocca).
- (Opz.) helper puro `parseNumeroPersone` in `packages/api/src/spese.ts` + test.

**Action** (`_actions/kantiere-spese.ts`):
- `CreaSchema` (:56): `numeroPersone: z.number().int().positive().max(99).default(1)`. Insert (:150): `numero_persone: d.numeroPersone`.
- `CreaOfficeSchema` (:187) + insert (:259): stesso campo.
- Nessun calcolo derivato (niente split importo): solo dato registrato.

**UI PWA** (`nuova-spesa.tsx`):
- State `numeroPersone` (default 1) + `personeToccato` (default false). Reset in `reset` (:207). Precompila da `est.numero_persone ?? 1` in `onFile` success (:283), con `personeToccato=false`.
- Stepper −/+ con input manuale nel blocco revisione (:485-632); ogni onChange → `setPersoneToccato(true)`.
- In `salva` (:306): se `!personeToccato` → aprire **overlay full-screen** (pattern `fixed inset-0 z-[...]` come lightbox :704) con copy **"Stai aggiungendo una spesa da {importo}€. Per quante persone hai pagato?"** + stepper editabile (default = numero AI, es. "Eravate in cinque, confermi?"). Conferma → prosegue con `creaSpesa` includendo `numeroPersone`. Se `personeToccato` → nessun overlay, salva diretto.
- Aggiornare dep array di `salva`, tipi locali `Estratto`/`ScanOk`.

**UI Office** (`nuova-spesa-office.tsx`): stesso campo/stepper nel form, **senza** overlay. Precompila da AI, passa a `creaSpesaOffice`.

**Migration**: sì (`numero_persone`). **Push-safe**: NO — pushare solo dopo migration applicata (l'insert con `numero_persone` fallirebbe).
**Test**: unit `parseNumeroPersone` (se aggiunto); manuale flusso PWA con/senza tocco del campo.

---

## Feature 2 — Modifica ore ultimi 3 giorni (tecnico, PWA + desktop) + notifica campanella

**Obiettivo**: il tecnico può modificare le proprie ore di **oggi + i 3 giorni precedenti** (editare ore e/o **aggiungere la pausa pranzo**) da un dialog **semplice e responsivo** (mobile full-screen + desktop centrato). La modifica **si applica subito**, è **versionata**, e genera una **notifica di sistema persistente** verso office/admin (campanella desktop + PWA), **non-letta finché non aperta**; il click porta alla giornata modificata.

**Stato attuale**:
- PWA tecnico: sola lettura sui giorni passati (`ore-client.tsx` input `disabled`, `storico-ore.tsx` presentazionale). Può modificare solo oggi.
- Versioning `modifica_tecnico` **già ammesso** dal CHECK di `rapportino_versioni` (nessuna migration). RLS: il tecnico può già scrivere `rapportino_righe`/`timbrature` del proprio tenant.
- Notifiche: infrastruttura pronta (`notifiche` + bell office/mobile + pipeline push), ma nessun evento Kantiere la usa.

**Modifiche**:

*Ingresso UI*:
- `mobile/kantiere/ore/_components/storico-ore.tsx`: rendere **tappabili** solo le righe di oggi + 3 giorni precedenti (le più vecchie restano sola-lettura, con eventuale hint "modificabile fino a 3 giorni"). Tap → apre il dialog.

*Dialog responsivo* (nuovo componente `mobile/kantiere/ore/_components/modifica-giornata-dialog.tsx`, riusabile):
- Mobile: foglio full-screen (header/body/footer sticky, come da linea UI "azioni sticky"). Desktop: modale centrato (shadcn `Dialog` responsive).
- Body: per ogni cantiere della giornata, input ore lavoro (H e MM) + ore viaggio; sezione "Pausa pranzo" con "Aggiungi pausa" (30/45/60 min) se assente.
- Footer sticky "Salva". Info: "La modifica avvisa l'ufficio".

*Server* — nuova action tecnico `modificaMiaGiornata(input)` in `_actions/kantiere-rapportino.ts` (o file dedicato):
- Gate: proprietà (`dipendente_id === me.id`), **finestra ≤ 3 giorni** (`romeDay`), stato modificabile.
- Applica: upsert `rapportino_righe` (riuso logica `registraOreManuali`/`salvaMioRapportino`); pausa via coppia centrata (riuso `coppiaPausaCentrata`/`inserisciPausaDichiarata`, come `aggiungiPausaGiornata:764` office).
- Ricalcola (`ricomputaRapportinoAuto`).
- Versione `scriviVersioneRapportino({ azione: 'modifica_tecnico', modificatoDa: me.id, modificatoDaNome })`.
- **Notifica**: inserire righe `notifiche` (via service client, pattern `office/_actions/bulk.ts:283`) per gli utenti `office`/`admin` del tenant, `type='kantiere_modifica_tecnico'`, `payload={ rapportinoId, dipendenteId, dipendenteNome, data, url: '/office/kantiere/rapportini?giorno=<data>&dip=<id>' }`.

*Campanella / lettura*:
- Verificare che la bell office (`office/layout.tsx` + `office/notifiche/page.tsx`) mostri il nuovo `type` come non-letto (badge finché `read_at` nullo) e che il click **marchi letto + navighi** a `payload.url`. Adeguare il render del bell/notifiche se il nuovo type non è gestito (label + icona + link).
- Il tecnico che modifica non riceve notifica.

**Edge cases**:
- Modifica di una giornata **già auto-approvata**: consentita → riapre/riversiona + notifica (l'office può ricorreggere). Il motore auto-approvazione ri-valuta al ricalcolo.
- Desktop: il tecnico che accede da desktop usa lo stesso dialog responsivo.

**Migration**: nessuna (`modifica_tecnico` già ammesso; `type` notifica è stringa libera). **Push-safe**: sì.
**Test**: manuale (modifica giorno -2, verifica versione + notifica office + deep-link); gate finestra 3 giorni.

---

## Migrazioni da applicare (riassunto per l'umano)

Da applicare al cloud **prima** del deploy di #1 e #4 (`supabase db push` o psql):
1. `<ts>_timbrature_auto_chiusa.sql` — `alter table public.timbrature add column auto_chiusa boolean not null default false;`
2. `<ts>_spese_numero_persone.sql` — `alter table public.spese add column numero_persone smallint not null default 1 check (numero_persone >= 1);`

Feature migration-free e pushabili subito dopo verifica: **#5, #3, #2**.

## Orchestrazione

Implementazione via workflow multiagente **sequenziale sul tree** (evita conflitti su file condivisi: `nuova-spesa.tsx` in #4/#5; aree pausa/rapportino/riepilogo in #1/#2). Ordine agenti: **SPESE (#4+#5) → KM (#3) → PAUSA (#1) → MODIFICA (#2)**. Nessun commit/push dagli agenti; verifica finale (`pnpm --filter @kommessa/web typecheck` + `build`) e commit per-feature dal main loop. Tutto documentato in memoria.
