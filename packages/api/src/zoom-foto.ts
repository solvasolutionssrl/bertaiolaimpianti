/**
 * **Ingrandire una foto: i conti.**
 *
 * ⚠️ **Lo zoom del browser qui non si puo' usare.** Su tutta l'applicazione il
 * pizzicotto e' disattivato di proposito (`maximumScale: 1`,
 * `userScalable: false`, `touch-action: manipulation`): in cantiere un pizzico
 * preso per sbaglio con i guanti lascia la pagina ingrandita e storta, e
 * rimetterla a posto col telefono sporco e' peggio del problema che risolveva.
 * La scelta e' del cliente ed e' giusta per la pagina — ma una foto di una
 * caldaia **va** guardata da vicino. Quindi lo zoom esiste solo **dentro il
 * visore**, dove l'unica cosa che si muove e' l'immagine.
 *
 * Qui stanno i conti, senza DOM e senza React, perche' sono la parte che
 * sbaglia in silenzio: un segno invertito non si vede leggendo, si vede
 * quando la foto scappa via da sotto le dita.
 *
 * ## Il sistema di riferimento
 *
 * Tutte le coordinate sono in pixel **dal centro del contenitore**: il centro
 * e' `{x: 0, y: 0}`. E' la scelta che fa sparire meta' dei conti, perche'
 * l'immagine e' disegnata con `transform: translate(x, y) scale(s)` e
 * l'origine della trasformazione e' il centro.
 *
 * `immagine` e' quanto l'immagine **occupa a scala 1**, cioe' dopo che
 * `object-contain` l'ha fatta stare nel riquadro: non sono i pixel del file.
 */

export interface Punto {
  x: number;
  y: number;
}

export interface Misura {
  larghezza: number;
  altezza: number;
}

/** Non si rimpicciolisce sotto la misura di partenza: non servirebbe a niente. */
export const SCALA_MIN = 1;
/** Oltre questo una foto da telefono e' solo rumore ingrandito. */
export const SCALA_MAX = 6;
/** Quanto ingrandisce un doppio tocco. */
export const SCALA_DOPPIO_TOCCO = 2.5;

export function limitaScala(
  scala: number,
  limiti: { min?: number; max?: number } = {},
): number {
  const min = limiti.min ?? SCALA_MIN;
  const max = limiti.max ?? SCALA_MAX;
  // ⚠️ Un numero che non e' un numero torna al **minimo**, non al massimo: un
  // pizzicotto con due dita nello stesso punto fa una divisione per zero, e la
  // risposta giusta a «non ho capito il gesto» e' rimettere la foto com'era,
  // non lasciarla ingrandita sei volte su un dettaglio a caso.
  if (!Number.isFinite(scala)) return min;
  return Math.min(max, Math.max(min, scala));
}

