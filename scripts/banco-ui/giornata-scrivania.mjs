/**
 * Banco: «La mia giornata» nell'header dell'ufficio e «Compila giornata» da PC.
 *
 *   node scripts/banco-ui/giornata-scrivania.mjs
 *
 * Presuppone che l'account ufficio di DEMOC abbia una scheda dipendente in
 * modalita' ufficio (nel banco del 22/10 creata a mano e tolta dopo).
 * SCRIVE sul tenant demo: si ripulisce a mano.
 */
import { apriChrome, vaiA, accedi, esito, riepilogo, foto, clicVero } from './comune.mjs';
import { valuta, finoA } from '../banco-upload/cdp.mjs';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const PILLOLA = `document.querySelector('header button[title="La mia giornata"]')`;
const testoPillola = async (cdp) => valuta(cdp, `(${PILLOLA})?.innerText.replace(/\\s+/g,' ').trim() ?? null`);
const apriMenu = async (cdp) => { await clicVero(cdp, PILLOLA); await finoA(cdp, `document.querySelector('[role=menu]')`, { cosa: 'menu' }); };
const bottone = (re) => `[...document.querySelectorAll('[role=menu] button, [role=dialog] button')].find((b) => new RegExp(${JSON.stringify(re)}).test(b.textContent.trim()))`;
const sceltaCantiere = async (cdp, nome) => {
  // In sede il cantiere e' facoltativo: la tendina dice «Nessuno: lo dici a fine giornata».
  await clicVero(cdp, `[...document.querySelectorAll('[role=dialog] button')].find((b) => /Cantiere…|Nessuno: lo dici/.test(b.textContent))`);
  await pausa(500);
  await clicVero(cdp, `[...document.querySelectorAll('[role=option], [data-popover-portale] button')].find((b) => new RegExp(${JSON.stringify(nome)}).test(b.textContent))`);
  await pausa(400);
};

