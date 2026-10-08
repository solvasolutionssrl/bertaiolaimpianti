# Banco di prova — interfaccia

Guida un Chrome vero contro il server di sviluppo e **misura** le cose che a
occhio si notano solo «a volte»: la sidebar che si alza, il click che non fa
niente, il tasto troppo piccolo per un dito, la pagina che sborda.

Gira sui **tenant demo** (`DEMOK` commesse, `DEMOC` presenze), mai sui clienti
veri: i dati sono finti apposta e le credenziali stanno già in
`scripts/demo/create-demo-auth.mjs`.

## Come si lancia

```bash
# 1. server di sviluppo
cd apps/web && npx next dev -p 3010

# 2. banco (dalla radice del repo)
node scripts/banco-ui/desktop.mjs                 # ufficio, mondo presenze
BANCO_MONDO=kommessa node scripts/banco-ui/desktop.mjs   # ufficio, mondo commesse
node scripts/banco-ui/app.mjs                     # app tecnici, iPhone emulato
node scripts/banco-ui/registra-giornata.mjs       # Registra giornata col percorso (BANCO_SALVA=1 salva sul demo)
BANCO_CHI=tecnico node scripts/banco-ui/campanella.mjs   # niente testo sotto campanella e «＋ Spesa» (anche BANCO_CHI=kantiere)
node scripts/banco-ui/cronologia-a-mano.mjs      # cronologia di una giornata a mano senza timbrature (serve il seed demo)
node scripts/banco-ui/impostazioni.mjs           # Impostazioni Kantiere: sezioni, esempio dell'orario ordinario, validazione (non salva)
node scripts/banco-ui/lavoro-da-sede.mjs         # «Lavoro dalla sede sul progetto» in avvio e fine turno (BANCO_SALVA=1 avvia e chiude un turno sul demo)
node scripts/banco-ui/ore-quote.mjs              # quote delle ore nelle pagine ufficio (dopo registra-giornata con BANCO_SALVA=1)
node scripts/banco-ui/elenco-commesse.mjs        # l'elenco del tecnico: titolo, tab, ricerca, pastiglie, ordine, sbordo
node scripts/banco-ui/notifiche-preferenze.mjs   # la pagina notifiche governa qualcosa: la scelta resta dopo un ricaricamento
node scripts/banco-ui/condividi.mjs              # il dialog «Condividi il lavoro» si apre davvero e non è incollato al bordo
node scripts/banco-ui/tendine.mjs                # le tendine nei dialog: non tagliate, e scegliere non chiude il dialog (BANCO_MOBILE=1)
node scripts/banco-ui/riunione-tecnico.mjs       # un tecnico scrive una riunione con l’AI (BANCO_SALVA=1 salva sul demo: ripulire)
node scripts/banco-ui/richieste.mjs              # il giro dell’ufficio: telefonata → cliente nuovo → chi ci va → spunta → elimina (si ripulisce da solo)
node scripts/banco-ui/riunione-audio-corto.mjs   # mezzo secondo di registrazione: avviso calmo, non un popup di errore (microfono finto)
node scripts/banco-ui/zoom-foto.mjs              # una foto si guarda da vicino: rotellina, pizzicotto a due dita, doppio clic, tasti, il freno dello spostamento
node scripts/banco-ui/scheda-commessa.mjs        # la scheda vista da un utente UFFICIO: niente titolo doppio, e le note si salvano davvero (si ripulisce da solo)
```

## ⚠️ Il dito vero, e perché conta

`elemento.click()` **non è un clic**: è una chiamata al DOM, e ignora
`pointer-events`, ignora chi sta sopra, ignora `visibility`. Un pannello
spento da `pointer-events: none` — quello che Radix fa al `<body>` quando apre
un dialog modale — accetta `click()` e rifiuta il dito di una persona.

Il banco delle tendine ha dato **11 verdi per settimane** su una tendina che
nessuno riusciva a usare, e lo ha fatto così.

Dove si misura se una cosa **si può usare**, si usano questi, da `comune.mjs`:

| | |
|---|---|
| `clicVero(cdp, espressione)` | tocca davvero; se il dito finisce altrove lo **dice** («in quel punto risponde `<TEXTAREA>`») invece di fingere. Porta l’elemento in vista prima, come farebbe una persona |
| `scriviVero(cdp, testo)` | batte sulla tastiera; se il fuoco viene strappato, il testo non arriva — ed è ciò che si vuole misurare |
| `premiTasto(cdp, 'Escape')` | un tasto non stampabile |
| `chiHaIlFuoco(cdp, selettore)` | chi ha il cursore adesso, e se è dentro un dato recinto |
| `chiRiceveIlTocco(cdp, x, y)` | chi risponderebbe in quel punto: distingue «non funziona» da «c’è qualcosa davanti» |

