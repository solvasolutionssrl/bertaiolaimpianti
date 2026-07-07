# Permessi e ferie — normativa italiana (catalogo per il modulo Dipendenti)

**Versione**: 1.0
**Stato**: riferimento
**Data**: 07/07/2026
**Uso**: base per il catalogo tipi (`PERMESSO_TIPI`) del modulo Dipendenti → Ferie e permessi (Fase 2). Contesto: PMI impiantistica, forza lavoro mista (operai/tecnici + impiegati), riferimento CCNL Metalmeccanico (industria e artigianato). Dati aggiornati 2025-2026.

> **I monte-ore/giorni del CCNL (ferie 4 sett., ROL 72 h, ex-festività 32 h, matrimonio 15 gg, ecc.) vanno resi parametrici per contratto/livello/anzianità — NON hardcodarli.** Differiscono tra industria e artigianato e cambiano coi rinnovi.

**Legenda "retribuito"**: `Sì (azienda)` = a carico datore · `Sì (INPS)` = indennità INPS anticipata in busta dal datore e conguagliata · `Sì (INAIL)` · `Parziale` = percentuale/quota · `No` = non retribuito (spesso conserva il posto e talvolta la contribuzione figurativa).

---

## 1. Tabella completa dei tipi

| codice | etichetta | descrizione | unità | retribuito | giustificativo | note |
|---|---|---|---|---|---|---|
| `ferie` | Ferie | Riposo annuale retribuito | Giorni (frazionabili a mezze giornate) | Sì (azienda) | No (solo approvazione) | Metalmecc.: 4 settimane/anno (~160 h). Ratei mensili. Piano ferie; almeno 2 settimane continuative. |
| `rol` | Permessi ROL | Riduzione orario di lavoro: monte ore individuale | Ore (frazionabili) | Sì (azienda) | No | Metalmecc.: 72 h/anno (~6 h/mese). Se non goduti, di norma pagati o riportati. |
| `par_ex_festivita` | Permessi ex-festività (PAR) | Ore sostitutive delle festività abolite | Ore (frazionabili) | Sì (azienda) | No | Metalmecc.: 32 h/anno (4 gg). Spesso ROL+ex-festività gestiti come "PAR" fino a ~104 h/anno. |
| `permesso_retribuito` | Permesso retribuito | Permesso a ore per motivi previsti da legge/CCNL o banca ore | Ore | Sì (azienda) | Dipende dal motivo | Contenitore per permessi brevi giustificati. |
| `permesso_non_retribuito` | Permesso non retribuito | Assenza breve autorizzata senza retribuzione | Ore o giorni | No | Autorizzazione datore | Quando esauriti ferie/ROL. Trattenuta in busta. |
| `recupero_banca_ore` | Recupero / banca ore | Fruizione di ore accantonate da straordinario | Ore | Sì (già maturato) | No | Solo con accordo di banca ore. |
| `malattia` | Malattia | Assenza per patologia non professionale | Giorni | Sì (INPS + integrazione CCNL) | Sì: certificato telematico (protocollo); reperibilità | Carenza primi 3 gg spesso azienda, poi INPS. Attenzione al periodo di comporto. |
| `visita_medica` | Visita medica / prestazione specialistica | Assenza per visita, esame o cura | Ore o giorno | Dipende (malattia oraria o ROL/permesso) | Sì: attestazione struttura con data/ora | Rendere configurabile (spesso imputata su ROL). |
| `infortunio` | Infortunio sul lavoro / malattia professionale | Assenza per infortunio o tecnopatia | Giorni | Sì (INAIL + integrazione CCNL; giorno evento 100% azienda) | Sì: certificato/PS; denuncia INAIL del datore | INAIL 60% dal 4° gg, 75% dopo il 90°. Denuncia obbligatoria del datore. |
| `permesso_104` | Permesso Legge 104 (assistenza) | Assistenza a familiare con disabilità grave | 3 giorni/mese (o 2 h/giorno), frazionabili | Sì (INPS, anticipata dal datore) | Sì: verbale gravità (una tantum) + domanda INPS; referente unico | Non goduto non si cumula. Dal 2026 +10 h/anno per visite/cure. |
| `permesso_104_self` | Permesso Legge 104 (lavoratore disabile) | Il lavoratore disabile grave per sé | 3 giorni/mese oppure 2 h/giorno | Sì (INPS) | Sì: proprio verbale L.104 | Alternativa giorni/ore. |
| `congedo_straordinario_104` | Congedo straordinario biennale (art. 42 D.Lgs 151) | Assistenza continuativa a familiare disabile grave convivente | Giorni interi | Sì (INPS, = ultima retribuzione entro tetto) | Sì: verbale L.104 + parentela/convivenza | Max 2 anni nella vita lavorativa. Contribuzione figurativa. |
| `maternita_obbligatoria` | Congedo di maternità obbligatorio | Astensione obbligatoria pre/post parto | ~5 mesi | Sì (INPS 80% + integrazione CCNL) | Sì: certificato + domanda INPS | 2 mesi prima + 3 dopo (o flessibilità). |
| `paternita_obbligatoria` | Congedo di paternità obbligatorio | Astensione del padre per nascita | 10 giorni (20 se plurimo) | Sì (INPS 100%) | Sì: comunicazione + domanda INPS | Da 2 mesi prima a 5 mesi dopo, anche frazionato. |
| `congedo_parentale` | Congedo parentale (facoltativo) | Astensione facoltativa per cura del figlio | Giorni o ore | Parziale (INPS) | Sì: domanda INPS + preavviso | Max 10-11 mesi di coppia. 2025: 3 mesi 80%, poi 30%. Dal 2026 fino a 14 anni. |
| `malattia_figlio` | Congedo per malattia del figlio | Assenza per malattia del bambino | Giorni | No (0-3 anni; alcuni CCNL prevedono quote) | Sì: certificato pediatra | Illimitato fino a 3 anni; 5 gg/anno da 3 a 8 anni. |
| `allattamento_riposi` | Riposi giornalieri (allattamento) | Permessi orari nel 1° anno del figlio | 1-2 h/giorno | Sì (INPS) | Sì: domanda; età figlio | 2 h/giorno (1 h se orario < 6 h); raddoppiati per gemelli. |
| `congedo_matrimoniale` | Congedo matrimoniale | Assenza per matrimonio/unione civile | 15 giorni consecutivi | Sì (azienda, da CCNL) | Sì: certificato di matrimonio | Metalmecc.: 15 gg; entro pochi giorni dall'evento. |
| `lutto` | Permesso per lutto / grave infermità (art. 4 L.53/2000) | Decesso o grave infermità di coniuge/parente entro 2° grado/convivente | 3 giorni/anno | Sì (azienda) | Sì: certificato di morte; medico per grave infermità | Entro 7 gg dall'evento. |
| `donazione_sangue` | Permesso donazione sangue | Astensione per la giornata della donazione | 1 giorno | Sì (INPS, anticipata dal datore) | Sì: certificazione centro trasfusionale (min. 250 g) | Solo giornata effettiva. Contribuzione figurativa. |
| `donazione_midollo` | Permesso donazione midollo osseo | Accertamenti, prelievo e convalescenza | Ore + giorni | Sì (INPS; rimborso al datore) | Sì: certificazione struttura | Copre atti preliminari, degenza, convalescenza. |
| `diritto_studio` | Permessi diritto allo studio (150 ore) | Frequenza corsi/esami per lavoratori studenti | Ore (fino a 150 h) | Sì (azienda, da CCNL) | Sì: iscrizione + attestati | Tipicamente 150 h nel triennio, con % max in contemporanea. |
| `permesso_esami` | Permesso per esami | Sostenimento di esami | Giorni | Sì (azienda, da CCNL) | Sì: attestato di presenza | Spesso incluso nei permessi studio. |
| `permesso_elettorale` | Permesso elettorale (seggio) | Componente di seggio | Giorni | Sì (azienda; festivi → riposo compensativo) | Sì: attestato di partecipazione | Riguarda chi opera al seggio, non il voto. |
| `carica_pubblica` | Permesso / aspettativa per cariche pubbliche | Amministratori locali e mandati elettivi | Ore (permessi) o mesi/anni (aspettativa) | Permessi Sì (azienda); aspettativa No | Sì: attestazione ente | Amministratori locali: fino 24 h/mese (48 per sindaci). |
| `permesso_sindacale` | Permesso sindacale | Mandato RSU/RSA e cariche sindacali | Ore/giorni | Sì (azienda, nei limiti) | Sì: comunicazione sindacale | Monte ore per dimensione azienda. Esiste anche non retribuito (art. 24). |
| `aspettativa_non_retribuita` | Aspettativa non retribuita | Sospensione per motivi personali | Giorni/mesi | No | Dipende (motivata) | Conserva il posto; non matura ferie/TFR salvo diverse previsioni. |
| `congedo_gravi_motivi_familiari` | Congedo per gravi e documentati motivi familiari (art. 4 L.53/2000) | Situazioni gravi in famiglia | Fino a 2 anni | No | Sì: documentazione | Conserva il posto; non retribuito. Distinto dal lutto. |
| `congedo_formazione` | Congedo per la formazione (art. 5 L.53/2000) | Formazione non aziendale | Fino a 11 mesi | No | Sì: iscrizione al percorso | Anzianità minima ~5 anni. Aspettativa senza assegni. |
| `congedo_vittime_violenza` | Congedo per donne vittime di violenza di genere | Percorso di protezione certificato | Fino a 3 mesi (giorni o ore, entro 3 anni) | Sì (INPS 100%) | Sì: certificazione servizi/percorso | 90 gg lavorativi; a ore o giorni. |
| `sciopero` | Sciopero | Astensione collettiva | Ore o giorni | No | No (adesione) | Diritto costituzionale. Tracciare per la busta. |

