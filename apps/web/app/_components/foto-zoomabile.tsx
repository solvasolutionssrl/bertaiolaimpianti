'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { Minus, Plus, Maximize2, X } from 'lucide-react';

import {
  SCALA_MAX,
  SCALA_MIN,
  ZOOM_A_RIPOSO,
  distanzaFra,
  dopoDoppioTocco,
  limitaScala,
  limitaSpostamento,
  misuraContenuta,
  puoScorrereFraLeFoto,
  zoomVersoPunto,
  type Misura,
  type Punto,
  type StatoZoom,
} from '@kommessa/api/zoom-foto';

/**
 * **Una foto che si può guardare da vicino.**
 *
 * ⚠️ **Lo zoom del browser su questa applicazione è spento di proposito**
 * (`maximumScale: 1`, `userScalable: false` nel layout di radice, più
 * `touch-action: manipulation` sul `body`): in cantiere un pizzicotto preso
 * per sbaglio coi guanti lascia la pagina ingrandita e storta. La scelta è del
 * cliente ed è giusta per la pagina — ma una foto di una caldaia va guardata
 * da vicino, e il numero di matricola si legge solo ingrandendo.
 *
 * Quindi lo zoom vive **qui dentro**, dove l'unica cosa che si muove è
 * l'immagine e si rimette a posto con un doppio tocco. I conti stanno in
 * `@kommessa/api/zoom-foto`, puri e provati: un segno invertito non si vede
 * rileggendo il codice, si vede quando la foto scappa da sotto le dita.
 *
 * ## I tre modi di ingrandire, e perché tutti e tre
 *
 * **Pizzicotto** (telefono), **rotellina o doppio clic** (computer), **tasti
 * +/−** (visibili, per chi non prova né l'uno né l'altro). Lo zoom nascosto
 * dentro un gesto che nessuno annuncia è zoom che non esiste: i tasti costano
 * tre pulsanti e tolgono la domanda «ma si può ingrandire?».
 *
 * ## Tre trappole, tutte già costate tempo in questo repo
 *
 * ⚠️ **`react-remove-scroll`**: dentro un dialog Radix la libreria mette un
 * ascoltatore di `wheel`/`touchmove` su `document` e **annulla** tutto ciò che
 * non viene da dentro il dialog. L'evento si ferma **prima**, con un
 * ascoltatore **nativo** e `passive: false` — con `onWheel` di React non si
 * può chiamare `preventDefault`.
 *
 * ⚠️ **Il gesto del dito è uno solo e vuol dire due cose**: a riposo scorre
 * alla foto successiva, ingrandita sposta l'immagine. Non si decide per
 * convenzione, si guarda lo stato (`puoScorrereFraLeFoto`), e quando siamo noi
 * a prendere il gesto lo diciamo al genitore così non fa anche la sua parte.
 *
 * ⚠️ **La misura dei bordi non è quella del riquadro** ma quella che l'immagine
 * occupa davvero dopo `object-contain`. Limitare lo spostamento sul riquadro
 * blocca la foto prima che abbia mostrato i suoi angoli.
 */
const PASSO_TASTI = 1.6;
/** Due tocchi più lontani di così sono due tocchi, non un doppio tocco. */
const DOPPIO_TOCCO_PX = 32;
const DOPPIO_TOCCO_MS = 320;

function centroDi(el: HTMLElement): { misura: Misura; sinistra: number; alto: number } {
  const r = el.getBoundingClientRect();
  return {
    misura: { larghezza: r.width, altezza: r.height },
    sinistra: r.left,
    alto: r.top,
  };
}

/** Da coordinate di finestra a pixel dal centro del riquadro. */
function dalCentro(el: HTMLElement, clientX: number, clientY: number): Punto {
  const { misura, sinistra, alto } = centroDi(el);
  return {
    x: clientX - sinistra - misura.larghezza / 2,
    y: clientY - alto - misura.altezza / 2,
  };
}