E tre regole imparate sbagliando, tutte dentro questi banchi:

1. **Un controllo non deve SPARIRE quando non riesce a misurare.** In
   `elenco-commesse.mjs` un `if` saltava in silenzio il confronto fra gli
   spazi quando nessun blocco aveva due figli: venti verdi e di quello,
   niente. Ora, se non misura, lo dice.
2. **Non fotografare subito dopo il clic: aspettare.** La riga eliminata era
   già cancellata nel database e ancora a schermo, e il banco inventava un
   guasto.
3. **Guardare la cosa, non tutta la pagina.** «Il titolo non c’è più» falliva
   perché il titolo era nel dialog di conferma ancora aperto.

`BANCO_VISIBILE=1` apre il browser a schermo invece che di nascosto: serve
quando un controllo fallisce e si vuole vedere cosa succede.

Gli screenshot dei fallimenti finiscono in `scripts/banco-ui/esiti/`.

## Cosa controlla

### Ufficio (`desktop.mjs`)

| | |
|---|---|
| Sidebar | arriva sempre in fondo alla finestra, su ogni pagina |
| Finestra bassa | a 520px di altezza nessuna pagina fa scrollare la finestra |
| Voci di menu | ogni voce naviga davvero, e si misura quanto ci mette |
| Attesa | entro mezzo secondo dal click c'è un segno visibile |
| Dati vivi | la dashboard dichiara di aggiornarsi ogni minuto |
| Tasti | tutti hanno un nome leggibile e una superficie decente |
| Dialog | si aprono, si chiudono con Esc, e non lasciano il velo grigio |
| Console | nessun errore JavaScript per strada |

### App (`app.mjs`)

| | |
|---|---|
| Larghezza | nessuna pagina sborda di lato |
| Barra dei tab | arrivati in fondo non resta niente coperto |
| Cambio pagina | ogni tab risponde, e si misura quanto ci mette |
| Tasti | nessuno sotto i 40px: sotto quella misura un dito sbaglia |
| Dati vivi | quali pagine si aggiornano da sole |

## Tre trappole imparate costruendolo

**1. `h-full` sulla sidebar era il difetto, non la cura.** `h-full` vuol dire
«il 100% del genitore»: finché il genitore non ha un'altezza già risolta —
durante l'idratazione, o mentre la pagina arriva a pezzi — quel 100% cade
sull'altezza del contenuto e la sidebar viene su corta. Poi si sistema da sola,
ed è per questo che il difetto sembrava capitare a caso. Lo stiramento del flex
(`self-stretch`) non dipende da un numero.

**2. Gli `sr-only` sfuggono a `overflow: hidden`.** Tailwind li rende
`position: absolute`; se sopra non c'è nessun elemento posizionato, il loro
contenitore diventa il documento e **non vengono ritagliati**. Con una pagina
lunga il documento si allunga, la finestra scrolla e la sidebar scorre via.
Bastava un `relative` sulla shell. Si vede solo dove il contenuto è abbastanza
lungo: da qui l'intermittenza.

**3. In emulazione la tacca non esiste.** `env(safe-area-inset-*)` vale zero, e
gli spazi in alto e in basso sembrano perfetti anche quando non lo sono. Il
banco li rimette a mano (59px sopra, 34px sotto) prima di misurare.

## Cosa NON prova

È Chrome che si finge un iPhone, non Safari. Restano fuori le stranezze vere di
WebKit: il comportamento della tastiera, la sospensione quando l'app va in
secondo piano, il ritorno da schermo bloccato. Quelle vanno viste su un telefono
in mano.

### Area upload (`upload-ui.mjs`)

Misura le cose dell'area caricamento che si vedono solo col dito:

```bash
node scripts/banco-upload/prova.mjs   # genera i file di prova (la prima volta)
node scripts/banco-ui/upload-ui.mjs
```

| | |
|---|---|
| X per togliere un file | almeno 40px di bersaglio, e visibile senza passarci sopra col mouse |
| Anteprima | il file selezionato si vede davvero (non un riquadro rotto) |

Gira sulla pagina dev `/prova-upload` (404 in produzione): niente login,
niente dati veri. Lo screenshot finisce in `esiti/`.
