# Roadmap & Sprint plan
**Versione**: 1.0
**Go-live MVP target**: 4 settimane dal kickoff sviluppo
**Filosofia**: ship piccolo, ship presto, validare in produzione con Bertaiola

> **Nota sul tempo**: le settimane indicate sono **durate sprint** (effort condensato), non date di calendario. Il sequenziamento esatto va concordato col cliente in fase di firma preventivo.

---

## Macro-fasi

```
[Sprint 0]     Setup
[Sprint MVP]   Core: web ufficio + PWA tecnici + sync ufficio + auth + ticketing base
[Sprint 2]     Migrazione Freshdesk + Ticketing email/portale + Notifiche + Ricerca
[Sprint 3]     Portale cliente finale (opzionale)
[Sprint 4]     Preventivi & rapportini (opzionali)
[Sprint 5]     Manutenzioni / integrazione impiantix (opzionale, post-validazione)
[Operatività]  Manutenzione canone SOLVA, evolutive on demand
```

---

## SPRINT 0 — Setup (½ settimana)

**Obiettivo**: tutta l'infrastruttura accesa, niente codice di prodotto ancora.

| Task | Output |
|---|---|
| Acquisto domini (`impiantixplus.app`, sub `m.impiantixplus.app` per PWA, `bertaiolaimpianti.<dominio_app>`, etc.) | DNS attivi su Cloudflare |
| Provisioning Hetzner Storage Share NX11 + custom domain `cloud.bertaiolaimpianti.<X>` | Istanza Nextcloud accessibile, SSL OK |
| Creazione progetto Supabase region Frankfurt | URL + chiavi disponibili |
| Setup Vercel account + collegamento GitHub | Pipeline deploy attiva |
| Setup Resend (transactional outbound + inbound parsing per ticket email) | Domain `bertaiolaimpianti.it` verificato |
| Creazione repo `solva-impiantixplus` mono-repo (pnpm + turbo) | Repo inizializzato |
| Branding minimo: logo SVG, palette, font, favicon, **icone PWA 192/512** | Pacchetto design system pronto |
| Setup Sentry free + Web App Manifest + Service Worker baseline | Servizi configurati |
| Provisioning utenze iniziali (5 ufficio + 15 tecnici) su Supabase | Utenti pronti per onboarding |
| Audit account Freshdesk del cliente (volumi ticket, allegati, struttura) | Stima dimensione migrazione |

**Deliverable**: ambiente cliente provisionato, niente UX ancora.

---

## SPRINT MVP — Core (3 settimane, ~155 h)

**Obiettivo**: Bertaiola può creare ticket/commesse, struttura cartelle si crea automatica, ufficio le vede sui PC tramite Nextcloud Sync, tecnici scattano foto da iPhone (PWA installata) e le foto finiscono nella cartella giusta.

### Backend (45 h)
- Schema Postgres: `tenants`, `users`, `clients`, `tickets`, `ticket_messages`, `commesse`, `fasi`, `file_refs`, `audit_events`
- Migrazioni Supabase versionate
- RLS policies multitenant
- Seed dei 38 tipi-fase per Bertaiola
- Edge Function `createCommessa`: crea record + alberatura Nextcloud via WebDAV
- Edge Function `linkFile`: carica file su NC e crea row `file_refs` + thumbnail
- Edge Function `convertTicketToCommessa`: ticket → commessa + alberatura
- API CRUD `clients`, `tickets`, `commesse`

### Web Ufficio (55 h)
- Auth login (email + password Supabase Auth)
- Dashboard: KPI rapidi (ticket aperti, commesse aperte, foto caricate oggi, fasi in attesa)
- **Sezione Ticket**: lista, dettaglio con thread messaggi, creazione manuale, pulsante "Converti in commessa"
- Lista commesse con filtri (stato, cliente, anno, responsabile)
- Dettaglio commessa con tab: **Anagrafica · Fasi · Documenti · Foto · Note · Ticket origine**
- Tab Fasi: 38 voci con stato + checklist foto per fase
- Tab Documenti: file browser tipo "Esplora risorse" su contenuto Nextcloud
- Pulsante "Apri in cartella locale" → deep link al path sincronizzato sul PC
- Anagrafica clienti (CRUD base)
- Ricerca rapida globale (per nome cliente, codice ticket, codice commessa, file)

