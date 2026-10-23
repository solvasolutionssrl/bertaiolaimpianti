/**
 * Banco: il tecnico da computer (23/10/2026).
 *
 * Un tecnico del mondo presenze che entra da PC atterra in `/office/mio`, vede
 * una barra ridotta alle sue cose, non puo' aprire le pagine dell'ufficio, e
 * dalla pagina «Oggi» segna la presenza e la chiude con i soli comandi «suoi».
 *
 *   BANCO_CDP=9337 node scripts/banco-ui/desktop-tecnico.mjs
 */
import { execSync } from 'node:child_process';
import { apriChrome, vaiA, accedi, esito, riepilogo, foto, clicVero } from './comune.mjs';
import { valuta, finoA } from '../banco-upload/cdp.mjs';

const DIP = 'c1d00000-0000-4000-8000-000000000001'; // Marco Rinaldi, DEMOC, modalita' ufficio
// Con altri banchi che interrogano il database nello stesso momento la CLI
// a volte risponde con un errore vuoto: si riprova, non e' un fatto del banco.
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
const conta = (q) => {
  try {
    const out = execSync(`supabase db query --linked "${q.replace(/"/g, '\\"')}"`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const m = out.match(/"count":\s*(\d+)/);
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
};
const oggiAlle = (hhmm) => `((current_date::text || ' ${hhmm}')::timestamp at time zone 'Europe/Rome')`;
const pulisci = () => {
  sql(`delete from timbri_grezzi where dipendente_id='${DIP}' and sorgente='app' and ts >= ${oggiAlle('00:00')}`);
  sql(`delete from timbrature where dipendente_id='${DIP}' and ts >= ${oggiAlle('00:00')}`);
  sql(`delete from rapportini where dipendente_id='${DIP}' and data=current_date`);
};
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const MISURA = `(() => {
  const aside = document.querySelector('aside'); const main = document.querySelector('main');
  if (!aside || !main) return { manca: true };
  return { manca: false, sbordo: Math.max(0, document.documentElement.scrollWidth - window.innerWidth), scrollPagina: Math.max(0, document.documentElement.scrollHeight - window.innerHeight), testo: document.body.innerText.replace(/\\s+/g,' ') };
})()`;
const bottoneCard = (re) => `[...document.querySelectorAll('[data-le-mie-ore] button, [role=dialog] button')].find((b) => new RegExp(${JSON.stringify(re)}).test(b.textContent.trim()))`;

pulisci();
const { cdp, chiudi } = await apriChrome({ larghezza: 1440, altezza: 900 });
try {
  await accedi(cdp, 'tecnico');
  await finoA(cdp, `location.pathname.startsWith('/office/mio')`, { cosa: 'atterraggio in /office/mio', timeoutMs: 40000 });
  esito(true, 'da computer il tecnico atterra in /office/mio', await valuta(cdp, 'location.pathname'));

  await finoA(cdp, `document.querySelector('aside')`, { cosa: 'barra' });
  const barra = await valuta(cdp, `document.querySelector('aside').innerText.replace(/\\s+/g,' ')`);
  esito(/Oggi/.test(barra) && /Cantieri/.test(barra) && /Le mie ore/.test(barra) && /Le mie spese/.test(barra) && /Avvisi/.test(barra) && /Profilo/.test(barra), 'barra: le voci del tecnico', barra.slice(0, 160));
  esito(!/Presenze e ore|Dashboard|Impostazioni|Kontabilit|Sedi/.test(barra), 'barra: niente voci dell’ufficio');

  await vaiA(cdp, '/office/kantiere/rapportini');
  await finoA(cdp, `location.pathname === '/office/mio'`, { cosa: 'rimbalzo da Presenze e ore', timeoutMs: 30000 }).then(() => esito(true, 'una pagina dell’ufficio rimanda a /office/mio')).catch(async () => esito(false, 'una pagina dell’ufficio rimanda a /office/mio', await valuta(cdp, 'location.pathname')));

  const PAGINE = [
    ['/office/mio', /Oggi/],
    ['/office/mio/cantieri', /Cantieri/],
    ['/office/mio/ore', /Le mie ore/],
    ['/office/mio/spese', /Le mie spese/],
    ['/office/mio/pianificazione', /La mia settimana/],
    ['/office/mio/profilo', /Profilo/],
    ['/office/notifiche', /Avvisi/],
  ];
  for (const [path, re] of PAGINE) {
    await vaiA(cdp, path);
    await pausa(500);
    const m = await valuta(cdp, MISURA);
    const ok = !m.manca && m.sbordo === 0 && m.scrollPagina === 0 && re.test(m.testo);
    esito(ok, `pagina ${path}`, m.manca ? 'fuori dal guscio' : `sbordo ${m.sbordo} · scroll ${m.scrollPagina}`);
    if (!ok) await foto(cdp, `desktop-tecnico-${path.replace(/\//g, '_')}`);
  }

  // Cantieri: tabella e scheda.
  await vaiA(cdp, '/office/mio/cantieri');
  await finoA(cdp, `document.querySelector('tr[data-cantiere]')`, { cosa: 'righe cantieri', timeoutMs: 30000 });
  const nCant = await valuta(cdp, `document.querySelectorAll('tr[data-cantiere]').length`);
  esito(nCant > 0, 'cantieri: la tabella ha righe', String(nCant));
  await clicVero(cdp, `document.querySelector('tr[data-cantiere] td')`);
  await finoA(cdp, `/\\/office\\/mio\\/cantieri\\/[0-9a-f-]{36}$/.test(location.pathname)`, { cosa: 'scheda cantiere', timeoutMs: 30000 });
  await finoA(cdp, `/Sottocantieri/.test(document.body.innerText) && /Squadra/.test(document.body.innerText)`, { cosa: 'sezioni scheda', timeoutMs: 30000 });
  esito(true, 'cantieri: la scheda si apre con anagrafica, squadra e sottocantieri');

  // Oggi: presenza in sede dalla card, poi fine giornata.
  await vaiA(cdp, '/office/mio');
  await finoA(cdp, `document.querySelector('[data-le-mie-ore]')`, { cosa: 'card Le mie ore', timeoutMs: 30000 });
  await clicVero(cdp, bottoneCard('^Inizia giornata'));
  await finoA(cdp, `document.querySelector('[role=dialog][aria-label="Inizia giornata"]')`, { cosa: 'dialog avvio' });
  await clicVero(cdp, bottoneCard('^Inizia$'));
  // Il dialog di avvio sta DENTRO la card (non e' un Portal): si aspetta che
  // sparisca, o il suo «In sede · Sede…» farebbe passare il controllo a vuoto.
  await finoA(cdp, `!document.querySelector('[role=dialog][aria-label="Inizia giornata"]') && /In sede dalle|In turno/.test(document.querySelector('[data-le-mie-ore]')?.innerText ?? '')`, { cosa: 'presenza segnata', timeoutMs: 30000 });
  esito(true, 'oggi: «Inizia giornata» segna la presenza', await valuta(cdp, `document.querySelector('[data-le-mie-ore]').innerText.replace(/\\s+/g,' ').slice(0, 120)`));
  await foto(cdp, 'desktop-tecnico-oggi');
  const fine = await valuta(cdp, `!!(${bottoneCard('^Fine giornata|^Chiudi il turno')})`);
  if (fine) {
    await clicVero(cdp, bottoneCard('^Fine giornata|^Chiudi il turno'));
    const dialogo = await valuta(cdp, `[...document.querySelectorAll('[role=dialog]')].some((d) => /Chiudi il turno/.test(d.textContent))`);
    if (dialogo) await clicVero(cdp, bottoneCard('^Chiudi il turno$'));
    // La verita' sta nel registro: l'uscita scritta dal PC. (La card si
    // riaggiorna da sola, ma altri banchi sullo stesso tenant possono
    // ripulire nel frattempo, e un controllo a schermo mentirebbe.)
    let uscita = false;
    for (let i = 0; i < 10 && !uscita; i += 1) {
      await pausa(2000);
      uscita = conta(`select count(*) from timbri_grezzi where dipendente_id='${DIP}' and sorgente='app' and tipo='uscita' and ts >= ${oggiAlle('00:00')}`) > 0;
    }
    esito(uscita, 'oggi: la giornata si chiude dalla card (uscita nel registro, dal PC)');
  } else {
    esito(false, 'oggi: manca il tasto per chiudere');
  }
} finally {
  await chiudi();
  pulisci();
}
process.exit(riepilogo() === 0 ? 0 : 1);
