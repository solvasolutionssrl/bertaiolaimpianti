# Comparativa Storage — Alternative a SharePoint Online
**Versione**: 1.0
**Decisione richiesta**: scelta del backend file per archivio commesse
**Vincoli da rispettare**: UE/GDPR, sync locale ai PC ufficio, accesso da app mobile, gestito SOLVA, multitenant, budget €1.500-3.000/anno per Bertaiola

---

## TL;DR — Raccomandazione

> **Hetzner Storage Share (Nextcloud managed)** come **file backend primario**, integrato dietro la app SOLVA tramite API/WebDAV. **5 PC ufficio** ricevono il client desktop ufficiale Nextcloud (sync bidirezionale tipo OneDrive/Dropbox). **App mobile SOLVA** legge/scrive via REST verso Nextcloud. **Postgres (Supabase)** memorizza i metadati strutturati (commesse, fasi, ticket, foto-meta).

**Perché**:
- ✅ Cartelle navigabili "alla vecchia" lato Windows con sync continua (esperienza UX richiesta dal cliente)
- ✅ Hosting Falkenstein (DE) — UE, GDPR compliant
- ✅ Costo bassissimo: <span class="cite">1 TB managed a ~€5/mese</span>
- ✅ Multitenant friendly: 1 istanza per tenant **oppure** group folders condivise con quote per utente
- ✅ Client desktop ufficiali Windows/Mac/Linux + iOS/Android
- ✅ API REST + WebDAV per integrazione lato app SOLVA
- ✅ App Nextcloud "Workflow OCR" gratuita per indicizzazione PDF (OCR su poche scansioni come richiesto)
- ✅ Backup ZFS automatico lato Hetzner
- ✅ Niente lock-in: dati portabili (Nextcloud è open source)

---

## Confronto soluzioni valutate

| Criterio | **Hetzner Storage Share** ⭐ | SharePoint Online (v1) | Synology Drive (NAS proprio) | Dropbox Business | Google Workspace Business |
|---|---|---|---|---|---|
| Costo 1 TB (singolo tenant) | <span class="cite">~€5/mese (NX11)</span> | ~€200/mese (M365 BS+BB 20 utenti) | One-time hardware €600-1500 + €0 cloud | ~€12/utente/mese (€240 totale) | €12/utente/mese (€240 totale) |
| **Costo annuo Bertaiola** | **~€60-170/anno** | ~€2.400/anno | Ammortamento NAS 3 anni ≈ €300/anno + corrente | ~€2.880/anno | ~€2.880/anno |
| Hosting UE | ✅ Germania (Falkenstein) | ✅ Configurabile EU | ✅ On-prem | ⚠️ US/EU mixed | ⚠️ Multi-region |
| Sync locale Windows | ✅ Client ufficiale | ✅ OneDrive | ✅ Drive Client | ✅ | ✅ |
| Mobile iOS/Android | ✅ App ufficiali | ✅ | ✅ | ✅ | ✅ |
| API per integrazione SOLVA | ✅ WebDAV + REST | ✅ Graph API (complessa) | ✅ DSM API | ✅ Dropbox API | ✅ Drive API |
| Multitenant friendly | ✅✅ Istanze multiple o group folders | ⚠️ Tenant M365 separati | ❌ Vendor lock hardware | ⚠️ Team separati pagati | ⚠️ Workspace separati pagati |
| Cartelle "alla vecchia" | ✅✅ esperienza Explorer-like | ✅ con Sync | ✅ | ✅ | ✅ |
| OCR full-text built-in | ✅ App gratuita Workflow OCR | ✅ Microsoft Graph | ⚠️ DSM Photo, no doc | ⚠️ limitato | ✅ |
| Vendor lock-in | 🟢 Open source | 🔴 Alto | 🔴 Hardware Synology | 🟡 Proprietario | 🟡 Proprietario |
| Gestibilità da SOLVA | ✅ Pannello konsoleH | 🟡 Tenant cliente | ❌ Accesso fisico al NAS | ✅ admin console | ✅ admin console |
| Adatto a budget €1.5-3k | ✅✅ Larghissimo margine | ❌ Fuori scala | 🟡 OK ma hardware-dipendente | 🟡 Tight | 🟡 Tight |

## Dettaglio Hetzner Storage Share

**Cos'è**: <span class="cite">servizio managed di Nextcloud erogato da Hetzner, hosting in datacenter tedeschi GDPR-compliant, certificato SSL incluso, sotto-domini personalizzati, backup automatici giornalieri del DB e dello storage</span>.

**Piani disponibili (prezzi 2026)**:

| Piano | Storage | Connessioni concorrenti | Costo €/mese | Costo annuo |
|---|---|---|---|---|
| **NX11** | 1 TB | 50 | ~€5 (USD 5) | ~€60 |
| **NX21** | 5 TB | 100+ | <span class="cite">€14,19</span> | ~€170 |
| **NX31** | 10 TB | 200 | ~€30 | ~€360 |