/** Distanza fra due dita. */
export function distanzaFra(a: Punto, b: Punto): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Il punto in mezzo a due dita. */
export function puntoMedio(a: Punto, b: Punto): Punto {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Quanto si puo' spostare l'immagine senza staccarla dai bordi.
 *
 * Se a questa scala l'immagine ci sta ancora dentro, la risposta e' zero: non
 * si trascina una cosa che si vede tutta. ⭐ **E' questo che impedisce la cosa
 * piu' fastidiosa di tutti i visori fatti in casa**, cioe' far scorrere via la
 * foto fino a perderla e non sapere come riportarla indietro.
 */
export function spostamentoMassimo(scala: number, contenitore: Misura, immagine: Misura): Misura {
  return {
    larghezza: Math.max(0, (immagine.larghezza * scala - contenitore.larghezza) / 2),
    altezza: Math.max(0, (immagine.altezza * scala - contenitore.altezza) / 2),
  };
}

/** Lo spostamento riportato dentro i bordi. */
export function limitaSpostamento(dati: {
  spostamento: Punto;
  scala: number;
  contenitore: Misura;
  immagine: Misura;
}): Punto {
  const max = spostamentoMassimo(dati.scala, dati.contenitore, dati.immagine);
  // Lo zero con il segno meno esiste, e `Math.max(-0, -900)` lo produce. In un
  // `translate()` non si vede, ma e' un valore che si propaga nei confronti e
  // nei test: si normalizza qui, una volta.
  const fra = (v: number, m: number) => {
    if (!Number.isFinite(v)) return 0;
    const r = Math.min(m, Math.max(-m, v));
    return r === 0 ? 0 : r;
  };
  return {
    x: fra(dati.spostamento.x, max.larghezza),
    y: fra(dati.spostamento.y, max.altezza),
  };
}

/**
 * Lo spostamento che tiene **fermo sotto le dita** il punto che si sta
 * pizzicando.
 *
 * Senza questo l'ingrandimento avviene sempre verso il centro: si pizzica
 * l'angolo in alto a sinistra e quello che si voleva vedere scappa fuori
 * schermo. E' il conto che distingue uno zoom usabile da uno zoom che si
 * combatte.
 */
export function spostamentoDopoZoom(dati: {
  /** Il punto fisso, in pixel dal centro del contenitore. */
  punto: Punto;
  spostamento: Punto;
  scalaPrima: number;
  scalaDopo: number;
}): Punto {
  if (dati.scalaPrima <= 0) return dati.spostamento;
  const k = dati.scalaDopo / dati.scalaPrima;
  return {
    x: dati.punto.x - (dati.punto.x - dati.spostamento.x) * k,
    y: dati.punto.y - (dati.punto.y - dati.spostamento.y) * k,
  };
}

export interface StatoZoom {
  scala: number;
  spostamento: Punto;
}

export const ZOOM_A_RIPOSO: StatoZoom = { scala: 1, spostamento: { x: 0, y: 0 } };

/**
 * Tutto insieme: da uno stato, un punto e una scala nuova, lo stato dopo —
 * ingrandito verso quel punto e riportato dentro i bordi.
 */
export function zoomVersoPunto(dati: {
  stato: StatoZoom;
  punto: Punto;
  scalaRichiesta: number;
  contenitore: Misura;
  immagine: Misura;
  limiti?: { min?: number; max?: number };
}): StatoZoom {
  const scala = limitaScala(dati.scalaRichiesta, dati.limiti);
  const spostato = spostamentoDopoZoom({
    punto: dati.punto,
    spostamento: dati.stato.spostamento,
    scalaPrima: dati.stato.scala,
    scalaDopo: scala,
  });
  return {
    scala,
    spostamento: limitaSpostamento({
      spostamento: spostato,
      scala,
      contenitore: dati.contenitore,
      immagine: dati.immagine,
    }),
  };
}

/**
 * Il doppio tocco: se e' a riposo ingrandisce verso il punto toccato, se e'
 * gia' ingrandita torna com'era.
 *
 * ⚠️ **Torna a riposo da QUALUNQUE ingrandimento**, non solo da quello del
 * doppio tocco: dopo un pizzicotto a 4,2 il doppio tocco deve essere la via
 * d'uscita, non un terzo stato.
 */
export function dopoDoppioTocco(dati: {
  stato: StatoZoom;
  punto: Punto;
  contenitore: Misura;
  immagine: Misura;
  scalaIngrandita?: number;
}): StatoZoom {
  if (dati.stato.scala > SCALA_MIN + 0.01) return ZOOM_A_RIPOSO;
  return zoomVersoPunto({
    stato: dati.stato,
    punto: dati.punto,
    scalaRichiesta: dati.scalaIngrandita ?? SCALA_DOPPIO_TOCCO,
    contenitore: dati.contenitore,
    immagine: dati.immagine,
  });
}

/**
 * La misura che l'immagine occupa dentro il riquadro a scala 1, cioe' quello
 * che fa `object-contain`. Serve ai conti sui bordi: senza, si limiterebbe lo
 * spostamento sulla misura del riquadro e la foto resterebbe bloccata prima
 * di aver mostrato i suoi angoli.
 */
export function misuraContenuta(naturale: Misura, contenitore: Misura): Misura {
  if (naturale.larghezza <= 0 || naturale.altezza <= 0) return contenitore;
  const k = Math.min(
    contenitore.larghezza / naturale.larghezza,
    contenitore.altezza / naturale.altezza,
  );
  return { larghezza: naturale.larghezza * k, altezza: naturale.altezza * k };
}

/**
 * ⚠️ **Quando lo scorrimento laterale fra una foto e l'altra deve tacere.**
 * Il visore gia' cambia foto con lo scorrimento del dito: con l'immagine
 * ingrandita quello stesso gesto deve spostarla, non saltare alla prossima.
 * Due gesti identici sullo stesso elemento, e vince quello che dipende dallo
 * stato.
 */
export function puoScorrereFraLeFoto(stato: StatoZoom): boolean {
  return stato.scala <= SCALA_MIN + 0.01;
}
