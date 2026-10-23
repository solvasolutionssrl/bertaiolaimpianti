/**
 * Banco: i SOTTOCANTIERI (fasi) sul telefono.
 *
 * Semina una fase sul cantiere Aurora del tenant demo (DEMOC), poi con il
 * tecnico demo: «Inizia turno» → la riga di Aurora ha il pallino con il numero
 * di fasi e la freccia; la freccia apre la fase; si sceglie la fase; il turno
 * parte e la card dice «› Fase banco»; «Termina turno» chiude; nel database
 * l'ingresso, l'uscita e la riga delle ore portano la fase. Si ripulisce da solo.
 *
 *   node scripts/banco-ui/sottocantieri-mobile.mjs
 */

import { execSync } from 'node:child_process';
import { apriChrome, vaiA, accedi, esito, riepilogo, foto, valuta, finoA, clicVero } from './comune.mjs';

const DIP = 'c1d00000-0000-4000-8000-000000000001';
const TENANT = `(select tenant_id from dipendenti where id='${DIP}')`;
const sql = (q) => execSync(`supabase db query --linked "${q.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
const leggi = (q) => {
  const out = execSync(`supabase db query --linked "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    return JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)).rows ?? [];
  } catch {
    return [];
  }
};
/** Il giorno italiano: `current_date` nel database e' UTC, e dopo mezzanotte e' ancora ieri. */
const OGGI_ROME = "((now() at time zone 'Europe/Rome')::date)";
const oggiAlle = (hhmm) => `((${OGGI_ROME}::text || ' ${hhmm}')::timestamp at time zone 'Europe/Rome')`;
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const testo = (cdp) => valuta(cdp, `document.body.innerText`);

const pulisci = () => {
  sql(`delete from timbratura_viaggio where dipendente_id='${DIP}' and data=${OGGI_ROME}`);
  sql(`delete from timbrature where dipendente_id='${DIP}' and ts >= ${oggiAlle('00:00')}`);
  sql(`delete from rapportini where dipendente_id='${DIP}' and data=${OGGI_ROME}`);
  sql(`delete from timbri_grezzi where dipendente_id='${DIP}' and sorgente='app' and ts >= ${oggiAlle('00:00')}`);
  sql(`delete from sottocantieri where codice='B-01' and nome='Fase banco' and tenant_id=${TENANT}`);
};

pulisci();
sql(`update dipendenti set modalita_lavoro='esterno' where id='${DIP}'`);
sql(`insert into sottocantieri (tenant_id, cantiere_id, nome, codice, descrizione) select tenant_id, id, 'Fase banco', 'B-01', 'Fase di prova del banco' from cantieri where tenant_id=${TENANT} and nome ilike '%aurora%' and stato='attivo' order by nome limit 1`);
const seminata = leggi(`select id from sottocantieri where codice='B-01' and nome='Fase banco' and tenant_id=${TENANT}`);
if (seminata.length === 0) {
  console.log('NON MISURATO: nessun cantiere «Aurora» attivo su DEMOC, la fase non si semina.');
  process.exit(1);
}

const { cdp, chiudi } = await apriChrome({ mobile: true });
const erroriBrowser = [];
cdp.su('Runtime.exceptionThrown', (p) =>
  erroriBrowser.push(`eccezione: ${p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text}`),
);

async function scrivi(cdp, selettore, valore) {
  await valuta(
    cdp,
    `(() => {
      const radice = [...document.querySelectorAll('[role="dialog"]')].pop() ?? document;
      const el = radice.querySelector(${JSON.stringify(selettore)});
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, ${JSON.stringify(valore)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`,
  );
  await pausa(600);
}

