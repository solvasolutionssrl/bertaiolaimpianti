/**
 * Banco: la presenza in sede senza cantiere, dal PC.
 *
 *   node scripts/banco-ui/presenza-sede.mjs
 *
 * «Inizia giornata» con «In sede» e nessun cantiere → la presenza va nel
 * registro, la pillola dice «In sede · dalle», pausa e ripresa, «Fine giornata»
 * → «da ripartire» → «Inserisci le commesse» → le ore sul cantiere con
 * modalita' `app`. Vuole la scheda dipendente in modalita' ufficio sull'account
 * ufficio di DEMOC. SCRIVE sul demo.
 */
import { apriChrome, vaiA, accedi, esito, riepilogo, foto, clicVero } from './comune.mjs';
import { valuta, finoA } from '../banco-upload/cdp.mjs';
import { execSync } from 'node:child_process';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const PILLOLA = `document.querySelector('header button[title="La mia giornata"]')`;
const testoPillola = async (cdp) => valuta(cdp, `(${PILLOLA})?.innerText.replace(/\\s+/g,' ').trim() ?? null`);
const apriMenu = async (cdp) => { await clicVero(cdp, PILLOLA); await finoA(cdp, `document.querySelector('[role=menu]')`, { cosa: 'menu' }); };
const bottone = (re) => `[...document.querySelectorAll('[role=menu] button, [role=dialog] button')].find((b) => new RegExp(${JSON.stringify(re)}).test(b.textContent.trim()))`;
const attendiPillola = (cdp, re) => finoA(cdp, `new RegExp(${JSON.stringify(re)}).test((${PILLOLA})?.innerText ?? '')`, { cosa: `pillola ${re}`, timeoutMs: 30000 });

const { cdp, chiudi } = await apriChrome({});
try {
  await accedi(cdp, 'kantiere');
  await vaiA(cdp, '/office/kantiere/rapportini');
  await finoA(cdp, PILLOLA, { cosa: 'pillola', timeoutMs: 60000 });
  await apriMenu(cdp);
  await clicVero(cdp, bottone('^Inizia giornata'));
  await finoA(cdp, `document.querySelector('[role=dialog][aria-label="Inizia giornata"]')`, { cosa: 'dialog avvio' });
  const a = await valuta(cdp, `(() => { const d = document.querySelector('[role=dialog][aria-label="Inizia giornata"]'); const t = d.innerText; return { facoltativo: /facoltativo/.test(t), spiega: /le ore si attribuiscono ai cantieri alla chiusura/i.test(t) }; })()`);
  esito(a.facoltativo && a.spiega, 'avvio: il cantiere è facoltativo e lo dice');
  await clicVero(cdp, bottone('^Inizia$'));
  await attendiPillola(cdp, 'In sede · dalle');
  esito(true, 'header: «In sede · dalle HH:MM» senza cantiere', await testoPillola(cdp));
  await foto(cdp, 'presenza-01-in-sede');
  // Il banco va in secondi, una giornata in ore: l'ingresso si sposta
  // indietro di tre ore, cosi' la presenza non dura zero minuti.
  // Si sposta l'ingresso indietro di tre ore, ma mai prima della mezzanotte
  // italiana: lanciato di notte, la presenza finirebbe nel giorno prima.
  execSync(`supabase db query --linked "update timbri_grezzi set ts = ts - least(interval '3 hours', (now() at time zone 'Europe/Rome')::time - time '00:05') where sorgente='app' and dipendente_id='c1d00000-0000-4000-8000-00000000bb01' and tipo='ingresso'"`, { stdio: 'ignore' });
  await vaiA(cdp, '/office/kantiere/rapportini');
  await finoA(cdp, PILLOLA, { cosa: 'pillola', timeoutMs: 60000 });

  await apriMenu(cdp);
  await clicVero(cdp, bottone('^Pausa$'));
  await attendiPillola(cdp, 'In sede · .* da ripartire');
  esito(true, 'header: dopo la pausa, «da ripartire» (il registro non sa se torni)');
  await apriMenu(cdp);
  const m = await valuta(cdp, `document.querySelector('[role=menu]').innerText.replace(/\\s+/g,' ')`);
  esito(/Riprendi/.test(m) && /Inserisci le commesse/.test(m), 'menu: Riprendi e Inserisci le commesse', m.slice(0, 160));
  // Il testo di un tasto non deve uscire dal tasto, ne' il tasto dal menu.
  const sborda = await valuta(cdp, `(() => { const menu = document.querySelector('[role=menu]'); const mr = menu.getBoundingClientRect(); return [...menu.querySelectorAll('button')].filter((b) => b.scrollWidth > b.clientWidth + 1 || b.getBoundingClientRect().right > mr.right + 1).map((b) => b.textContent.trim()); })()`);
  esito(sborda.length === 0, 'menu: nessun tasto tagliato', sborda.join(', ') || 'tutti dentro');
  await clicVero(cdp, bottone('^Riprendi'));
  await attendiPillola(cdp, 'In sede · dalle');
  esito(true, 'header: ripreso');
  await apriMenu(cdp);
  await clicVero(cdp, bottone('^Fine giornata'));
  await attendiPillola(cdp, 'da ripartire');
  esito(true, 'header: chiusa, da ripartire');

  await apriMenu(cdp);
  await clicVero(cdp, bottone('^Inserisci le commesse'));
  await finoA(cdp, `[...document.querySelectorAll('[role=dialog]')].some((d) => /Inserisci le commesse sulle quali hai lavorato/.test(d.textContent))`, { cosa: 'dialog scatola' });
  await pausa(800);
  const d = await valuta(cdp, `(() => { const d = [...document.querySelectorAll('[role=dialog]')].find((x) => /Inserisci le commesse/.test(x.textContent)); const t = d.innerText; return { presenza: /presenza in sede/.test(t), badge: /badge/i.test(t), inSede: d.querySelector('[role=radiogroup][aria-label="Dove"] [role=radio][aria-checked="true"]')?.textContent.trim() }; })()`);
  esito(d.presenza && !d.badge, 'scatola: dice «presenza in sede», non «badge»');
  esito(d.inSede === 'In sede', 'scatola: «In sede» per default');
  await clicVero(cdp, `[...document.querySelectorAll('[role=dialog] button')].find((b) => /Cantiere…/.test(b.textContent))`);
  await pausa(500);
  await clicVero(cdp, `[...document.querySelectorAll('[role=option], [data-popover-portale] button')].find((b) => /Aurora/.test(b.textContent))`);
  await pausa(2500);
  await foto(cdp, 'presenza-02-scatola');
  await clicVero(cdp, bottone('^Salva la giornata$'));
  const salvato = await finoA(cdp, `![...document.querySelectorAll('[role=dialog]')].some((x) => /Inserisci le commesse/.test(x.textContent))`, { cosa: 'salvato', timeoutMs: 30000 }).then(() => true).catch(() => false);
  esito(salvato, 'scatola: salvata');
  if (!salvato) console.log('  errore:', await valuta(cdp, `document.querySelector('[role=dialog] [role=alert]')?.textContent ?? '-'`));
  await pausa(1500);
  await attendiPillola(cdp, 'Oggi .* di lavoro|Nessun turno').catch(() => null);
  esito(true, 'header: dopo', await testoPillola(cdp));
} finally {
  await chiudi();
}
process.exit(riepilogo() === 0 ? 0 : 1);
