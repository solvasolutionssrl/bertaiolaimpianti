# Bertaiola Impianti × SOLVA · Cantiera
**Pacchetto di kickoff completo — v1.0 (Dicembre 2025)**

Repository del progetto di digitalizzazione gestione documenti e lavori per Bertaiola Impianti, sviluppato come istanza pilota del SaaS multitenant **Cantiera** (SOLVA Solutions).

---

## 📁 Struttura del repository

```
.
├── file_iniziali_incontri/      → PDF di kickoff cliente (14/11 e 28/11/2025)
│
├── 01_KICKOFF/                  → FASE 1 — Documento Zero & Report Riunione
│   ├── Documento_Zero.md
│   ├── Report_Riunione.md
│   └── Domande_Cliente_SOLVA.md  ← compilato dal cliente
│
├── 02_ARCHITETTURA/             → FASE 3-4 — Architettura tecnica & infrastruttura
│   ├── Architettura_Soluzione.md      (schema logico, multitenancy, modello dati)
│   ├── Stack_Tecnico.md               (tutte le tecnologie scelte)
│   ├── Comparativa_Storage.md         (perché Nextcloud > SharePoint)
│   └── Stima_Costi_Infrastruttura.md  (costi annui + giustificazione listini)
│
├── 03_BRAND/                    → Proposta brand SaaS multitenant
│   └── Proposta_Brand_Prodotto.md     (3 candidati: Cantiera ⭐, Posa, ImpiantOS)
│
├── 04_ROADMAP/                  → Piano sprint
│   └── Roadmap_Sprint.md              (Sprint 0 → Sprint 5, durate ed effort)
│
├── 05_MOCKUP/                   → Wireframe UI
│   └── Mockup_UI.md                   (6 schermate prioritarie)
│
├── 06_PREVENTIVO/               → Base tecnico-economica
│   └── Preventivo_Base.md             (3 pacchetti commerciali consigliati)
│
└── 07_PRESENTAZIONI/            → Slide deck finali
    ├── Bertaiola_Executive.pptx       (10 slide, pubblico tecnico, alto livello)
    └── Bertaiola_Tecnica.pptx         (12 slide, deep dive architetturale)
    └── (Bertaiola_Commerciale.pptx — NON inclusa, da fare in seguito)
```

---

## 🎯 TL;DR — punti chiave decisi

| Tema | Decisione |
|---|---|
| **Scope MVP** | Web ufficio · App mobile foto · Sync cartelle ufficio · Multitenancy |
| **Storage file** | Hetzner Storage Share (Nextcloud managed) — alternativa scelta a SharePoint v1 |
| **Backend** | Supabase Pro (Frankfurt EU) — Postgres + Auth + Realtime + Edge Functions |
| **Web** | Next.js 14 su Vercel |
| **Mobile** | Expo (React Native), iOS + Android |
| **Brand** | Doppio brand SOLVA + Bertaiola, prodotto SaaS proposto: **Cantiera** |
| **Hosting** | 100% UE (Germania + Frankfurt) — GDPR compliant |
| **Go-live MVP** | 1 mese dal kickoff sviluppo |
| **Costo anno 1 (Pacchetto B)** | ~€ 19.650 + IVA (chiavi in mano) |
| **Anno 2 a regime** | ~€ 4.150/anno (infra + manutenzione Standard) |
| **Risparmio strutturale vs v1 SharePoint** | ~€ 2.400/anno di licenze M365 evitate |

---

## 🛠️ Come leggere questi documenti

**Se sei nuovo al progetto**, leggi in ordine:
1. `01_KICKOFF/Documento_Zero.md` — visione e contesto
2. `01_KICKOFF/Report_Riunione.md` — cosa è stato discusso e deciso
3. `02_ARCHITETTURA/Comparativa_Storage.md` — perché abbiamo cambiato approccio rispetto a v1
4. `02_ARCHITETTURA/Architettura_Soluzione.md` — come funziona tecnicamente
5. `04_ROADMAP/Roadmap_Sprint.md` — quando si fa cosa
6. `06_PREVENTIVO/Preventivo_Base.md` — quanto costa
7. `07_PRESENTAZIONI/*.pptx` — versioni "show and tell" per riunioni

**Se devi presentare al cliente**, apri direttamente le due PPT in `07_PRESENTAZIONI`.

**Se devi ricalibrare il preventivo**, modifica `06_PREVENTIVO/Preventivo_Base.md` e rigenera la PPT commerciale (da produrre).

---

## 📅 Cronologia di kickoff

| Data | Evento | Output |
|---|---|---|
| 14/11/2025 | Riunione cliente — mappatura processo | PDF v1 (in `file_iniziali_incontri/`) |
| 28/11/2025 | Riunione cliente — proposta architettura M365 | PDF v2 (in `file_iniziali_incontri/`) |
| Dic 2025 | Compilazione questionario SOLVA + decisione pivot architetturale | `01_KICKOFF/Domande_Cliente_SOLVA.md` compilato |
| Dic 2025 | Produzione pacchetto v2 (questo repo) | tutti i documenti sopra elencati |
| 🟡 Da fare | Validazione cliente su brand + scope MVP + firma preventivo | — |
| 🟡 Da fare | Kickoff sviluppo Sprint 0 | — |

---

## 🚨 Cosa manca / da fare prossimamente

- [ ] **PPT commerciale** (`07_PRESENTAZIONI/Bertaiola_Commerciale.pptx`) — esclusa esplicitamente dal pacchetto attuale, da produrre lato SOLVA dopo validazione preventivo
- [ ] Verifica WHOIS domini candidati (cantiera.app, cantiera.it, cantiera.com)
- [ ] Brief grafico per logo Cantiera
- [ ] Decisione finale tra istanza Nextcloud per tenant vs group folders condivise (dopo demo MVP)
- [ ] Roadmap manutenzioni: modulo nativo o integrazione impiantix.app (post-MVP)

---

**Autore**: SOLVA Solutions — Luca Melchiori & team
**Cliente**: Bertaiola Impianti
**Repository**: solvasolutionssrl/bertaiolaimpianti
