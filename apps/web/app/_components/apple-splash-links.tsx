/**
 * Immagini di lancio iOS (apple-touch-startup-image) della PWA.
 *
 * iOS mostra queste immagini a tutto schermo mentre la web-app installata si
 * avvia: riproducono lo sfondo dell'app (`bg-canvas-mobile`) con la striscia blu
 * della status bar → il lancio "sembra già aperto", niente flash bianco; poi il
 * contenuto entra col micro-fade del template mobile. iOS sceglie l'immagine che
 * combacia ESATTAMENTE con la risoluzione del device (media query per-device),
 * altrimenti ripiega sul `background_color` del manifest.
 *
 * I PNG sono generati da `scripts/gen-splash.mjs` in `public/splash/`.
 * Next.js issa i <link> renderizzati qui dentro l'<head>.
 *
 * NB: valgono solo su iOS in standalone. Su browser/Android sono inerti.
 */

// [larghezza CSS, altezza CSS, dpr] — deve combaciare con DEVICES in gen-splash.mjs.
const DEVICES: Array<[number, number, number]> = [
  [320, 568, 2],
  [375, 667, 2],
  [414, 736, 3],
  [375, 812, 3],
  [414, 896, 2],
  [414, 896, 3],
  [390, 844, 3],
  [428, 926, 3],
  [393, 852, 3],
  [430, 932, 3],
  [402, 874, 3],
  [440, 956, 3],
];

export function AppleSplashLinks() {
  return (
    <>
      {DEVICES.map(([w, h, dpr]) => (
        <link
          key={`${w}x${h}@${dpr}`}
          rel="apple-touch-startup-image"
          media={`(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`}
          href={`/splash/apple-splash-${w * dpr}-${h * dpr}.png`}
        />
      ))}
    </>
  );
}
