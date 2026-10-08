'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { FocusScope } from '@radix-ui/react-focus-scope';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@kommessa/ui';
import {
  filtraOpzioni,
  primoIndiceUtile,
  prossimoIndice,
  raggruppaOpzioni,
  type OpzioneScelta,
} from '@kommessa/api/scelta-opzioni';

/**
 * Menu a tendina con ricerca — **`Scelta`** (una) e **`SceltaMultipla`** (più
 * d'una).
 *
 * Sostituisce il `<select>` di sistema dove l'elenco è lungo. Assegnare un task
 * a una delle trenta persone dell'azienda con la tendina nativa vuol dire
 * scorrere a occhio un muro di nomi; su iPhone vuol dire la ruota, che è
 * peggio. Qui si scrive due lettere e si trova.
 *
 * Il `<select>` nativo resta la cosa giusta dove le voci sono **poche e
 * stabili** (un sì/no, quattro stati, tre tipi): lì la tendina di sistema è più
 * veloce di qualunque cosa possiamo disegnare, e non va sostituita per
 * simmetria. La soglia pratica è intorno alla decina di voci.
 *
 * ## Quattro regole che vengono da bug veri
 *
 * 1. ⚠️ **L'elenco è un Portal su `document.body`, marcato
 *    `SEGNO_PANNELLO`.** Le due cose insieme, e nessuna da sola: un overlay
 *    in-flow viene **tagliato** (`DialogContent` ha `overflow-y-auto` *e* una
 *    `transform`, e una trasformazione taglia anche un `position: fixed`), ma
 *    un Portal non marcato viene letto da Radix come clic «fuori» e chiude il
 *    dialog sotto.
 * 2. ⚠️ **Dentro un dialog il Portal da solo non basta**, e per settimane non
 *    è bastato: un dialog modale Radix spegne i puntatori su tutto il
 *    `<body>` (`pointer-events: none`) e li riaccende **solo** nel proprio
 *    recinto. Il pannello si vedeva e il dito lo attraversava, colpendo il
 *    campo che stava sotto. Quindi: `pointerEvents: 'auto'` esplicito, e un
 *    `FocusScope` che mette in **pausa** la gabbia del fuoco del dialog —
 *    senza, il cursore nella casella di ricerca viene strappato all'istante.
 * 3. **La casella di ricerca compare solo quando serve** (oltre
 *    `SOGLIA_RICERCA` voci). Sotto, una casella vuota in cima è solo un
 *    ostacolo fra il dito e la voce da toccare.
 * 4. **Le frecce scavalcano le voci spente** invece di fermarcisi sopra: una
 *    freccia che non muove niente sembra un tasto rotto.
 *
 * ⚠️ **Un banco che sceglie con `elemento.click()` non misura niente di tutto
 * questo**: una chiamata al DOM ignora `pointer-events`. Il banco
 * `scripts/banco-ui/tendine.mjs` dava undici verdi su una tendina che nessuno
 * riusciva a usare. Si misura col dito vero (`clicVero`, `scriviVero`).
 *
 * La meccanica di ricerca — token su più campi, accenti piegati, chi comincia
 * con quello che hai scritto davanti — sta in `@kommessa/api/scelta-opzioni`,
 * pura e testata.
 */

export type { OpzioneScelta };

/** Oltre questo numero di voci compare la casella di ricerca. */
const SOGLIA_RICERCA = 8;

/** Quante pastiglie si vedono nel tasto prima di riassumere con «+n». */
const CHIP_VISIBILI = 2;

interface BaseProps {
  opzioni: readonly OpzioneScelta[];
  /** Cosa si legge nel tasto quando non è stato scelto niente. */
  segnaposto?: string;
  /** Testo della casella di ricerca. */
  segnapostoRicerca?: string;
  /** Cosa si legge quando la ricerca non trova niente. */
  nessunRisultato?: string;
  disabilitato?: boolean;
  className?: string;
  /** Larghezza dell'elenco. Default: come il tasto. */
  larghezzaElenco?: 'tasto' | 'auto';
  'aria-label'?: string;
  id?: string;
}

// ── il guscio: tasto + overlay, logica di apertura e tastiera ───────────────

