# Preventivo base — Bertaiola Impianti
**Versione**: 1.0 (bozza tecnica per validazione SOLVA)
**Tenant**: Bertaiola Impianti
**Prodotto**: Cantiera (SaaS multitenant) — istanza personalizzata
**Valuta**: EUR — IVA esclusa salvo dove indicato
**Validità offerta**: 30 giorni dalla data di emissione

> ⚠️ Questo documento è la **base tecnico-economica** per la proposta commerciale (PPT a cura di SOLVA, non inclusa in questa consegna). I valori riflettono la stima effort di un team SOLVA con seniority mista, da ricalibrare in fase di firma.

---

## A. Sintesi esecutiva

| Voce | Importo |
|---|---|
| **Setup + Sviluppo MVP** (Sprint 0 + MVP, una tantum) | **€ 9.900** |
| **Sprint 2** — Integrazione Freshdesk + Notifiche + Ricerca | € 5.600 |
| **Sprint 3** — Portale cliente finale (opzionale) | € 4.900 |
| **Sprint 4** — Preventivi & rapportini (opzionale) | € 7.700 |
| **Infrastruttura annua gestita SOLVA** (anno 1) | **€ 1.030** |
| **Canone manutenzione SOLVA** — tier Standard | da € 250/mese |

**Pacchetto consigliato per il go-live**: Sprint 0 + MVP + Sprint 2 = **€ 15.500 una tantum** + infrastruttura €1.030/anno + canone manutenzione.

---

## B. Sviluppo software — dettaglio per sprint

Tariffa media SOLVA Solutions: **€ 60-70 / h** (mix profili: PM, sviluppo full-stack, mobile, DevOps).
Per semplicità tutte le righe seguenti usano **€ 65/h come riferimento**.

### Sprint 0 — Setup (½ settimana, 25 h)

| Attività | h |
|---|---|
| Acquisto domini + DNS Cloudflare | 2 |
| Provisioning Hetzner Storage Share NX11 + custom domain | 3 |
| Setup Supabase Frankfurt + repo mono-repo | 4 |
| Vercel + EAS + Resend + Sentry setup | 4 |
| Branding minimo (logo SVG, palette, design system tokens) | 6 |
| Provisioning utenti iniziali (20) + onboarding doc | 3 |
| Documentazione tecnica baseline | 3 |
| **Subtotale Sprint 0** | **25 h → € 1.625** |

### Sprint MVP — Core (3 settimane, 140 h)

| Modulo | Effort | Costo |
|---|---|---|
| Backend (schema, RLS multitenant, Edge functions create commessa, link file, alberatura NC) | 40 h | € 2.600 |
| Frontend Web Ufficio (auth, dashboard, lista, dettaglio, fasi, file browser) | 50 h | € 3.250 |
| Mobile Expo (auth, lista, dettaglio, scatta+upload foto, geo, push token) | 40 h | € 2.600 |
| Setup sync Nextcloud sui 5 PC ufficio + documentazione | 10 h | € 650 |
| **Subtotale Sprint MVP** | **140 h** | **€ 9.100** |

**🎯 Totale Sprint 0 + MVP = € 10.725** → Arrotondato a **€ 9.900** (sconto fast-pilot SOLVA del ~8%).

### Sprint 2 — Freshdesk + Notifiche + Ricerca (2 settimane, 80 h)

| Modulo | Effort | Costo |
|---|---|---|
| Webhook Freshdesk → creazione commessa auto + linking | 35 h | € 2.275 |
| Sistema notifiche (push Expo + email Resend, regole, preferenze) | 25 h | € 1.625 |
| Ricerca full-text Postgres + OCR Mistral opt-in | 20 h | € 1.300 |
| **Subtotale Sprint 2** | **80 h** | **€ 5.200** |

Arrotondato a **€ 5.600** (margine per debug + 1ª iterazione regole notifica).

### Sprint 3 — Portale Cliente Finale (2 settimane, 70 h, OPZIONALE)

| Modulo | Effort | Costo |
|---|---|---|
| Auth magic-link clienti finali + permessi granulari | 15 h | € 975 |
| Frontend portale white-label per tenant | 35 h | € 2.275 |
| Pulsante "Richiedi intervento" → ticket Freshdesk | 10 h | € 650 |
| Branding Bertaiola + test 3 clienti pilota | 10 h | € 650 |
| **Subtotale Sprint 3** | **70 h** | **€ 4.550** |

Arrotondato a **€ 4.900**.

### Sprint 4 — Preventivi & Rapportini (3 settimane, 110 h, OPZIONALE)

| Modulo | Effort | Costo |
|---|---|---|
| Editor preventivo + listini base + export PDF | 50 h | € 3.250 |
| Conversione preventivo → commessa | 10 h | € 650 |
| App rapportini mobile (ore, geo start/stop, note, foto) | 30 h | € 1.950 |
| Vista ufficio foglio ore + export CSV/Excel | 20 h | € 1.300 |
| **Subtotale Sprint 4** | **110 h** | **€ 7.150** |

Arrotondato a **€ 7.700**.

### (Sprint 5 manutenzioni — non quotato, da definire dopo demo MVP)

---

## C. Infrastruttura — anno 1 (gestita SOLVA)

(Vedi `02_ARCHITETTURA/Stima_Costi_Infrastruttura.md` per fonti listino.)

