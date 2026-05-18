# Proposta brand prodotto — SaaS multitenant per impiantisti
**Versione**: 1.1
**Decisione richiesta**: nome prodotto + identità visiva guida
**Stato**: 3 opzioni in valutazione, raccomandazione finale a fondo pagina

> **Aggiornamento 2026-05-10**: il nome di lavoro scelto per il prodotto è **impiantiXplus** (working name, soggetto a cambi). Le 3 proposte sotto (Cantiera, Posa, ImpiantOS) restano come materiale storico di riferimento.

---

## Contesto

Bertaiola è il **primo cliente pilota** di una nuova linea SaaS verticale che SOLVA Solutions può rivendere a tutte le PMI termoidrauliche/impiantistiche italiane (10.000+ aziende in Italia, mercato concorrenziale ma poco moderno lato UX).

Il nome deve:
- Essere **brandable** (corto, memorabile, distintivo)
- Funzionare in **italiano** prima di tutto, ma essere **pronunciabile** in inglese (futuri sbocchi)
- **Non confondersi** con concorrenti esistenti già mappati: Hopperix, Perfetto, Ergo Infominds, Edison, iMio, Dylog, **impiantix.app** (citato dal cliente come riferimento)
- Avere domini disponibili (almeno `.app`, `.it`, idealmente `.com`)
- Reggere il **doppio brand** "SOLVA × <prodotto>"

## ⚠️ Nomi già occupati o sconsigliati

| Nome | Motivo esclusione |
|---|---|
| Cantierix | Esiste già (TecnoEdil — piattaforma streaming, sito `cantierix.it`) |
| Hopperix | Concorrente diretto (gestionale termoidraulici) |
| Perfetto | Concorrente diretto (gestionale impiantisti) |
| Impiantix | Nome riferito dal cliente; esiste `impiantix.app`, non riusabile |
| Cantiere/Cantieri | Troppo generico, dominio principale occupato |

## ✅ 3 candidati proposti

### Candidato 1 — **CANTIERA**

> "La piattaforma per chi vive il cantiere"

- **Etimologia**: femminile italiano di "cantiere", suona moderno e curato
- **Pro**: pronunciabile EN ("kan-tee-air-ah"), evocativo, applicabile anche a edilizia non solo impianti (mercato espandibile), no concorrenti diretti omonimi rilevati
- **Domini da verificare**: `cantiera.app`, `cantiera.it`, `cantiera.com`, `getcantiera.com`
- **Tagline candidate**:
  - "Il tuo cantiere, sotto controllo."
  - "Dalla commessa al collaudo, in tasca."
  - "Cartelle ordinate, foto al posto giusto, lavoro chiuso."

### Candidato 2 — **POSA**

> "La app delle squadre che posano impianti"

- **Etimologia**: "posa" come azione di installare/montare (idiomatico del settore), parola breve e potente
- **Pro**: 4 lettere, dominio probabilmente disponibile su `.app`, brandable a livello internazionale (verbo "to lay/install"), evoca concretezza e mestiere
- **Contro**: leggermente più "tecnico", forse meno scalabile a target generalisti (es. edilizia)
- **Domini da verificare**: `posa.app`, `posaapp.it`, `useposa.com`
- **Tagline candidate**:
  - "Posa, scatta, salva."
  - "L'app del posatore moderno."

### Candidato 3 — **IMPIANTOS** (oppure scritto **ImpiantOS**)

> "Il sistema operativo della tua impiantistica"

- **Etimologia**: portmanteau **Impianti + OS** (Operating System) → posizionamento "platform / centro di controllo"
- **Pro**: parla esplicitamente al verticale (impiantisti capiscono subito), tono tech moderno, easy SEO
- **Contro**: meno espandibile fuori dal segmento impianti (ma è anche il punto: verticalità è il differenziale)
- **Domini da verificare**: `impiantos.com`, `impiantos.it`, `impiantos.app`
- **Tagline candidate**:
  - "Il sistema operativo del tuo impianto."
  - "OS per impiantisti che non hanno tempo da perdere."

## Comparativa rapida