/**
 * Il segno che marca il pannello della tendina ovunque finisca nel documento.
 *
 * Serve a due cose che senza di lui si romperebbero a vicenda:
 *  - a questo componente, per non chiudersi quando si clicca dentro il proprio
 *    elenco (che dal punto di vista del DOM e' «fuori» dal tasto);
 *  - al dialog che lo contiene, per non chiudersi **lui** credendo che sia un
 *    clic fuori. Vedi `packages/ui/.../dialog.tsx`.
 */
export const SEGNO_PANNELLO = 'data-popover-portale';

function useChiudiSuClicFuori(
  aperto: boolean,
  chiudi: () => void,
): React.RefObject<HTMLDivElement> {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!aperto) return;
    function suClic(e: MouseEvent | TouchEvent) {
      const bersaglio = e.target as HTMLElement | null;
      // ⚠️ Il pannello vive su `document.body`, non dentro il tasto: senza
      // questa riga ogni clic su una voce sarebbe «fuori», la tendina si
      // chiuderebbe prima della scelta e non si potrebbe selezionare niente.
      if (bersaglio?.closest?.(`[${SEGNO_PANNELLO}]`)) return;
      if (ref.current && !ref.current.contains(bersaglio as Node)) chiudi();
    }
    // `mousedown` e non `click`: così la tendina si chiude prima che il clic
    // raggiunga quello che c'è sotto, e non si perde il primo tocco.
    document.addEventListener('mousedown', suClic);
    document.addEventListener('touchstart', suClic);
    return () => {
      document.removeEventListener('mousedown', suClic);
      document.removeEventListener('touchstart', suClic);
    };
  }, [aperto, chiudi]);
  return ref;
}

/** L'altezza massima dell'elenco più un margine di cortesia. */
const ALTEZZA_ELENCO = 280;

export interface PosizionePannello {
  /** Coordinate di finestra: il pannello è `fixed`, non dentro la pagina. */
  top: number;
  left: number;
  larghezza: number;
  versoAlto: boolean;
}

/**
 * Dove disegnare il pannello.
 *
 * ⚠️ **Perché il pannello non può più stare accanto al tasto.**
 * Prima era `position: absolute` dentro il tasto, e dentro un dialog veniva
 * **tagliato**: `DialogContent` ha `overflow-y-auto` (per i moduli lunghi) e
 * una `transform` per centrarsi. Quell'accoppiata è una trappola nota: il
 * primo taglia tutto ciò che sborda, e il secondo impedisce persino a un
 * `position: fixed` di uscirne, perché una trasformazione rende l'elemento il
 * riferimento dei discendenti fissi. Quindi l'elenco delle persone finiva
 * mozzato a metà, su desktop e su telefono.
 *
 * L'unica uscita è portare il pannello su `document.body` e posizionarlo a
 * mano. Da lì nessun antenato lo taglia — al prezzo di dover ricalcolare le
 * coordinate quando qualcosa si muove, che è ciò che fa l'effetto qui sotto.
 */
// ⚠️ Il nome deve cominciare per `use`, anche se tutto il resto del file è in
// italiano: la regola `react-hooks/rules-of-hooks` riconosce un hook dal nome,
// e `usaPosizione` faceva fallire la compilazione. Non è una preferenza di
// stile, è l'unico modo che ha il controllo per sapere che qui dentro si
// possono chiamare gli hook.
function usePosizione(
  aperto: boolean,
  ref: React.RefObject<HTMLElement>,
): PosizionePannello | null {
  const [pos, setPos] = React.useState<PosizionePannello | null>(null);

  React.useEffect(() => {
    if (!aperto) {
      setPos(null);
      return;
    }
    const calcola = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const sotto = window.innerHeight - r.bottom;
      // Una tendina che esce dallo schermo costringe a scorrere mentre si
      // sceglie, e dentro un dialog spesso non si può proprio.
      const versoAlto = sotto < ALTEZZA_ELENCO && r.top > sotto;
      setPos({
        top: versoAlto ? r.top : r.bottom,
        left: r.left,
        larghezza: r.width,
        versoAlto,
      });
    };
    calcola();

    // `capture: true` perché a scorrere è quasi sempre il corpo del dialog,
    // non la finestra: senza, il pannello resterebbe fermo mentre il tasto si
    // sposta sotto di lui.
    window.addEventListener('scroll', calcola, true);
    window.addEventListener('resize', calcola);
    return () => {
      window.removeEventListener('scroll', calcola, true);
      window.removeEventListener('resize', calcola);
    };
  }, [aperto, ref]);

  return pos;
}

