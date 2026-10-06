'use client';

import * as React from 'react';
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
 * ## Tre regole che vengono da bug veri
 *
 * 1. ⚠️ **L'elenco è un overlay assoluto in-flow, NON un Portal.** Dentro un
 *    dialog Radix un Portal viene letto come clic «fuori» e chiude il dialog
 *    sotto. È la stessa regola di `cliente-picker.tsx` e sta in CLAUDE.md.
 * 2. **La casella di ricerca compare solo quando serve** (oltre
 *    `SOGLIA_RICERCA` voci). Sotto, una casella vuota in cima è solo un
 *    ostacolo fra il dito e la voce da toccare.
 * 3. **Le frecce scavalcano le voci spente** invece di fermarcisi sopra: una
 *    freccia che non muove niente sembra un tasto rotto.
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

function useChiudiSuClicFuori(
  aperto: boolean,
  chiudi: () => void,
): React.RefObject<HTMLDivElement> {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!aperto) return;
    function suClic(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) chiudi();
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

/**
 * Decide se aprire verso il basso o verso l'alto. Una tendina che esce dallo
 * schermo costringe a scorrere la pagina mentre si sceglie, e su un dialog
 * spesso non si può proprio.
 */
function useVersoAlto(aperto: boolean, ref: React.RefObject<HTMLElement>) {
  const [versoAlto, setVersoAlto] = React.useState(false);
  React.useEffect(() => {
    if (!aperto || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const sotto = window.innerHeight - r.bottom;
    // 280 è l'altezza massima dell'elenco più un margine di cortesia.
    setVersoAlto(sotto < 280 && r.top > sotto);
  }, [aperto, ref]);
  return versoAlto;
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
  versoAlto,
  larghezza,
  segnapostoRicerca,
  nessunRisultato,
  idElenco,
  piede,
}: {
  opzioni: OpzioneScelta[];
  query: string;
  setQuery: (s: string) => void;
  attivo: number;
  setAttivo: (n: number) => void;
  scegli: (o: OpzioneScelta) => void;
  eSelezionata: (v: string) => boolean;
  multipla: boolean;
  versoAlto: boolean;
  larghezza: 'tasto' | 'auto';
  segnapostoRicerca: string;
  nessunRisultato: string;
  idElenco: string;
  piede?: React.ReactNode;
}) {
  const conRicerca = opzioni.length > SOGLIA_RICERCA || query.length > 0;
  const rifLista = React.useRef<HTMLDivElement>(null);

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

  return (
    <div
      className={cn(
        'absolute left-0 z-50 overflow-hidden rounded-md border border-border bg-popover shadow-lg',
        versoAlto ? 'bottom-full mb-1' : 'top-full mt-1',
        larghezza === 'tasto' ? 'right-0' : 'min-w-full',
      )}
    >
      {conRicerca ? (
        <div className="flex items-center gap-1.5 border-b border-border px-2">
          <Search aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            // La casella vive dentro l'overlay in-flow: non serve nessun
            // Portal, e il focus resta dentro il dialog che ci contiene.
            autoFocus
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
  const versoAlto = useVersoAlto(aperto, guscio);

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
    versoAlto,
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

  return (
    <div ref={t.guscio} className={cn('relative', className)}>
      <TastoTendina
        id={id}
        idElenco={idElenco}
        aperto={t.aperto}
        disabilitato={disabilitato}
        vuoto={!scelta}
        onClick={() => (t.aperto ? t.chiudi() : t.setAperto(true))}
        onKeyDown={(e) =>
          tastieraElenco({
            e,
            aperto: t.aperto,
            apri: () => t.setAperto(true),
            chiudi: t.chiudi,
            attivo: t.attivo,
            setAttivo: t.setAttivo,
            visibili: t.visibili,
            conferma,
          })
        }
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
          versoAlto={t.versoAlto}
          larghezza={larghezzaElenco}
          segnapostoRicerca={segnapostoRicerca}
          nessunRisultato={nessunRisultato}
          idElenco={idElenco}
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

  return (
    <div ref={t.guscio} className={cn('relative', className)}>
      <TastoTendina
        id={id}
        idElenco={idElenco}
        aperto={t.aperto}
        disabilitato={disabilitato}
        vuoto={scelte.length === 0}
        onClick={() => (t.aperto ? t.chiudi() : t.setAperto(true))}
        onKeyDown={(e) =>
          tastieraElenco({
            e,
            aperto: t.aperto,
            apri: () => t.setAperto(true),
            chiudi: t.chiudi,
            attivo: t.attivo,
            setAttivo: t.setAttivo,
            visibili: t.visibili,
            conferma,
          })
        }
        {...aria}
      >
        {scelte.length === 0 ? (
          <span className="truncate">{segnaposto}</span>
        ) : (
          <>
            {scelte.slice(0, CHIP_VISIBILI).map((o) => (
              <span
                key={o.valore}
                className="inline-flex max-w-[11rem] items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-foreground"
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
          versoAlto={t.versoAlto}
          larghezza={larghezzaElenco}
          segnapostoRicerca={segnapostoRicerca}
          nessunRisultato={nessunRisultato}
          idElenco={idElenco}
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
