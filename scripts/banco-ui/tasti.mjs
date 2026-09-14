/**
 * Banco: censimento dei tasti dell'ufficio (altezza, colore, forma).
 *
 * Non giudica: misura. Visita le pagine principali dei due mondi (commesse e
 * presenze) sui tenant demo e raccoglie ogni elemento che a schermo si presenta
 * come un tasto. Il riepilogo raggruppa per altezza e per colore di fondo, così
 * le eccezioni saltano all'occhio invece di doverle cercare a mano.
 *
 *   BANCO_CDP=9334 node scripts/banco-ui/tasti.mjs
 *
 * Scrive il dettaglio in scripts/banco-ui/esiti/tasti.json.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { apriChrome, vaiA, accedi } from './comune.mjs';
import { valuta } from '../banco-upload/cdp.mjs';

const MONDI = {
  kantiere: [
    '/office/kantiere',
    '/office/kantiere/rapportini',
    '/office/kantiere/cantieri',
    '/office/kantiere/dipendenti',
    '/office/kantiere/sedi',
    '/office/kantiere/mezzi',
    '/office/kantiere/kontabilita',
    '/office/kantiere/ore-costi',
    '/office/kantiere/report',
    '/office/kantiere/qr',
    '/office/personale/pianificazione',
    '/office/personale/permessi',
    '/office/impostazioni/kantiere',
    '/office/impostazioni/pagamenti',
    '/office/impostazioni/utenti',
    '/office/impostazioni/profilo',
  ],
  kommessa: [
    '/office',
    '/office/commesse',
    '/office/commesse/panoramica',
    '/office/clienti',
    '/office/tickets',
    '/office/impostazioni/voci',
    '/office/impostazioni/branding',
  ],
};

/** Dettaglio: la prima scheda raggiungibile dall'elenco. */
const DETTAGLI = {
  kantiere: { elenco: '/office/kantiere/cantieri', prefisso: '/office/kantiere/cantieri/' },
  kommessa: { elenco: '/office/commesse', prefisso: '/office/commesse/' },
};

const RACCOGLI = `(() => {
  const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const trasparente = (c) => !c || c === 'transparent' || /rgba\\(\\s*0,\\s*0,\\s*0,\\s*0\\s*\\)/.test(c);
  const out = [];
  const cand = document.querySelectorAll('button, a, [role="button"], input[type="submit"]');
  for (const el of cand) {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 16 || r.height > 64) continue;
    if (r.bottom < 0 || r.top > innerHeight * 3) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    // Solo cio' che si presenta come tasto: fondo pieno, bordo, o una classe da tasto.
    const fondo = !trasparente(cs.backgroundColor);
    const bordo = parseFloat(cs.borderTopWidth) > 0 && !trasparente(cs.borderTopColor);
    const cls = typeof el.className === 'string' ? el.className : '';
    const daTasto = /inline-flex[^"]*justify-center|\\bh-(7|8|9|10|11|12)\\b/.test(cls);
    if (!fondo && !bordo && !daTasto) continue;
    // Le voci della barra laterale non sono tasti.
    if (el.closest('aside, nav')) continue;
    const testo = t(el.textContent).slice(0, 32);
    out.push({
      h: Math.round(r.height),
      w: Math.round(r.width),
      bg: fondo ? cs.backgroundColor : 'transparent',
      fg: cs.color,
      bordo: bordo ? cs.borderTopColor : null,
      raggio: cs.borderTopLeftRadius,
      font: cs.fontSize + '/' + cs.fontWeight,
      testo,
      soloIcona: testo.length === 0 && !!el.querySelector('svg'),
      componente: /whitespace-nowrap rounded-md/.test(cls),
      cls: cls.slice(0, 160),
    });
  }
  return out;
})()`;

const tutti = [];
const { cdp, chiudi } = await apriChrome({ larghezza: 1440, altezza: 900 });
try {
  for (const [mondo, pagine] of Object.entries(MONDI)) {
    await accedi(cdp, mondo);
    const daVisitare = [...pagine];
    try {
      await vaiA(cdp, DETTAGLI[mondo].elenco);
      const href = await valuta(
        cdp,
        `(() => { const a = [...document.querySelectorAll('a[href^="${DETTAGLI[mondo].prefisso}"]')].find((x) => /[0-9a-f-]{36}/.test(x.getAttribute('href'))); return a ? a.getAttribute('href') : null; })()`,
      );
      if (href) daVisitare.push(href.split('?')[0]);
    } catch {
      /* nessun dettaglio raggiungibile: si va avanti */
    }

    for (const pagina of daVisitare) {
      try {
        await vaiA(cdp, pagina);
        await new Promise((r) => setTimeout(r, 900));
        const tasti = await valuta(cdp, RACCOGLI);
        for (const x of tasti) tutti.push({ mondo, pagina, ...x });
        process.stdout.write(`  ${mondo.padEnd(9)}${pagina.padEnd(46)}${String(tasti.length).padStart(4)} tasti\n`);
      } catch (e) {
        process.stdout.write(`  ${mondo.padEnd(9)}${pagina.padEnd(46)} saltata (${e.message})\n`);
      }
    }
  }
} finally {
  await chiudi();
}

const dir = join(process.cwd(), 'scripts/banco-ui/esiti');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'tasti.json'), JSON.stringify(tutti, null, 1));

const conTesto = tutti.filter((x) => !x.soloIcona);
const perAltezza = new Map();
for (const x of conTesto) perAltezza.set(x.h, (perAltezza.get(x.h) ?? 0) + 1);
console.log('\nALTEZZE (tasti con testo)');
for (const [h, n] of [...perAltezza.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(h).padStart(3)}px  ${n}`);

const perFondo = new Map();
for (const x of conTesto.filter((x) => x.bg !== 'transparent')) {
  const k = x.bg;
  const v = perFondo.get(k) ?? { n: 0, esempi: new Set() };
  v.n += 1;
  if (v.esempi.size < 4) v.esempi.add(`${x.testo || '(icona)'} @ ${x.pagina}`);
  perFondo.set(k, v);
}
console.log('\nFONDI PIENI');
for (const [bg, v] of [...perFondo.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${bg.padEnd(26)} ${String(v.n).padStart(4)}   ${[...v.esempi].join(' | ')}`);
}
console.log(`\nTotale elementi: ${tutti.length} (con testo ${conTesto.length})`);