| Servizio | Costo annuo |
|---|---|
| Hetzner Storage Share NX11 (1 TB Nextcloud managed, Falkenstein DE) | € 60 |
| Supabase Pro (DB + Auth + Storage + Realtime, Frankfurt EU) | € 276 |
| Vercel Pro (web hosting Next.js) | € 216 |
| Expo EAS Production (build + push iOS/Android) | € 204 |
| Resend (email transactional) | € 216 |
| Cloudflare DNS/CDN | € 0 |
| Sentry monitoring (free tier) | € 0 |
| Dominio `.app` o `.it` (registrazione) | € 30 |
| Mistral OCR (uso atteso) | € 6 |
| Backup off-site Cloudflare R2 | € 24 |
| **TOTALE INFRA ANNO 1** | **€ 1.032** |

SOLVA fattura al cliente questa voce con un **mark-up 10%** = **€ 1.150 / anno** per coprire gestione contratti e variazioni listino.

---

## D. Canone manutenzione SOLVA (post go-live)

Tre tier proposti:

### 🥉 Base — €150/mese (€1.800/anno)
- Monitoraggio uptime e alert 24/7
- Bug fix tier-1 entro 5 giorni lavorativi
- Aggiornamento mensile dipendenze
- Backup verificati mensilmente
- 1 release evolutiva/anno
- Support email 8x5

### 🥈 Standard — **€250/mese (€3.000/anno)** ⭐ consigliato
- Tutto del Base
- Bug fix tier-1 entro 2 giorni lavorativi
- 4 ore/mese di evolutive minori incluse
- Support email + ticketing prioritario
- 2 revisioni trimestrali UX/performance
- Onboarding di nuovi utenti incluso

### 🥇 Premium — €450/mese (€5.400/anno)
- Tutto dello Standard
- Bug critici entro 4 ore lavorative
- 10 ore/mese evolutive incluse
- Modulo AI search (Anthropic Claude Haiku) attivo
- Roadmap evolutiva trimestrale concordata
- Support telefono diretto SOLVA
- SLA 99,5% con report mensile

---

## E. Pacchetti commerciali consigliati

### Pacchetto A — "MVP & Live"
- Sprint 0 + MVP : € 9.900
- Infra anno 1 : € 1.150
- Canone Standard 12 mesi : € 3.000
- **Totale anno 1: € 14.050**

### Pacchetto B — "Full v1" ⭐ consigliato per Bertaiola
- Sprint 0 + MVP + Sprint 2 : € 15.500
- Infra anno 1 : € 1.150
- Canone Standard 12 mesi : € 3.000
- **Totale anno 1: € 19.650**

### Pacchetto C — "Full + Portale Cliente"
- Sprint 0 + MVP + Sprint 2 + Sprint 3 : € 20.400
- Infra anno 1 : € 1.150
- Canone Premium 12 mesi : € 5.400
- **Totale anno 1: € 26.950**

---

## F. Confronto con proposta v1 (28/11/2025)

| Voce | v1 (SharePoint/M365) | v2 SOLVA Cantiera (Pacchetto B) |
|---|---|---|
| Setup una tantum | ~€ 11.000 | **€ 15.500** (più funzionalità: app mobile + multitenant + integrazione Freshdesk inclusi) |
| Licenze utente | € 200/mese = € 2.400/anno | **€ 0** (incluso in canone) |
| Infrastruttura aggiuntiva | da definire | **€ 1.150/anno** trasparente |
| Manutenzione | da definire | **€ 3.000/anno** chiaro |
| **Totale costo anno 1** | ~€ 13.400 + manutenzione | **€ 19.650 chiavi in mano** |
| **Totale anno 2 (a regime)** | ~€ 2.400/anno + manutenzione | **€ 4.150/anno** |

> 💡 Sul **lungo periodo** (3+ anni) il modello v2 è **più conveniente** del v1, perché elimina €2.400/anno di licenze ricorrenti. Inoltre v2 include funzionalità custom (app mobile, multitenant, branding) **non incluse nelle licenze M365**.

---

## G. Termini & condizioni (bozza)

- Pagamento: 40% all'avvio Sprint 0, 30% a fine MVP, 30% a fine Sprint 2 (per pacchetto B)
- Infrastruttura: fatturazione annuale anticipata, primo anno pro-rata
- Canone: fatturazione mensile o trimestrale
- Property: codice sorgente proprietà di **SOLVA Solutions**; cliente ha **licenza d'uso perpetua** sull'istanza personalizzata
- Esclusiva: nessuna esclusiva concessa (Cantiera è prodotto SaaS multitenant)
- Modifiche di scope: change request formale con stima oraria
- Recesso canone: con preavviso 60 giorni
- Foro competente: vedere contratto madre SOLVA

---

## H. Note per la PPT commerciale (a cura di SOLVA)

Quando produrrai la slide preventivo, **suggerisco di evidenziare**:

1. Il **risparmio di €2.400/anno** sulle licenze M365 evitate
2. Il fatto che Bertaiola riceve **una app proprietaria** non un canone software altrui
3. **Hosting 100% UE / GDPR** (anti-vendor-lock-in americano)
4. Il valore aggiunto del **doppio brand** SOLVA × Bertaiola
5. Roadmap evolutiva **a vista** (preventivi, rapportini, portale cliente) come opzioni non obblighi
