# Flusso Operativo — impiantiXplus
**Versione**: 1.0
**Stato**: bozza, raccolta dalla conversazione con il cliente del 2026-05-10
**Scopo**: descrivere il flusso end-to-end con cui il responsabile (capo) e i tecnici useranno il prodotto in pratica, in modo che architettura, mockup e roadmap possano essere validati contro un caso d'uso concreto.

---

## 1. Attori

| Ruolo | Superficie principale | Cosa fa |
|---|---|---|
| **Responsabile / capo** | Telefono (PWA `m.impiantixplus.app`) — accessoriamente Web ufficio | Sopralluogo dal cliente, creazione commessa, configurazione tipologia impianto, assegnazione tecnici |
| **Tecnico in cantiere** | Telefono (PWA) | Esecuzione fasi, upload foto/video, note, ore, materiali |
| **Ufficio / segreteria** | Web (`app.impiantixplus.app`) — PC ufficio Bertaiola | Anagrafica clienti, preventivi, ticket, documenti, sincronizzazione cartelle locali |
| **Cliente finale** | Web (`cliente.impiantixplus.app/<slug>`) — magic-link | Consultazione documenti, stato lavori, richiesta intervento (Sprint 3) |

---

## 2. Flusso "nuovo cliente / nuova commessa" (capo, da telefono)

Questo è il flusso che fa da spina dorsale al prodotto: il capo va dal cliente, raccoglie informazioni, e l'app crea **automaticamente** sia il record di commessa in DB sia la cartella di progetto sul cloud, senza intervento manuale dell'ufficio.

```
1. Capo apre PWA sul telefono dal cliente
        │
2. ➕ "Nuovo sopralluogo"
        │
3. Anagrafica base cliente (resta nel DB, NON in cartella)
   ├── nome / ragione sociale
   ├── indirizzo intervento
   ├── contatti (telefono, email)
   └── (se cliente già esistente → autocomplete da DB)
        │
4. Cattura sul posto
   ├── 📷 Foto (uno o più scatti)
   ├── 🎥 Video brevi
   ├── 📝 Note testuali / annotazioni
   ├── 🖊️ Schizzi a mano (canvas touch)
   └── 📍 Geolocalizzazione automatica
        │
5. Selezione voci/fasi
   ├── lista delle 38 voci codificate dal PDF cliente
   │   → vedi `Tassonomia_Lavori.md` per elenco completo + split default/selezionabile
   ├── voci di Sezione A (1-10, 26): sempre attive — pre-spuntate, non disattivabili
   ├── voci di Sezione B (11-25, 27-38): selezione del capo (checklist raggruppata)
   └── opzionalmente partendo da un preset salvato dal tenant
       (Bertaiola parte senza preset; se ne accumulano col tempo)
        │
6. Genera nome cartella (AI)
   ├── Edge Function chiama Claude Haiku con prompt strutturato:
   │     • voci selezionate al passo 5
   │     • note testuali del passo 4
   │     • indirizzo / tipo cliente
   ├── Output proposto: <DescrizioneAI> (es. "SistemazioneBagno",
   │     "InstallazioneCaldaia", "ImpiantoSolareCompleto")
   └── Mostrato al capo in PWA come campo EDITABILE prima del conferma
        │
7. Conferma e crea commessa
   │
   ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  AUTOMATICO — nessun intervento ufficio                      │
   ├──────────────────────────────────────────────────────────────┤
   │  • Insert record `clienti` (o autocomplete se esistente)     │
   │  • Insert record `commesse` con:                             │
   │      - codice_interno: BER-26-NNN (identificatore tecnico)   │
   │      - nome_cartella: NomeCliente_YYYY-MM-DD_DescrizioneAI   │
   │  • Insert N righe `commessa_voci` (default + selezionate)    │
   │  • Genera cartella progetto sul cloud — friendly names,      │
   │    NIENTE prefissi numerici. Esempio:                        │
   │                                                              │
   │      /Rossi_2026-05-10_SistemazioneBagno/                   │
   │        ├── Preventivi/                                       │
   │        ├── Schemi/                                           │
   │        ├── Foto/                                             │
   │        │   ├── Sopralluogo/   ← foto/video del passo 4 qui  │
   │        │   ├── In corso/                                     │
   │        │   └── Finali/                                       │
   │        ├── Documenti/                                        │
   │        │   ├── POS/                                          │
   │        │   ├── Cartellone/                                   │
   │        │   ├── DICO/                                         │
   │        │   ├── Cassette_DPI/                                 │
   │        │   └── Certificazioni/                               │
   │        ├── Materiali/                                        │
   │        └── Chiusura/                                         │
   │                                                              │
   │  • Sync automatico verso i 5 PC ufficio                      │
   │  • Le foto/video del passo 4 vanno in Foto/Sopralluogo/      │
   └──────────────────────────────────────────────────────────────┘
```

