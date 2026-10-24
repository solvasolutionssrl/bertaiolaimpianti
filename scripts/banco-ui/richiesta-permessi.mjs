/**
 * Banco: la richiesta di ferie o permesso del tecnico, dal telefono e da
 * computer (24/10/2026).
 *
 *  - telefono: il foglio «Nuova richiesta» non fa uscire nessun campo dalla
 *    card (iPhone restringe male i campi data/ora), il riepilogo si aggiorna,
 *    la richiesta inviata compare fra quelle in attesa;
 *  - computer: `/office/mio/richieste` esiste, sta in barra, mostra la stessa
 *    richiesta e la annulla con conferma;
 *  - ufficio: la richiesta era visibile in «Ferie e permessi» finche' c'era.
 *
 *   BANCO_CDP=9351 node scripts/banco-ui/richiesta-permessi.mjs
 * ⚠️ Un banco alla volta: `pgrep -f remote-debugging-port` deve essere vuoto.
 */
import { execSync } from 'node:child_process';
import { apriChrome, vaiA, accedi, esito, riepilogo, foto, clicVero, scriviVero } from './comune.mjs';
import { valuta, finoA } from '../banco-upload/cdp.mjs';

const DIP = 'c1d00000-0000-4000-8000-000000000001'; // Marco Rinaldi, DEMOC
const MOTIVO = 'BANCO richiesta permessi';
const sql = (q) => {
  for (let i = 0; i < 3; i += 1) {
    try {
      execSync(`supabase db query --linked "${q.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
      return;
    } catch (e) {
      if (i === 2) throw e;
    }
  }
};
const pulisci = () => sql(`delete from permesso_richieste where dipendente_id='${DIP}' and motivo='${MOTIVO}'`);
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const SET = `const set = (el, v) => { const proto = Object.getPrototypeOf(el); Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };`;
const oggi = new Date().toISOString().slice(0, 10);
const domani = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

pulisci();

// ── Telefono ─────────────────────────────────────────────────────────────
{
  const { cdp, chiudi } = await apriChrome({ mobile: true });
  try {
    await accedi(cdp, 'tecnico');
    await vaiA(cdp, '/mobile/permessi');
    await finoA(cdp, `[...document.querySelectorAll('button')].some((b) => /Nuova richiesta/.test(b.textContent))`, { cosa: 'pagina permessi', timeoutMs: 40000 });
    await foto(cdp, 'richiesta-permessi-01-telefono-lista');
    await clicVero(cdp, `[...document.querySelectorAll('button')].find((b) => /Nuova richiesta/.test(b.textContent))`);
    await finoA(cdp, `document.querySelector('[role=dialog][aria-label="Nuova richiesta"]')`, { cosa: 'foglio' });
    await pausa(400);
    const m1 = await valuta(cdp, `(() => { const d = document.querySelector('[role=dialog]'); const box = d.getBoundingClientRect(); const campi = [...d.querySelectorAll('input,select,textarea,button[role=radio]')].map((e) => { const b = e.getBoundingClientRect(); return { t: e.type || e.tagName, l: Math.round(b.left), r: Math.round(b.right) }; }); return { vw: innerWidth, sw: document.documentElement.scrollWidth, fuori: campi.filter((c) => c.l < box.left || c.r > box.right + 1), n: campi.length }; })()`);
    esito(m1.fuori.length === 0 && m1.sw <= m1.vw, 'telefono: nessun campo esce dal foglio (giorni)', JSON.stringify(m1));
    await foto(cdp, 'richiesta-permessi-02-telefono-giorni');
    // Permesso non retribuito: «giorni o ore», compare la scelta.
    await valuta(cdp, `(() => { ${SET} const s = document.querySelector('[role=dialog] select'); const o = [...s.options].find((x) => /non retribuito/i.test(x.textContent)); if (o) set(s, o.value); return !!o; })()`);
    await pausa(300);
    const radio = await valuta(cdp, `!!document.querySelector('[role=dialog] [role=radiogroup]')`);
    esito(radio, 'telefono: con un tipo «giorni o ore» compare la scelta Giorni interi / A ore');
    await clicVero(cdp, `[...document.querySelectorAll('[role=dialog] [role=radio]')].find((b) => /A ore/.test(b.textContent))`);
    await pausa(300);
    const m2 = await valuta(cdp, `(() => { const d = document.querySelector('[role=dialog]'); const box = d.getBoundingClientRect(); const campi = [...d.querySelectorAll('input,select,textarea')].map((e) => { const b = e.getBoundingClientRect(); return { t: e.type, l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width) }; }); return { fuori: campi.filter((c) => c.l < box.left || c.r > box.right + 1), tempi: campi.filter((c) => c.t === 'time').map((c) => c.w) }; })()`);
    esito(m2.fuori.length === 0 && m2.tempi.length === 2 && m2.tempi.every((w) => w > 120), 'telefono: i campi Dalle/Alle stanno nella card e sono larghi', JSON.stringify(m2));
    await clicVero(cdp, `[...document.querySelectorAll('[role=dialog] button')].find((b) => /^4 ore$/.test(b.textContent.trim()))`);
    await pausa(300);
    const riep = await valuta(cdp, `document.querySelector('[role=dialog] [data-riepilogo]')?.textContent ?? ''`);
    esito(/4 ore/.test(riep) && /08:00-12:00/.test(riep), 'telefono: il riepilogo dice «4 ore · 08:00-12:00»', riep);
    await foto(cdp, 'richiesta-permessi-03-telefono-ore');
    // Si invia come giorni interi (domani), con il motivo del banco.
    await clicVero(cdp, `[...document.querySelectorAll('[role=dialog] [role=radio]')].find((b) => /Giorni interi/.test(b.textContent))`);
    await pausa(200);
    await valuta(cdp, `(() => { ${SET} const [dal, al] = [...document.querySelectorAll('[role=dialog] input[type=date]')]; set(dal, '${domani}'); set(al, '${domani}'); set(document.querySelector('[role=dialog] textarea'), '${MOTIVO}'); return true; })()`);
    await pausa(200);
    await clicVero(cdp, `[...document.querySelectorAll('[role=dialog] button')].find((b) => /Invia richiesta/.test(b.textContent))`);
    await finoA(cdp, `!document.querySelector('[role=dialog][aria-label="Nuova richiesta"]') && /In attesa/.test(document.body.innerText) && document.body.innerText.includes('${MOTIVO}')`, { cosa: 'richiesta nell’elenco', timeoutMs: 20000 });
    const card = await valuta(cdp, `(() => { const s = document.querySelector('[data-sezione="in-corso"]'); return s ? s.innerText.replace(/\\s+/g, ' ') : ''; })()`);
    esito(/Permesso non retribuito/.test(card) && /1 giorno/.test(card) && /In attesa/.test(card), 'telefono: la richiesta compare in «In attesa di risposta» con tipo, quantità e stato', card.slice(0, 160));
    await foto(cdp, 'richiesta-permessi-04-telefono-inviata');
  } finally {
    await chiudi();
  }
}

// ── Ufficio la vede ──────────────────────────────────────────────────────
{
  const { cdp, chiudi } = await apriChrome({ larghezza: 1440, altezza: 900 });
  try {
    await accedi(cdp, 'kantiere');
    await vaiA(cdp, '/office/personale/permessi');
    await finoA(cdp, `document.body.innerText.includes('${MOTIVO}') || /Nessuna richiesta|Ferie e permessi/.test(document.body.innerText)`, { cosa: 'pagina ufficio', timeoutMs: 40000 });
    const vista = await valuta(cdp, `document.body.innerText.includes('${MOTIVO}')`);
    esito(vista, 'ufficio: la richiesta del tecnico e’ in «Ferie e permessi»');
  } finally {
    await chiudi();
  }
}

// ── Computer del tecnico ─────────────────────────────────────────────────
{
  const { cdp, chiudi } = await apriChrome({ larghezza: 1440, altezza: 900 });
  try {
    await accedi(cdp, 'tecnico');
    await finoA(cdp, `location.pathname.startsWith('/office/mio')`, { cosa: 'atterraggio', timeoutMs: 40000 });
    await finoA(cdp, `document.querySelector('aside')`, { cosa: 'barra' });
    const barra = await valuta(cdp, `document.querySelector('aside').innerText.replace(/\\s+/g, ' ')`);
    esito(/Le mie richieste/.test(barra), 'computer: «Le mie richieste» sta in barra', barra.slice(0, 160));
    await vaiA(cdp, '/office/mio/richieste');
    await finoA(cdp, `document.querySelector('[data-le-mie-richieste]') && document.body.innerText.includes('${MOTIVO}')`, { cosa: 'pagina richieste', timeoutMs: 40000 });
    const m = await valuta(cdp, `({ sbordo: Math.max(0, document.documentElement.scrollWidth - innerWidth), righe: document.querySelectorAll('[data-richiesta]').length })`);
    esito(m.sbordo === 0 && m.righe >= 1, 'computer: la pagina mostra la richiesta senza sbordare', JSON.stringify(m));
    await foto(cdp, 'richiesta-permessi-05-computer-lista');
    await clicVero(cdp, `[...document.querySelectorAll('[data-le-mie-richieste] button')].find((b) => /Nuova richiesta/.test(b.textContent))`);
    await finoA(cdp, `document.querySelector('[role=dialog]')`, { cosa: 'dialog' });
    await pausa(300);
    await foto(cdp, 'richiesta-permessi-06-computer-dialog');
    await clicVero(cdp, `[...document.querySelectorAll('[role=dialog] button')].find((b) => /^Annulla$/.test(b.textContent.trim()))`);
    await finoA(cdp, `!document.querySelector('[role=dialog]')`, { cosa: 'dialog chiuso' });
    // Annulla la richiesta in attesa, con conferma.
    await clicVero(cdp, `document.querySelector('[data-richiesta] button')`);
    await finoA(cdp, `[...document.querySelectorAll('[role=alertdialog] button, [role=dialog] button')].some((b) => /Annulla richiesta/.test(b.textContent))`, { cosa: 'conferma' });
    await clicVero(cdp, `[...document.querySelectorAll('[role=alertdialog] button, [role=dialog] button')].find((b) => /Annulla richiesta/.test(b.textContent))`);
    await finoA(cdp, `!document.body.innerText.includes('${MOTIVO}')`, { cosa: 'richiesta annullata', timeoutMs: 20000 });
    esito(true, 'computer: la richiesta si annulla con conferma e sparisce');
  } finally {
    await chiudi();
  }
}

pulisci();
process.exit(riepilogo() === 0 ? 0 : 1);
