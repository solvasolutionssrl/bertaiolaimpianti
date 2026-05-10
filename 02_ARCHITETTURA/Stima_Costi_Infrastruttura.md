# Stima costi infrastruttura
**Versione**: 1.0
**Tenant di riferimento**: Bertaiola Impianti (20 utenti, 50→200 GB)
**Periodo riferimento**: 12 mesi a partire da go-live (Gen 2026)

---

## A. Costi ricorrenti — Infrastruttura per Bertaiola

Tutti i prezzi listino dei fornitori (rilevati Q1-Q2 2026). IVA esclusa salvo diversa indicazione.

| Voce | Fornitore | Piano | Costo €/mese | Costo €/anno | Note |
|---|---|---|---|---|---|
| **Storage file (1 TB)** | Hetzner | <span class="cite">Storage Share NX11</span> | ~5 | ~60 | UE/GDPR, sync desktop, utenti illimitati |
| **Backend (DB + Auth + Storage cache + Realtime)** | Supabase | <span class="cite">Pro</span> | ~23 ($25) | ~276 | <span class="cite">8 GB DB, 100 GB file, 100K MAU, 250 GB egress incl.</span> |
| **Hosting web + PWA (Vercel)** | Vercel | <span class="cite">Pro $20/mese per seat</span> | ~18 | ~216 | 1 seat per SOLVA; serve sia web sia PWA tecnici dallo stesso deploy |
| **Email transactional + inbound** | Resend | Pro | ~18 ($20) | ~216 | 50k email/mese + parsing inbound → ticket nativi |
| **DNS / CDN** | Cloudflare | Free | 0 | 0 | Routing multi-tenant + subdomain `m.<tenant>` per PWA |
| **Monitoring errori** | Sentry | Free → Team | 0 → 23 | 0 → 276 | Free tier fino a 5k errori/mese sufficiente per start |
| **Dominio (.app/.it)** | Registrar (Cloudflare/OVH) | 1 anno | ~3 | ~30 | brand prodotto + sotto-dominio tenant |
| **OCR (Mistral)** | Mistral AI | pay-per-use | ~0,5 | ~6 | ~500 pagine/anno × <span class="cite">$1/1000 pagine Batch API</span> |
| **AI features (futuro, opz.)** | Anthropic Claude | pay-per-use | 0 (off) → ~25 | 0 → ~300 | Attivabile su richiesta |
| **Backup off-site (script S3 → Cloudflare R2)** | Cloudflare R2 | Storage | ~2 | ~24 | Snapshot settimanale archivio Nextcloud |
| **TOTALE BASE** | | | **~70 €/mese** | **~828 €/anno** | Senza Sentry Team e AI features |
| **TOTALE CON ESTENSIONI** | | | **~118 €/mese** | **~1.404 €/anno** | Con Sentry Team + AI Claude attivo |

> 💡 **Confronto con proposta v1 SharePoint**: M365 BS+BB 5+15 utenti = **~€200/mese = €2.400/anno solo licenze**, ovvero quasi **3× il nostro stack completo** (e senza ancora aver scritto una riga di app custom).

> ✂️ **Risparmio rispetto a v2 con app nativa Expo**: la scelta PWA elimina €204/anno di Expo EAS Production + ~€90/anno di Apple Developer Program = **~€300/anno risparmiati** nel TCO.

> 🪦 **Costo Freshdesk evitato**: la disdetta della licenza Freshdesk dopo il go-live libera ulteriori ~€15-49 € per agente al mese a seconda del piano attivato dal cliente (verifica fattura corrente per stima esatta del risparmio).

## B. Costi ricorrenti — Scalabilità multitenant (a regime)

Quando SOLVA aggiunge il **secondo, terzo, N-esimo** tenant al prodotto SaaS, i costi NON raddoppiano:

| Componente | Scala con i tenant? | Note |
|---|---|---|
| Storage Share Hetzner | ✅ +€5-14/mese per tenant | 1 istanza per cliente |
| Supabase | 🟡 leggermente | Stessa istanza Postgres serve tutti i tenant (RLS) finché < 10 GB DB e < 100K MAU |
| Vercel | ❌ stessa app | Multitenant via subdomain o path; PWA tecnici inclusa |
| Email Resend | 🟡 scala con volume | 50k email/mese coprono ~5 tenant medi |
| Cloudflare DNS | ❌ free fino a domini centinaia | |

