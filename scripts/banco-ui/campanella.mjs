/**
 * Banco: la campanella in alto (e il «＋ Spesa» dell'ufficio) non deve coprire
 * nessun testo delle pagine Kantiere dell'app.
 *
 * Nasce da un difetto visto sul telefono: la campanella stava sempre un filo
 * sopra «Aggiornato alle 15:34». A occhio sembra niente, ma è su ogni pagina.
 * Qui si misura: per ogni pagina, i rettangoli del testo che finisce sotto i
 * tasti fissi in alto (con 3px di margine).
 *
 *   node scripts/banco-ui/campanella.mjs
 */

import { apriChrome, vaiA, accedi, esito, riepilogo } from './comune.mjs';
import { valuta } from '../banco-upload/cdp.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGINE = {
  tecnico: [
    '/mobile/kantiere/cantieri',
    '@primo-cantiere',
    '/mobile/kantiere/ore',
    '/mobile/kantiere/spese',
    '/mobile/kantiere/scansiona',
  ],
  kantiere: [
    '/mobile/kantiere/cruscotto',
    '/mobile/kantiere/cantieri',
    '@primo-cantiere',
    '/mobile/kantiere/ore',
    '/mobile/kantiere/spese',
    '/mobile/kantiere/scansiona',
    '/mobile/kantiere/gestione-squadra',
  ],
};

const MISURA = `(() => {
  const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const fissi = [
    document.querySelector('a[href="/mobile/notifiche"][aria-label^="Notifiche"]'),
    document.querySelector('button[aria-label="Aggiungi spesa"]'),
  ].filter((el) => el && getComputedStyle(el).position === 'fixed' && el.getClientRects().length > 0);
  const scatole = fissi.map((el) => {
    const r = el.getBoundingClientRect();
    return { nome: el.getAttribute('aria-label'), top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  });
  const M = 3;
  const coperti = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (!t(n.textContent)) continue;
    const el = n.parentElement;
    if (!el || fissi.some((f) => f.contains(el))) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.opacity === '0') continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      for (const s of scatole) {
        const sopra = r.left < s.right + M && r.right > s.left - M && r.top < s.bottom + M && r.bottom > s.top - M;
        if (sopra) coperti.push(s.nome + ' copre «' + t(n.textContent).slice(0, 40) + '» (' + Math.round(r.top) + '-' + Math.round(r.bottom) + ')');
      }
    }
  }
  return { scatole: scatole.map((s) => s.nome + ' ' + Math.round(s.top) + '-' + Math.round(s.bottom) + ' x' + Math.round(s.left) + '-' + Math.round(s.right)), coperti: [...new Set(coperti)] };
})()`;

async function fotoAlto(cdp, nome) {
  const dir = join(process.cwd(), 'scripts/banco-ui/esiti');
  mkdirSync(dir, { recursive: true });
  const r = await cdp.invia('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: 390, height: 150, scale: 2 },
  });
  writeFileSync(join(dir, `${nome}.png`), Buffer.from(r.data, 'base64'));
}

// Un Chrome per volta: riaprirne un secondo sulla stessa porta mentre il primo
// si sta chiudendo fa fallire la connessione. `BANCO_CHI` sceglie un solo accesso.
const MONDI = process.env.BANCO_CHI ? [process.env.BANCO_CHI] : Object.keys(PAGINE);

for (const mondo of MONDI) {
  console.log(`\n── ${mondo === 'tecnico' ? 'tecnico' : 'ufficio'} ──`);
  const { cdp, chiudi } = await apriChrome({ mobile: true });
  try {
    await accedi(cdp, mondo);
    for (const voce of PAGINE[mondo]) {
      let percorso = voce;
      if (voce === '@primo-cantiere') {
        percorso = await valuta(
          cdp,
          `(() => { const a = [...document.querySelectorAll('a[href^="/mobile/kantiere/cantieri/"]')][0]; return a ? a.getAttribute('href') : null; })()`,
        );
        if (!percorso) {
          console.log('  · nessun cantiere da aprire');
          continue;
        }
      }
      try {
        await vaiA(cdp, percorso);
      } catch (e) {
        console.log(`  · ${percorso}: ${e.message}`);
        continue;
      }
      await pausa(1200);
      const dove = await valuta(cdp, 'location.pathname');
      if (!dove.startsWith('/mobile/kantiere')) {
        console.log(`  · ${percorso} → ${dove} (non accessibile, saltata)`);
        continue;
      }
      const m = await valuta(cdp, MISURA);
      const etichetta = dove.replace('/mobile/kantiere/', '').replace(/cantieri\/[^/]+$/, 'cantiere');
      esito(m.coperti.length === 0, `${etichetta}: niente testo sotto i tasti in alto`, m.coperti.join(' | ') || m.scatole.join(', '));
      await fotoAlto(cdp, `campanella-${mondo}-${etichetta.replace(/\//g, '-')}`);
    }
  } finally {
    await chiudi();
    await pausa(2500);
  }
}

process.exitCode = riepilogo() > 0 ? 1 : 0;
