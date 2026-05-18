# Domande di kickoff — Bertaiola Impianti

> Compilare le risposte sotto ogni domanda.
> Dove non si risponde, SOLVA userà ipotesi ragionevoli e le segnerà come **[ASSUNTO]** nei deliverable.
> Se una domanda non è applicabile, scrivere "N/A" e (opzionalmente) il motivo.

**Compilato da:**
**Data:**
**Versione:** 1.0

---

## 🗂️ Volumi & dati

### 1. Archivio attuale e crescita
- Volume totale documenti oggi (GB / TB): 50gb
- Crescita stimata anno (GB / TB): 20
- N° commesse aperte/anno:200
- N° medio file per commessa: 50

> Risposta: Ho compilato sopra

---

### 2. Tipi e pesi file dominanti
- DWG / CAD pesanti? (sì/no, quali sw) Si cad e altri file tecnici a volte
- PDF (schede tecniche, DICO, certificati)? Si schede tecniche, pdf di docuemnti vari, preventivi
- Foto smartphone (12-30 MP)? Si esatto, tante foto di iphone fatte dal capo, è lui che apre i ticket
- Video sopralluogo / foto drone?: le foto apppena dette da iphone
- Altri tipi (Office, scansioni, BIM)? sisi file excel, word e tipici di ufficio

> Risposta: Risposto sopra

---

### 3. Editing concomitante Office
- Serve coediting in tempo reale (più persone su stesso Word/Excel) **o** basta versioning + lock (apre uno per volta)?

> Risposta: Eh... è raro co editing, se riusciamo a vincolare ad uno alla volta già ottimo (sarebbe comodo e intuitivo se vedessero delle cartelle "alla vecchia", poi dimmi te, consigliami)

---

## 🏢 Infrastruttura attuale

### 4. Suite produttività attiva
- Hanno già Microsoft 365 o Google Workspace?
- Quante licenze e quale tier?
- Email aziendale dove gira oggi?

> Risposta: Hanno licenze locali office, email "normali"

---

### 5. Storage attuale in ufficio
- NAS / server file locale (marca/modello)? 
- OneDrive / Google Drive / Dropbox già in uso?
- Solo cartelle SMB condivise?
- N° postazioni desktop fisse in ufficio:

> Risposta: Hanno un nas locale al momento, hanno su google drive adesso perchè creavano ticket su ffreshdesk e allegaavano una lbum di drive per ticket, ma possiamo migrare, 5 desktop in uffico

---

### 6. Connettività
- Banda internet ufficio (download / upload Mbps):
- Tipologia (fibra FTTH, FTTC, 4G/5G fisso):
- Copertura mobile tipica nei cantieri (4G/5G stabile o spesso assente)?

> Risposta: fibra adante, nei cantieri di solito si dai c'è copertura

---

## 📱 Device & mobilità

### 7. Device tecnici di campo
- Aziendali o BYOD?
- iOS / Android / misto?
- Modello/range tipico (smartphone, tablet rugged, ecc.)?
- SIM dati aziendale o consumo a carico del tecnico?

> Risposta: Iphone e PC windows

---