function TastoTendina({
  children,
  aperto,
  disabilitato,
  onClick,
  onKeyDown,
  vuoto,
  className,
  idElenco,
  ...aria
}: {
  children: React.ReactNode;
  aperto: boolean;
  disabilitato?: boolean;
  vuoto: boolean;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  className?: string;
  /** Id dell'elenco che questo tasto comanda: serve ai lettori di schermo. */
  idElenco: string;
  id?: string;
  'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      role="combobox"
      aria-expanded={aperto}
      aria-controls={idElenco}
      aria-haspopup="listbox"
      disabled={disabilitato}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        'flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-2.5 text-left',
        // 36px in ufficio (densità professionale), 44 sotto il dito.
        'min-h-[36px] py-1 text-sm max-sm:min-h-[44px]',
        'transition focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-60',
        aperto && 'ring-2 ring-ring ring-offset-1',
        vuoto && 'text-muted-foreground',
        className,
      )}
      {...aria}
    >
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {children}
      </span>
      <ChevronDown
        aria-hidden="true"
        className={cn(
          'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
          aperto && 'rotate-180',
        )}
      />
    </button>
  );
}

function Elenco({
  opzioni,
  query,
  setQuery,
  attivo,
  setAttivo,
  scegli,
  eSelezionata,
  multipla,
  posizione,
  larghezza,
  segnapostoRicerca,
  nessunRisultato,
  idElenco,
  piede,
  onTastiera,
}: {
  opzioni: OpzioneScelta[];
  query: string;
  setQuery: (s: string) => void;
  attivo: number;
  setAttivo: (n: number) => void;
  scegli: (o: OpzioneScelta) => void;
  eSelezionata: (v: string) => boolean;
  multipla: boolean;
  posizione: PosizionePannello | null;
  larghezza: 'tasto' | 'auto';
  segnapostoRicerca: string;
  nessunRisultato: string;
  idElenco: string;
  piede?: React.ReactNode;
  onTastiera: (e: React.KeyboardEvent) => void;
}) {
  const conRicerca = opzioni.length > SOGLIA_RICERCA || query.length > 0;
  const rifLista = React.useRef<HTMLDivElement>(null);
  const rifRicerca = React.useRef<HTMLInputElement>(null);
  const rifPannello = React.useRef<HTMLDivElement>(null);

  /**
   * ⚠️ **La rotellina dentro un dialog modale.**
   *
   * Radix blocca lo scorrimento della pagina mentre un dialog e' aperto, e lo
   * fa con `react-remove-scroll`, che mette un ascoltatore di `wheel` su
   * `document` e **annulla** ogni evento che non venga da dentro il dialog.
   * Il pannello sta su `body`, quindi e' «fuori»: l'elenco si poteva scorrere
   * solo trascinando la barra di lato.
   *
   * La via d'uscita prevista dalla libreria sono gli `shards`, che pero' li
   * passa Radix e non sono raggiungibili da qui. Allora si ferma l'evento
   * **prima** che arrivi a `document`: il percorso e' pannello → body → html
   * → document, e uno `stopPropagation` sul pannello lo toglie di mezzo. Il
   * browser scorre da solo, come farebbe senza nessun dialog.
   *
   * ⚠️ Ascoltatore **nativo** e non `onWheel` di React: un Portal fuori dalla
   * radice fa dipendere la propagazione da come React aggancia gli eventi al
   * contenitore, ed e' un dettaglio su cui non vale la pena scommettere.
   * ⚠️ `passive: false` anche se non si chiama `preventDefault`: senza, il
   * browser puo' trattarlo come passivo e ignorare il nostro intervento.
   *
   * `touchmove` per lo stesso motivo, sul telefono.
   */
  React.useEffect(() => {
    const el = rifPannello.current;
    if (!el) return;
    const fermaQui = (e: Event) => e.stopPropagation();
    el.addEventListener('wheel', fermaQui, { passive: false });
    el.addEventListener('touchmove', fermaQui, { passive: false });
    return () => {
      el.removeEventListener('wheel', fermaQui);
      el.removeEventListener('touchmove', fermaQui);
    };
  }, [posizione]);

  // Tiene la voce attiva dentro la finestra visibile mentre si scorre con le
  // frecce. `block: 'nearest'` muove il minimo indispensabile: uno scatto al
  // centro a ogni freccia dà il voltastomaco.
  React.useEffect(() => {
    const el = rifLista.current?.querySelector<HTMLElement>(
      `[data-indice="${attivo}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [attivo]);

  const gruppi = raggruppaOpzioni(opzioni);
  let indice = -1;

  // Il pannello esce dal documento della pagina: vedi `usePosizione`.
  if (!posizione) return null;

  const pannello = (
    <div
      ref={rifPannello}
      {...{ [SEGNO_PANNELLO]: '' }}
      // La tastiera sta **anche** qui, non solo sul tasto: quando il cursore è
      // nella casella di ricerca il tasto non ha più il fuoco, e senza questa
      // riga le frecce e Invio non muovono niente. Gli eventi di un Portal
      // risalgono l'albero di React, non quello del documento, e il pannello è
      // un fratello del tasto: non lo raggiungerebbero mai.
      onKeyDown={onTastiera}
      style={{
        position: 'fixed',
        top: posizione.versoAlto ? undefined : posizione.top + 4,
        bottom: posizione.versoAlto
          ? Math.max(0, window.innerHeight - posizione.top) + 4
          : undefined,
        left: posizione.left,
        width: larghezza === 'tasto' ? posizione.larghezza : undefined,
        minWidth: larghezza === 'tasto' ? undefined : posizione.larghezza,
        // Sopra il dialog (`z-50`) e sopra la barra in basso della PWA.
        zIndex: 100,
        // ⚠️ Un dialog modale Radix mette `pointer-events: none` sul `<body>`
        // e li riaccende solo dentro di sé. Il pannello sta su `body`, quindi
        // senza questa riga si vede e **il dito ci passa attraverso**,
        // colpendo il campo che sta sotto. Misurato: `elementFromPoint` sul
        // centro di una voce restituiva la `<textarea>` della descrizione.
        pointerEvents: 'auto',
      }}
      className="overflow-hidden rounded-md border border-border bg-popover shadow-lg"
    >
      {conRicerca ? (
        <div className="flex items-center gap-1.5 border-b border-border px-2">
          <Search aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            // ⚠️ Niente `autoFocus` di React: il fuoco lo dà il `FocusScope`
            // qui sotto, **dopo** essersi messo in cima alla pila. Al
            // contrario, l'autoFocus di React arriva prima, la gabbia del
            // dialog è ancora attiva e strappa via il cursore.
            ref={rifRicerca}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={segnapostoRicerca}
            aria-label={segnapostoRicerca}
            aria-controls={idElenco}
            className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Cancella la ricerca"
              className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        ref={rifLista}
        id={idElenco}
        role="listbox"
        aria-multiselectable={multipla || undefined}
        className="max-h-[260px] overflow-y-auto overscroll-contain py-1"
      >
        {opzioni.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">{nessunRisultato}</p>
        ) : (
          gruppi.map((g) => (
            <div key={g.gruppo ?? '—'}>
              {g.gruppo ? (
                <p className="px-2.5 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.gruppo}
                </p>
              ) : null}
              {g.opzioni.map((o) => {
                indice += 1;
                const i = indice;
                const scelta = eSelezionata(o.valore);
                return (
                  <button
                    key={o.valore}
                    type="button"
                    role="option"
                    aria-selected={scelta}
                    data-indice={i}
                    disabled={o.disabilitata}
                    onMouseEnter={() => !o.disabilitata && setAttivo(i)}
                    onClick={() => !o.disabilitata && scegli(o)}
                    className={cn(
                      'flex w-full items-center gap-2 px-2.5 text-left transition',
                      'min-h-[34px] py-1 max-sm:min-h-[44px]',
                      i === attivo && 'bg-accent/10',
                      o.disabilitata && 'cursor-not-allowed opacity-45',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center',
                        multipla && 'rounded border border-input',
                        multipla && scelta && 'border-primary bg-primary text-primary-foreground',
                      )}
                      aria-hidden="true"
                    >
                      {scelta ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{o.etichetta}</span>
                      {o.dettaglio ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {o.dettaglio}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
      {piede}
    </div>
  );

  // ⚠️ `document.body` e non un contenitore nostro: un portale dentro il
  // dialog sarebbe di nuovo dentro il riquadro che taglia. E il pannello si
  // marca con `SEGNO_PANNELLO`, altrimenti il dialog che lo contiene legge il
  // clic su una voce come un clic fuori e si chiude.
  //
  // ⚠️ Il `FocusScope` **non serve a intrappolare** (`trapped` resta falso):
  // serve al solo fatto di esistere. Montandosi si mette in cima alla pila dei
  // fuochi di Radix, e questo **mette in pausa** la gabbia del dialog, che
  // altrimenti riporterebbe il cursore dentro di sé appena tocca la casella di
  // ricerca. Smontandosi la riattiva e restituisce il fuoco al tasto.
  //
  // Il fuoco iniziale lo decidiamo noi: nella casella di ricerca se c'è,
  // altrimenti **da nessuna parte** — il tasto lo tiene, e le frecce
  // continuano a funzionare da lì. Lasciando fare a Radix, senza casella il
  // fuoco finirebbe sulla prima voce, e il segno di «voce attiva» (che qui è
  // uno stato nostro, non il fuoco) racconterebbe un'altra storia.
  const dentroPortale = (
    <FocusScope
      asChild
      trapped={false}
      onMountAutoFocus={(e) => {
        e.preventDefault();
        if (conRicerca) rifRicerca.current?.focus({ preventScroll: true });
      }}
    >
      {pannello}
    </FocusScope>
  );

  return typeof document === 'undefined'
    ? null
    : createPortal(dentroPortale, document.body);
}

/** Logica condivisa fra scelta singola e multipla. */
function useTendina(opzioni: readonly OpzioneScelta[]) {
  const [aperto, setAperto] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [attivo, setAttivo] = React.useState(-1);

  const visibili = React.useMemo(
    () => filtraOpzioni(opzioni, query),
    [opzioni, query],
  );

  const chiudi = React.useCallback(() => {
    setAperto(false);
    setQuery('');
    setAttivo(-1);
  }, []);

  const guscio = useChiudiSuClicFuori(aperto, chiudi);
  const posizione = usePosizione(aperto, guscio);

  // Ogni volta che l'elenco visibile cambia, la voce attiva torna alla prima
  // utile: altrimenti dopo aver digitato si resterebbe puntati su un indice
  // che ora corrisponde a un'altra persona.
  React.useEffect(() => {
    if (aperto) setAttivo(primoIndiceUtile(visibili));
  }, [aperto, visibili]);

  return {
    aperto,
    setAperto,
    query,
    setQuery,
    attivo,
    setAttivo,
    visibili,
    chiudi,
    guscio,
    posizione,
  };
}

function tastieraElenco({
  e,
  aperto,
  apri,
  chiudi,
  attivo,
  setAttivo,
  visibili,
  conferma,
}: {
  e: React.KeyboardEvent;
  aperto: boolean;
  apri: () => void;
  chiudi: () => void;
  attivo: number;
  setAttivo: (n: number) => void;
  visibili: OpzioneScelta[];
  conferma: (o: OpzioneScelta) => void;
}): void {
  if (!aperto) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      apri();
    }
    return;
  }
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      setAttivo(prossimoIndice(visibili, attivo, 1));
      break;
    case 'ArrowUp':
      e.preventDefault();
      setAttivo(prossimoIndice(visibili, attivo, -1));
      break;
    case 'Home':
      e.preventDefault();
      setAttivo(primoIndiceUtile(visibili));
      break;
    case 'End':
      e.preventDefault();
      setAttivo(prossimoIndice(visibili, visibili.length, -1));
      break;
    case 'Enter': {
      e.preventDefault();
      const o = visibili[attivo];
      if (o && !o.disabilitata) conferma(o);
      break;
    }
    case 'Escape':
      e.preventDefault();
      chiudi();
      break;
    default:
      break;
  }
}

// ── scelta singola ──────────────────────────────────────────────────────────

export interface SceltaProps extends BaseProps {
  valore: string | null;
  onCambia: (valore: string | null) => void;
  /** Voce «nessuno» in cima. Assente = la scelta è obbligatoria. */
  etichettaNessuno?: string;
}

export function Scelta({
  opzioni,
  valore,
  onCambia,
  segnaposto = 'Scegli…',
  segnapostoRicerca = 'Cerca…',
  nessunRisultato = 'Nessun risultato.',
  etichettaNessuno,
  disabilitato,
  className,
  larghezzaElenco = 'tasto',
  id,
  ...aria
}: SceltaProps) {
  const idElenco = React.useId();

  // La voce «nessuno» è un'opzione come le altre: così entra nella ricerca,
  // nella navigazione con le frecce e nel conteggio, senza casi particolari.
  const VUOTO = ' nessuno';
  const complete = React.useMemo<OpzioneScelta[]>(
    () =>
      etichettaNessuno
        ? [{ valore: VUOTO, etichetta: etichettaNessuno }, ...opzioni]
        : [...opzioni],
    [opzioni, etichettaNessuno],
  );

  const t = useTendina(complete);

  const scelta = opzioni.find((o) => o.valore === valore) ?? null;

  function conferma(o: OpzioneScelta) {
    onCambia(o.valore === VUOTO ? null : o.valore);
    t.chiudi();
  }

  // Un gestore solo per tutti e due i posti da cui possono arrivare i tasti:
  // il tasto (tendina chiusa, o aperta senza casella di ricerca) e il pannello
  // (cursore nella casella). Due copie divergerebbero.
  const tastiera = (e: React.KeyboardEvent) =>
    tastieraElenco({
      e,
      aperto: t.aperto,
      apri: () => t.setAperto(true),
      chiudi: t.chiudi,
      attivo: t.attivo,
      setAttivo: t.setAttivo,
      visibili: t.visibili,
      conferma,
    });

  return (
    <div ref={t.guscio} className={cn('relative', className)}>
      <TastoTendina
        id={id}
        idElenco={idElenco}
        aperto={t.aperto}
        disabilitato={disabilitato}
        vuoto={!scelta}
        onClick={() => (t.aperto ? t.chiudi() : t.setAperto(true))}
        onKeyDown={tastiera}
        {...aria}
      >
        <span className="truncate">{scelta ? scelta.etichetta : segnaposto}</span>
      </TastoTendina>

      {t.aperto ? (
        <Elenco
          opzioni={t.visibili}
          query={t.query}
          setQuery={t.setQuery}
          attivo={t.attivo}
          setAttivo={t.setAttivo}
          scegli={conferma}
          eSelezionata={(v) => (v === VUOTO ? valore === null : v === valore)}
          multipla={false}
          posizione={t.posizione}
          larghezza={larghezzaElenco}
          segnapostoRicerca={segnapostoRicerca}
          nessunRisultato={nessunRisultato}
          idElenco={idElenco}
          onTastiera={tastiera}
        />
      ) : null}
    </div>
  );
}

// ── scelta multipla ─────────────────────────────────────────────────────────

export interface SceltaMultiplaProps extends BaseProps {
  valori: readonly string[];
  onCambia: (valori: string[]) => void;
  /** Massimo di voci scegliibili. Oltre, le altre si spengono. */
  massimo?: number;
  /**
   * In poco spazio: nel tasto si dice **quanti** invece di **chi**.
   *
   * ⚠️ Non e' una preferenza estetica. Le pastiglie coi nomi vanno a capo
   * quando il tasto e' stretto, e la riga cresce spostando quello che ha
   * sotto; e stringerle fino a farcele stare le riduce a una lettera piu' la
   * crocetta — cioe' a niente, con in piu' il rischio di togliere la persona
   * sbagliata. Dove si usa (la colonna stretta delle richieste) i nomi sono
   * gia' scritti due righe sopra: qui serve sapere che ce ne sono due e
   * potersi aprire.
   */
  riassunto?: boolean;
}

/**
 * Più scelte insieme.
 *
 * La tendina **resta aperta** mentre si spunta: chi assegna a tre persone non
 * vuole riaprirla tre volte. Si chiude con Esc, con un clic fuori o con
 * «Fatto». Nel tasto si vedono le prime due pastiglie e il resto diventa «+n»,
 * così la riga non cresce mai in altezza e non sposta quello che c'è sotto.
 */
export function SceltaMultipla({
  opzioni,
  valori,
  onCambia,
  segnaposto = 'Scegli…',
  segnapostoRicerca = 'Cerca…',
  nessunRisultato = 'Nessun risultato.',
  massimo,
  riassunto = false,
  disabilitato,
  className,
  larghezzaElenco = 'tasto',
  id,
  ...aria
}: SceltaMultiplaProps) {
  const idElenco = React.useId();
  const pieno = massimo !== undefined && valori.length >= massimo;

  // Il tetto si applica spegnendo le voci non ancora scelte: restano visibili
  // (sapere che esistono conta) ma non si possono aggiungere.
  const conTetto = React.useMemo<OpzioneScelta[]>(
    () =>
      pieno
        ? opzioni.map((o) =>
            valori.includes(o.valore) ? o : { ...o, disabilitata: true },
          )
        : [...opzioni],
    [opzioni, valori, pieno],
  );

  const t = useTendina(conTetto);

  const scelte = opzioni.filter((o) => valori.includes(o.valore));

  function conferma(o: OpzioneScelta) {
    onCambia(
      valori.includes(o.valore)
        ? valori.filter((v) => v !== o.valore)
        : [...valori, o.valore],
    );
    // Niente `chiudi()`: si continua a spuntare.
  }

  const tastiera = (e: React.KeyboardEvent) =>
    tastieraElenco({
      e,
      aperto: t.aperto,
      apri: () => t.setAperto(true),
      chiudi: t.chiudi,
      attivo: t.attivo,
      setAttivo: t.setAttivo,
      visibili: t.visibili,
      conferma,
    });

  return (
    <div ref={t.guscio} className={cn('relative', className)}>
      <TastoTendina
        id={id}
        idElenco={idElenco}
        aperto={t.aperto}
        disabilitato={disabilitato}
        vuoto={scelte.length === 0}
        onClick={() => (t.aperto ? t.chiudi() : t.setAperto(true))}
        onKeyDown={tastiera}
        {...aria}
      >
        {scelte.length === 0 ? (
          <span className="truncate">{segnaposto}</span>
        ) : riassunto ? (
          <span className="truncate" title={scelte.map((o) => o.etichetta).join(', ')}>
            {scelte.length === 1 ? scelte[0]!.etichetta : `${scelte.length} scelti`}
          </span>
        ) : (
          <>
            {scelte.slice(0, CHIP_VISIBILI).map((o) => (
              <span
                key={o.valore}
                className="inline-flex min-w-0 max-w-[11rem] items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-foreground"
              >
                <span className="truncate">{o.etichetta}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`Togli ${o.etichetta}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCambia(valori.filter((v) => v !== o.valore));
                  }}
                  className="shrink-0 rounded text-muted-foreground hover:text-foreground"
                >
                  <X aria-hidden="true" className="h-3 w-3" />
                </span>
              </span>
            ))}
            {scelte.length > CHIP_VISIBILI ? (
              <span className="text-xs text-muted-foreground">
                +{scelte.length - CHIP_VISIBILI}
              </span>
            ) : null}
          </>
        )}
      </TastoTendina>

      {t.aperto ? (
        <Elenco
          opzioni={t.visibili}
          query={t.query}
          setQuery={t.setQuery}
          attivo={t.attivo}
          setAttivo={t.setAttivo}
          scegli={conferma}
          eSelezionata={(v) => valori.includes(v)}
          multipla
          posizione={t.posizione}
          larghezza={larghezzaElenco}
          segnapostoRicerca={segnapostoRicerca}
          nessunRisultato={nessunRisultato}
          idElenco={idElenco}
          onTastiera={tastiera}
          piede={
            <div className="flex items-center justify-between gap-2 border-t border-border px-2 py-1.5">
              <span className="text-xs text-muted-foreground">
                {scelte.length === 0
                  ? 'Nessuno selezionato'
                  : `${scelte.length} selezionati${massimo ? ` su ${massimo}` : ''}`}
              </span>
              <span className="flex items-center gap-1">
                {scelte.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onCambia([])}
                    className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Svuota
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={t.chiudi}
                  className="rounded px-1.5 py-1 text-xs font-medium text-primary hover:underline"
                >
                  Fatto
                </button>
              </span>
            </div>
          }
        />
      ) : null}
    </div>
  );
}
