/**
 * Cattura: le schermate del dialog «Registra giornata» sulla PWA.
 *
 * Non misura niente e non salva niente sul tenant demo (nessun BANCO_SALVA):
 * guida il browser negli stati che si vogliono far rivedere a una persona e
 * salva i PNG sotto `scripts/banco-ui/esiti/`.
 *
 * iPhone 14 emulato (390x844), tecnico demo (DEMOC).
 *
 *   node scripts/banco-ui/foto-registra-giornata.mjs
 */

import { apriChrome, vaiA, accedi, foto } from './comune.mjs';
import { valuta, finoA } from '../banco-upload/cdp.mjs';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

/** Gli stessi aiuti del banco `registra-giornata.mjs`. */
const AIUTI = `
  const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const visibile = (el) => el.getClientRects().length > 0;
  const pagina = () => document.querySelector('[role="dialog"][aria-label="Registra giornata"]');
  const setValore = (el, v) => {
    const proto = Object.getPrototypeOf(el);
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const cardDi = (radice, titolo) => [...(radice?.querySelectorAll('button[aria-expanded]') ?? [])].find((b) => new RegExp('^' + titolo, 'i').test(t(b.textContent)))?.parentElement;
`;

/** Clicca l'elemento visibile più in basso nel DOM che corrisponde. */
async function clicca(cdp, re, { dentro = 'document' } = {}) {
  const r = await valuta(
    cdp,
    `(() => {
      ${AIUTI}
      const radice = ${dentro};
      if (!radice) return 'contenitore assente';
      const re = new RegExp(${JSON.stringify(re)}, 'i');
      const el = [...radice.querySelectorAll('button, [role="option"], [role="switch"], a')]
        .filter(visibile)
        .filter((x) => re.test(t(x.textContent)) || re.test(x.getAttribute('aria-label') || ''))
        .pop();
      if (!el) return 'non trovato';
      el.scrollIntoView({ block: 'center' });
      el.click();
      return 'ok';
    })()`,
  );
  if (r !== 'ok') console.log(`  · clic su /${re}/: ${r}`);
  await pausa(400);
  return r === 'ok';
}

async function aggiungiCantiere(cdp, cerca) {
  await finoA(cdp, `(() => { ${AIUTI} return [...(pagina()?.querySelectorAll('button') ?? [])].some((b) => /^Aggiungi (il )?cantiere$/.test(t(b.textContent))); })()`, {
    cosa: 'tasto Aggiungi cantiere',
    timeoutMs: 40000,
  });
  await clicca(cdp, '^Aggiungi (il )?cantiere$', { dentro: 'pagina()' });
  await finoA(cdp, `[...document.querySelectorAll('[role="dialog"] h2')].some((h) => /Aggiungi cantiere/.test(h.textContent))`, {
    cosa: 'foglio cantieri',
    timeoutMs: 40000,
  });
  await valuta(
    cdp,
    `(() => {
      ${AIUTI}
      const sheet = [...document.querySelectorAll('[role="dialog"]')].find((d) => /Aggiungi cantiere/.test(d.querySelector('h2')?.textContent || ''));
      const input = sheet?.querySelector('input');
      if (input) setValore(input, ${JSON.stringify(cerca)});
      return !!input;
    })()`,
  );
  await pausa(500);
  const scelto = await valuta(
    cdp,
    `(() => {
      ${AIUTI}
      const sheet = [...document.querySelectorAll('[role="dialog"]')].find((d) => /Aggiungi cantiere/.test(d.querySelector('h2')?.textContent || ''));
      const b = [...(sheet?.querySelectorAll('button') ?? [])].filter(visibile).find((x) => new RegExp(${JSON.stringify(cerca)}, 'i').test(t(x.textContent)));
      if (!b) return false;
      b.click();
      return true;
    })()`,
  );
  await pausa(600);
  return scelto;
}

/** Ore sul cantiere n (0-based). */
async function ore(cdp, indice, h) {
  return valuta(
    cdp,
    `(() => {
      ${AIUTI}
      const campi = [...pagina().querySelectorAll('input[aria-label="ore"]')];
      if (campi[${indice}]) setValore(campi[${indice}], '${h}');
      return campi.length;
    })()`,
  );
}

