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
  // Tecnico del mondo presenze: serve per le schermate dell'app che l'ufficio
  // non vede (le mie ore, i miei viaggi, le mie spese).
  tecnico: { email: 'marco@democ.kommessa.local', password: 'Demo2026!' },
};

const CHROME =
  process.env.CHROME_BIN ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** Avvia Chrome pulito e ci si collega. `mobile` emula un iPhone. */
export async function apriChrome({
  mobile = false,
  larghezza = 1440,
  altezza = 900,
  /**
   * Dà a Chrome un microfono finto e concede il permesso senza chiederlo.
   *
   * Serve a misurare cio' che succede **prima** dell'AI: quanto dura una
   * registrazione, cosa si vede se dura troppo poco. Senza, `getUserMedia`
   * solleva e il banco puo' solo guardare il tasto.
   */
  microfonoFinto = false,
} = {}) {
  const profilo = mkdtempSync(join(tmpdir(), 'banco-ui-'));
  const args = [
    `--remote-debugging-port=${PORTA_CDP}`,
    `--user-data-dir=${profilo}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,MediaRouter',
    ...(microfonoFinto
      ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
      : []),
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

// ── il dito e la tastiera veri ───────────────────────────────────────────────
//
// ⚠️ `elemento.click()` NON e' un clic. E' una chiamata al DOM: ignora
// `pointer-events`, ignora chi sta sopra, ignora `visibility`. Un pannello
// spento da `pointer-events: none` — quello che fa Radix al `<body>` quando
// apre un dialog modale — accetta `click()` e rifiuta il dito di una persona.
// Il banco delle tendine ha dato 11 verdi per settimane su una tendina che
// nessuno riusciva a usare, e lo ha fatto cosi'.
//
// Queste funzioni passano dalla coda degli eventi del browser
// (`Input.dispatchMouseEvent`, `Input.dispatchKeyEvent`): vedono quello che
// vede un dito. Dove si misura se una cosa **si puo' usare**, si usano queste.

/**
 * Centro visibile di un elemento, scelto da un'espressione JS che lo
 * restituisce. Torna `null` se non c'e' o se non ha superficie.
 */
export async function centroDi(cdp, espressioneElemento) {
  return await valuta(
    cdp,
    `(() => {
      const el = (${espressioneElemento});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
               largo: Math.round(r.width), alto: Math.round(r.height) };
    })()`,
  );
}

/**
 * Chi riceverebbe davvero il tocco in quel punto: l'elemento piu' in alto
 * secondo il browser. Serve a distinguere «non funziona» da «c'e' qualcosa
 * davanti» — o, come nel caso delle tendine, da «e' trasparente al dito».
 */
export async function chiRiceveIlTocco(cdp, x, y) {
  return await valuta(
    cdp,
    `(() => {
      const e = document.elementFromPoint(${x}, ${y});
      if (!e) return null;
      const cls = typeof e.className === 'string' ? e.className : '';
      return { tag: e.tagName, classi: cls.slice(0, 60),
               testo: (e.textContent || '').trim().slice(0, 40) };
    })()`,
  );
}

/**
 * Clic vero. `espressioneElemento` e' un'espressione JS che torna l'elemento.
 * Restituisce `{ fatto, perche, bersaglio }`: se il dito finisce su un altro
 * elemento lo dice, invece di far finta di aver cliccato.
 */
export async function clicVero(cdp, espressioneElemento, { attesaMs = 350 } = {}) {
  // ⚠️ Prima si porta in vista. Una persona davanti a un modulo lungo scorre
  // fino al campo e poi lo tocca; un banco che non lo fa riporta «elemento
  // assente» su un campo che c'e' e si vede benissimo, due dita piu' in
  // basso. Misurato: il tasto «Chi se ne occupa» spariva appena il modulo
  // della telefonata si allungava con la scheda del cliente nuovo.
  await valuta(
    cdp,
    `(() => { const el = (${espressioneElemento});
       if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'nearest' });
       return 1; })()`,
  );
  await new Promise((r) => setTimeout(r, 180));

  const c = await centroDi(cdp, espressioneElemento);
  if (!c) return { fatto: false, perche: 'elemento assente o senza superficie' };

  const sotto = await chiRiceveIlTocco(cdp, c.x, c.y);
  const mio = await valuta(
    cdp,
    `(() => {
      const el = (${espressioneElemento});
      const r = el.getBoundingClientRect();
      const e = document.elementFromPoint(Math.round(r.left + r.width/2), Math.round(r.top + r.height/2));
      return !!(e && (e === el || el.contains(e) || e.contains(el)));
    })()`,
  );
  if (!mio) {
    return {
      fatto: false,
      perche: `il tocco non arriva all'elemento: in quel punto risponde <${sotto?.tag ?? '?'}>`,
      bersaglio: sotto,
    };
  }

  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.invia('Input.dispatchMouseEvent', {
      type, x: c.x, y: c.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1,
    });
  }
  await new Promise((r) => setTimeout(r, attesaMs));
  return { fatto: true, bersaglio: sotto };
}

