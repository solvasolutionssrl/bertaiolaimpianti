# Kantiere Fase H — Rifiniture chirurgiche (navigazione, layout, estensioni)

**Data**: 2026-06-19 · **Stato**: in corso · branch `feat/kantiere-tesserino-digitale` (NON mergiare).
Lista improvement dall'utente. Regola: chirurgico, identità visiva attuale, non rompere funzioni operative, no refactor pesanti. Tutto gated → Bertaiola invariata.

## Interventi

### H1 — Sidebar tenant-dependent (FPM) + trattamento "modulo/add-on"
`packages/ui/src/components/app-shell-office.tsx`: aggiungi `variant?: 'module'` a `OfficeNavItem` + render con trattamento visivo riconoscibile (accent brand discreto sul group header: icona in accent + micro-chip/etichetta, niente stravolgimenti).
`office-shell-client.tsx` `buildNav(hasKantiere)`:
- **Se `hasKantiere` (FPM)** → struttura nuova:
  - Dashboard (`/office`)
  - **Commessa** [group, variant module]: Commesse (`/office/commesse`), Task (`/office/todo`)
  - Clienti (`/office/clienti`)
  - **Dipendenti** (`/office/kantiere/dipendenti`) — voce GLOBALE (fuori da Kantiere)
  - Turni & ore (`/office/turni`)
  - Ricerca (`/office/cerca`)
  - Avvisi (`/office/notifiche`)
  - Co-pilot (`/office/copilot`)
  - **Kantiere** [group, variant module, SOPRA Impostazioni]: Panoramica, Cantieri, QR code, Rapportini, Report, Anomalie (NO Dipendenti, NO Impostazioni)
  - **Impostazioni** [group]: children esistenti + **Kantiere** (`/office/impostazioni/kantiere`), gated hasKantiere
- **Se `!hasKantiere` (Bertaiola)** → struttura ATTUALE invariata.

### H2 — Impostazioni Kantiere dentro Impostazioni generali
- Crea `/office/impostazioni/kantiere/page.tsx` + client = contenuto attuale di `/office/kantiere/impostazioni` (soglia ore + sede partenza). Riusa l'action `salvaImpostazioniKantiere`.
- Aggiungi tab "Kantiere" in `SettingsTopNav` (`impostazioni/_components/settings-tabs.tsx`), gated hasKantiere.
- Vecchia route `/office/kantiere/impostazioni` → `redirect('/office/impostazioni/kantiere')` (non rompere link). Rimuovi la voce dal gruppo Kantiere (H1).

### H3 — Layout tab Cantieri (lista)
`cantieri/_components/cantieri-client.tsx`: lista densa più ordinata/desktop; bottone **Apri** primario ed evidente; coerenza visiva.

### H4 — Dettaglio cantiere ristrutturato
`cantieri/[id]/page.tsx` + `_components/cantiere-detail-client.tsx`:
- Header completo: info principali + **azioni rapide** + **QR in evidenza in alto** (non in fondo): mostra il QR (immagine) + Stampa/Rigenera subito.
- Sezioni accessibili: Anagrafica (edit), Squadra, **Rapportini del cantiere** (righe che referenziano questo cantiere), **Stato/anomalie** (es. timbrature incomplete sul cantiere). Layout desktop, meno spezzato.
- **Squadra (dialog batch)**: un dialog "Gestisci squadra" → titolo "Squadra {nome cantiere}" + select capo + **checkbox membri** disponibili + Conferma → applica in un colpo. Nuova action `impostaSquadraCantiere({cantiereId, capoId, membriIds})` in `office/_actions/cantieri.ts` (rimpiazza la squadra: set capo + membri; rimuove i non selezionati). Timbratura invariata.

### H5 — QR code: storico completo
`qr/page.tsx` + `qr-client.tsx`: mostra TUTTI i `cantiere_qr` (attivi + revocati), per commessa E cantiere. QR attivo in evidenza in alto; i vecchi/revocati in basso, grigi/disabilitati, distinguibili per data/stato. Rigenera non li fa sparire (già in DB). 

### H6 — Registra ore per dipendente (ufficio)
Action `registraOrePerDipendente` in `office/_actions/kantiere-rapportini.ts`: input `{ dipendenteId, target: {commessaId?|cantiereId?}, data, ore_ordinarie, ore_viaggio, ore_straordinarie, note? }`. Guard office/admin+modulo. Upsert rapportino `(dipendente_id, data)` stato `approvato` (approvato_da=ufficio); inserisce/aggiorna una riga col target giusto. UI: bottone "Registra ore" + dialog sulla pagina Rapportini ufficio.

## Note
- Default: Ricerca/Avvisi/Co-pilot restano flat globali. Gruppi collassabili (già supportato).
- Verifica finale: build + typecheck + Bertaiola-safe (struttura attuale invariata senza kantiere).