**Risultato**: a fine sopralluogo, **senza che nessuno in ufficio tocchi nulla**, esiste:
- una commessa registrata in DB con tutta l'anagrafica,
- una cartella di progetto pulita, ordinata, con la stessa struttura template di tutte le altre commesse,
- tutti i file multimediali del sopralluogo già nel posto giusto,
- visibilità immediata per ufficio sui 5 PC.

---

## 3. Perché questo è il valore centrale

Il problema reale di Bertaiola oggi è la **dispersione**: foto sul telefono del capo, note su Whatsapp, documenti sparsi tra Drive/email/desktop, cartelle nominate in modo inconsistente nel tempo. La conseguenza è che in fase di chiusura/contenzioso/manutenzione recuperare materiale è lento e a volte impossibile.

Il flusso sopra risolve questo con tre vincoli architetturali:

1. **Cartella generata dall'app, non dall'umano** → struttura sempre identica, naming sempre coerente.
2. **Cattura sul posto con upload immediato** → il file nasce già nella cartella giusta, non viene "spostato dopo".
3. **DB + filesystem in sync** → il record commessa in Supabase punta sempre alla cartella corretta; ricerche e collegamenti incrociati funzionano automaticamente.

---

## 4. Estensioni del flusso (oltre il sopralluogo)

| Momento | Chi | Cosa |
|---|---|---|
| Avvio lavori | Capo da web ufficio | Crea fasi (es. "Posa tubi", "Collaudo"), assegna tecnici |
| In cantiere | Tecnico da PWA | Apre fase, scatta foto progress (vanno in `Foto/In corso/<voce>/`), aggiunge note ore |
| Chiusura intervento | Tecnico/capo | Carica DICO, certificazioni → vanno in `Documenti/DICO/` e `Documenti/Certificazioni/` |
| Post go-live | Cliente finale | Riceve magic-link, vede stato lavori, scarica certificazioni, può richiedere intervento → ticket nativo (no Freshdesk) |
| Manutenzione (post-MVP) | Ufficio o sistema automatico | Scadenzario su impianti registrati, notifiche cliente |

---

## 5. Riferimenti incrociati

- **Tipologie di impianto / opzioni catalogo**: `Tassonomia_Lavori.md` (lista delle 38 voci estratta dal PDF) + `00_input_cliente/Bertaiola_Update_20251114 (2).pdf` (sorgente originale).
- **Modello dati e multitenancy**: `documentazione_generale/02_ARCHITETTURA/Architettura_Soluzione.md`.
- **Storage cloud (decisione TBD)**: `documentazione_generale/02_ARCHITETTURA/Comparativa_Storage.md` — la scelta finale del provider è rimandata; il flusso sopra è **agnostico** rispetto allo storage (richiede solo: API per creare cartelle + sync desktop).
- **Wireframe UI corrispondenti**: `documentazione_generale/05_MOCKUP/Mockup_UI.md` (schermate "Nuova commessa", "Upload foto cantiere", "Lista commesse").
- **Posizionamento nei sprint**: `documentazione_generale/04_ROADMAP/Roadmap_Sprint.md` (Sprint 1-2 coprono il flusso minimo end-to-end).

---

## 6. Open questions da risolvere prima di Sprint 0

- [ ] Lista definitiva delle **tipologie di impianto** selezionabili al passo 5 (tassonomia chiusa o albero?).
- [ ] **Provider storage cloud** (impatta solo l'implementazione del passo "genera cartella + sync", non il flusso utente).
- [ ] Politica di **codifica commessa** (`BER-26-NNN` o convenzione esistente di Bertaiola da preservare?).
- [ ] **Permessi**: il capo può fare tutto; tecnico cosa NON può fare? (es. modificare anagrafica, vedere preventivo, ecc.)
- [ ] **Offline**: in cantiere senza segnale, le foto del passo 4 vanno in coda Service Worker e si caricano dopo — confermare che è accettabile.