async function scorri(cdp, dove) {
  await valuta(
    cdp,
    `(() => {
      ${AIUTI}
      const corpo = pagina()?.querySelector('.overflow-y-auto');
      if (corpo) corpo.scrollTop = ${dove === 'fondo' ? 'corpo.scrollHeight' : '0'};
      return true;
    })()`,
  );
  await pausa(400);
}

const fatte = [];
const saltate = [];

const { cdp, chiudi } = await apriChrome({ mobile: true });
try {
  await accedi(cdp, 'tecnico');
  await vaiA(cdp, '/mobile/kantiere/ore');
  await finoA(cdp, `[...document.querySelectorAll('button')].some((b) => /Registra giornata/.test(b.textContent))`, {
    cosa: 'tasto Registra giornata',
    timeoutMs: 30_000,
  });
  await pausa(900);

  // ── 1. la pagina, prima del dialog ───────────────────────────────────────
  await foto(cdp, 'mobile-ore-1-pagina');
  fatte.push('mobile-ore-1-pagina');

  // ── 2. il dialog appena aperto, in cima ──────────────────────────────────
  await clicca(cdp, 'Registra giornata');
  await finoA(cdp, `!!document.querySelector('[role="dialog"][aria-label="Registra giornata"]')`, { cosa: 'pagina del dialog' });
  await pausa(1000);
  await scorri(cdp, 'cima');
  await foto(cdp, 'mobile-ore-2-dialog-top');
  fatte.push('mobile-ore-2-dialog-top');

  // ── 3. un cantiere con le ore: card del cantiere + barra dei tempi ───────
  const scelto = await aggiungiCantiere(cdp, 'Aurora');
  if (!scelto) {
    saltate.push('mobile-ore-3-dialog-cantiere: il cantiere «Aurora» non si è potuto scegliere dal foglio');
  } else {
    await ore(cdp, 0, 8);
    await pausa(600);
    await scorri(cdp, 'cima');
    await foto(cdp, 'mobile-ore-3-dialog-cantiere');
    fatte.push('mobile-ore-3-dialog-cantiere');
  }

  // ── 4. il percorso: partenza / tratte / rientro ──────────────────────────
  // Con due cantieri compare anche la tratta fra l'uno e l'altro.
  if (scelto) {
    const secondo = await aggiungiCantiere(cdp, 'Logistica');
    if (secondo) {
      await ore(cdp, 0, 4);
      await ore(cdp, 1, 4);
      // La stima della tratta arriva dalla rete.
      await finoA(cdp, `(() => { ${AIUTI} return /di tratte/.test(t(pagina()?.querySelector('[aria-live="polite"]')?.textContent)); })()`, {
        cosa: 'stima della tratta',
        timeoutMs: 90000,
      }).catch(() => null);
    }
  }
  const percorso = await valuta(
    cdp,
    `(() => {
      ${AIUTI}
      const c = cardDi(pagina(), 'Partenza');
      if (!c) return 'card «Partenza» assente';
      c.scrollIntoView({ block: 'start' });
      return 'ok';
    })()`,
  );
  if (percorso !== 'ok') {
    saltate.push(`mobile-ore-4-percorso: ${percorso}`);
  } else {
    await pausa(500);
    await foto(cdp, 'mobile-ore-4-percorso');
    fatte.push('mobile-ore-4-percorso');
  }

  // ── 5. la pausa pranzo ───────────────────────────────────────────────────
  const dovePausa = await valuta(
    cdp,
    `(() => {
      ${AIUTI}
      const b = [...(pagina()?.querySelectorAll('button[aria-pressed]') ?? [])].find((x) => /^(Nessuna|30 min|45 min|1 h|1 h 30)$/.test(t(x.textContent)));
      const zona = b?.closest('div');
      if (!zona) return 'zona della pausa non trovata';
      zona.scrollIntoView({ block: 'center' });
      return 'ok';
    })()`,
  );
  if (dovePausa !== 'ok') {
    saltate.push(`mobile-ore-5-pausa: ${dovePausa}`);
  } else {
    await pausa(500);
    await foto(cdp, 'mobile-ore-5-pausa');
    fatte.push('mobile-ore-5-pausa');
  }
} finally {
  await chiudi();
}

console.log('\nScattate:');
for (const f of fatte) console.log(`  · scripts/banco-ui/esiti/${f}.png`);
if (saltate.length) {
  console.log('\nSaltate:');
  for (const s of saltate) console.log(`  · ${s}`);
}
