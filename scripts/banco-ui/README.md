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
```

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
