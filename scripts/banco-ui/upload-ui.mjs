/**
 * Misure a schermo sull'area upload, iPhone emulato, sul codice vero.
 *
 * Gira contro la pagina dev `/prova-upload` (404 in produzione), quindi non
 * serve autenticazione e non si tocca niente di reale. Richiede il server di
 * sviluppo sulla 3010 e i file di prova generati da `scripts/banco-upload`.
 *
 *   node scripts/banco-upload/prova.mjs   # genera i file di prova
 *   node scripts/banco-ui/upload-ui.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connetti, valuta, finoA } from '../banco-upload/cdp.mjs';

const QUI = path.dirname(decodeURIComponent(new URL(import.meta.url).pathname));
const APP = 'http://127.0.0.1:3010';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORTA = 9377;

const esiti = [];
const controlla = (nome, cond, det = '') => esiti.push({ ok: !!cond, nome, det });

const profilo = path.join(os.tmpdir(), 'kommessa-banco-ui-upload');
fs.rmSync(profilo, { recursive: true, force: true });
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORTA}`, `--user-data-dir=${profilo}`,
  '--disable-gpu', '--no-first-run', '--allow-file-access-from-files', 'about:blank',
]);

const cdp = await connetti(PORTA);
await cdp.invia('Page.enable');
await cdp.invia('Runtime.enable');
await cdp.invia('DOM.enable');
await cdp.invia('Emulation.setDeviceMetricsOverride', {
  width: 393, height: 852, deviceScaleFactor: 3, mobile: true,
});
await cdp.invia('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await cdp.invia('Network.setUserAgentOverride', {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  platform: 'iPhone',
});

// ── 1. La X per togliere un file ──────────────────────────────────────────
await cdp.invia('Page.navigate', { url: `${APP}/prova-upload` });
await finoA(cdp, `document.querySelector('input[accept="image/*,video/*"]')`, {
  timeoutMs: 120_000, cosa: 'pagina pronta',
});
await finoA(
  cdp,
  `(() => { const i = document.querySelector('input[accept="image/*,video/*"]');
    return Object.keys(i).some((k) => k.startsWith('__reactProps')); })()`,
  { timeoutMs: 60_000, cosa: 'React idratato' },
);

const { root } = await cdp.invia('DOM.getDocument', { depth: 1 });
const tutti = await cdp.invia('DOM.querySelectorAll', {
  nodeId: root.nodeId, selector: 'input[accept="image/*,video/*"]',
});
const nodeId = tutti.nodeIds[tutti.nodeIds.length - 1];
await cdp.invia('DOM.setFileInputFiles', {
  files: [path.join(os.tmpdir(), 'kommessa-banco-upload/media/foto_cantiere.jpg')],
  nodeId,
});
await new Promise((r) => setTimeout(r, 2500));

const misura = await valuta(cdp, `
  (() => {
    const b = Array.from(document.querySelectorAll('button'))
      .find((x) => (x.getAttribute('aria-label') || '').startsWith('Rimuovi'));
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const stile = getComputedStyle(b);
    return { w: Math.round(r.width), h: Math.round(r.height), opacita: stile.opacity };
  })()
`);
controlla(
  'la X per togliere un file è un bersaglio da dito (>= 40px)',
  misura && misura.w >= 40 && misura.h >= 40,
  misura ? `${misura.w}x${misura.h} px, opacità ${misura.opacita}` : 'tasto non trovato',
);
controlla(
  'la X si vede senza passarci sopra col mouse',
  misura && Number(misura.opacita) === 1,
  misura ? `opacità ${misura.opacita}` : '',
);

const anteprima = await valuta(cdp, `
  (() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    const a = imgs[imgs.length - 1];
    if (!a) return null;
    return { src: (a.src || '').slice(0, 30), naturale: a.naturalWidth, completa: a.complete };
  })()
`);
controlla(
  "l'anteprima del file selezionato si vede",
  anteprima && anteprima.naturale > 0,
  JSON.stringify(anteprima),
);

const shot = await cdp.invia('Page.captureScreenshot', { format: 'png' });
fs.mkdirSync(path.join(QUI, 'esiti'), { recursive: true });
fs.writeFileSync(path.join(QUI, 'esiti', 'x-caricamento.png'), Buffer.from(shot.data, 'base64'));

console.log('\n──────── ESITO UI ────────');
for (const e of esiti) console.log(`${e.ok ? 'OK  ' : 'KO  '} ${e.nome}${e.det ? ` — ${e.det}` : ''}`);
console.log(`\n${esiti.filter((e) => e.ok).length}/${esiti.length} passati`);


cdp.chiudi();
chrome.kill();