export function FotoZoomabile({
  src,
  alt,
  className,
  onStatoZoom,
  conControlli = true,
}: {
  src: string;
  alt: string;
  className?: string;
  /**
   * Il genitore deve sapere se la foto è ingrandita: finché lo è, lo
   * scorrimento laterale fra le foto non deve rubare il gesto.
   */
  onStatoZoom?: (puoScorrere: boolean) => void;
  conControlli?: boolean;
}) {
  const rifRiquadro = React.useRef<HTMLDivElement>(null);
  const rifImg = React.useRef<HTMLImageElement>(null);
  const [stato, setStato] = React.useState<StatoZoom>(ZOOM_A_RIPOSO);
  const [naturale, setNaturale] = React.useState<Misura>({ larghezza: 0, altezza: 0 });

  // I dita in corso. Una `Map` e non uno stato di React: cambia a ogni
  // movimento e non deve ridisegnare niente.
  const dita = React.useRef(new Map<number, Punto>());
  const pizzico = React.useRef<{ distanza: number; scala: number } | null>(null);
  const trascino = React.useRef<{ da: Punto; spostamento: Punto } | null>(null);
  const ultimoTocco = React.useRef<{ t: number; x: number; y: number } | null>(null);

  const misure = React.useCallback((): { contenitore: Misura; immagine: Misura } | null => {
    const el = rifRiquadro.current;
    if (!el) return null;
    const { misura } = centroDi(el);
    if (misura.larghezza <= 0 || misura.altezza <= 0) return null;
    return { contenitore: misura, immagine: misuraContenuta(naturale, misura) };
  }, [naturale]);

  React.useEffect(() => {
    onStatoZoom?.(puoScorrereFraLeFoto(stato));
  }, [stato, onStatoZoom]);

  // Foto nuova = si riparte da capo. Senza, si cambia immagine e ci si
  // ritrova sull'angolo in cui si era rimasti sulla precedente.
  React.useEffect(() => {
    setStato(ZOOM_A_RIPOSO);
    setNaturale({ larghezza: 0, altezza: 0 });
  }, [src]);

  const applica = React.useCallback(
    (scalaRichiesta: number, punto: Punto) => {
      const m = misure();
      if (!m) return;
      setStato((prec) =>
        zoomVersoPunto({
          stato: prec,
          punto,
          scalaRichiesta,
          contenitore: m.contenitore,
          immagine: m.immagine,
        }),
      );
    },
    [misure],
  );

  // ⚠️ Ascoltatori NATIVI, non `onWheel`/`onTouchMove` di React: dentro un
  // dialog Radix l'evento va fermato prima che arrivi a `document`, e con gli
  // ascoltatori di React non si può chiamare `preventDefault` su un evento
  // dichiarato passivo.
  React.useEffect(() => {
    const el = rifRiquadro.current;
    if (!el) return;

    const rotella = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const m = misure();
      if (!m) return;
      const fattore = Math.exp(-e.deltaY / 420);
      setStato((prec) =>
        zoomVersoPunto({
          stato: prec,
          punto: dalCentro(el, e.clientX, e.clientY),
          scalaRichiesta: prec.scala * fattore,
          contenitore: m.contenitore,
          immagine: m.immagine,
        }),
      );
    };

    // Il dito: si ferma qui solo quando lo stiamo usando noi, altrimenti il
    // genitore non potrebbe più cambiare foto scorrendo.
    const dito = (e: TouchEvent) => {
      if (dita.current.size >= 2 || !puoScorrereFraLeFoto(stato)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    el.addEventListener('wheel', rotella, { passive: false });
    el.addEventListener('touchmove', dito, { passive: false });
    return () => {
      el.removeEventListener('wheel', rotella);
      el.removeEventListener('touchmove', dito);
    };
  }, [misure, stato]);

  const giuDito = (e: React.PointerEvent) => {
    dita.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (dita.current.size === 2) {
      const [a, b] = [...dita.current.values()];
      if (a && b) pizzico.current = { distanza: distanzaFra(a, b), scala: stato.scala };
      trascino.current = null;
      return;
    }

    // Un dito solo: si trascina **solo se è ingrandita**, altrimenti il gesto
    // è del genitore (scorrere alla foto successiva).
    if (dita.current.size === 1 && !puoScorrereFraLeFoto(stato)) {
      trascino.current = { da: { x: e.clientX, y: e.clientY }, spostamento: stato.spostamento };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
  };

  const muoviDito = (e: React.PointerEvent) => {
    if (!dita.current.has(e.pointerId)) return;
    dita.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const el = rifRiquadro.current;
    if (!el) return;

    if (dita.current.size >= 2 && pizzico.current) {
      const [a, b] = [...dita.current.values()];
      if (!a || !b) return;
      const ora = distanzaFra(a, b);
      if (pizzico.current.distanza <= 0) return;
      const k = ora / pizzico.current.distanza;
      const medio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      applica(pizzico.current.scala * k, dalCentro(el, medio.x, medio.y));
      return;
    }

    const t = trascino.current;
    if (!t) return;
    const m = misure();
    if (!m) return;
    setStato((prec) => ({
      scala: prec.scala,
      spostamento: limitaSpostamento({
        spostamento: {
          x: t.spostamento.x + (e.clientX - t.da.x),
          y: t.spostamento.y + (e.clientY - t.da.y),
        },
        scala: prec.scala,
        contenitore: m.contenitore,
        immagine: m.immagine,
      }),
    }));
  };

  const suDito = (e: React.PointerEvent) => {
    dita.current.delete(e.pointerId);
    if (dita.current.size < 2) pizzico.current = null;
    if (dita.current.size === 0) trascino.current = null;

    // Doppio tocco: due volte vicino, in fretta. Vale anche col mouse.
    const el = rifRiquadro.current;
    if (!el) return;
    const ora = Date.now();
    const prec = ultimoTocco.current;
    if (
      prec &&
      ora - prec.t < DOPPIO_TOCCO_MS &&
      Math.hypot(e.clientX - prec.x, e.clientY - prec.y) < DOPPIO_TOCCO_PX
    ) {
      ultimoTocco.current = null;
      const m = misure();
      if (!m) return;
      setStato((p) =>
        dopoDoppioTocco({
          stato: p,
          punto: dalCentro(el, e.clientX, e.clientY),
          contenitore: m.contenitore,
          immagine: m.immagine,
        }),
      );
      return;
    }
    ultimoTocco.current = { t: ora, x: e.clientX, y: e.clientY };
  };

  const daiTasti = (verso: 1 | -1 | 0) => {
    const el = rifRiquadro.current;
    if (!el) return;
    if (verso === 0) {
      setStato(ZOOM_A_RIPOSO);
      return;
    }
    const centro: Punto = { x: 0, y: 0 };
    applica(verso === 1 ? stato.scala * PASSO_TASTI : stato.scala / PASSO_TASTI, centro);
  };

  const ingrandita = !puoScorrereFraLeFoto(stato);

  return (
    <div
      ref={rifRiquadro}
      className={'relative flex h-full w-full items-center justify-center overflow-hidden ' + (className ?? '')}
      style={{ touchAction: 'none' }}
      onPointerDown={giuDito}
      onPointerMove={muoviDito}
      onPointerUp={suDito}
      onPointerCancel={suDito}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={rifImg}
        src={src}
        alt={alt}
        draggable={false}
        onLoad={(e) => {
          const img = e.currentTarget;
          setNaturale({ larghezza: img.naturalWidth, altezza: img.naturalHeight });
        }}
        className="max-h-full max-w-full select-none object-contain"
        style={{
          transform: `translate(${stato.spostamento.x}px, ${stato.spostamento.y}px) scale(${stato.scala})`,
          // Durante il gesto niente transizione: seguirebbe le dita in ritardo.
          transition: trascino.current || pizzico.current ? 'none' : 'transform 140ms ease-out',
          cursor: ingrandita ? 'grab' : 'zoom-in',
        }}
      />

      {conControlli ? (
        <div className="pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/55 p-1 backdrop-blur-sm">
          <TastoZoom
            etichetta="Rimpicciolisci"
            disabilitato={stato.scala <= SCALA_MIN + 0.01}
            onClick={() => daiTasti(-1)}
          >
            <Minus className="h-4 w-4" />
          </TastoZoom>
          <span className="min-w-[2.6rem] text-center font-mono text-[11px] tabular-nums text-white/80">
            {Math.round(stato.scala * 100)}%
          </span>
          <TastoZoom
            etichetta="Ingrandisci"
            disabilitato={stato.scala >= SCALA_MAX - 0.01}
            onClick={() => daiTasti(1)}
          >
            <Plus className="h-4 w-4" />
          </TastoZoom>
          <TastoZoom
            etichetta="Rimetti a posto"
            disabilitato={!ingrandita}
            onClick={() => daiTasti(0)}
          >
            <Maximize2 className="h-4 w-4" />
          </TastoZoom>
        </div>
      ) : null}
    </div>
  );
}

function TastoZoom({
  children,
  etichetta,
  disabilitato,
  onClick,
}: {
  children: React.ReactNode;
  etichetta: string;
  disabilitato?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={etichetta}
      aria-label={etichetta}
      disabled={disabilitato}
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      className="flex h-8 w-8 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15 disabled:opacity-35"
    >
      {children}
    </button>
  );
}

/**
 * Il visore minimo: schermo nero, la foto che si ingrandisce, una croce.
 *
 * Serve ai punti dove una foto c'è ma non si poteva aprire — le anteprime dei
 * file in coda, la ricevuta di una spesa, la galleria del collegamento
 * pubblico. Dove invece c'è già una pila di media con le frecce e le
 * miniature, il posto è `MediaLightbox`, che usa lo stesso motore di zoom.
 *
 * ⚠️ Va su `document.body`: dentro i gusci un elemento `fixed` resta
 * intrappolato nel contesto di impilamento della barra in basso.
 *
 * ⚠️⚠️ **E da `body` servono due cose in più, perché da qui si apre anche da
 * dentro un dialog Radix** (le anteprime dei file in coda stanno dentro dei
 * moduli che a volte sono dialog):
 *
 *   1. `pointerEvents: 'auto'` esplicito — un dialog modale Radix mette
 *      `pointer-events: none` su **tutto** il `<body>` e li riaccende solo nel
 *      proprio recinto: senza questa riga il visore si vedrebbe e il dito ci
 *      passerebbe attraverso, esattamente come succedeva alle tendine.
 *   2. `data-popover-portale` — altrimenti Radix legge il clic qui dentro come
 *      un clic «fuori» e chiude il dialog sottostante insieme al visore.
 *
 * Costano due attributi e togliono un pomeriggio di diagnosi.
 */
export function VisoreFoto({
  src,
  alt,
  didascalia,
  onChiudi,
}: {
  src: string;
  alt: string;
  didascalia?: string | null;
  onChiudi: () => void;
}) {
  React.useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChiudi();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onChiudi]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      data-popover-portale=""
      style={{ pointerEvents: 'auto' }}
      className="fixed inset-0 z-[95] flex flex-col bg-black/92"
    >
      <div
        className="flex shrink-0 items-start justify-between gap-3 px-3 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
      >
        <p className="min-w-0 flex-1 truncate text-xs text-white/70">{didascalia ?? alt}</p>
        <button
          type="button"
          onClick={onChiudi}
          aria-label="Chiudi"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div
        className="min-h-0 flex-1"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <FotoZoomabile src={src} alt={alt} />
      </div>
    </div>,
    document.body,
  );
}