### 8. Lavoro offline in cantiere
- Serve **offline reale** (scattare foto e creare upload anche senza rete, sync al rientro in copertura)?
- Oppure basta accesso **on-demand** (apertura file solo quando c'è rete)?

> Risposta: No dai al momento non serve accesso all'app offline, quando c'è rete dai, poi ci penseremo

---

## ⚙️ Funzionali & integrazioni

### 9. Scope reale del progetto SOLVA
Spuntare cosa è IN scope:
- [ Ma si, anche "manuale" volendo all'inizio, poi migriamo subito di la] Ponte Freshdesk ↔ archivio file (creazione cartelle automatica)
- [ ECCErto, è il punto principale] App mobile per tecnici (foto cantiere, consultazione disegni, checklist fasi)
- [facoltativo ] Modulo preventivi
- [ facoltativo] Modulo rapportini intervento / ore lavorate
- [no ] Modulo magazzino / materiali
- [no, al massimo valuteremo integrazione con impiantix.app che un applicativo fatto per loro. Dammi una tua idea anzi, anche come brand proprio di cosa consigli. ] Modulo manutenzioni programmate (caldaie, condizionatori)
- [ no] Scadenziario DICO / dichiarazioni
- [ Eh si, per l'ufficio anche] Portale cliente finale (consultazione documenti, pagamenti)
- [ ] Altro:

> Risposta / priorità:

---

### 10. Gestionale / ERP / fatturazione
- Software in uso oggi (TeamSystem, Zucchetti, Fatture in Cloud, Aruba, Danea, Cassa in Cloud, ecc.):
- Va integrato (lettura/scrittura) o resta isolato?

> Risposta: Attualemtne freshdesk, crea ticket il capo e dall'ufficio dalla dashboard leggono e accedono alle foto da album google foto condivisi

---

### 11. OCR / full-text
- Serve ricerca testuale dentro PDF scansionati e schede tecniche?
- Volumi di scansioni mensili stimati?

> Risposta: 1 sarebbe comodo si (poche scansiioonI)

---

### 12. Identità / SSO
- Login preferito utenti: Microsoft, Google, email+password custom, magic link, altro?
- MFA obbligatorio?

> Risposta: Custom, facile per gli utenti

---

## 🔒 Compliance

### 13. Vincoli normativi e geografici
- Hosting UE / Italia obbligatorio?
- Committenti PA o vincoli specifici (Codice Appalti, fatture PA)?
- Conservazione DICO 10 anni: oggi come la gestiscono?
- Altri vincoli (CEI, INAIL, ASL, GDPR avanzato per dati sensibili)?

> Risposta: Hosting UE, e gdpr, meglio che si può restando in una cosa "efficiente"

---

## 💰 Economici & tempi

### 14. Budget orientativo annuo per stack file/cloud
Range (selezionare):
- [ ] < €1.500/anno (self-hosted o NAS, Synology Drive, Nextcloud minimal)
- [x ] €1.500 – €3.000/anno (Google Workspace Business / Dropbox Business)
- [ ] €3.000 – €5.000/anno (M365 + servizi gestiti)
- [ ] > €5.000/anno (Tresorit, soluzioni enterprise)
- [ ] Da valutare in base al ROI

> Risposta:

---

### 15. Tempistiche
- Data go-live desiderata:
- Priorità: MVP rapido (3-6 settimane) **o** release completa (Q1-Q2 2026)?
- Eventi di business critici prima del go-live (es. apertura nuove commesse, audit)?

> Risposta: 1 mese 

---

### 16. Manutenzione post go-live
- Canone gestito SOLVA (support + evolutive + monitoring)?
- Oppure passaggio a IT interno / partner sistemistico del cliente?
- Livello SLA atteso (best effort / 8x5 / 24x7)?

> Risposta: Tutto gestito

---

## 📈 Crescita

### 17. Stima utenti a 24 mesi
- Oggi: 5 ufficio + 15 tecnici = 20 utenti
- A 12 mesi previsti: ___
- A 24 mesi previsti: ___

> Risposta: Statico

---

## 🎨 Deliverable & branding

### 18. Brand presentazioni e mockup
- Stile **SOLVA** (template SOLVA esistente, colori, logo)?
- Stile **doppio brand SOLVA + Bertaiola**?
- Hai un template Canva/PPT/Keynote SOLVA da usare? (se sì, indicare percorso o allegare)
- Palette colori e font preferiti:

> Risposta: Doppio brand, vorrei fosse un multitenant per rivenderlo in futuro

---

### 19. Mockup UI — schermate prioritarie
Conferma o modifica le 6 schermate proposte:
- [x ] Dashboard (panoramica commesse attive, scadenze, alert)
- [ x] Lista commesse (filtri, ricerca, stato)
- [x ] Dettaglio commessa con tab fasi (anagrafica, lavorazioni, documenti, foto, allegati, DICO)
- [x ] Upload foto cantiere (mobile, con tag fase e geo-tag)
- [x ] Ricerca documenti (full-text, filtri per cliente/anno/tipo)
- [ x] Notifiche / scadenze (push + email + in-app)

Aggiungere/rimuovere:

> Risposta:

---

### 20. Pubblico delle presentazioni
- PPT **executive**: per chi? (titolare, CDA, soci, consulente esterno)
- PPT **tecnica**: per chi? (titolare, ufficio tecnico, IT del cliente, partner sistemista)
- Tono preferito: divulgativo / tecnico / mix?
- Lingua: italiano (default) o anche EN?

> Risposta: Il pubblico è tecnico

---

## 📌 Note libere / altro

> Spazio libero per qualunque informazione utile non coperta sopra (vincoli, preferenze fornitori, esperienze pregresse negative, ecc.):
Suggerisci idee o soluzioni soprattutto per la parte di gestione dei file 
