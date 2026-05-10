# Report di Riunione — Bertaiola Impianti
**Versione**: 1.0
**Periodo coperto**: 14/11/2025 → 28/11/2025
**Compilato da**: SOLVA Solutions
**Stato**: Consolidato post-kickoff

---

## Eventi documentati

| # | Data | Output | Documento sorgente |
|---|---|---|---|
| 1 | 14/11/2025 | Proposta tecnica iniziale — mappatura processo | `file_iniziali_incontri/Bertaiola_Update_20251114 (2).pdf` |
| 2 | 28/11/2025 | Aggiornamento architettura M365 + costi | `file_iniziali_incontri/Copia di Bertaiola_Update_20251114 (2).pdf` |
| 3 | Dic 2025 | Kickoff SOLVA: revisione + questionario compilato dal cliente | `01_KICKOFF/Domande_Cliente_SOLVA.md` |

## Partecipanti

| Ruolo | Nome / referente |
|---|---|
| Autore proposte tecniche (SOLVA) | Luca Melchiori |
| Cliente | Bertaiola Impianti (referente da nominare nel verbale ufficiale) |
| Compilatore questionario | Lato SOLVA (le risposte raccolte sono integrate nel Documento Zero) |

## Materiali di partenza analizzati

1. **PDF 14/11/2025** — 7 pagine, contenuti:
   - Overview workflow attuale (38 lavorazioni / 8 macro-aree)
   - Esempio applicato a "caldaia" (8 fasi attive vs 3 escluse)
   - Funzionalità target (alberatura, gestione foto, notifiche, cloud)
   - Fasi progetto (Progettazione → Infrastruttura → Operatività)

2. **PDF 28/11/2025** — 7 pagine, contenuti:
   - Overview "Unificare Freshdesk e Documentazione con M365"
   - Confronto situazione attuale ↔ proposta
   - Flusso di lavoro mobile (foto in tempo reale, consultazione disegni, no VPN)
   - Architettura proposta: **SharePoint Online + Freshdesk + M365**
   - Licensing: 5 × M365 Business Standard (€15) + 15 × M365 Business Basic (€8) = **~€200/mese**
   - Costi setup: **€4.500** architettura + **€3.500** integrazione + **~€3.000** tuning = **~€11.000 + IVA**
   - Canone annuo: "Da definire"

## Mappatura processo (38 lavorazioni, 8 macro-aree)

1. **Anagrafica & ticket**: Cliente/Cantiere, Ticket, Responsabile, Preventivo, Cartella cantiere
2. **Cantiere & ordini**: Ordine materiali, POS+Documenti, Tracciatura cantiere, Cartellone, Fornitura cassette
3. **Impiantistica macro**: Colonne sanitario/riscaldamento, Impianti sanitario/condizionamento/gas/aspirazione, Solare, Pannelli solari, Ordine C.T./bagni
4. **Ventilazione & collaudi**: Fori ventilazione, Collaudo tenuta
5. **Allegati DICO**: Disegni DICO, Compilazione DICO, Agg. 26/24, Agg. 26/24.4
6. **Foto & materiali**: Foto cantiere
7. **Idraulica**: Tubazioni esterne, Piatto doccia + vasca, Collettori riscaldamento
8. **Montaggi**: Posa impianto pavimento, Montaggio bagni, Montaggio centrale
9. **Allacci & supporto**: Contatore SAT, CIRCE-CURIT, Allacci obbligatori, Assistenza collaudi, Adesivi info cliente
10. **Alimentazione**: Tensione 220/380 ecc.

(Tot. 38 voci come da PDF 14/11/2025)

## Temi discussi

1. ✅ Workflow attuale e tassonomia delle 38 fasi
2. ✅ Esempio "caldaia": preventivo → ordine materiali → impianto gas → impianto sanitario → impianto condizionamento (se previsto) → collaudo tenuta → DICO → foto finali (8 fasi attive)
3. ✅ Funzionalità target: alberatura automatica, archivio centralizzato, gestione foto cantiere (prima/durante/fine), notifiche su upload mancanti / cambi stato / requisiti pre-chiusura
4. ✅ Necessità di accesso mobile per tecnici (iOS/Android) **senza VPN**
5. ✅ Architettura v1 ipotizzata: SharePoint Online + Freshdesk + M365
6. ⚠️ Riserva sull'architettura v1: SharePoint percepito come "pesante", licensing M365 oneroso per chi non usa l'ecosistema Microsoft
7. ✅ Esigenza di **sync locale** sui PC ufficio (UX "cartella alla vecchia")
8. ✅ Opportunità di rendere la soluzione **multitenant** per rivenderla ad altre PMI impiantistiche

