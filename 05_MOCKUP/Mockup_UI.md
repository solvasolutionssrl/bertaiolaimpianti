# Mockup UI — Cantiera (SOLVA × Bertaiola)
**Versione**: 1.0
**Convenzione**: wireframe a bassa fedeltà in ASCII per allineamento concettuale; passaggio a Figma in Sprint 0 prima dello sviluppo.
**Stile**: tono fresco/tecnico, palette Cantiera (Ocra `#D97706` + Blu `#1E40AF` + neutri).
**Schermate prioritarie confermate dal cliente**: Dashboard · Lista commesse · Dettaglio commessa · Upload foto cantiere · Ricerca documenti · Notifiche/scadenze.

---

## Layout generale Web (Ufficio)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [logo Bertaiola]  Cantiera                              🔔  👤 Mario Rossi▾ │
├──────────┬──────────────────────────────────────────────────────────────────┤
│          │                                                                  │
│ 🏠 Home  │                      AREA CONTENUTI PRINCIPALI                   │
│ 📋 Lista │                                                                  │
│ ➕ Nuova │                                                                  │
│ 🔍 Cerca │                                                                  │
│ 🔔 Notif │                                                                  │
│ 📊 Stats │                                                                  │
│ ⚙️  Setup│                                                                  │
│          │                                                                  │
│ ─────    │                                                                  │
│ 📁 Cart. │                                                                  │
│   locali │                                                                  │
└──────────┴──────────────────────────────────────────────────────────────────┘
```

Header brand: **logo Bertaiola** (caricato per tenant) + scritta "Cantiera" + footer discreto "powered by SOLVA". Sidebar a sinistra collassabile.

---

## 🖥️ 1) DASHBOARD (Web Ufficio)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Buongiorno, Mario · martedì 13 gennaio 2026                                 │
│                                                                             │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│ │  COMMESSE    │  │  FASI IN     │  │  FOTO        │  │  DICO IN     │    │
│ │  APERTE      │  │  ATTESA      │  │  CARICATE    │  │  SCADENZA    │    │
│ │              │  │  >3 GIORNI   │  │  OGGI        │  │  ≤7 GIORNI   │    │
│ │     27       │  │     4 ⚠️     │  │     42       │  │     2 🔴     │    │
│ │  +3 settim.  │  │              │  │              │  │              │    │
│ └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                                             │
│ ── COMMESSE A RISCHIO ─────────────────────────────────────────────────── │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │ 🟠 BER-2026-014   Rossi M. · via Roma 12 · Caldaia + Sanitario  │    │
│  │    ⚠ Foto in_corso mancanti (0/3) da 4 giorni                   │    │
│  │    Resp: Luca P.        [Apri commessa →]                        │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │ 🔴 BER-2025-188   Bianchi · DICO non caricato (collaudo 18/01)  │    │
│  │    Resp: Andrea T.      [Apri commessa →]                        │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│ ── ULTIMA ATTIVITÀ ─────────────────────────────────────────────────────  │
│                                                                             │
│  🕐 09:42  Tecnico Davide ha caricato 3 foto su BER-2026-021              │
│  🕐 09:15  Nuovo ticket Freshdesk #4521 → creata BER-2026-029              │
│  🕐 08:58  Fase "Montaggio bagni" completata su BER-2026-019              │
│  🕐 08:30  Cliente Verdi ha aperto il portale (3 documenti visualizzati)  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Note di design**:
- 4 KPI card grandi con numeri 48-72 pt
- Card "a rischio" con bordo colorato sx (arancio/rosso) → motivo visual immediato
- Timeline attività in basso (read-only), filtrabile in altra pagina

---

## 🖥️ 2) LISTA COMMESSE (Web Ufficio)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Commesse                                          [➕ Nuova commessa]       │
│                                                                             │
│  🔍 [Cerca per cliente, codice, indirizzo...     ]                          │
│                                                                             │
│  Filtri: [Stato ▾] [Anno ▾] [Responsabile ▾] [Tipo lavoro ▾] [Reset]      │
│                                                                             │
│ ┌────────────┬─────────────────┬──────────┬──────┬─────────┬─────────┐    │
│ │ CODICE     │ CLIENTE         │ STATO    │ FOTO │ FASI    │ RESP.   │    │
│ ├────────────┼─────────────────┼──────────┼──────┼─────────┼─────────┤    │
│ │ BER-26-001 │ Rossi M.        │ 🟢 Aperta│ 12   │ 5/8     │ Luca P. │    │
│ │ BER-26-002 │ Bianchi G.      │ 🟡 Coll. │ 47   │ 7/7     │ Andrea T│    │
│ │ BER-26-003 │ Comune di X     │ 🔴 Rita. │ 8    │ 2/9     │ Marco F.│    │
│ │ BER-26-004 │ Verdi srl       │ ⚪ Bozza │ 0    │ 0/4     │ -       │    │
│ │ BER-26-005 │ Neri E.         │ 🟢 In c. │ 31   │ 4/6     │ Luca P. │    │
│ └────────────┴─────────────────┴──────────┴──────┴─────────┴─────────┘    │
│                                                                             │
│   <  1  2  3 … 18  >                            27 di 215 commesse         │
└─────────────────────────────────────────────────────────────────────────────┘
```

