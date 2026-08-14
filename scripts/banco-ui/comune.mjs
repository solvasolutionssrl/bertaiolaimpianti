/**
 * Parti condivise del banco di prova UI: avvio di Chrome, accesso, misure.
 *
 * Gira sui **tenant demo** (DEMOK / DEMOC), mai sui clienti veri: le
 * credenziali stanno gia' in `scripts/demo/create-demo-auth.mjs` e i dati sono
 * finti apposta.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { connetti, valuta, finoA } from '../banco-upload/cdp.mjs';

export const BASE = process.env.BANCO_BASE ?? 'http://localhost:3010';
export const PORTA_CDP = Number(process.env.BANCO_CDP ?? 9333);

export const ACCESSI = {
  // Mondo commesse (Bertaiola-like): ha Commesse, Task, Clienti.
  kommessa: { email: 'demo@demok.kommessa.local', password: 'Demo2026!' },
  // Mondo presenze (FPM-like): ha Cantieri, Presenze, Kontabilita'.
  kantiere: { email: 'ufficio@democ.kommessa.local', password: 'Demo2026!' },
};

const CHROME =
  process.env.CHROME_BIN ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** Avvia Chrome pulito e ci si collega. `mobile` emula un iPhone. */
export async function apriChrome({ mobile = false, larghezza = 1440, altezza = 900 } = {}) {
  const profilo = mkdtempSync(join(tmpdir(), 'banco-ui-'));
  const args = [
    `--remote-debugging-port=${PORTA_CDP}`,
    `--user-data-dir=${profilo}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,MediaRouter',
    `--window-size=${larghezza},${altezza + 90}`,
    'about:blank',
  ];
  if (process.env.BANCO_VISIBILE !== '1') args.unshift('--headless=new');

  const proc = spawn(CHROME, args, { stdio: 'ignore', detached: true });
  const cdp = await connetti(PORTA_CDP);
  await cdp.invia('Page.enable');
  await cdp.invia('Runtime.enable');
  await cdp.invia('Network.enable');

  if (mobile) {
    // iPhone 14: quello che usano in cantiere.
    await cdp.invia('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
    });
    await cdp.invia('Emulation.setUserAgentOverride', {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    });
    await cdp.invia('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  } else {
    await cdp.invia('Emulation.setDeviceMetricsOverride', {
      width: larghezza,
      height: altezza,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  return { cdp, proc, chiudi: () => { try { cdp.chiudi(); } catch {} try { process.kill(-proc.pid); } catch {} } };
}

/** Va a un indirizzo e aspetta che React abbia montato qualcosa. */
export async function vaiA(cdp, path, { attesaMs = 25_000 } = {}) {
  await cdp.invia('Page.navigate', { url: `${BASE}${path}` });
  await finoA(cdp, `document.readyState === 'complete'`, { timeoutMs: attesaMs, cosa: `caricamento ${path}` });
  await finoA(cdp, `document.body && document.body.innerText.trim().length > 0`, {
    timeoutMs: attesaMs,
    cosa: `contenuto di ${path}`,
  });
}

/** Accede con le credenziali demo. Lascia il browser dentro l'area riservata. */
export async function accedi(cdp, mondo = 'kommessa') {
  const { email, password } = ACCESSI[mondo];
  await vaiA(cdp, '/login');
  await finoA(cdp, `document.querySelector('input[name=email]')`, { cosa: 'campo email' });
  await valuta(
    cdp,
    `(() => {
      const set = (el, v) => {
        const proto = Object.getPrototypeOf(el);
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      // Il codice azienda si lascia vuoto: l'email demo e' gia' univoca.
      set(document.querySelector('input[name=email]'), ${JSON.stringify(email)});
      set(document.querySelector('input[name=password]'), ${JSON.stringify(password)});
      document.querySelector('form button[type=submit]').click();
      return true;
    })()`,
  );
  await finoA(cdp, `!location.pathname.startsWith('/login')`, {
    timeoutMs: 40_000,
    cosa: 'uscita dalla pagina di accesso',
  });
  await finoA(cdp, `document.readyState === 'complete'`, { timeoutMs: 30_000 });
}

/** Salva uno screenshot sotto scripts/banco-ui/esiti/. */
export async function foto(cdp, nome) {
  const dir = join(process.cwd(), 'scripts/banco-ui/esiti');
  mkdirSync(dir, { recursive: true });
  const r = await cdp.invia('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(dir, `${nome}.png`), Buffer.from(r.data, 'base64'));
}

export { valuta, finoA };

// ── stampa ──────────────────────────────────────────────────────────────────

let ok = 0;
let ko = 0;
export function esito(passa, titolo, dettaglio = '') {
  if (passa) {
    ok++;
    console.log(`  \x1b[32m✓\x1b[0m ${titolo}${dettaglio ? `  ${dettaglio}` : ''}`);
  } else {
    ko++;
    console.log(`  \x1b[31m✗\x1b[0m ${titolo}${dettaglio ? `  \x1b[31m${dettaglio}\x1b[0m` : ''}`);
  }
  return passa;
}
export function riepilogo() {
  console.log(`\n${ko === 0 ? '\x1b[32m' : '\x1b[31m'}${ok} passati, ${ko} falliti\x1b[0m`);
  return ko;
}