/**
 * Scrive su chi ha il fuoco, un carattere per volta, con eventi di tastiera
 * veri. Se il fuoco viene strappato da una gabbia (`FocusScope` di Radix) il
 * testo non arriva — ed e' esattamente cio' che si vuole misurare.
 */
export async function scriviVero(cdp, testo, { ritardoMs = 30 } = {}) {
  // ⚠️ `keyDown` con `text` **e** un `char` a parte inseriscono il carattere
  // DUE volte: «a» diventa «aa». Misurato. La terna giusta e'
  // rawKeyDown (nessun testo) → char (il testo) → keyUp, come fa Puppeteer.
  for (const ch of testo) {
    await cdp.invia('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: ch });
    await cdp.invia('Input.dispatchKeyEvent', { type: 'char', text: ch, unmodifiedText: ch, key: ch });
    await cdp.invia('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
    if (ritardoMs) await new Promise((r) => setTimeout(r, ritardoMs));
  }
}

/** Un tasto non stampabile (Escape, ArrowDown, Enter, Backspace, Tab). */
export async function premiTasto(cdp, key, { attesaMs = 150 } = {}) {
  const codici = {
    Escape: { windowsVirtualKeyCode: 27, code: 'Escape' },
    Enter: { windowsVirtualKeyCode: 13, code: 'Enter', text: '\r' },
    ArrowDown: { windowsVirtualKeyCode: 40, code: 'ArrowDown' },
    ArrowUp: { windowsVirtualKeyCode: 38, code: 'ArrowUp' },
    Backspace: { windowsVirtualKeyCode: 8, code: 'Backspace' },
    Tab: { windowsVirtualKeyCode: 9, code: 'Tab' },
  };
  const extra = codici[key] ?? {};
  await cdp.invia('Input.dispatchKeyEvent', { type: 'keyDown', key, ...extra });
  await cdp.invia('Input.dispatchKeyEvent', { type: 'keyUp', key, ...extra });
  await new Promise((r) => setTimeout(r, attesaMs));
}

/** Chi ha il fuoco adesso: tag, tipo, etichetta e se e' dentro un dato recinto. */
export async function chiHaIlFuoco(cdp, dentroSelettore = null) {
  return await valuta(
    cdp,
    `(() => {
      const a = document.activeElement;
      if (!a) return null;
      return {
        tag: a.tagName,
        tipo: a.getAttribute('type') || '',
        etichetta: a.getAttribute('aria-label') || a.getAttribute('placeholder') || (a.textContent || '').trim().slice(0, 30),
        valore: 'value' in a ? String(a.value ?? '') : '',
        dentro: ${dentroSelettore ? `!!a.closest(${JSON.stringify(dentroSelettore)})` : 'null'},
      };
    })()`,
  );
}

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