- Colonna "Fasi" mostra completate/totale
- Click su riga → dettaglio
- Sort cliccabile per colonna

---

## 🖥️ 3) DETTAGLIO COMMESSA con tab fasi (Web Ufficio)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← Torna alla lista                                                          │
│                                                                             │
│ BER-2026-001 · Rossi Mario · Caldaia + Sanitario              🟢 In corso  │
│ via Roma 12, Treviso · Resp: Luca Padova · Aperta il 03/01/2026             │
│                                                                             │
│  [Anagrafica] [Fasi] [Documenti] [Foto] [Note] [Cronologia]                 │
│  ─────────  ━━━━━  ─────────── ───── ──── ──────────                       │
│                                                                             │
│  FASI ATTIVE PER QUESTA COMMESSA                                            │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │ ✅ Preventivo                                       2 file        │    │
│  │ ✅ Ordine materiali cantiere                        3 file        │    │
│  │ 🟡 Impianto gas interno              4/3 foto       6 file        │    │
│  │ 🟡 Impianto sanitario                2/3 foto ⚠     4 file        │    │
│  │ ⚪ Impianto condizionamento          0/3 foto       0 file        │    │
│  │ ⚪ Collaudo tenuta                                   -             │    │
│  │ ⚪ Compilazione DICO                                 -             │    │
│  │ ⚪ Foto finali                       0/5 foto        -             │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  FASI NON SELEZIONATE   [Aggiungi fase ▾]                                   │
│   — Pannelli solari · Impianto aspirazione · Montaggio bagni                │
│                                                                             │
│  [📁 Apri cartella locale] [📤 Genera report PDF] [💬 Aggiungi nota]         │
└─────────────────────────────────────────────────────────────────────────────┘
```

- Tab "Fasi" è il cuore funzionale: ogni fase mostra count foto vs target + stato
- Pulsante "Apri cartella locale" → file:// link Windows che apre Esplora Risorse alla cartella sincronizzata Nextcloud (UX richiesta dal cliente)

---

## 📱 4) UPLOAD FOTO CANTIERE (Mobile App)

```
   📱 iPhone — schermata Tecnico

   ┌─────────────────────────────┐
   │  ←   BER-2026-001           │
   │      Rossi Mario            │
   ├─────────────────────────────┤
   │                             │
   │  📸 SCATTA FOTO             │
   │  ╭───────────────────────╮  │
   │  │                       │  │
   │  │      [📷 grande]      │  │
   │  │                       │  │
   │  │  Tap per scattare     │  │
   │  │  o trascina dalla     │  │
   │  │  galleria             │  │
   │  ╰───────────────────────╯  │
   │                             │
   │  FASE                       │
   │  [Impianto sanitario   ▾]  │
   │                             │
   │  MOMENTO                    │
   │  ○ Prima  ● In corso  ○ Fine│
   │                             │
   │  📍 Geo-tag attivo          │
   │  🕒 Allegato: ora corrente  │
   │                             │
   │  📝 Nota (opzionale)        │
   │  [Tubazioni passaggio…   ]  │
   │                             │
   │  ┌─────────────────────┐    │
   │  │   CARICA FOTO  →    │    │
   │  └─────────────────────┘    │
   │                             │
   │ ─────────────────────────── │
   │  Ultime caricate (oggi)     │
   │  [img][img][img][img] + 12  │
   └─────────────────────────────┘
```

**Stato durante upload**:
```
   ┌─────────────────────────────┐
   │  Caricamento foto...        │
   │  ████████████░░░░  75 %     │
   │                             │
   │  Anche se chiudi l'app,     │
   │  l'upload continua.         │
   └─────────────────────────────┘
```

---

## 📱 4-bis) LISTA COMMESSE mobile (vista tecnico)

```
   ┌─────────────────────────────┐
   │  Cantiera        🔔  Mario  │
   ├─────────────────────────────┤
   │  Le mie commesse oggi       │
   │                             │
   │  🟢 BER-26-001              │
   │     Rossi · via Roma 12     │
   │     2 fasi attive  📸 8/14  │
   │                             │
   │  🟡 BER-26-007              │
   │     Comune Castagnole       │
   │     1 fase attiva  📸 0/3 ⚠ │
   │                             │
   │  🟢 BER-25-198              │
   │     Bianchi · ritorno       │
   │     Solo collaudo  📸 3/3 ✓ │
   │                             │
   │  [+ Vedi archivio]          │
   └─────────────────────────────┘
