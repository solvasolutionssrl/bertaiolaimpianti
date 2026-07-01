// Generatore delle immagini di lancio iOS (apple-touch-startup-image) della PWA.
//
// iOS, quando apri la web-app installata, mostra una schermata di lancio: se
// trova un `apple-touch-startup-image` che combacia ESATTAMENTE con la
// risoluzione del device la usa, altrimenti ripiega sul `background_color` del
// manifest. Qui rasterizziamo per ogni iPhone un'immagine che riproduce lo
// sfondo dell'app (`bg-canvas-mobile`) con in cima la striscia blu brand della
// status bar (stesso trattamento dello scrim del layout): così il lancio
// "sembra già aperto" e il contenuto entra con un micro-fade (template.tsx).
//
// Rigenerare con:  cd apps/web && node ../../scripts/gen-splash.mjs
// (sharp risolto da apps/web/node_modules). Le PNG finiscono in
// apps/web/public/splash/ e sono referenziate da AppleSplashLinks.
//
// Colori derivati da .bg-canvas-mobile (globals.css) e --primary (#1340A6).

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
// sharp è una dipendenza di @kommessa/web: risolvila dal suo package (in pnpm
// non è hoistata alla root) invece che dalla cartella scripts/.
const require = createRequire(resolve(__dirname, '../apps/web/package.json'));
const sharp = require('sharp');
const OUT_DIR = resolve(__dirname, '../apps/web/public/splash');

const BASE = '#CDDAEF'; // hsl(216 52% 87%) — base sfondo
const WARM = '#FFE4CC'; // hsl(28 100% 90%)  — glow caldo top-right
const BLUE_L = '#CBDDFB'; // hsl(218 86% 89%) — glow blu sinistra
const BLUE_B = '#D3E1F8'; // hsl(217 74% 90%) — glow blu basso
const BRAND = '#1340A6'; // --primary — striscia status bar

// [larghezza CSS, altezza CSS, device-pixel-ratio, safe-area-inset-top in pt].
// Copre gli iPhone da SE fino a 16 Pro Max (portrait).
const DEVICES = [
  [320, 568, 2, 20], // SE 1 / 5s
  [375, 667, 2, 20], // 6/7/8 / SE 2-3
  [414, 736, 3, 20], // 6+/7+/8+
  [375, 812, 3, 44], // X / XS / 11 Pro / 12-13 mini
  [414, 896, 2, 48], // XR / 11
  [414, 896, 3, 44], // XS Max / 11 Pro Max
  [390, 844, 3, 47], // 12 / 12 Pro / 13 / 13 Pro / 14
  [428, 926, 3, 47], // 12/13 Pro Max / 14 Plus
  [393, 852, 3, 59], // 14 Pro / 15 / 15 Pro / 16
  [430, 932, 3, 59], // 14 Pro Max / 15 Plus / 15 Pro Max / 16 Plus
  [402, 874, 3, 62], // 16 Pro
  [440, 956, 3, 62], // 16 Pro Max
];

function svgFor(w, h, insetPx) {
  // Glow con radialGradient objectBoundingBox (frazioni 0..1): risoluzione-
  // indipendenti, si adattano all'aspect del device. Ordine di pittura come in
  // CSS: base → blu basso → blu sinistra → caldo (l'ultimo sopra).
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <radialGradient id="warm" cx="1.0" cy="0.12" r="0.72">
      <stop offset="0" stop-color="${WARM}"/>
      <stop offset="0.62" stop-color="${WARM}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="blueL" cx="-0.05" cy="0.28" r="0.78">
      <stop offset="0" stop-color="${BLUE_L}"/>
      <stop offset="0.6" stop-color="${BLUE_L}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="blueB" cx="0.5" cy="1.02" r="0.85">
      <stop offset="0" stop-color="${BLUE_B}"/>
      <stop offset="0.62" stop-color="${BLUE_B}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${w}" height="${h}" fill="${BASE}"/>
  <rect x="0" y="0" width="${w}" height="${h}" fill="url(#blueB)"/>
  <rect x="0" y="0" width="${w}" height="${h}" fill="url(#blueL)"/>
  <rect x="0" y="0" width="${w}" height="${h}" fill="url(#warm)"/>
  <rect x="0" y="0" width="${w}" height="${insetPx}" fill="${BRAND}"/>
</svg>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const links = [];
  for (const [wCss, hCss, dpr, insetPt] of DEVICES) {
    const w = wCss * dpr;
    const h = hCss * dpr;
    const insetPx = Math.round(insetPt * dpr);
    const svg = svgFor(w, h, insetPx);
    const file = `apple-splash-${w}-${h}.png`;
    const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
    await writeFile(resolve(OUT_DIR, file), png);
    const media = `(device-width: ${wCss}px) and (device-height: ${hCss}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`;
    links.push({ file, media, kb: Math.round(png.length / 1024) });
    console.log(`✓ ${file}  (${w}×${h}, inset ${insetPx}px, ${Math.round(png.length / 1024)} KB)`);
  }
  // Stampa i <link> pronti da incollare (comodo se cambia la lista device).
  console.log('\n--- link tags ---');
  for (const l of links) {
    console.log(
      `<link rel="apple-touch-startup-image" media="${l.media}" href="/splash/${l.file}" />`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