try {
  await accedi(cdp, 'tecnico');
  // Il foglio «Aggiungi alla Home» compare sul telefono dopo qualche
  // navigazione e si mette davanti a tutto: per questo banco e' rumore.
  await valuta(cdp, `(() => { try { localStorage.setItem('pwa.installed', '1'); sessionStorage.setItem('pwa.session-dismissed', '1'); } catch {} return true; })()`);
  await vaiA(cdp, '/mobile/kantiere/cantieri');
  await finoA(cdp, `[...document.querySelectorAll('button')].some((b) => /Inizia turno/.test(b.textContent))`, { cosa: 'tasto Inizia turno', timeoutMs: 30_000 });
  await clicVero(cdp, `[...document.querySelectorAll('button')].find((b) => /Inizia turno/.test(b.textContent))`);
  await finoA(cdp, `!!document.querySelector('input[aria-label="Cerca cantiere"]')`, { cosa: 'ricerca cantiere' });
  await scrivi(cdp, 'input[aria-label="Cerca cantiere"]', 'Aurora');
  await finoA(cdp, `!!document.querySelector('[data-fasi-toggle]')`, { cosa: 'riga di Aurora con le fasi', timeoutMs: 30_000 });

  // 1. Il pallino con il numero di fasi e la freccia.
  const toggle = await valuta(cdp, `(() => { const t = document.querySelector('[data-fasi-toggle]'); return t ? { testo: t.textContent.trim(), aperto: t.getAttribute('aria-expanded'), h: Math.round(t.getBoundingClientRect().height), w: Math.round(t.getBoundingClientRect().width) } : null; })()`);
  esito(!!toggle && toggle.testo === '1' && toggle.aperto === 'false', 'la riga del cantiere mostra il pallino «1» e la freccia chiusa', JSON.stringify(toggle));
  esito(!!toggle && toggle.w >= 44 && toggle.h >= 44, 'la freccia è un bersaglio da 44px', toggle ? `${toggle.w}x${toggle.h}` : '');
  await foto(cdp, 'sottocantieri-01-pallino');

  // 2. La freccia apre le fasi (clic vero: pointer-events contano).
  await clicVero(cdp, `document.querySelector('[data-fasi-toggle]')`);
  await finoA(cdp, `!!document.querySelector('[data-fasi-di]')`, { cosa: 'elenco fasi aperto' });
  let t = await testo(cdp);
  esito(/B-01/.test(t) && /Fase banco/.test(t) && /Fase di prova del banco/.test(t), 'la fase compare con codice, nome e descrizione');
  await foto(cdp, 'sottocantieri-02-fasi');

  // 3. Si sceglie la fase, non il cantiere intero.
  await clicVero(cdp, `[...document.querySelectorAll('[data-fasi-di] button')].find((b) => /Fase banco/.test(b.textContent))`);
  await pausa(500);
  t = await testo(cdp);
  esito(/Continua[\s\S]{0,80}Fase banco/.test(t), 'il tasto «Continua» porta il nome della fase', (t.match(/Continua[\s\S]{0,60}/) ?? [''])[0].replace(/\n/g, ' '));
  const continua = () => clicVero(cdp, `[...document.querySelectorAll('button')].find((b) => /^Continua/.test(b.textContent.trim()))`);
  await continua();
  // Il foglio della partenza chiede le sedi al server: con il server di sviluppo
  // che ricompila, un secondo tocco dopo l'attesa non e' un difetto dell'app.
  await finoA(cdp, `/Luogo di partenza/.test(document.body.innerText) && !/Carico le sedi/.test(document.body.innerText)`, { cosa: 'foglio partenza', timeoutMs: 40_000 }).catch(async () => {
    await continua();
    await finoA(cdp, `/Luogo di partenza/.test(document.body.innerText) && !/Carico le sedi/.test(document.body.innerText)`, { cosa: 'foglio partenza (secondo tocco)', timeoutMs: 40_000 });
  });
  // Il tasto si accende quando la stima della strada e' arrivata.
  await finoA(cdp, `(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Avvia turno$/.test(x.textContent.trim())); return !!b && !b.disabled && !/stima\\.\\.\\./.test(document.body.innerText); })()`, { cosa: 'tasto Avvia turno acceso', timeoutMs: 40_000 });
  await pausa(500);
  await clicVero(cdp, `[...document.querySelectorAll('button')].find((b) => /^Avvia turno$/.test(b.textContent.trim()))`);
  // Senza la spunta «guidavo io» l'app chiede conferma: si risponde da passeggero.
  await finoA(cdp, `[...document.querySelectorAll('button')].some((b) => /Sì, ero passeggero/.test(b.textContent)) || /Turno in corso/i.test(document.body.innerText)`, { cosa: 'conferma passeggero o turno', timeoutMs: 20_000 });
  await clicVero(cdp, `[...document.querySelectorAll('button')].find((b) => /Sì, ero passeggero/.test(b.textContent))`).catch(() => null);
  await finoA(cdp, `/Turno in corso/i.test(document.body.innerText)`, { cosa: 'turno avviato', timeoutMs: 30_000 });
  await pausa(1200);
  t = await testo(cdp);
  esito(/› Fase banco/.test(t), 'la card del turno dice «Cantiere › Fase banco»', (t.match(/[^\n]*› Fase banco[^\n]*/) ?? [''])[0]);
  await foto(cdp, 'sottocantieri-03-turno');

  const ingressi = leggi(`select sottocantiere_id from timbrature where dipendente_id='${DIP}' and ts >= ${oggiAlle('00:00')} and tipo='ingresso'`);
  esito(ingressi.length === 1 && ingressi[0].sottocantiere_id === seminata[0].id, 'nel database l’ingresso porta la fase');

  // 4. La ricerca per nome della fase apre il cantiere da sola (nel cambio cantiere).
  // «Cambia» (card compatta) o «Cambia cantiere»: non «Cambia l'ora di fine».
  await clicVero(cdp, `[...document.querySelectorAll('button')].find((b) => /^Cambia( cantiere)?$/.test(b.textContent.trim()))`);
  await finoA(cdp, `!!document.querySelector('input[aria-label="Cerca cantiere"]')`, { cosa: 'ricerca nel cambio cantiere' });
  // L'elenco del cambio cantiere si carica al primo tocco: si aspetta che ci sia.
  await finoA(cdp, `!!document.querySelector('[data-fasi-toggle]')`, { cosa: 'elenco del cambio cantiere', timeoutMs: 30_000 }).catch(async (e) => {
    const diag = await valuta(cdp, `(() => { const d = [...document.querySelectorAll('[role="dialog"]')].pop(); return { titolo: d?.querySelector('h2')?.textContent, voci: d ? d.querySelectorAll('li').length : -1, testo: (d?.innerText || document.body.innerText).slice(0, 300) }; })()`);
    console.log('  · diagnostica cambio cantiere:', JSON.stringify(diag));
    await foto(cdp, 'sottocantieri-err-cambio');
    throw e;
  });
  await scrivi(cdp, 'input[aria-label="Cerca cantiere"]', 'banco');
  await pausa(500);
  const autoAperto = await valuta(cdp, `!!document.querySelector('[data-fasi-di]') && /Fase banco/.test(document.body.innerText)`);
  esito(autoAperto, 'cercando il nome della fase il cantiere si apre da solo');
  await foto(cdp, 'sottocantieri-04-cerca-fase');
  await clicVero(cdp, `[...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Chiudi')`);
  await pausa(600);

  // 5. Fine turno: la fase si eredita sull'uscita e sulla riga delle ore.
  // ⚠️ Con il passo di 5 minuti di DEMOC un turno aperto e chiuso nello stesso
  // slot vale zero minuti e non produce nessuna riga: l'ingresso si sposta
  // indietro di un quarto d'ora, cosi' la riga esiste e si puo' misurare.
  sql(`update timbrature set ts = ts - interval '15 minutes' where dipendente_id='${DIP}' and tipo='ingresso' and ts >= ${oggiAlle('00:00')}`);
  await clicVero(cdp, `[...document.querySelectorAll('button')].find((b) => /^Termina turno/.test(b.textContent.trim()))`);
  await finoA(cdp, `/Destinazione/.test(document.body.innerText)`, { cosa: 'dialog fine turno', timeoutMs: 15_000 });
  await pausa(800);
  await clicVero(cdp, `[...[...document.querySelectorAll('[role="dialog"]')].pop().querySelectorAll('button')].find((b) => /^Termina turno$/.test(b.textContent.trim()))`);
  await finoA(cdp, `[...document.querySelectorAll('button')].some((b) => /Sì, ero passeggero/.test(b.textContent)) || !/Turno in corso/i.test(document.body.innerText)`, { cosa: 'conferma passeggero o chiusura', timeoutMs: 20_000 });
  await clicVero(cdp, `[...document.querySelectorAll('button')].find((b) => /Sì, ero passeggero/.test(b.textContent))`).catch(() => null);
  await finoA(cdp, `!/Turno in corso/i.test(document.body.innerText)`, { cosa: 'turno chiuso', timeoutMs: 30_000 });
  await pausa(1500);
  const uscite = leggi(`select sottocantiere_id from timbrature where dipendente_id='${DIP}' and ts >= ${oggiAlle('00:00')} and tipo='uscita'`);
  esito(uscite.length === 1 && uscite[0].sottocantiere_id === seminata[0].id, 'l’uscita eredita la fase dell’ingresso');
  const righe = leggi(`select r.sottocantiere_id from rapportino_righe r join rapportini p on p.id=r.rapportino_id where p.dipendente_id='${DIP}' and p.data=${OGGI_ROME}`);
  esito(righe.length === 1 && righe[0].sottocantiere_id === seminata[0].id, 'la riga delle ore è della fase');

  await vaiA(cdp, '/mobile/kantiere/ore');
  await pausa(1500);
  t = await testo(cdp);
  console.log(`  · tab Ore: ${/› Fase banco/.test(t) ? 'mostra «› Fase banco»' : 'una riga sola, il riepilogo per cantiere non compare'}`);
  await foto(cdp, 'sottocantieri-05-ore');

  esito(erroriBrowser.length === 0, 'nessun errore nel browser', erroriBrowser.length ? `${erroriBrowser.length}` : '');
  for (const e of erroriBrowser.slice(0, 5)) console.log(`    · ${e}`);
} finally {
  await chiudi();
  // `BANCO_TIENI=1` lascia i dati sul demo per guardarli: poi si ripulisce a mano.
  if (!process.env.BANCO_TIENI) pulisci();
  sql(`update dipendenti set modalita_lavoro='ufficio' where id='${DIP}'`);
}

process.exitCode = riepilogo() > 0 ? 1 : 0;