### PWA Tecnici (40 h)
- Web App Manifest + Service Worker (Workbox)
- Pagina onboarding "Aggiungi alla schermata Home" con istruzioni screen per iOS Safari + Android Chrome
- Auth login (stesso Supabase, JWT in IndexedDB)
- Lista commesse assegnate a me
- Dettaglio commessa: tab Fasi + Foto
- **Funzione cardine**: tap "Scatta foto" → `<input capture="environment">` → upload background con progress
- Geo-tag automatico (Geolocation API) + tag fase + categoria (prima/in_corso/fine)
- Galleria foto della commessa, filtrabile per fase
- Layout responsive mobile-first, dark mode di sistema rispettato

### Sync Ufficio (10 h)
- Setup client Nextcloud Desktop sui 5 PC di Bertaiola (installazione remota)
- Configurazione cartella sync
- Test "una nuova commessa creata in web → cartelle appaiono entro 60s sui PC"
- Documento operativo per ufficio (1 pagina A4)

### Onboarding & QA (5 h)
- Test PWA installazione su iPhone reale (2-3 modelli, iOS 16/17/18)
- Test camera capture su Android tipico
- Test sync Nextcloud sotto Windows 10/11

**Deliverable Sprint MVP**:
- ✅ `app.impiantixplus.app/bertaiola` accessibile da 5 PC ufficio
- ✅ `m.impiantixplus.app/bertaiola` installabile su 15 iPhone via "Aggiungi alla schermata Home"
- ✅ Modulo ticket nativo già operativo per ticket manuali
- ✅ Ufficio vede le cartelle "alla vecchia" sincronizzate
- ✅ Tecnico scatta foto da cantiere → 30 secondi dopo è in cartella

---

## SPRINT 2 — Migrazione Freshdesk + Ticketing avanzato + Notifiche + Ricerca (2 settimane, ~80 h)

### Migrazione Freshdesk one-time (25 h)
- Script `scripts/migrate-freshdesk.ts`: enumera ticket via `GET /api/v2/tickets` paginato
- Per ogni ticket: fetch conversazioni + allegati, re-upload allegati su Nextcloud `/import/freshdesk/`
- Dedupe clienti (matching email/telefono) → INSERT su `clients`
- INSERT su `tickets` con `source='imported_from_freshdesk'` + `freshdesk_legacy_id`
- INSERT su `ticket_messages` per ogni conversazione
- UI di review in dashboard SOLVA per casi ambigui
- Report finale: n. ticket, n. clienti, n. allegati, n. errori
- Documento operativo per cliente: data target disdetta Freshdesk
- **Migrazione album Google Foto** storici (script una tantum, ~5 GB) → integrata nello stesso script

### Ticketing avanzato (20 h)
- Email inbound: `ticket@bertaiolaimpianti.it` → Resend → Edge Function `parseInboundEmail` → INSERT ticket
- Routing automatico (round-robin o per area)
- Auto-reply al cliente con codice ticket
- Thread email ↔ ticket nativo (Re: codice in subject)
- UI "Risposta cliente" in dashboard → invia email + INSERT message

### Notifiche (15 h)
- Setup Web Push (VAPID keys) + endpoint subscribe
- Edge Function `notifyOnEvent`: trigger su Postgres webhooks (file_refs insert, fase update, ticket nuovo)
- Email transactional via Resend per ufficio
- Regole notifica:
  - fase con 0 foto da >3 giorni → push/email capo cantiere
  - tutte le fasi obbligatorie completate → push/email responsabile
  - DICO non caricato a 7 giorni dal collaudo → email
  - nuovo ticket entrante → notifica assegnatario
- UI preferenze notifiche per utente

### Ricerca (20 h)
- Index trigram Postgres su `clients.nome`, `commesse.codice`, `tickets.oggetto`, `file_refs.filename`
- API endpoint `/search?q=` con paginazione
- UI ricerca globale con risultati raggruppati (ticket · commesse · file · note)
- Filtri: data, cliente, tipo fase, sorgente ticket
- OCR Mistral per i PDF: opt-in (toggle in admin)

**Deliverable Sprint 2**:
- Storico Freshdesk migrato nella nuova app (ticket + allegati + clienti)
- Cliente può disdire Freshdesk
- Email entranti diventano automaticamente ticket nativi
- Notifiche email/push attive con regole configurabili
- Ricerca full-text rapida

---

## SPRINT 3 — Portale Cliente Finale (2 settimane, ~70 h, OPZIONALE)