| | Cantiera | Posa | ImpiantOS |
|---|---|---|---|
| Memorabile | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| Verticalità impianti | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Espandibilità mercati | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| Tono moderno tech | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Pronuncia internazionale | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| Rischio collisione marchi | basso | basso/medio | basso |
| Lunghezza | 8 lettere | 4 lettere | 9 lettere |

## 🏆 Raccomandazione SOLVA

**Cantiera** è la nostra prima scelta:
- Sufficientemente verticale per parlare al target (impiantisti + edilizia tecnica)
- Espandibile come piattaforma "lavori su commessa" oltre i soli impianti, se SOLVA decide di scalare il mercato
- Femminile italiano → suono caldo, distintivo, non aggressivo
- Lascia spazio a sotto-prodotti (Cantiera Mobile, Cantiera Office, Cantiera Cliente)

**Brand system minimo (Sprint 0)**:
- Logo: parola "cantiera" con accento custom sul "a" finale, oppure un pittogramma di una cartella aperta stilizzata
- Palette colori:
  - Primario **Ocra cantiere**: `#D97706` (richiama hi-vis arancio, ma più "designer")
  - Secondario **Blu lavagna**: `#1E40AF` (tecnico, affidabile)
  - Neutri: `#0F172A` testo, `#F8FAFC` bg, `#E2E8F0` linee
- Font: header **Inter Tight** (o Manrope), body **Inter**

**Doppio brand SOLVA × Cantiera**:
- Header app: `SOLVA · Cantiera per Bertaiola Impianti`
- Footer "Powered by SOLVA Solutions"
- White-label per tenant: ogni tenant può caricare suo logo che compare in alto a sinistra (es. logo Bertaiola), con `Powered by Cantiera × SOLVA` discretamente in footer.

## Prossime azioni (Sprint 0)

1. ⏰ **Subito**: verifica disponibilità dominio scelto via WHOIS (`cantiera.app`, `cantiera.it`, `cantiera.com`)
2. Registrazione marchio (verifica TM-View EUIPO + UIBM Italia)
3. Acquisto domini (~€30-50/anno) + setup DNS Cloudflare
4. Lock account social handles (`@cantiera_app` IG/X/LinkedIn)
5. Brief grafico per logo (1 designer SOLVA, 4-6h)
6. Setup pagina "coming soon" su `cantiera.app` con cattura email beta partners

> **Nota**: i 3 candidati restano in pista finché il cliente Bertaiola **non valida** la scelta. Tutti e tre possono essere prototipati a costo nullo (basta CSS/logo).

---

## Approfondimento: posizionamento di mercato

| Concorrente | Forza | Debolezza che colpiamo |
|---|---|---|
| **Hopperix** | Feature ricche (preventivi, contabilità, magazzino, manutenzioni) | UX desktop tradizionale, no Freshdesk integration, costi alti per piccoli artigiani |
| **Perfetto** (myperfetto.it) | Brand forte, ANGAISA listini integrati, mobile rapportini | Stesso DNA gestionale anni 2000, non mobile-first |
| **Ergo Infominds** | ERP completo, edilizia + impianti, modulare | Pesante, lungo onboarding, costi enterprise |
| **Edison (Exeprogetti)** | 30 anni di mercato, riconoscibilità | UI datata, no cloud nativo |
| **impiantix.app** | Mobile-first nascente | Probabilmente focus solo su intervento/manutenzione |

**Nostro posizionamento "Cantiera"**:
> _"Il primo gestionale commesse che parla al cantiere prima che all'ufficio. Mobile-first. Foto al centro. Senza ERP da imparare."_

Mercato target SaaS:
- PMI impiantistiche 5-30 dipendenti
- Aziende che usano già un ticket system (Freshdesk, Zendesk, Trello) e vogliono "il pezzo che manca"
- Aziende che hanno provato gestionali tradizionali e li hanno trovati "troppo"

Prezzo di lancio ipotetico (post-Bertaiola):
- **Base** €99/mese (fino a 10 utenti, 1 TB)
- **Pro** €199/mese (fino a 25 utenti, 5 TB, ricerca AI)
- **Custom** on demand
