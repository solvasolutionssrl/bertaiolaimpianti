# Integrazioni con i gestionali dei clienti

**Versione**: 2.0 · **Stato**: contratto chiuso, lato Kommessa in costruzione · **Aggiornato**: 06/08/2026

Questa cartella spiega come Kommessa si collega al gestionale (ERP) di un cliente:
leggere le sue commesse, e mandargli ore, chilometri e note spese.

Primo caso reale: **FPM Impianti** con **ERGO di Infominds**. Ma niente qui è scritto
per ERGO — è il punto di tutto il progetto.

## I documenti

| File | A chi serve |
|---|---|
| **[Come_funziona.md](Come_funziona.md)** | a chiunque debba capire l'impianto: come sono divisi i pezzi e perché |
| **[Contratto_API.md](Contratto_API.md)** | a chi scrive un agente di sincronizzazione |
| **[Aggiungere_un_gestionale.md](Aggiungere_un_gestionale.md)** | a chi deve collegare il **prossimo** cliente |

## In due minuti

Il cliente ha un gestionale che vive dentro la sua rete aziendale, irraggiungibile da
internet. Noi non possiamo chiamarlo, e non vogliamo chiedergli di aprire porte nel
firewall: è una richiesta che apre una discussione col loro reparto IT e può fermare tutto
per settimane.

Quindi il collegamento lo fa **una macchina dentro la loro rete**, che chiamiamo *agente*.
L'agente parla col gestionale in locale, e con noi via HTTPS **in uscita** — come farebbe
un browser. Non ci sono porte da aprire da nessuna parte.

```
   rete del cliente (privata)                        internet
 ┌──────────────────────────────┐
 │   Gestionale (ERGO, …)       │
 │        ▲          │          │
 │  legge │          │ scrive   │
 │        │          ▼          │
 │       AGENTE                 │
 └────────────┬─────────────────┘
              │  HTTPS 443, sempre in uscita, token Bearer
              ▼
        API Kommessa  ──>  database
              ▲
              │
        Kommessa (ufficio, PWA)
```

L'agente **non conosce Kommessa** e Kommessa **non conosce il gestionale**. Si parlano
attraverso un vocabolario neutro fatto di *ore*, *chilometri* e *spese*. La traduzione
verso il dialetto dell'ERP avviene tutta dentro l'agente.

## Le tre regole da ricordare

**1. Kommessa non nomina mai un gestionale.** Nel nostro codice non esiste un codice
articolo di ERGO né un suo nome di campo. Se domani arriva un cliente con TeamSystem si
scrive un altro agente e Kommessa non se ne accorge. È ciò che rende questo lavoro
rivendibile invece che su misura.

**2. Nessuno chiama nessuno a sorpresa.** È sempre l'agente a farsi vivo. Noi mettiamo il
lavoro in una coda; lui passa a prenderlo quando può. Se la sua macchina è spenta per un
giorno, il lavoro resta in coda e riparte da solo.

**3. Su un gestionale si scrive e non si torna indietro.** Su ERGO — e va dato per
possibile su qualunque ERP finché non si dimostra il contrario — quello che scrivi non si
può rileggere né cancellare via API. Perciò si manda **solo ciò che l'ufficio ha già
approvato**, mai in automatico, e una correzione fatta dopo l'invio va sistemata a mano nel
gestionale. Questo va detto al cliente **prima**, non dopo il primo errore.

## Stato

- ✅ Vocabolario neutro e conversione dati (con test)
- ✅ Tabelle e permessi sul database
- ✅ API per gli agenti (5 rotte, versionate `v1`)
- ✅ Pulsante "Sincronizza" in ufficio e accodamento
- ✅ Vista di piattaforma su code, operazioni e giri (`/admin/integrazioni`)
- ✅ Token con permesso dedicato (`/admin/token-app`)
- ⏳ **Collegamento delle anagrafiche** — il prossimo passo, e quello che sblocca tutto:
  finché i nostri cantieri non sono agganciati a quelli del gestionale, non parte niente.
  Richiede una revisione a mano: i cantieri caricati da CSV non hanno alcun legame con
  quelli del gestionale.
- ⏳ Allarme automatico quando un cliente resta silenzioso
