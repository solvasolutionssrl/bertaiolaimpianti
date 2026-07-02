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

// Azzurro (sky) coerente con .bg-canvas-mobile: gradiente verticale scuro→chiaro
// + soffio di glow azzurro in alto a destra + striscia status bar brand.
const TOP = '#D3E4F3'; // hsl(208 56% 89%) — azzurro (in alto)
const MID = '#E0ECF5'; // hsl(207 50% 92%)
const BOT = '#ECF3F8'; // hsl(205 46% 95%) — azzurro chiaro (in basso)
const GLOW = '#DDF1FD'; // hsl(202 90% 93%) — glow azzurro top-right
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
  // Gradiente verticale azzurro scuro→chiaro (come .bg-canvas-mobile) + soffio di
  // glow azzurro in alto a destra + striscia status bar brand in cima.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${TOP}"/>
      <stop offset="0.52" stop-color="${MID}"/>
      <stop offset="1" stop-color="${BOT}"/>
    </linearGradient>
    <radialGradient id="glow" cx="1.08" cy="0.06" r="0.58">
      <stop offset="0" stop-color="${GLOW}"/>
      <stop offset="0.58" stop-color="${GLOW}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${w}" height="${h}" fill="url(#v)"/>
  <rect x="0" y="0" width="${w}" height="${h}" fill="url(#glow)"/>
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