const { cdp, chiudi } = await apriChrome({});
try {
  await accedi(cdp, 'kantiere');
  await vaiA(cdp, '/office/kantiere/rapportini');
  await finoA(cdp, PILLOLA, { cosa: 'pillola', timeoutMs: 40000 });
  esito(/Nessun turno/.test(await testoPillola(cdp)), 'header: pillola «Nessun turno»', await testoPillola(cdp));

  // Inizia giornata → in sede (default ufficio).
  await apriMenu(cdp);
  await clicVero(cdp, bottone('^Inizia giornata'));
  await finoA(cdp, `document.querySelector('[role=dialog][aria-label="Inizia giornata"]')`, { cosa: 'dialog avvio' });
  const avvio = await valuta(cdp, `(() => { const d = document.querySelector('[role=dialog][aria-label="Inizia giornata"]'); return { inSede: d.querySelector('[role=radio][aria-checked="true"]')?.textContent.trim() ?? null }; })()`);
  esito(/^In sede/.test(avvio.inSede ?? ''), 'avvio: «In sede» per default (persona in modalità ufficio)', avvio.inSede ?? '');
  await sceltaCantiere(cdp, 'Aurora');
  await clicVero(cdp, bottone('^Inizia$'));
  await finoA(cdp, `/In turno/.test((${PILLOLA})?.innerText ?? '')`, { cosa: 'turno aperto', timeoutMs: 30000 });
  const p1 = await testoPillola(cdp);
  esito(/In turno/.test(p1) && /Aurora/.test(p1), 'header: «In turno · Aurora · HH:MM»', p1);
  await foto(cdp, 'scrivania-01-turno');

  // Pausa e ripresa.
  await apriMenu(cdp);
  const menu = await valuta(cdp, `document.querySelector('[role=menu]').innerText.replace(/\\s+/g,' ')`);
  esito(/dall’app/.test(menu) && /in sede/.test(menu), 'menu: dice da dove e come è partito', menu.slice(0, 120));
  await clicVero(cdp, bottone('^Pausa pranzo'));
  await finoA(cdp, `/In pausa/.test((${PILLOLA})?.innerText ?? '')`, { cosa: 'in pausa', timeoutMs: 30000 });
  esito(true, 'header: «In pausa»');
  await apriMenu(cdp);
  const chiudiDisabilitato = await valuta(cdp, `(${bottone('^Chiudi il turno')})?.disabled ?? null`);
  esito(chiudiDisabilitato === true, 'menu: in pausa «Chiudi il turno» è spento');
  await clicVero(cdp, bottone('^Riprendi'));
  await finoA(cdp, `/In turno/.test((${PILLOLA})?.innerText ?? '')`, { cosa: 'ripreso', timeoutMs: 30000 });
  esito(true, 'header: ripreso');

  // Chiudi il turno dal dialog grande, con anteprima.
  await apriMenu(cdp);
  await clicVero(cdp, bottone('^Chiudi il turno'));
  await finoA(cdp, `[...document.querySelectorAll('[role=dialog]')].some((d) => /Chiudi il turno/.test(d.textContent))`, { cosa: 'dialog chiusura' });
  await pausa(1500);
  const c = await valuta(cdp, `(() => { const d = [...document.querySelectorAll('[role=dialog]')].find((x) => /Chiudi il turno/.test(x.textContent)); const t = d.innerText; return { anteprima: /Come verrà scritta/i.test(t), aurora: /Aurora/.test(t), bloccato: /turno aperto/i.test(t), nessunViaggio: /nessun viaggio/i.test(t) && !/IL VIAGGIO/.test(t), totali: /Lavoro/i.test(t) && /Viaggio/i.test(t) && /Km/i.test(t) }; })()`);
  esito(c.anteprima && c.totali, 'chiusura: anteprima «Come verrà scritta» con i totali');
  if (!c.anteprima || !c.nessunViaggio) console.log('  dialog:', await valuta(cdp, `[...document.querySelectorAll('[role=dialog]')].find((x) => /Chiudi il turno/.test(x.textContent))?.innerText.replace(/\\s+/g,' ').slice(0, 500)`));
  esito(c.aurora && c.bloccato, 'chiusura: il cantiere del turno c’è ed è bloccato');
  esito(c.nessunViaggio, 'chiusura: in sede, nessun viaggio chiesto');
  await foto(cdp, 'scrivania-02-chiusura');
  await clicVero(cdp, bottone('^Chiudi il turno$'));
  await finoA(cdp, `/Oggi .* di lavoro|Nessun turno/.test((${PILLOLA})?.innerText ?? '')`, { cosa: 'chiuso', timeoutMs: 30000 });
  esito(true, 'header: turno chiuso', await testoPillola(cdp));

  // Compila giornata per un'altra persona (Rinaldi, oggi, giornata vuota).
  await clicVero(cdp, `[...document.querySelectorAll('button')].find((b) => /^Compila giornata$/.test(b.textContent.trim()))`);
  await finoA(cdp, `[...document.querySelectorAll('[role=dialog] h2')].some((h) => /Compila giornata/.test(h.textContent))`, { cosa: 'scelta' });
  await valuta(cdp, `(() => { const sel = document.querySelector('[role=dialog] select'); const opt = [...sel.options].find((o) => /Fabbri/.test(o.text)); if (!opt) return false; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(sel, opt.value); sel.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await pausa(300);
  await clicVero(cdp, bottone('^Avanti$'));
  await finoA(cdp, `[...document.querySelectorAll('[role=dialog]')].some((d) => /Compila la giornata di/.test(d.textContent))`, { cosa: 'dialog compila' });
  await sceltaCantiere(cdp, 'Logistica');
  await valuta(cdp, `(() => { const inp = [...document.querySelectorAll('[role=dialog] input[aria-label="Minuti"]')].pop(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(inp, '480'); inp.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await pausa(2500);
  const k = await valuta(cdp, `(() => { const d = [...document.querySelectorAll('[role=dialog]')].find((x) => /Compila la giornata di/.test(x.textContent)); const t = d.innerText; return { fine: /Fine · calcolata/.test(t), anteprima: /Logistica/.test(t) && /Partenza/.test(t), inCantiere: d.querySelector('[role=radiogroup][aria-label="Dove"] [role=radio][aria-checked="true"]')?.textContent.trim() }; })()`);
  esito(k.inCantiere === 'In cantiere', 'compila altro: «In cantiere» per default (Fabbri è esterno)', k.inCantiere ?? '');
  esito(k.anteprima, 'compila altro: anteprima con cantiere e partenza');
  await foto(cdp, 'scrivania-03-compila');
  // Le stime di strada arrivano in un paio di secondi: un dito vero non e' cosi' veloce.
  await pausa(4000);
  await clicVero(cdp, bottone('^Salva la giornata$'));
  const chiuso = await finoA(cdp, `![...document.querySelectorAll('[role=dialog]')].some((x) => /Compila la giornata di/.test(x.textContent))`, { cosa: 'salvato', timeoutMs: 30000 }).then(() => true).catch(() => false);
  esito(chiuso, 'compila altro: salvato e dialog chiuso');
  if (!chiuso) console.log('  errore:', await valuta(cdp, `document.querySelector('[role=dialog] [role=alert]')?.textContent ?? '-'`));
} finally {
  await chiudi();
}
process.exit(riepilogo() === 0 ? 0 : 1);
