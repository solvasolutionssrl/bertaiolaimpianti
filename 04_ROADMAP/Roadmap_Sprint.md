# Roadmap & Sprint plan
**Versione**: 1.0
**Go-live MVP target**: 4 settimane dal kickoff sviluppo
**Filosofia**: ship piccolo, ship presto, validare in produzione con Bertaiola

> **Nota sul tempo**: le settimane indicate sono **durate sprint** (effort condensato), non date di calendario. Il sequenziamento esatto va concordato col cliente in fase di firma preventivo.

---

## Macro-fasi

```
[Sprint 0]     Setup
[Sprint MVP]   Core: web ufficio + mobile foto + sync ufficio + auth multitenant
[Sprint 2]     Integrazione Freshdesk + Notifiche + Ricerca
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
| Acquisto domini (`cantiera.app`, `bertaiolaimpianti.<dominio_app>`, etc.) | DNS attivi su Cloudflare |
| Provisioning Hetzner Storage Share NX11 + custom domain `cloud.bertaiolaimpianti.<X>` | Istanza Nextcloud accessibile, SSL OK |
| Creazione progetto Supabase region Frankfurt | URL + chiavi disponibili |
| Setup Vercel account + collegamento GitHub | Pipeline deploy attiva |
| Setup Expo / EAS | Workspace creato |
| Creazione repo `solva-cantiera` mono-repo (pnpm + turbo) | Repo inizializzato |
| Branding minimo: logo SVG, palette, font, favicon | Pacchetto design system pronto |
| Setup Resend per email transactional + Sentry free | Servizi configurati |
| Provisioning utenze iniziali (5 ufficio + 15 tecnici) su Supabase | Utenti pronti per onboarding |

**Deliverable**: ambiente cliente provisionato, niente UX ancora.

---

## SPRINT MVP — Core (3 settimane, ~140 h)

**Obiettivo**: Bertaiola può creare commesse, struttura cartelle si crea automatica, ufficio le vede sui PC tramite Nextcloud Sync, tecnici scattano foto da iPhone e le foto finiscono nella cartella giusta.

### Backend (40 h)
- Schema Postgres: `tenants`, `users`, `commesse`, `fasi`, `file_refs`, `audit_events`
- Migrazioni Supabase versionate
- RLS policies multitenant
- Seed dei 38 tipi-fase per Bertaiola
- Edge Function `createCommessa`: crea record + alberatura Nextcloud via WebDAV
- Edge Function `linkFile`: carica file su NC e crea row `file_refs` + thumbnail
- Edge Function `webhookFreshdeskStub`: skeleton per Sprint 2

### Web Ufficio (50 h)
- Auth login (email + password Supabase Auth)
- Dashboard: KPI rapidi (commesse aperte, foto caricate oggi, fasi in attesa)
- Lista commesse con filtri (stato, cliente, anno, responsabile)
- Dettaglio commessa con tab: **Anagrafica · Fasi · Documenti · Foto · Note**
- Tab Fasi: 38 voci con stato + checklist foto per fase
- Tab Documenti: file browser tipo "Esplora risorse" su contenuto Nextcloud
- Pulsante "Apri in cartella locale" → deep link al path sincronizzato sul PC
- Ricerca rapida globale (per nome cliente, codice, file)

### Mobile Tecnici (40 h)
- Auth login (stesso Supabase, JWT memorizzato secure)
- Lista commesse assegnate a me
- Dettaglio commessa: tab Fasi + Foto
- **Funzione cardine**: tap "Scatta foto" → camera → upload background con progress bar
- Geo-tag automatico + tag fase (selezione menu) + tag categoria (prima/in_corso/fine)
- Galleria foto della commessa, filtrabile per fase

### Sync Ufficio (10 h)
- Setup client Nextcloud Desktop sui 5 PC di Bertaiola (installazione remota)
- Configurazione cartella sync
- Test "una nuova commessa creata in web → cartelle appaiono entro 60s sui PC"
- Documento operativo per ufficio (1 pagina A4)

**Deliverable Sprint MVP**:
- ✅ web.cantiera.app/bertaiola accessibile da 5 PC ufficio
- ✅ app SOLVA · Cantiera installabile su 15 iPhone (TestFlight + EAS Update per iterazione)
- ✅ ufficio vede le cartelle "alla vecchia" sincronizzate
- ✅ tecnico scatta foto da cantiere → 30 secondi dopo è in cartella

---

## SPRINT 2 — Freshdesk + Notifiche + Ricerca (2 settimane, ~80 h)

### Integrazione Freshdesk (35 h)
- Webhook automation rule Freshdesk: <span class="cite">on ticket creation → Trigger Webhook POST verso Edge Function Supabase</span>
- Parsing payload, creazione commessa automatica con stato `bozza`
- Campo custom su Freshdesk: link al record `Cantiera`
- API Freshdesk per fetch dettagli ticket (cliente, descrizione, allegati)
- Migrazione album Google Foto storici (script una tantum, ~5 GB)
- UI di "conferma matching" in dashboard ufficio per casi ambigui

### Notifiche (25 h)
- Setup Expo Push tokens
- Edge Function `notifyOnEvent`: trigger su Postgres webhooks (file_refs insert, fase update)
- Email transactional via Resend per ufficio
- Regole notifica:
  - fase con 0 foto da >3 giorni → push capo cantiere
  - tutte le fasi obbligatorie completate → push responsabile
  - DICO non caricato a 7 giorni dal collaudo → email
- UI preferenze notifiche per utente

### Ricerca (20 h)
- Index trigram Postgres su `commesse.cliente_nome`, `file_refs.filename`
- API endpoint `/search?q=` con paginazione
- UI ricerca globale con risultati raggruppati (commesse · file · note)
- Filtri: data, cliente, tipo fase
- OCR Mistral per i PDF: opt-in (toggle in admin)

**Deliverable Sprint 2**:
- Nuovo ticket Freshdesk → cartelle e record creati automaticamente
- Notifiche email/push attive con regole configurabili
- Ricerca full-text rapida

---

## SPRINT 3 — Portale Cliente Finale (2 settimane, ~70 h, OPZIONALE)

**Obiettivo**: ogni cliente di Bertaiola riceve un magic-link via email per consultare i propri documenti.

| Task |
|---|
| Schema `external_users` (clienti finali) + magic-link auth Supabase |
| Frontend portale `cliente.cantiera.app/<slug-cliente>` |
| UI minimal: lista commesse del cliente, vista documenti, download PDF |
| Sezione "Stato lavori" (% completamento fasi) |
| Sezione "Comunicazioni" (timeline aggiornamenti da ufficio) |
| Pulsante "Richiedi intervento" → crea ticket Freshdesk in automatico |
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
- API a doppio senso: Cantiera invia anagrafica impianti, impiantix gestisce piano manutenzione
- Sincronizzazione interventi e DICO

**B. Modulo nativo Cantiera "Manutenzioni"**
- Anagrafica impianti collegati a commessa
- Piano manutenzione automatico (12 mesi caldaie, 24 mesi condizionatori, ecc.)
- Scadenzario + notifiche cliente

→ Decisione cliente Bertaiola necessaria prima di sviluppare.

---

## Operatività post go-live

| Settimana 1 dopo go-live | Settimana 2-4 | Mese 2+ |
|---|---|---|
| Presenza on-site SOLVA + hyper-care | Tuning UX su feedback | Manutenzione canone |
| Sessione formativa ufficio (1-2h × 5 utenti) | Bug fix rapidi via EAS Update | Evolutive trimestrali |
| Sessione formativa tecnici (30 min × 15) | Adeguamento regole notifica | Aggiornamenti sicurezza |
| Migrazione foto storiche da Google Drive | | |

## Milestone visuali

| Milestone | Quando | Validato da |
|---|---|---|
| M1 — Demo MVP funzionante | fine Sprint MVP | Bertaiola titolare + 1 tecnico |
| M2 — Go-live pilota | fine Sprint MVP + 3 giorni hyper-care | 100% utenti ufficio + 3 tecnici beta |
| M3 — Roll-out completo | fine Sprint MVP + 2 settimane | Tutti i 15 tecnici |
| M4 — Integrazione Freshdesk attiva | fine Sprint 2 | Ufficio Bertaiola |
| M5 — Portale cliente live | fine Sprint 3 (se attivato) | 3 clienti pilota Bertaiola |
| M6 — Secondo tenant SaaS | quando deciso da SOLVA | SOLVA + cliente 2 |

## Gestione rischi durante l'execution

| Rischio | Mitigazione |
|---|---|
| Tecnico non riesce a installare TestFlight | EAS Update + link diretto via email |
| Sync Nextcloud blocca un PC | Documentazione operatore + helpdesk Hetzner |
| Webhook Freshdesk si rompe | Fallback "Crea commessa manuale" + alert SOLVA |
| Volumi foto esplodono (>1 TB) | Upgrade NX21 (€14/mese) self-service |
| Scope creep (preventivi, magazzino...) | Roadmap chiara firmata, change request formale |