**Obiettivo**: ogni cliente di Bertaiola riceve un magic-link via email per consultare i propri documenti.

| Task |
|---|
| Schema `external_users` (clienti finali) + magic-link auth Supabase |
| Frontend portale `cliente.impiantixplus.app/<slug-cliente>` |
| UI minimal: lista commesse del cliente, vista documenti, download PDF |
| Sezione "Stato lavori" (% completamento fasi) |
| Sezione "Comunicazioni" (timeline aggiornamenti da ufficio) |
| Pulsante "Richiedi intervento" → crea ticket nativo in automatico (impiantiXplus, niente Freshdesk) |
| Branding Bertaiola white-label |

**Roadmap futura**: integrazione pagamenti (Stripe) per saldi/acconti.

---

## SPRINT 4 — Preventivi & Rapportini (3 settimane, ~110 h, OPZIONALE)

**Modulo Preventivi**
- Editor preventivo da template (capitolato semplice)
- Listini base (carico manuale CSV; integrazione ANGAISA opzionale fase 5)
- Export PDF + invio cliente
- Conversione "preventivo → commessa" con un click

**Modulo Rapportini**
- App mobile: registrazione ore lavorate per commessa
- Geolocation start/stop intervento
- Note testuali + foto allegate
- Vista ufficio: foglio ore squadra per settimana, esportabile CSV/Excel

---

## SPRINT 5 — Manutenzioni programmate (2-3 settimane, OPZIONALE, post-validazione cliente)

**Due strade**:

**A. Integrazione con impiantix.app**
- API a doppio senso: impiantiXplus invia anagrafica impianti, impiantix gestisce piano manutenzione
- Sincronizzazione interventi e DICO

**B. Modulo nativo impiantiXplus "Manutenzioni"**
- Anagrafica impianti collegati a commessa
- Piano manutenzione automatico (12 mesi caldaie, 24 mesi condizionatori, ecc.)
- Scadenzario + notifiche cliente

→ Decisione cliente Bertaiola necessaria prima di sviluppare.

---

## Operatività post go-live

| Settimana 1 dopo go-live | Settimana 2-4 | Mese 2+ |
|---|---|---|
| Presenza on-site SOLVA + hyper-care | Tuning UX su feedback | Manutenzione canone |
| Sessione formativa ufficio (1-2h × 5 utenti) | Bug fix rapidi via deploy Vercel (PWA aggiornata in tempo reale) | Evolutive trimestrali |
| Sessione formativa tecnici (30 min × 15) — incluso "Aggiungi alla schermata Home" su iPhone | Adeguamento regole notifica | Aggiornamenti sicurezza |
| Migrazione storico Freshdesk + album Google Foto | Verifica completezza migrazione → cliente disdice Freshdesk | |

## Milestone visuali

| Milestone | Quando | Validato da |
|---|---|---|
| M1 — Demo MVP funzionante | fine Sprint MVP | Bertaiola titolare + 1 tecnico |
| M2 — Go-live pilota | fine Sprint MVP + 3 giorni hyper-care | 100% utenti ufficio + 3 tecnici beta |
| M3 — Roll-out completo | fine Sprint MVP + 2 settimane | Tutti i 15 tecnici |
| M4 — Migrazione Freshdesk completata + disdetta licenza | fine Sprint 2 | Ufficio Bertaiola |
| M5 — Portale cliente live | fine Sprint 3 (se attivato) | 3 clienti pilota Bertaiola |
| M6 — Secondo tenant SaaS | quando deciso da SOLVA | SOLVA + cliente 2 |

## Gestione rischi durante l'execution

| Rischio | Mitigazione |
|---|---|
| Tecnico non riesce a installare PWA su iPhone | Guida fotografica 3 step + video 60s + supporto telefonico SOLVA in hyper-care |
| Sync Nextcloud blocca un PC | Documentazione operatore + helpdesk Hetzner |
| Script migrazione Freshdesk fallisce su alcuni ticket | Log dettagliato + UI di review per casi ambigui + retry per singolo ticket |
| Volumi foto esplodono (>1 TB) | Upgrade NX21 (€14/mese) self-service |
| Scope creep (preventivi, magazzino...) | Roadmap chiara firmata, change request formale |
| Push notifications iOS non funzionano (PWA non installata) | Fallback email sempre attivo per notifiche critiche; onboarding insiste su "Aggiungi a Home" |
