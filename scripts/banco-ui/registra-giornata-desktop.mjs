/**
 * Banco: il dialog «Compila giornata» da scrivania (24/10/2026).
 *
 * Misura cio' che Luca ha chiesto: i blocchi di lavoro sono card trascinabili
 * (a sinistra E nella colonna «Come verra' scritta»), l'ordine e' uno solo, la
 * pausa pranzo si trascina fra i blocchi e la sua posizione vince, le ore si
 * scrivono come vengono («7,5» → 7:30), la strada fra due blocchi e' una card
 * con chi guidava. Trascina con eventi del mouse VERI (CDP), non con click().
 *
 *   BANCO_CDP=9350 node scripts/banco-ui/registra-giornata-desktop.mjs
 *
 * SCRIVE sul tenant demo (la giornata di Luca Fabbri, oggi) e si ripulisce.
 */
import { execSync } from 'node:child_process';
import { apriChrome, vaiA, accedi, esito, riepilogo, foto, clicVero, centroDi } from './comune.mjs';
import { valuta, finoA } from '../banco-upload/cdp.mjs';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (q) => execSync(`supabase db query --linked "${q.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
const DIP_FABBRI = `(select id from dipendenti where cognome='Fabbri' and tenant_id='a0d30000-0000-4000-8000-000000000002' limit 1)`;
const pulisci = () => {
  sql(`delete from timbratura_viaggio where dipendente_id=${DIP_FABBRI} and data=current_date`);
  sql(`delete from timbrature where dipendente_id=${DIP_FABBRI} and (ts at time zone 'Europe/Rome')::date=current_date`);
  sql(`delete from rapportini where dipendente_id=${DIP_FABBRI} and data=current_date`);
};
pulisci();

const DIALOGO = `[...document.querySelectorAll('[role=dialog]')].find((d) => /Compila la giornata di/.test(d.textContent))`;
const bottone = (re) => `[...document.querySelectorAll('[role=dialog] button')].find((b) => new RegExp(${JSON.stringify(re)}).test(b.textContent.trim()))`;
const SX = `${DIALOGO}.querySelector('ol[aria-label^="Blocchi di lavoro"]')`;
const DX = `${DIALOGO}.querySelector('ol[aria-label^="La giornata come"]')`;
const ordineSx = () => `[...${SX}.querySelectorAll('li[data-drop-zona=blocchi]')].map((li) => li.querySelector('[role=combobox], button[aria-haspopup]')?.textContent.replace(/\\s+/g,' ').trim().slice(0, 40) ?? li.textContent.trim().slice(0, 40))`;
const righeDx = () => `[...${DX}.querySelectorAll('li')].map((li) => li.textContent.replace(/\\s+/g,' ').trim().slice(0, 60))`;
const lavoroDx = () => `[...${DX}.querySelectorAll('li[data-drop-zona=blocchi]')].map((li) => li.dataset.indice + ':' + li.textContent.replace(/\\s+/g,' ').trim().slice(12, 40))`;

async function trascina(cdp, daEspr, aEspr, { meta = 'centro' } = {}) {
  const da = await centroDi(cdp, daEspr);
  const r = await valuta(cdp, `(() => { const el = ${aEspr}; const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, h: b.height }; })()`);
  const y = meta === 'sotto' ? r.y + r.h * 0.35 : meta === 'sopra' ? r.y - r.h * 0.35 : r.y;
  await cdp.invia('Input.dispatchMouseEvent', { type: 'mousePressed', x: da.x, y: da.y, button: 'left', clickCount: 1 });
  const passi = 8;
  for (let i = 1; i <= passi; i++) {
    await cdp.invia('Input.dispatchMouseEvent', { type: 'mouseMoved', x: da.x + ((r.x - da.x) * i) / passi, y: da.y + ((y - da.y) * i) / passi, button: 'left' });
    await pausa(30);
  }
  await cdp.invia('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y, button: 'left', clickCount: 1 });
  await pausa(400);
}

const { cdp, chiudi } = await apriChrome({ larghezza: 1440, altezza: 900 });
try {
  await accedi(cdp, 'kantiere');
  await vaiA(cdp, '/office/kantiere/rapportini');
  await finoA(cdp, `[...document.querySelectorAll('button')].some((b) => /^Compila giornata$/.test(b.textContent.trim()))`, { cosa: 'tasto', timeoutMs: 60000 });
  await clicVero(cdp, `[...document.querySelectorAll('button')].find((b) => /^Compila giornata$/.test(b.textContent.trim()))`);
  await finoA(cdp, `[...document.querySelectorAll('[role=dialog] h2')].some((h) => /Compila giornata/.test(h.textContent))`, { cosa: 'scelta' });
  await valuta(cdp, `(() => { const sel = document.querySelector('[role=dialog] select'); const opt = [...sel.options].find((o) => /Fabbri/.test(o.text)); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(sel, opt.value); sel.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await pausa(300);
  await clicVero(cdp, bottone('^Avanti$'));
  await finoA(cdp, DIALOGO, { cosa: 'dialog compila' });

  const scegli = async (nome) => {
    await clicVero(cdp, `[...${DIALOGO}.querySelectorAll('button')].filter((b) => /Cantiere…/.test(b.textContent)).pop()`);
    await pausa(400);
    await clicVero(cdp, `[...document.querySelectorAll('[role=option], [data-popover-portale] button')].find((b) => new RegExp(${JSON.stringify(nome)}).test(b.textContent))`);
    await pausa(300);
  };
  const scriviOre = async (indice, testo) => {
    await clicVero(cdp, `[...${SX}.querySelectorAll('input[aria-label="Ore"]')][${indice}]`);
    await valuta(cdp, `(() => { const inp = [...${SX}.querySelectorAll('input[aria-label="Ore"]')][${indice}]; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(inp, ${JSON.stringify(testo)}); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
    await pausa(300);
  };

  // 1. Le ore si scrivono come vengono.
  await scegli('Logistica');
  await scriviOre(0, '3,5');
  const ore1 = await valuta(cdp, `[...${SX}.querySelectorAll('input[aria-label="Ore"]')][0].value`);
  esito(ore1 === '3:30', 'ore: «3,5» diventa 3:30', ore1);
  const vuoto = await valuta(cdp, `(() => { const i = [...${SX}.querySelectorAll('input[aria-label="Ore"]')][0]; return i.placeholder; })()`);
  esito(vuoto === '0:00', 'ore: a zero il campo mostra solo il segnaposto, niente zero da cancellare', vuoto);

  await clicVero(cdp, bottone('Aggiungi cantiere'));
  await pausa(300);
  await scegli('Aurora');
  await scriviOre(1, '430');
  const ore2 = await valuta(cdp, `[...${SX}.querySelectorAll('input[aria-label="Ore"]')][1].value`);
  esito(ore2 === '4:30', 'ore: «430» diventa 4:30', ore2);
  await pausa(4000); // stime di strada

  // 2. La card della strada fra i due blocchi, con chi guidava.
  const strada = await valuta(cdp, `(() => { const li = ${SX}.querySelector('li[aria-label="Strada fra i due blocchi"]'); if (!li) return null; return { testo: li.textContent.replace(/\\s+/g,' ').trim().slice(0, 80), guida: !!li.querySelector('[role=radiogroup][aria-label="Chi guidava"]'), tempo: !!li.querySelector('input[aria-label="Tempo di strada"]') }; })()`);
  esito(!!strada && strada.guida && strada.tempo && /→/.test(strada.testo), 'strada: card fra i blocchi con stima, chi guidava e tempo', strada ? strada.testo : 'nessuna card');

  // 3. I colori: due blocchi, due tinte.
  const tinte = await valuta(cdp, `[...${SX}.querySelectorAll('li[data-drop-zona=blocchi]')].map((li) => getComputedStyle(li).borderLeftColor)`);
  esito(tinte.length === 2 && tinte[0] !== tinte[1], 'blocchi: tinte diverse', tinte.join(' | '));
  const altezze = await valuta(cdp, `[...${SX}.querySelectorAll('li[data-drop-zona=blocchi]')].map((li) => Math.round(li.getBoundingClientRect().height))`);
  esito(altezze.every((h) => h <= 60), 'blocchi: card strette in altezza (≤ 60px)', altezze.join(', '));
  await foto(cdp, 'compila-dopo-1440');

  const primaSx = await valuta(cdp, ordineSx());
  const primaDx = await valuta(cdp, lavoroDx());
  esito(/Logistica/.test(primaSx[0]) && /Aurora/.test(primaSx[1]) && primaDx[0]?.startsWith('0:') && primaDx[1]?.startsWith('1:'), 'prima: sinistra e destra nello stesso ordine', `${primaSx.join(' / ')} · ${primaDx.join(' / ')}`);

  // 4. Trascino a sinistra: la destra segue.
  await trascina(cdp, `[...${SX}.querySelectorAll('button[aria-label^="Sposta il blocco"]')][1]`, `[...${SX}.querySelectorAll('li[data-drop-zona=blocchi]')][0]`);
  const dopoSx = await valuta(cdp, ordineSx());
  const dopoDx = await valuta(cdp, lavoroDx());
  esito(/Aurora/.test(dopoSx[0]) && /Logistica/.test(dopoSx[1]), 'trascino a sinistra: l’ordine cambia', dopoSx.join(' / '));
  esito(/Aurora/.test(dopoDx[0] ?? '') && /Logistica/.test(dopoDx[1] ?? ''), 'trascino a sinistra: la colonna destra segue', dopoDx.join(' / '));

  // 5. Trascino a destra: la sinistra segue.
  await trascina(cdp, `[...${DX}.querySelectorAll('li[data-drop-zona=blocchi] button[aria-label="Sposta il blocco"]')][1]`, `[...${DX}.querySelectorAll('li[data-drop-zona=blocchi]')][0]`);
  const dxSx = await valuta(cdp, ordineSx());
  const dxDx = await valuta(cdp, lavoroDx());
  esito(/Logistica/.test(dxSx[0]) && /Aurora/.test(dxSx[1]), 'trascino a destra: la sinistra segue', dxSx.join(' / '));
  esito(/Logistica/.test(dxDx[0] ?? ''), 'trascino a destra: la destra si riordina', dxDx.join(' / '));

  // 6. La pausa: di default dopo il primo blocco? La regola mette la pausa al
  //    confine piu' vicino al centro (3:30 | 4:30 → dopo Logistica). La
  //    trascino sotto il secondo blocco... non e' ammesso (dopo l'ultimo): resta.
  //    Allora prima la metto «dopo Aurora» spostando Aurora sopra, poi vediamo.
  const righePrima = await valuta(cdp, righeDx());
  const iPausaPrima = righePrima.findIndex((t) => /Pausa/.test(t));
  esito(iPausaPrima > 0, 'anteprima: la pausa c’è', righePrima[iPausaPrima] ?? '-');
  // Ora: Logistica (3:30), Aurora (4:30), pausa al confine → dopo Logistica.
  // Porto la pausa DOPO Aurora non si puo' (ultimo). Invece: tre blocchi.
  await clicVero(cdp, bottone('Aggiungi cantiere'));
  await pausa(300);
  await scegli('Betulle');
  await scriviOre(2, '2');
  await pausa(4000);
  const r3 = await valuta(cdp, righeDx());
  const pausaIdx = r3.findIndex((t) => /Pausa/.test(t));
  const lavoroPrimaDellaPausa = r3.slice(0, pausaIdx).filter((t) => !/Pausa|Strada|Partenza|Rientro/.test(t)).length;
  esito(lavoroPrimaDellaPausa === 2, 'pausa automatica: con 3:30 | 4:30 | 2:00 sta dopo il secondo blocco (vicino al centro)', `blocchi prima della pausa: ${lavoroPrimaDellaPausa}`);
  // Con la strada fra Logistica e Aurora la pausa automatica (confine 3:30,
  // il piu' vicino al centro) cade gia' «dopo Logistica» e il motore la
  // sposta 30 minuti dentro Aurora (pausa e strada, due buchi). Quindi la
  // trascino nella meta' bassa del SECONDO blocco: dopo Aurora.
  const distintiPrima = () => `(() => { const li = [...${DX}.querySelectorAll('li')]; const i = li.findIndex((x) => /Pausa/.test(x.textContent)); return new Set(li.slice(0, i).filter((x) => x.dataset.dropZona === 'blocchi').map((x) => x.dataset.indice)).size; })()`;
  const autoDistinti = await valuta(cdp, distintiPrima());
  await trascina(cdp, `${DX}.querySelector('button[aria-label="Sposta la pausa"]')`, `[...${DX}.querySelectorAll('li[data-drop-zona=blocchi][data-indice="1"]')][0]`, { meta: 'sotto' });
  const dopoDistinti = await valuta(cdp, distintiPrima());
  esito(autoDistinti === 2 && dopoDistinti === 3, 'pausa trascinata dopo Aurora: ora sta dentro il terzo blocco, 30 minuti dopo l’arrivo', `blocchi toccati prima della pausa: ${autoDistinti} → ${dopoDistinti}`);
  const nota = await valuta(cdp, `${DIALOGO}.textContent.includes('dopo Cantiere Gruppo Aurora')`);
  esito(nota, 'pausa: a sinistra si legge «dopo Cantiere Gruppo Aurora …» con il tasto «automatica»');
  await foto(cdp, 'compila-dopo-pausa');

  // 7. Da tastiera: freccia giu' sulla maniglia del primo blocco.
  await valuta(cdp, `(() => { const b = [...${SX}.querySelectorAll('button[aria-label^="Sposta il blocco"]')][0]; b.focus(); b.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); return true; })()`);
  await pausa(300);
  const tast = await valuta(cdp, ordineSx());
  esito(/Aurora/.test(tast[0]) && /Logistica/.test(tast[1]), 'tastiera: freccia giù sposta il blocco', tast.join(' / '));

  // 8. Una colonna sola sotto i 1100px.
  await cdp.invia('Emulation.setDeviceMetricsOverride', { width: 1000, height: 900, deviceScaleFactor: 1, mobile: false });
  await pausa(500);
  const colonne = await valuta(cdp, `(() => { const g = ${DX}.closest('aside').parentElement; return getComputedStyle(g).gridTemplateColumns.split(' ').length; })()`);
  esito(colonne === 1, 'sotto 1100px: una colonna sola', String(colonne));
  const sborda = await valuta(cdp, `(() => { const d = ${DIALOGO}; return d.scrollWidth > d.clientWidth + 1; })()`);
  esito(!sborda, 'sotto 1100px: niente sbordo orizzontale');
  await foto(cdp, 'compila-dopo-1000');
  await cdp.invia('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await pausa(500);

  // 9. Salva: il server accetta la pausa spostata e i blocchi riordinati.
  await pausa(2500);
  await clicVero(cdp, bottone('^Salva la giornata$'));
  const chiuso = await finoA(cdp, `!${DIALOGO}`, { cosa: 'salvato', timeoutMs: 30000 }).then(() => true).catch(() => false);
  if (!chiuso) console.log('  errore:', await valuta(cdp, `document.querySelector('[role=dialog] [role=alert]')?.textContent ?? '-'`));
  esito(chiuso, 'salvato e dialog chiuso');
  if (chiuso) {
    const righe = JSON.parse(execSync(`supabase db query --linked "select string_agg(to_char(t.ts at time zone 'Europe/Rome','HH24:MI')||' '||t.tipo||(case when t.pausa then '*' else '' end)||' '||left(c.nome,8), ' | ' order by t.ts) s from timbrature t join cantieri c on c.id=t.cantiere_id where t.dipendente_id=${DIP_FABBRI} and (t.ts at time zone 'Europe/Rome')::date=current_date"`, { encoding: 'utf8' }).replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1')).rows?.[0]?.s ?? '';
    console.log('  timbrature:', righe);
    // Dopo la freccia giu' l'ordine e' Aurora, Logistica, Betulle e la pausa ha
    // seguito Aurora: 08:00 Aurora 4:30 → 12:30, strada → 12:40 Logistica, pausa 13:10.
    esito(/13:10 uscita\* Impianto/.test(righe) && /14:10 ingresso\* Impianto/.test(righe), 'db: la pausa sta dove e’ stata trascinata e ha seguito il blocco spostato', righe.slice(0, 160));
  }
} finally {
  pulisci();
  await chiudi();
}
process.exit(riepilogo() === 0 ? 0 : 1);
