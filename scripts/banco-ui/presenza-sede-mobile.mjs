/**
 * Banco: la presenza in sede senza cantiere, dal TELEFONO.
 *
 *   node scripts/banco-ui/presenza-sede-mobile.mjs
 *
 * Marco (tecnico demo, modalita' ufficio): «Inizia giornata» → «Inizia senza
 * cantiere» → card della presenza (pausa, ripresa, fine) → la tab Ore la
 * mostra come «In sede oggi». Poi la stessa persona in modalita' esterno: il
 * foglio «Inizia turno» offre lo stesso tasto. SCRIVE sul demo e si ripulisce.
 */
import { apriChrome, vaiA, accedi, esito, riepilogo, foto, clicVero } from './comune.mjs';
import { valuta, finoA } from '../banco-upload/cdp.mjs';
import { execSync } from 'node:child_process';

const DIP = 'c1d00000-0000-4000-8000-000000000001';
const sql = (q) => execSync(`supabase db query --linked "${q.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const bottone = (re) => `[...document.querySelectorAll('button, a')].find((b) => new RegExp(${JSON.stringify(re)}).test(b.textContent.replace(/\\s+/g,' ').trim()))`;
const card = (stato) => `document.querySelector('[data-presenza-sede="${stato}"]')`;
const attendiCard = (cdp, stato) => finoA(cdp, card(stato), { cosa: `card presenza ${stato}`, timeoutMs: 40000 });
const testoCard = (cdp) => valuta(cdp, `document.querySelector('[data-presenza-sede]')?.innerText.replace(/\\s+/g,' ').trim() ?? null`);

const { cdp, chiudi } = await apriChrome({ mobile: true });
try {
  sql(`delete from timbri_grezzi where dipendente_id='${DIP}' and sorgente='app'`);
  sql(`update dipendenti set modalita_lavoro='ufficio' where id='${DIP}'`);
  await accedi(cdp, 'tecnico');
  await vaiA(cdp, '/mobile/kantiere/cantieri');
  await finoA(cdp, bottone('^Inizia giornata'), { cosa: 'card Inizia giornata', timeoutMs: 90000 });
  await clicVero(cdp, bottone('^Inizia giornata'));
  await finoA(cdp, bottone('^Inizia senza cantiere'), { cosa: 'tasto senza cantiere' });
  esito(true, 'ufficio: il foglio offre «Inizia senza cantiere»');
  await foto(cdp, 'presenza-mobile-01-foglio');
  await clicVero(cdp, bottone('^Inizia senza cantiere'));
  await attendiCard(cdp, 'aperta');
  const t1 = await testoCard(cdp);
  esito(/Dentro dalle \d\d:\d\d/.test(t1) && /Pausa/.test(t1) && /Fine giornata/.test(t1), 'ufficio: card aperta con Pausa e Fine', t1);
  esito(!(await valuta(cdp, `!!${bottone('^Inizia giornata')}`)), 'ufficio: niente «Inizia giornata» con la presenza aperta');
  await foto(cdp, 'presenza-mobile-02-aperta');

  sql(`update timbri_grezzi set ts = ts - interval '3 hours' where dipendente_id='${DIP}' and sorgente='app' and tipo='ingresso'`);
  await vaiA(cdp, '/mobile/kantiere/cantieri');
  await attendiCard(cdp, 'aperta');
  await clicVero(cdp, bottone('^Pausa$'));
  await attendiCard(cdp, 'chiusa');
  const t2 = await testoCard(cdp);
  esito(/di presenza/.test(t2) && /Riprendi/.test(t2) && /Inserisci le commesse/.test(t2), 'ufficio: dopo la pausa, Riprendi e Inserisci le commesse', t2);
  const doppia = await valuta(cdp, `document.body.innerText.match(/Inserisci le commesse/g)?.length ?? 0`);
  esito(doppia === 1, 'ufficio: «Inserisci le commesse» una volta sola (niente striscia doppia)', String(doppia));
  await foto(cdp, 'presenza-mobile-03-pausa');
  await clicVero(cdp, bottone('^Riprendi'));
  await attendiCard(cdp, 'aperta');
  esito(true, 'ufficio: ripreso');
  await clicVero(cdp, bottone('^Fine giornata'));
  await attendiCard(cdp, 'chiusa');
  esito(true, 'ufficio: chiusa, da ripartire');

  await vaiA(cdp, '/mobile/kantiere/ore');
  await finoA(cdp, `/In sede oggi/i.test(document.body.innerText)`, { cosa: 'tab Ore: In sede oggi', timeoutMs: 60000 });
  const ore = await valuta(cdp, `document.body.innerText.replace(/\\s+/g,' ')`);
  esito(/Inserisci le commesse sulle quali hai lavorato oggi/.test(ore) && !/al terminale/.test(ore), 'ore: la scatola c’è e non parla di terminale');
  await foto(cdp, 'presenza-mobile-04-ore');

  // ── Modalita' esterno: stesso tasto nel foglio «Inizia turno» ──
  sql(`update dipendenti set modalita_lavoro='esterno' where id='${DIP}'`);
  await vaiA(cdp, '/mobile/kantiere/cantieri');
  await attendiCard(cdp, 'chiusa');
  esito(true, 'esterno: la card della presenza chiusa sta sopra l’elenco');
  await finoA(cdp, bottone('^Inizia turno'), { cosa: 'tasto Inizia turno' });
  await clicVero(cdp, bottone('^Inizia turno'));
  await finoA(cdp, bottone('^Inizia senza cantiere'), { cosa: 'tasto senza cantiere (esterno)' });
  esito(true, 'esterno: il foglio «Inizia turno» offre «Inizia senza cantiere»');
  await foto(cdp, 'presenza-mobile-05-esterno-foglio');
  await clicVero(cdp, bottone('^Inizia senza cantiere'));
  await attendiCard(cdp, 'aperta');
  esito(!(await valuta(cdp, `!!${bottone('^Inizia turno')}`)), 'esterno: con la presenza aperta «Inizia turno» sparisce');
  await clicVero(cdp, bottone('^Fine giornata'));
  await attendiCard(cdp, 'chiusa');
  esito(true, 'esterno: chiusa');
} finally {
  sql(`update dipendenti set modalita_lavoro='ufficio' where id='${DIP}'`);
  sql(`delete from timbri_grezzi where dipendente_id='${DIP}' and sorgente='app'`);
  await chiudi();
}
process.exit(riepilogo() === 0 ? 0 : 1);
