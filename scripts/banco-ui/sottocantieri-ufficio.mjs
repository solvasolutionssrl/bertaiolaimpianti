/**
 * Banco: i sottocantieri (fasi) dall'ufficio (23/10/2026).
 *
 *  1. dalla scheda cantiere si aggiunge una fase;
 *  2. l'elenco cantieri mostra il badge «1 fase»;
 *  3. in «Compila giornata» per un altro la tendina dei cantieri ha il
 *     pallino con la freccia, si apre e si sceglie la fase (clic veri);
 *  4. in Presenze e ore la riga si legge «Cantiere › Fase».
 *
 * SCRIVE sul tenant demo (DEMOC) e si ripulisce da solo: fase, timbrature e
 * rapportino di oggi di Luca Fabbri.
 *
 *   node scripts/banco-ui/sottocantieri-ufficio.mjs
 */
import { execSync } from 'node:child_process';
import { apriChrome, vaiA, accedi, esito, riepilogo, foto, clicVero, scriviVero } from './comune.mjs';
import { valuta, finoA } from '../banco-upload/cdp.mjs';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const CANTIERE = 'c0a70000-0000-4000-8000-000000000001'; // Cantiere Gruppo Aurora · Vicenza
const FABBRI = 'c1d00000-0000-4000-8000-000000000002';
const FASE = 'Banco fase quadri';
const sql = (q) => execSync(`supabase db query --linked "${q.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
const oggi = () => `((current_date::text || ' 00:00')::timestamp at time zone 'Europe/Rome')`;
const pulisci = () => {
  sql(`delete from timbrature where dipendente_id='${FABBRI}' and ts >= ${oggi()}`);
  sql(`delete from timbratura_viaggio where dipendente_id='${FABBRI}' and data=current_date`);
  sql(`delete from rapportini where dipendente_id='${FABBRI}' and data=current_date`);
  sql(`delete from sottocantieri where cantiere_id='${CANTIERE}' and nome like '%${FASE}%'`);
};
pulisci();

const bottone = (re, dentro = '[role=dialog]') => `[...document.querySelectorAll('${dentro} button')].find((b) => new RegExp(${JSON.stringify(re)}).test(b.textContent.trim()))`;

const { cdp, chiudi } = await apriChrome({});
try {
  await accedi(cdp, 'kantiere');

  // 1. La scheda cantiere: aggiungi una fase.
  await vaiA(cdp, `/office/kantiere/cantieri/${CANTIERE}`);
  await finoA(cdp, `document.querySelector('[data-sottocantieri-card]')`, { cosa: 'card sottocantieri', timeoutMs: 60000 });
  const vuota = await valuta(cdp, `!document.querySelector('[data-sottocantieri-card]').innerText.includes(${JSON.stringify(FASE)})`);
  esito(vuota, 'scheda: la fase di prova non c’è ancora');
  await clicVero(cdp, `[...document.querySelectorAll('[data-sottocantieri-card] button')].find((b) => /Aggiungi sottocantiere/.test(b.textContent))`);
  await finoA(cdp, `document.querySelector('[data-sottocantieri-card] input[placeholder="es. 01"]')`, { cosa: 'modulo fase' });
  await clicVero(cdp, `document.querySelector('[data-sottocantieri-card] input[placeholder="es. 01"]')`);
  await scriviVero(cdp, '01');
  await clicVero(cdp, `document.querySelector('[data-sottocantieri-card] input[placeholder="Nome della fase"]')`);
  await scriviVero(cdp, FASE);
  await clicVero(cdp, `[...document.querySelectorAll('[data-sottocantieri-card] button')].find((b) => /^Aggiungi$/.test(b.textContent.trim()))`);
  await finoA(cdp, `[...document.querySelectorAll('[data-sottocantieri-card] [data-fase]')].some((li) => li.textContent.includes(${JSON.stringify(FASE)}))`, { cosa: 'fase salvata', timeoutMs: 30000 });
  esito(true, 'scheda: la fase compare nell’elenco dopo il salvataggio');
  await foto(cdp, 'sottocantieri-01-scheda');

  // 2. L'elenco: badge «1 fase».
  await vaiA(cdp, '/office/kantiere/cantieri');
  await finoA(cdp, `document.querySelector('[data-fasi]')`, { cosa: 'badge fasi', timeoutMs: 60000 });
  const badge = await valuta(cdp, `[...document.querySelectorAll('[data-fasi]')].map((b) => b.textContent.trim())`);
  esito(badge.includes('1 fase'), 'elenco: badge «1 fase» accanto al nome', JSON.stringify(badge));

  // 3. Compila giornata per Fabbri: la tendina con i figli.
  await vaiA(cdp, '/office/kantiere/rapportini');
  await finoA(cdp, `[...document.querySelectorAll('button')].some((b) => /^Compila giornata$/.test(b.textContent.trim()))`, { cosa: 'barra', timeoutMs: 60000 });
  await clicVero(cdp, `[...document.querySelectorAll('button')].find((b) => /^Compila giornata$/.test(b.textContent.trim()))`);
  await finoA(cdp, `[...document.querySelectorAll('[role=dialog] h2')].some((h) => /Compila giornata/.test(h.textContent))`, { cosa: 'scelta persona' });
  await valuta(cdp, `(() => { const sel = document.querySelector('[role=dialog] select'); const opt = [...sel.options].find((o) => /Fabbri/.test(o.text)); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(sel, opt.value); sel.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await pausa(300);
  await clicVero(cdp, bottone('^Avanti$'));
  await finoA(cdp, `[...document.querySelectorAll('[role=dialog]')].some((d) => /Compila la giornata di/.test(d.textContent))`, { cosa: 'dialog compila' });
  await clicVero(cdp, `[...document.querySelectorAll('[role=dialog] button')].find((b) => /Cantiere…/.test(b.textContent))`);
  await finoA(cdp, `document.querySelector('[data-popover-portale] input')`, { cosa: 'ricerca cantiere' });
  await scriviVero(cdp, 'aurora');
  await pausa(400);
  const pallino = await valuta(cdp, `(() => { const p = document.querySelector('[data-popover-portale] [data-apri-figli]'); return p ? { testo: p.textContent.trim(), aperta: p.closest('[role=option]')?.getAttribute('data-aperta') } : null; })()`);
  esito(!!pallino && pallino.testo === '1', 'tendina: il cantiere ha il pallino con il numero di fasi', JSON.stringify(pallino));
  esito(pallino?.aperta === 'false', 'tendina: cercando il cantiere le fasi restano chiuse');
  await clicVero(cdp, `document.querySelector('[data-popover-portale] [data-apri-figli]')`);
  await pausa(300);
  const figli = await valuta(cdp, `[...document.querySelectorAll('[data-popover-portale] [role=option][data-livello="1"]')].map((o) => o.textContent.trim())`);
  esito(figli.length === 1 && figli[0].includes(FASE), 'tendina: la freccia apre la fase sotto, rientrata', JSON.stringify(figli));
  await foto(cdp, 'sottocantieri-02-tendina');
  await clicVero(cdp, `document.querySelector('[data-popover-portale] [role=option][data-livello="1"]')`);
  await pausa(400);
  const tasto = await valuta(cdp, `[...document.querySelectorAll('[role=dialog] button')].map((b) => b.textContent.trim()).find((t) => t.includes(${JSON.stringify(FASE)})) ?? null`);
  esito(!!tasto, 'tendina: la fase scelta si legge nel tasto', tasto ?? '');
  // Cercando il nome della fase il padre si apre da solo.
  await clicVero(cdp, `[...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.includes(${JSON.stringify(FASE)}))`);
  await finoA(cdp, `document.querySelector('[data-popover-portale] input')`, { cosa: 'ricerca' });
  await scriviVero(cdp, 'quadri');
  await pausa(400);
  const auto = await valuta(cdp, `[...document.querySelectorAll('[data-popover-portale] [role=option]')].map((o) => o.getAttribute('data-livello'))`);
  esito(auto.join(',') === '0,1', 'tendina: cercando la fase il cantiere si apre da solo', auto.join(','));
  await clicVero(cdp, `document.querySelector('[data-popover-portale] [role=option][data-livello="1"]')`);
  await pausa(300);
  await valuta(cdp, `(() => { const inp = [...document.querySelectorAll('[role=dialog] input[aria-label="Minuti"]')].pop(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(inp, '480'); inp.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await pausa(2500);
  const anteprima = await valuta(cdp, `(() => { const d = [...document.querySelectorAll('[role=dialog]')].find((x) => /Compila la giornata di/.test(x.textContent)); return /Aurora.*›.*${FASE.split(' ')[0]}/.test(d.innerText); })()`);
  esito(anteprima, 'compila: l’anteprima scrive «Cantiere › Fase»');
  await pausa(4000);
  await clicVero(cdp, bottone('^Salva la giornata$'));
  const chiuso = await finoA(cdp, `![...document.querySelectorAll('[role=dialog]')].some((x) => /Compila la giornata di/.test(x.textContent))`, { cosa: 'salvato', timeoutMs: 30000 }).then(() => true).catch(() => false);
  esito(chiuso, 'compila: salvato e dialog chiuso');
  if (!chiuso) console.log('  errore:', await valuta(cdp, `document.querySelector('[role=dialog] [role=alert]')?.textContent ?? '-'`));

  // 4. Presenze e ore: la riga per fase.
  await vaiA(cdp, '/office/kantiere/rapportini');
  await finoA(cdp, `document.body.innerText.includes(${JSON.stringify(FASE)})`, { cosa: 'riga con la fase', timeoutMs: 60000 });
  const riga = await valuta(cdp, `(() => { const t = document.body.innerText; const i = t.indexOf(${JSON.stringify(FASE)}); return t.slice(Math.max(0, i - 60), i + ${FASE.length}).replace(/\\s+/g, ' '); })()`);
  esito(/›/.test(riga), 'presenze: la riga si legge «Cantiere › Fase»', riga);
  await foto(cdp, 'sottocantieri-03-presenze');
} finally {
  await chiudi();
  pulisci();
}
process.exit(riepilogo() === 0 ? 0 : 1);