```

---

## 🖥️ 5) RICERCA DOCUMENTI (Web Ufficio)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Ricerca globale                                                            │
│                                                                             │
│  🔍 [ caldaia rossi 2024                                          ] [Cerca] │
│                                                                             │
│  Filtri: [Tutti ▾] [Anno ▾] [Tipo file ▾] [Cliente ▾]                     │
│                                                                             │
│  ── COMMESSE (3) ─────────────────────────────────────────────────────────  │
│                                                                             │
│  📋 BER-2024-097 — Rossi Mario · Caldaia + Sanitario                       │
│      via Roma 12, Treviso · Chiusa 14/09/2024                              │
│      "...installazione caldaia a condensazione 24 kW..."                   │
│                                                                             │
│  📋 BER-2024-201 — Rossi Famiglia · Solo caldaia                           │
│      via Verdi 8, Castelfranco · Chiusa 22/11/2024                         │
│                                                                             │
│  ── DOCUMENTI (12) ───────────────────────────────────────────────────────  │
│                                                                             │
│  📄 Preventivo_Rossi_Mario_caldaia.pdf       BER-2024-097   12/03/2024     │
│      "...caldaia Vaillant ecoTEC plus..."                                  │
│                                                                             │
│  📄 DICO_Rossi_finale.pdf                   BER-2024-097   14/09/2024     │
│      "...impianto a norma DM 37/08..."                                     │
│                                                                             │
│  🖼️ caldaia_post_installazione_001.jpg      BER-2024-097   12/09/2024     │
│                                                                             │
│  ── FOTO (47) ────────────────────────────────────────────────────────────  │
│  [thumb][thumb][thumb][thumb][thumb][thumb][thumb][thumb][thumb][thumb] +  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

- Risultati raggruppati per tipo
- Snippet OCR su PDF (highlight della query)
- Click thumb foto → lightbox

---

## 🖥️/📱 6) NOTIFICHE & SCADENZE

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Notifiche                                  [Tutte] [Non lette] [Filtri ▾] │
│                                                                             │
│  OGGI                                                                       │
│                                                                             │
│  🔴 09:42  DICO scadenza COMPLIANCE                                         │
│            BER-2025-188 · collaudo previsto 18/01, DICO non caricato       │
│            [Vai alla commessa]                                              │
│                                                                             │
│  🟠 08:30  Foto in attesa                                                   │
│            BER-2026-014 · fase "Foto in corso" senza upload da 4 giorni    │
│            [Sollecita Luca P.]   [Vai]                                      │
│                                                                             │
│  IERI                                                                       │
│                                                                             │
│  🟢 18:12  Fase completata                                                  │
│            BER-2026-019 · "Montaggio bagni" 3/3 foto caricate              │
│                                                                             │
│  🔵 17:45  Nuovo ticket Freshdesk                                           │
│            #4521 da cliente Castelli — creata BER-2026-029                  │
│                                                                             │
│  ── PREFERENZE ──────────────────────────────────────────────────────────── │
│  [✓] Email   [✓] Push app   [ ] Solo in orario lavoro (8-19)                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Componenti UI ricorrenti

| Componente | Note |
|---|---|
| Badge stato commessa | 🟢 Aperta · 🟡 Collaudo · 🔴 Critica · ⚪ Bozza · ⚫ Archiviata |
| Avatar utenti | iniziali su cerchio colorato per ruolo |
| Card KPI | numero grande + delta vs settimana precedente + icona |
| Bottoni primari | sfondo Ocra `#D97706`, testo bianco, radius 8px |
| Bottoni secondari | bordo Blu `#1E40AF`, testo Blu, sfondo bianco |
| Tabella | zebra stripe `#F8FAFC`, hover `#E2E8F0` |
| Modali | overlay `rgba(15,23,42,0.5)`, max-width 640px |

## Accessibilità

- Tutti i KPI hanno alt-text esplicito
- Contrasto WCAG AA su testi
- Tap target ≥ 44×44 su mobile (Apple HIG)
- Supporto Dark Mode sistematico (fase 2)

## Note finali

- Mockup HD in Figma da consegnare in Sprint 0 (1-2 giorni di design)
- Ogni schermata testata su iPhone SE (min) → iPhone 15 Pro Max + viewport desktop 1280 e 1920