> Per Bertaiola: **NX11 sufficiente** per i primi 2-3 anni (50 GB attuali + 60 GB di crescita previsti). Upgrade istantaneo a NX21 quando necessario, senza interruzione.

**Funzionalità incluse**:
- Utenti illimitati con quote configurabili per utente/gruppo
- <span class="cite">Web UI, app desktop Windows/Mac/Linux, app iOS/Android, WebDAV per automazione</span>
- Custom domain + SSL automatico (es. `cloud.bertaiolaimpianti.it`)
- <span class="cite">App store Nextcloud installabili autonomamente per estendere funzionalità (es. autenticazione, workflow OCR, audit log)</span>
- <span class="cite">DPA GDPR-art.28 generabile da pannello konsoleH</span>
- Backup ZFS multi-snapshot
- <span class="cite">Traffico interno/esterno illimitato</span>

**Limiti noti**:
- Versione Nextcloud sempre "1 release behind" la latest (es. 31.x quando esce 32.x) → garanzia di stabilità, non si testa l'edge
- Non si può installare la latest version core manualmente
- App custom installabili ma non supportate dall'helpdesk Hetzner

**Considerazioni operative**:
- Tempo provisioning: <2 minuti
- Setup custom domain: ~15 minuti (CNAME su DNS)
- Training utenti finali: 30 min (UI familiare tipo file explorer)
- Branding (logo, colori): possibile dal pannello Nextcloud

## Architettura proposta — Stack file

```
┌──────────────────────────────────────────────────────────────────┐
│                     UFFICIO BERTAIOLA (5 PC)                     │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                  │
│  │ Nextcloud  │  │ Nextcloud  │  │ Nextcloud  │   (sync continua │
│  │ Desktop    │  │ Desktop    │  │ Desktop    │    bi-direzionale│
│  │ Client     │  │ Client     │  │ Client     │    via WebDAV)   │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘                  │
└────────┼───────────────┼───────────────┼─────────────────────────┘
         │               │               │
         │  fibra FTTH   │               │
         ▼               ▼               ▼
┌──────────────────────────────────────────────────────────────────┐
│       HETZNER STORAGE SHARE (Falkenstein, DE — GDPR)            │
│                                                                  │
│   📁 /Rossi_2026-05-10_SistemazioneBagno/                       │
│        /Preventivi/                                              │
│        /Schemi/                                                  │
│        /Foto/                                                    │
│            /Sopralluogo/                                         │
│            /In corso/                                            │
│            /Finali/                                              │
│        /Documenti/                                               │
│            /POS/  /Cartellone/  /DICO/  /Cassette_DPI/  /Cert.../│
│        /Materiali/                                               │
│        /Chiusura/                                                │
│                                                                  │
└─────────────────────▲────────────────────────────────────────────┘
                      │
                      │ API WebDAV + REST
                      │
┌─────────────────────┴────────────────────────────────────────────┐
│            APP SOLVA — Backend Supabase (Frankfurt EU)           │
│                                                                  │
│  • Tabella commesse (metadata strutturati)                       │
│  • Tabella fasi (38 lavorazioni × commessa)                      │
│  • Tabella foto (metadata + URL Nextcloud)                       │
│  • Webhook Freshdesk → crea commessa + alberatura                │
│  • Edge function → conta foto, alert mancanti, notifiche         │
└─────────────────────▲────────────────────────────────────────────┘
                      │
              ┌───────┼───────┐
              │       │       │
        Web Office  App      Portale
        (5 utenti)  Tecnici  Cliente
                    (15)     finale
```

## Multitenant — strategia file

Per Bertaiola + futuri tenant SaaS, due opzioni:

**Opzione A — Istanze separate (consigliata fino a ~20 tenant)**
- Una istanza Storage Share per tenant (es. `cloud.bertaiolaimpianti.it`, `cloud.rossiimpianti.it`, ...)
- Isolamento dati perfetto, branding per cliente
- Costo: 1 × €5-14/mese per tenant
- Setup automatizzato da SOLVA in <10 minuti

**Opzione B — Istanza condivisa con Group Folders**
- 1 istanza grande (NX31 10 TB ~€30/mese), cartelle gruppo per tenant
- Costo aggregato più basso a scala
- Branding tenant-aware via reverse proxy (più complesso)

→ MVP Bertaiola: **Opzione A**. Si valuta Opzione B quando si superano 10 tenant.

## Sintesi raccomandazione finale

> Adottare **Hetzner Storage Share NX11** come backend file per Bertaiola.
> Costo infra storage: **€60/anno** (vs €2.400/anno SharePoint v1 → **risparmio ~97% sul solo storage**).
> Budget rimanente del cliente (€1.500-3.000/anno) viene riallocato su:
> - Hosting app SOLVA (Supabase + Vercel + Hetzner Cloud)
> - Manutenzione & support gestito SOLVA
> - Roadmap evolutiva (preventivi, rapportini, portale cliente, ricerca AI)

Dettagli costi totali in `Stima_Costi_Infrastruttura.md`.