---

## 2. Raccomandazione per il software

**Catalogo v1 (default consigliato per una PMI impiantistica)** — alta frequenza, coprono >95% delle richieste reali:
`ferie`, `rol`, `par_ex_festivita`, `permesso_non_retribuito`, `permesso_retribuito`, `malattia`, `infortunio`, `visita_medica`, `permesso_104`, `lutto`, `congedo_matrimoniale`, `donazione_sangue`, `paternita_obbligatoria`, `maternita_obbligatoria`, `congedo_parentale`, `permesso_elettorale`.

**Opzionali / fase successiva** (nel catalogo master ma disattivati di default, per non ingombrare la UI del tecnico): `permesso_104_self`, `congedo_straordinario_104`, `malattia_figlio`, `allattamento_riposi`, `diritto_studio`/`permesso_esami`, `donazione_midollo`, `permesso_sindacale`, `carica_pubblica`, `aspettativa_non_retribuita`, `congedo_gravi_motivi_familiari`, `congedo_formazione`, `congedo_vittime_violenza`, `sciopero`, `recupero_banca_ore`.

**Modello dati — giorni vs ore**: memorizzare sempre la durata in un'unità atomica unica (minuti o ore decimali) per uniformare calcoli/report. Sul tipo tenere: `unita_default` (`giorni`|`ore`), `frazionabile`, `consente_ore`/`consente_giorni`, `retribuito` (azienda/inps/inail/parziale/no), `richiede_giustificativo`, `ha_tetto` + `tetto_valore/periodo` (es. 104 = 3 gg/mese; lutto = 3 gg/anno), `preavviso_min`, `incide_su_monte_ore` (ferie/ROL scalano un saldo; malattia/104 no). Append-only sul catalogo (come le tipologie commessa) → nessuna migrazione distruttiva per aggiungere tipi.

## 3. Fonti principali
CCNL Metalmeccanico ROL/ex-festività/PAR: lexplain.it, pmi.it, dipendenti.it, businessonline.it · Ferie: lexplain.it · L.104: INPS, ticonsiglio.com, legge104.it, bustaia.it (novità 2026) · Congedo straordinario art.42: INPS, fiscoetasse.com, brocardi.it · Maternità: INPS, ticonsiglio.com, cgil.it · Paternità: INPS · Congedo parentale 2025-26: confcommercio.it, altalex.com, INPS · Lutto/gravi motivi/matrimonio art.4 L.53/2000: fitcisl.org, unidprofessional.com, handylex.org, famiglia.governo.it · Formazione art.5 + 150 ore: medicoeleggi.com, appmynet.it · Donazioni: wikilabour.it, INPS · Elettorali: cgil.it, fiscoetasse.com · Sindacali/cariche art.23-24 L.300/70: wikilabour.it, geps.it, contrattometalmeccanici.it.