**Marginal cost per nuovo tenant**: ~**€8/mese** (storage + email + un po' di Supabase) → vendibile a margine alto da SOLVA.

## C. Costi una tantum — Sviluppo MVP

Vedi `06_PREVENTIVO/Preventivo_Base.md` per il dettaglio. Sintesi:

| Sprint | Settimane | Effort SOLVA |
|---|---|---|
| Sprint 0 — Setup infra & multitenant base | 0,5 | ~25 h |
| Sprint MVP — Web ufficio + PWA tecnici + Sync Nextcloud + Auth + Ticketing base | 3 | ~155 h |
| Sprint 2 — Migrazione Freshdesk + Ticketing email/portale + Notifiche + Ricerca | 2 | ~80 h |
| Sprint 3 — Portale cliente (opz.) | 2 | ~70 h |
| Sprint 4 — Preventivi & rapportini (opz., facoltativi) | 3 | ~110 h |
| Sprint manutenzioni / impiantix integration | 2-3 | ~80 h |

## D. Costi di manutenzione (canone SOLVA, post go-live)

Da definire nel preventivo (`06_PREVENTIVO/Preventivo_Base.md`). Range:
- Tier Base (incluso): infra €1.030 + monitoraggio + bugfix tier-1 + update libreria
- Tier Standard (consigliato): + 4 ore/mese evolutive + 8x5 support
- Tier Premium: + ricerca AI attiva + portale cliente + SLA 99,5%

## E. Calcoli giustificativi (riferimenti listino)

### Hetzner Storage Share
- <span class="cite">NX11: 1 TB, 50 connessioni concorrenti, ~$5/mese</span>
- <span class="cite">NX21: 5 TB, €14,19/mese</span>
- <span class="cite">Hosting Germania (Falkenstein), traffico interno/esterno illimitato, GDPR-compliant</span>

### Supabase Pro
- <span class="cite">$25/mese base</span>
- <span class="cite">100K MAU inclusi, 8 GB DB, 100 GB file storage, 250 GB egress</span>
- <span class="cite">$0.09/GB egress oltre quota</span> — improbabile sforare per Bertaiola
- <span class="cite">$0.021/GB/mese storage oltre 100 GB</span>

### Vercel Pro
- <span class="cite">$20/mese per seat developer</span>
- <span class="cite">$20 di credito mensile incluso</span>
- <span class="cite">1 TB Fast Data Transfer + 10M Edge Requests</span>
- <span class="cite">Per traffico oltre 1 TB: $0.15/GB</span>

### Hetzner Cloud (se serve un piccolo VM ausiliario, opz.)
- <span class="cite">CX22: 2 vCPU, 4 GB RAM, 40 GB SSD, €3.79/mese</span> (pre-aprile 2026: €4.49)
- <span class="cite">20 TB di traffico incluso</span>
- Usabile come job runner (es. OCR pipeline), backup script

### Mistral OCR
- <span class="cite">$1 per 1.000 pagine in Batch API (50% sconto rispetto a real-time)</span>
- <span class="cite">$2 per 1.000 pagine in real-time</span>

### Anthropic Claude (opzionale, fase 3)
- <span class="cite">Sonnet 4.6: $3/M input, $15/M output</span>
- <span class="cite">Haiku 4.5: $1/M input, $5/M output</span> ← per la ricerca semantica useremmo Haiku
- <span class="cite">Batch API: -50% su input e output</span>
- <span class="cite">Prompt caching: -90% input ripetuto</span>

## F. Sintesi finanziaria per il cliente

| Voce | Importo | Note |
|---|---|---|
| Infra annua Bertaiola (gestita SOLVA) | **~€828/anno** | UE/GDPR, scalabile, no Expo EAS grazie a PWA |
| Risparmio vs proposta v1 SharePoint | **~€1.570/anno** | M365 +SharePoint = ~€2.400/anno |
| Risparmio licenza Freshdesk disdetta | **da quantificare** | dipende dal piano corrente del cliente (verifica fattura) |
| Costo MVP (una tantum, sviluppo) | vedi preventivo | range €10-14k per MVP focused |
| Costo manutenzione gestita | vedi preventivo | canone mensile o annuale |

> **Allocazione budget cliente €1.500-3.000/anno**: ampiamente coperto dall'infrastruttura **+ canone manutenzione SOLVA base**, con margine maggiore rispetto alla v2 iniziale grazie alla scelta PWA.
