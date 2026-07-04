# Split "cosa hai fatto oggi" a fine turno — design

**Stato**: DESIGN, da implementare (design a 4 casi già approvato con Luca).
**Gating**: modulo `kantiere` → Bertaiola-safe.
**⚠️ Tocca la paga**: sintetizza timbrature su DB di produzione → logica pura **unit-testata** prima di scrivere; validazione utente prima del merge.

## Problema
Un tecnico "assistenza" gira più cantieri in un giorno. Se **cambia cantiere live** (già fatto), le ore/km escono dai timestamp reali. Se **non** cambia live, alla chiusura va chiesto **cosa ha fatto** e diviso il tempo tra i cantieri.

## Regola di conteggio (vincolo ferreo)
`ricomputaRapportinoAuto` **ri-deriva SEMPRE le `rapportino_righe` dalle timbrature** (cancella + ricostruisce). Quindi lo split **non** può scrivere `rapportino_righe` (verrebbero sovrascritte): deve **sintetizzare segmenti timbrati** (coppie ingresso/uscita) che il ricalcolo poi trasforma nelle righe giuste. Approccio **additivo** (inserire i segmenti tra l'ingresso reale e l'uscita), mai delete distruttivo del reale.

## Quando compare il dialog (discriminatore = i confini provano dove è stato?)
| # | Inizio | Fine | Dialog split? |
|---|---|---|---|
| 1 | QR ingresso | **QR uscita, stesso cantiere** | **No** → riga unica (il QR uscita prova la presenza) |
| 2 | QR ingresso | Manuale (tasto termina) | **Sì** |
| 3 | Manuale | Manuale | **Sì** |
| 4 | Niente tutto il giorno | — (registra a posteriori) | **Sì** + chiede anche inizio/fine |

**Switch live**: se ha usato "Cambia cantiere", i segmenti esistono già → il dialog è **precompilato**, conferma e basta.

## UX (casi 2/3)
Alla chiusura manuale, dopo il box viaggio/pausa esistente:
> "Netti **H:MM** su {cantiere}. **Confermi tutto qui** oppure **dividi** tra più cantieri?"
- *Conferma tutto* → riga unica (nessuna sintesi), chiude come ora.
- *Dividi* → lista: aggiungi cantieri (usa il **picker** esistente) + ore per ciascuno (**al minuto**, input tap-and-type come modifica-giornata), contatore **"Restano X:MM"**; salva solo se **somma == netto**.

Il **netto** = `uscita − ingresso − pausa` (pausa esclusa; se turno lungo senza pausa timbrata → promemoria giallo esistente, mai persa).

## Sintesi segmenti (logica pura da unit-testare)
`calcolaSegmentiSplit({ ingressoIso, uscitaIso, pausaMin, split: [{cantiereId, minuti}] })` → righe timbratura da inserire.
- Segmenti **back-to-back** dai timestamp: `ingresso(c0)@ingressoIso`, `uscita(c0)@+m0`, `ingresso(c1)@+m0`, … `uscita(cN)@ingressoIso+Σm`.
- Il **primo** ingresso riusa quello **reale** esistente (già su c0 = cantiere del turno) → non si duplica.
- `origine='manuale'` per i segmenti sintetici.
- **Pausa**: coppia-pausa (`inserisciPausaDichiarata`/`coppiaPausaCentrata`) inserita nel gap `[ingressoIso+Σm, uscitaIso]` (la pausa è "dopo" il lavoro netto) **oppure** centrata — **DECISIONE APERTA** (vedi sotto).
- **Km**: per lo split retroattivo si **ignorano** (solo lo switch live calcola km). Coerente con "conta i km fatti durante la giornata" via switch.

## Caso 4 (registra giornata da zero)
Stesso dialog, ma prima chiede **inizio e fine** (non esistono timbrature) → poi cantieri + ore. Genera ingresso reale + segmenti. Opzionale: step successivo, minore di 2/3.

## Decisioni aperte (confermare prima di scrivere)
1. **Posizione pausa** nei segmenti sintetici: (a) gap alla fine `[Σm, uscita]` — semplice; (b) centrata nel giorno (una tratta perde la pausa). → *Reco (a)*: pausa come gap finale, non attribuita a nessun cantiere (le ore/cantiere restano = minuti dichiarati).
2. **Resto arrotondamento**: input al minuto, somma deve fare il netto esatto; se off-by-1 per arrotondamenti → l'**ultima riga assorbe il resto**. → *Reco: sì*.
3. **Caso 4** ora o step successivo. → *Reco: 2/3 prima, 4 dopo*.
4. **Etichetta km switch** ("Sede→cantiere" → "A→B"): richiede colonna `da_cantiere_id` su `timbratura_viaggio` (micro-migration). Accorpare qui o a parte.

## File coinvolti (previsti)
- `_actions/_lib/split-segmenti.ts` (nuovo, **puro + unit test**): `calcolaSegmentiSplit`.
- `_actions/kantiere-timbra.ts`: `terminaTurnoMio` accetta `split?`; se presente → valida somma == netto, sintetizza via helper, poi `ricomputaRapportinoAuto`.
- `_components/viaggio-ritorno-dialog.tsx` (o nuovo step): UI "confermi/dividi" + lista.
- Riuso: `CantierePicker`, `inserisciPausaDichiarata`, `coppiaPausaCentrata`.

## Test previsti (unit sulla logica pura)
- Somma durate == netto (con/ senza pausa).
- Chronologia strettamente crescente.
- Primo segmento riusa l'ingresso reale.
- Off-by-1 → ultima riga assorbe.
- Pausa nel gap corretto.
