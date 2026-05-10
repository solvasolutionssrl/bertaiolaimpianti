# Documento Zero — Bertaiola Impianti
**Versione**: 1.0
**Data**: Dicembre 2025
**Autore**: SOLVA Solutions
**Stato**: Post-kickoff, in evoluzione

---

## 1. Profilo cliente

**Bertaiola Impianti** è un'azienda **termoidraulica/impiantistica** che progetta, installa e mantiene impianti complessi per clienti residenziali e commerciali. Le aree di lavoro coprono caldaie, sanitario, riscaldamento, condizionamento, gas, solare termico/fotovoltaico, aspirazione centralizzata, ventilazione meccanica, collaudi e adempimenti normativi (DICO, agg. 26/24, allacci SAT, CIRCE/CURIT).

**Organico operativo coinvolto**: 20 utenti (5 ufficio + 15 tecnici di campo).

## 2. Problema da risolvere

L'azienda usa oggi **Freshdesk** come sistema di ticketing **legacy**, ma:
- La documentazione delle commesse (disegni, foto, schede tecniche, DICO, preventivi) è gestita **separatamente**: cartelle locali NAS in ufficio e album Google Foto condivisi linkati dentro Freshdesk per le foto cantiere caricate dal titolare via iPhone.
- Freshdesk è uno strumento generico di customer support, non un sistema di gestione commesse → introduce attriti nei workflow reali di Bertaiola.

Conseguenze:
- File sparsi tra NAS, Drive, email, allegati Freshdesk
- Rischio perdita informazioni nel passaggio campo↔ufficio
- Mancanza di alberatura standardizzata per le commesse
- Difficoltà a recuperare velocemente documenti storici
- Nessuna automazione su upload mancanti / chiusura lavoro
- Mancanza di app mobile dedicata per i tecnici
- Doppio salto mentale "ticket Freshdesk ↔ commessa fisica"

## 3. Visione del progetto (post-discussione)

Costruire **un'unica piattaforma** che **sostituisce** Freshdesk e centralizza tutto:

1. **Sostituisce** Freshdesk con un modulo ticketing nativo integrato alla gestione commesse (un ticket può diventare commessa con un click; gli storici Freshdesk sono migrati una tantum via API).
2. **Standardizza** l'alberatura cartelle automaticamente per ogni commessa, in base alle fasi selezionate (fra le 38 lavorazioni tipiche mappate).
3. **Da accesso mobile** ai tecnici tramite **PWA installabile** (no App Store, no installazione complicata): consultano disegni, scattano/caricano foto, vedono lo stato delle fasi della propria commessa.
4. **Notifica automaticamente** ufficio e capi-cantiere su upload mancanti, fasi in attesa, requisiti per chiudere il lavoro.
5. **Permette accesso "alla vecchia"** dall'ufficio: i 5 PC Windows in sede vedono le cartelle delle commesse come unità di rete sincronizzata (drag-and-drop, doppio click, niente app obbligatoria per le operazioni quotidiane di routine).
6. **Apre un portale cliente finale** dove far consultare documenti e (in futuro) eseguire pagamenti.

> ⚠️ **Cambio rispetto a v1 e ipotesi intermedie**: Freshdesk non viene "integrato" ma **abbandonato**. La migrazione è uno script one-time che estrae i ticket via API Freshdesk in JSON e li importa nella nuova app. Dal go-live, Bertaiola non rinnova più la licenza Freshdesk.

## 4. Vincoli e scelte chiave emerse

| Vincolo / Scelta | Dettaglio |
|---|---|
| Hosting | UE, GDPR compliant |
| Volumi | 50 GB oggi, +20 GB/anno → archivio sotto i 200 GB a 5 anni |
| Tipo file | Tante foto iPhone (12-48 MP), PDF (schede, DICO, preventivi), Office, occasionali CAD/disegni |
| Mobile | iPhone tecnici, accesso **online** (no offline per ora) |
| Ufficio | 5 PC Windows; preferenza per cartelle navigabili classiche |
| Suite produttività | Office locale (no M365 / no Google Workspace attivi) |
| Connettività | Fibra in ufficio; 4G/5G generalmente disponibile in cantiere |
| SSO | Login custom email+password, **semplice** |
| Budget storage | €1.500 – €3.000/anno |
| Go-live | **1 mese** (MVP focused) |
| Manutenzione | **Tutto gestito SOLVA** |
| Brand | **Doppio brand** SOLVA + Bertaiola |
| Architettura | **MULTITENANT** dal giorno 1 (Bertaiola è il primo cliente di una nuova linea SaaS) |
| Mobile tecnici | **PWA installabile** (no App Store, distribuita via URL, "Aggiungi alla schermata Home") |
| Freshdesk | **Da abbandonare**: migrazione one-time via API, poi ticketing nativo nella nuova app |
| Pubblico PPT | Tecnico |

## 5. Pivot architetturale rispetto alla v1 (28/11/2025)

La proposta v1 prevedeva **Microsoft 365 + SharePoint Online** (~€200/mese licenze + ~€11k setup). SOLVA ha scelto di valutare alternative perché:

- M365 è un investimento operativo significativo per 20 utenti che oggi non hanno alcun ecosistema Microsoft cloud.
- SharePoint è solido ma "pesante" lato UX e licensing, e poco compatibile con un'esperienza "cartella alla vecchia" semplice.
- Il cliente vuole una soluzione **leggera, gestita da SOLVA, ripetibile su altri clienti** (multitenant).

→ Vedere `02_ARCHITETTURA/Comparativa_Storage.md` per il confronto e la raccomandazione finale (Hetzner Storage Share / Nextcloud managed).

## 6. Opportunità SaaS (oltre il singolo progetto)

Bertaiola è il **caso d'uso pilota** per un prodotto SaaS verticale destinato alle PMI termoidrauliche e impiantistiche italiane. Mercato di riferimento (concorrenza nota: Hopperix, Perfetto, Ergo Infominds, Edison, iMio, Dylog, impiantix.app) → SOLVA può posizionarsi su **mobile-first + integrazione Freshdesk + UX moderna + pricing flessibile**.

→ Vedere `03_BRAND/Proposta_Brand_Prodotto.md` per nome prodotto e posizionamento.

## 7. Fasi del progetto

| Fase | Periodo | Stato |
|---|---|---|
| Progettazione | Nov-Dic 2025 | ✅ In corso (questo documento) |
| Infrastruttura & MVP | Gen 2026 (1 mese) | 🟡 Da avviare |
| Operatività & estensioni | Feb-Apr 2026 | ⚪ Pianificata |

## 8. Punti chiusi vs aperti

**Chiusi**: settore, organico, volumi, vincoli budget, vincolo go-live, scelta multitenant, scope MVP (ticketing nativo + app foto PWA + commesse + portale cliente), scelta hosting UE, decisione di abbandonare Freshdesk, decisione PWA al posto di app nativa.

**Aperti** (vedi roadmap):
- Selezione finale brand prodotto (3 opzioni in `03_BRAND`)
- Decisione tra Nextcloud managed (Hetzner Storage Share) vs Supabase Storage puro (vedi comparativa)
- Data esatta di disdetta licenza Freshdesk (consigliato: fine periodo fatturazione corrente, dopo go-live e migrazione storico)
- Strategia di onboarding nuovi tenant (post Bertaiola)
- Piano formativo per ufficio (1-2 sessioni)