## Decisioni prese

| ID | Decisione | Data | Owner |
|---|---|---|---|
| D1 | ~~Mantenere Freshdesk~~ → **Abbandonare Freshdesk**: migrazione one-time via API, ticketing nativo nella nuova app | Dic 2025 (rev.) | Cliente |
| D2 | Adottare un archivio cloud unico + struttura standardizzata per commessa | 14/11 | Cliente + SOLVA |
| D3 | App mobile per tecnici come funzione cardine (foto + checklist + consultazione) | 28/11 | Cliente + SOLVA |
| D3.1 | **App mobile = PWA installabile** (no App Store, no Play Store, no review): URL → "Aggiungi alla schermata Home" su iPhone | Dic 2025 | Cliente + SOLVA |
| D4 | Mobilità totale senza VPN | 28/11 | SOLVA |
| D5 | Riconsiderare SharePoint, valutare alternative leggere con sync locale | Dic 2025 | SOLVA |
| D6 | Architettura MULTITENANT, doppio brand SOLVA + Bertaiola | Dic 2025 (questionario) | Cliente + SOLVA |
| D7 | Login custom (email+password) | Dic 2025 | Cliente |
| D8 | Hosting UE, GDPR compliant | Dic 2025 | Cliente |
| D9 | Manutenzione gestita SOLVA, canone incluso | Dic 2025 | Cliente |
| D10 | MVP go-live in 1 mese (Gennaio 2026) | Dic 2025 | Cliente |
| D11 | NO offline mobile per fase 1 (online sufficiente) | Dic 2025 | Cliente |
| D12 | Scope opzionali in roadmap successiva: preventivi, rapportini, portale cliente, integrazione impiantix.app per manutenzioni | Dic 2025 | SOLVA + cliente |
| D13 | Nuova app gestisce **end-to-end** il ciclo: ticket entrante → commessa → fasi → foto → DICO → chiusura. Nessun sistema esterno di ticketing post go-live | Dic 2025 | Cliente |

## Punti aperti

| ID | Punto aperto | Da chiudere con | Stato |
|---|---|---|---|
| OPEN-1 | Selezione brand prodotto multitenant (3 opzioni proposte) | Decisione SOLVA + cliente | 🟡 In corso |
| OPEN-2 | Scelta finale storage: Hetzner Storage Share (Nextcloud) vs alternative | SOLVA — analisi in `02_ARCHITETTURA` | 🟡 In corso |
| OPEN-3 | Data esatta di disdetta licenza Freshdesk (consigliato: fine periodo fatturazione corrente, dopo migrazione e go-live) | Cliente | 🟡 In corso |
| OPEN-4 | Modalità migrazione album Google Foto + ticket Freshdesk → nuovo archivio (script una tantum) | SOLVA | ⚪ Pianificato |
| OPEN-5 | Sessione formativa ufficio (1-2h × 5 utenti) | SOLVA | ⚪ Pianificato |
| OPEN-6 | Roadmap manutenzioni programmate: integrare impiantix.app o sviluppare modulo nativo? | SOLVA + cliente | ⚪ Da pianificare in fase 3 |
| OPEN-7 | Push notifications su iOS via PWA: richiede installazione PWA come standalone app (supportata da iOS 16.4+). Backup canale email per browser senza PWA installata | SOLVA | 🟡 In corso |

## Rischi identificati

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Timeline 1 mese troppo stretta per scope completo | Media | Alto | Strategia MVP focused (lista commesse + dettaglio + upload foto + sync ufficio). Funzioni accessorie in sprint 2 |
| Cliente non passa a M365/Google Workspace per ora | Già accaduto | Medio | Stack alternativo selezionato (Nextcloud + Postgres + custom auth). Nessuna dipendenza M365 |
| Volumi foto in crescita oltre stima | Media | Basso | Storage modulare Hetzner (upgrade NX21 a €14/mese per 5 TB) |
| Adozione tecnici resistente al nuovo flusso | Media | Medio | UX mobile semplice (1-2 tap per foto); formazione breve |
| Multitenant: complessità architetturale | Media | Medio | Schema con RLS Postgres + folder isolation Nextcloud; ben documentato |

## Prossimi step

1. SOLVA presenta a Bertaiola: PPT executive + PPT tecnica + preventivo (questo pacchetto).
2. Validazione cliente su brand prodotto + scope MVP definitivo.
3. Kickoff sviluppo (Sprint 0): provisioning ambienti, dominio, account.
4. Sprint MVP (4 settimane).
5. Test e formazione (1 settimana).
6. Go-live e operatività.
