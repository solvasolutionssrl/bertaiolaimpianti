/**
 * Banco: la barra dei filtri di «Presenze e ore» su una riga, tutto alto 40px,
 * e il cantiere che si cerca per nome, codice e cliente. Non scrive.
 *
 *   node scripts/banco-ui/filtri-presenze.mjs
 */
import { apriChrome, vaiA, accedi, esito, riepilogo, foto, clicVero, scriviVero } from './comune.mjs';
import { valuta, finoA } from '../banco-upload/cdp.mjs';

const { cdp, chiudi } = await apriChrome({ larghezza: 1600 });
try {
  await accedi(cdp, 'kantiere');
  await vaiA(cdp, '/office/kantiere/rapportini');
  await finoA(cdp, `[...document.querySelectorAll('button')].some((b) => /Compila giornata/.test(b.textContent))`, { cosa: 'barra', timeoutMs: 60000 });
  const m = await valuta(cdp, `(() => {
    const barra = [...document.querySelectorAll('button')].find((b) => /Compila giornata/.test(b.textContent)).closest('.flex-wrap');
    const controlli = [...barra.children].flatMap((c) => c.classList.contains('ml-auto') ? [...c.querySelectorAll(':scope > button, :scope > a')] : [c.querySelector('input[type=date], button, label.flex') ?? c]).filter((e) => e.getClientRects().length);
    const r = controlli.map((e) => { const b = e.getBoundingClientRect(); return { h: Math.round(b.height), top: Math.round(b.top), bottom: Math.round(b.bottom), t: e.textContent.trim().slice(0, 16) }; });
    return { n: r.length, altezze: [...new Set(r.map((x) => x.h))], bottom: [...new Set(r.map((x) => x.bottom))], r };
  })()`);
  esito(m.altezze.length === 1 && m.altezze[0] === 40, 'barra: tutti i controlli alti 40px', JSON.stringify(m.altezze));
  esito(m.bottom.length === 1, 'barra: tutti sulla stessa riga (stesso bordo inferiore)', JSON.stringify(m.bottom));
  await foto(cdp, 'filtri-presenze-01');
  await new Promise((r) => setTimeout(r, 600));
  await clicVero(cdp, `[...document.querySelectorAll('button[aria-label="Cantiere"], button')].find((b) => /Tutti i cantieri/.test(b.textContent))`);
  await finoA(cdp, `document.querySelector('[data-popover-portale] input')`, { cosa: 'ricerca cantiere' });
  await scriviVero(cdp, 'aurora');
  await new Promise((r) => setTimeout(r, 400));
  const voci = await valuta(cdp, `[...document.querySelectorAll('[data-popover-portale] [role=option]')].map((o) => o.textContent.replace(/\\s+/g,' ').trim())`);
  esito(voci.length > 0 && voci.every((v) => /aurora/i.test(v)), 'cantiere: la ricerca filtra per nome', voci.slice(0, 2).join(' | '));
  await foto(cdp, 'filtri-presenze-02-ricerca');
} finally {
  await chiudi();
}
process.exit(riepilogo() === 0 ? 0 : 1);
