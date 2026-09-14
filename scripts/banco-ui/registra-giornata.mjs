/**
 * Banco: «Registra giornata» con il percorso (partenza, tratte, rientro, mezzo).
 *
 * iPhone emulato, tecnico demo (DEMOC). Fotografa la pagina e il foglio «Il
 * viaggio» nei casi che contano: un cantiere, due cantieri, la tratta aperta,
 * il passaggio dalla sede, la guida. Misura che la barra dei tempi resti
 * visibile sotto il foglio e che niente sbordi di lato.
 *
 * Non registra niente: preme «Registra giornata» solo quando manca la
 * partenza, cioè quando il tasto apre il foglio invece di salvare.
 *
 *   node scripts/banco-ui/registra-giornata.mjs
 */

import { apriChrome, vaiA, accedi, esito, riepilogo, foto } from './comune.mjs';
import { valuta, finoA } from '../banco-upload/cdp.mjs';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

/** Funzioni di servizio iniettate nella pagina a ogni chiamata. */
const AIUTI = `
  const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const visibile = (el) => el.getClientRects().length > 0;
  const pagina = () => document.querySelector('[role="dialog"][aria-label="Registra giornata"]');
  const foglio = () => document.querySelector('section[role="dialog"][aria-label="Il viaggio"]');
  const tastoRegistra = () => [...(pagina()?.querySelectorAll('button') ?? [])].filter((b) => /^Registra giornata$/.test(t(b.textContent))).pop();
  const setValore = (el, v) => {
    const proto = Object.getPrototypeOf(el);
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
`;

/** Clicca l'elemento visibile più in alto (l'ultimo nel DOM) che corrisponde. */
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
  await pausa(350);
  return r === 'ok';
}

async function aggiungiCantiere(cdp, cerca) {
  await clicca(cdp, '^Aggiungi (il )?cantiere$', { dentro: 'pagina()' });
  await finoA(cdp, `[...document.querySelectorAll('[role="dialog"] h2')].some((h) => /Aggiungi cantiere/.test(h.textContent))`, {
    cosa: 'foglio cantieri',
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
  await pausa(500);
  return scelto;
}

/** Ore sul cantiere n (0-based), scritte nel campo «ore» come farebbe il dito. */
async function ore(cdp, indice, h) {
  await valuta(
    cdp,
    `(() => {
      ${AIUTI}
      const campi = [...pagina().querySelectorAll('input[aria-label="ore"]')];
      if (campi[${indice}]) setValore(campi[${indice}], '${h}');
      return campi.length;
    })()`,
  );
  await pausa(250);
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
  await pausa(300);
}

async function misura(cdp) {
  return valuta(
    cdp,
    `(() => {
      ${AIUTI}
      const f = foglio()?.getBoundingClientRect();
      const piede = tastoRegistra()?.parentElement?.getBoundingClientRect();
      const barra = tastoRegistra()?.parentElement?.firstElementChild?.getBoundingClientRect();
      return {
        vh: innerHeight,
        sbordo: document.documentElement.scrollWidth > innerWidth || (pagina()?.scrollWidth ?? 0) > innerWidth,
        foglio: f ? { top: Math.round(f.top), bottom: Math.round(f.bottom) } : null,
        piede: piede ? { top: Math.round(piede.top), bottom: Math.round(piede.bottom) } : null,
        barra: barra ? { top: Math.round(barra.top), bottom: Math.round(barra.bottom) } : null,
        testoPiede: t(tastoRegistra()?.parentElement?.innerText),
      };
    })()`,
  );
}

const { cdp, chiudi } = await apriChrome({ mobile: true });
// Errori nel browser: il riquadro rosso di Next in sviluppo non basta vederlo in
// foto, bisogna sapere cosa dice.
const erroriBrowser = [];
cdp.su('Runtime.exceptionThrown', (p) =>
  erroriBrowser.push(`eccezione: ${p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text}`),
);
cdp.su('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error') {
    erroriBrowser.push(`console.error: ${p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400)}`);
  }
});
try {
  await accedi(cdp, 'tecnico');
  await vaiA(cdp, '/mobile/kantiere/ore');
  await finoA(cdp, `[...document.querySelectorAll('button')].some((b) => /Registra giornata/.test(b.textContent))`, {
    cosa: 'tasto Registra giornata',
    timeoutMs: 30_000,
  });
  // Il vecchio inserimento «Ore su un cantiere, con viaggio» non c'è più.
  esito(
    !(await valuta(cdp, `/Ore su un cantiere/.test(document.body.innerText)`)),
    'la tab Ore offre solo «Registra giornata»',
  );
  await foto(cdp, 'rg-00-tab-ore');
  await clicca(cdp, 'Registra giornata');
  await finoA(cdp, `!!document.querySelector('[role="dialog"][aria-label="Registra giornata"]')`, { cosa: 'pagina' });
  await pausa(900);
  await foto(cdp, 'rg-01-vuota');

  // ── Un cantiere ─────────────────────────────────────────────────────────
  esito(await aggiungiCantiere(cdp, 'Aurora'), 'aggiunge un cantiere dalla ricerca');
  await ore(cdp, 0, 8);
  await foto(cdp, 'rg-02-un-cantiere');

  let m = await misura(cdp);
  esito(!m.sbordo, 'la pagina non sborda di lato');
  esito(/8:00\s*di 8:00/.test(m.testoPiede), 'la barra conta le ore assegnate', m.testoPiede.slice(0, 60));

  // Manca la partenza: il tasto apre il foglio, non salva.
  await clicca(cdp, '^Registra giornata$', { dentro: 'pagina()' });
  await pausa(700);
  m = await misura(cdp);
  esito(!!m.foglio, 'senza partenza, «Registra giornata» apre il foglio «Il viaggio»');
  esito(!!m.foglio && !!m.piede && m.foglio.bottom <= m.piede.top + 1, 'il foglio si ferma sopra la barra dei tempi', JSON.stringify({ foglio: m.foglio, piede: m.piede }));
  esito(!!m.piede && m.piede.bottom <= m.vh + 1 && m.piede.top < m.vh, 'la barra dei tempi resta visibile');
  esito(
    await valuta(cdp, `(() => { ${AIUTI} return !!foglio()?.querySelector('[role="listbox"][aria-label="Partenza"]'); })()`),
    'il foglio si apre già sulle scelte della partenza',
  );
  await foto(cdp, 'rg-03-foglio-un-cantiere');

  // ── Due cantieri, prima di scegliere la partenza ────────────────────────
  await clicca(cdp, 'Torna alla giornata');
  esito(await aggiungiCantiere(cdp, 'Logistica'), 'aggiunge il secondo cantiere');
  await ore(cdp, 0, 4);
  await ore(cdp, 1, 4);
  await pausa(2500);
  await scorri(cdp, 'fondo');
  await foto(cdp, 'rg-04-due-cantieri');

  const tratta = await valuta(
    cdp,
    `(() => { ${AIUTI} const b = [...pagina().querySelectorAll('button[aria-expanded]')].find((x) => /^Diretta/.test(t(x.textContent))); return b ? t(b.textContent) : null; })()`,
  );
  esito(!!tratta, 'fra i due cantieri compare la tratta, diretta, con km e tempo', tratta ?? '');

  await clicca(cdp, '^Diretta', { dentro: 'pagina()' });
  await foto(cdp, 'rg-05-menu-tratta');
  esito(await clicca(cdp, '^Passando da Sede', { dentro: 'pagina()' }), 'la tratta si cambia in «passando dalla sede»');
  await pausa(2500);
  await scorri(cdp, 'fondo');
  await foto(cdp, 'rg-06-via-sede');

  // Manca ancora la partenza: foglio con due cantieri.
  await clicca(cdp, '^Registra giornata$', { dentro: 'pagina()' });
  await pausa(700);
  await foto(cdp, 'rg-07-foglio-due-cantieri');

  // La scelta dentro il menu della partenza, non la tratta «passando da Sede Nordest».
  esito(
    await clicca(cdp, 'Sede Nordest', { dentro: `foglio()?.querySelector('[role="listbox"][aria-label="Partenza"]')` }),
    'nel foglio si sceglie la partenza con un tocco',
  );
  await pausa(3000);
  const rientro = await valuta(
    cdp,
    `(() => { ${AIUTI} const b = [...foglio().querySelectorAll('button[aria-expanded]')].find((x) => /^Rientro/i.test(t(x.textContent))); return b ? t(b.textContent) : null; })()`,
  );
  esito(/Sede Nordest/.test(rientro ?? ''), 'il rientro prende la stessa sede della partenza', rientro ?? '');
  await foto(cdp, 'rg-08-foglio-partenza');

  await clicca(cdp, 'Guidavo io', { dentro: 'foglio()' });
  await pausa(400);
  await foto(cdp, 'rg-09-foglio-guida');

  m = await misura(cdp);
  esito(/Viaggio \d+:\d\d/.test(m.testoPiede), 'la barra somma il tempo di viaggio', m.testoPiede);
  esito(/Partenza \d\d:\d\d/.test(m.testoPiede) && /Rientro \d\d:\d\d/.test(m.testoPiede), 'la barra mostra partenza e rientro');

  await clicca(cdp, 'Torna alla giornata');
  await scorri(cdp, 'inizio');
  await foto(cdp, 'rg-10-pagina-completa-alto');
  await scorri(cdp, 'fondo');
  await foto(cdp, 'rg-11-pagina-completa-fondo');

  // ── Passeggero: la conferma resta sempre ────────────────────────────────
  await scorri(cdp, 'inizio');
  await clicca(cdp, 'Guidavo io', { dentro: 'pagina()' }); // la spegne
  await clicca(cdp, '^Registra giornata$', { dentro: 'pagina()' });
  await pausa(700);
  const conferma = await valuta(
    cdp,
    `(() => { ${AIUTI} return /Hai viaggiato da passeggero/.test(pagina()?.innerText || ''); })()`,
  );
  esito(conferma, 'chi non guidava conferma di essere passeggero');
  await foto(cdp, 'rg-12-conferma-passeggero');
  if (conferma) {
    await clicca(cdp, 'No, guidavo io', { dentro: 'pagina()' });
    await pausa(800);
    await foto(cdp, 'rg-13-guida-evidenziata');
  }

  // ── Salvataggio vero, solo se richiesto (tenant demo, da ripulire dopo) ──
  if (process.env.BANCO_SALVA === '1') {
    await clicca(cdp, 'Guidavo io', { dentro: 'pagina()' }); // la riaccende
    const senzaMezzo = await valuta(
      cdp,
      `(() => { ${AIUTI} const sel = [...pagina().querySelectorAll('select[aria-label="Mezzo"]')].pop(); return !sel || !sel.value; })()`,
    );
    if (senzaMezzo) {
      await clicca(cdp, '^Registra giornata$', { dentro: 'pagina()' });
      await pausa(700);
      esito(
        await valuta(cdp, `(() => { ${AIUTI} return !!foglio(); })()`),
        'chi guida senza aver scelto il mezzo se lo vede chiedere nel foglio',
      );
      await foto(cdp, 'rg-14-foglio-mezzo');
      const mezzo = await valuta(
        cdp,
        `(() => { ${AIUTI}
          const sel = [...pagina().querySelectorAll('select[aria-label="Mezzo"]')].pop();
          const opz = [...sel.options].find((o) => o.value && !o.disabled && o.value !== 'non_in_elenco');
          setValore(sel, opz.value);
          return opz.textContent;
        })()`,
      );
      console.log(`  · mezzo scelto: ${mezzo}`);
      await pausa(400);
    }
    await clicca(cdp, '^Registra giornata$', { dentro: 'pagina()' });
    await finoA(cdp, `/Giornata registrata/.test(document.body.innerText)`, {
      cosa: 'giornata registrata',
      timeoutMs: 45_000,
    });
    esito(true, 'la giornata si registra');
    await foto(cdp, 'rg-15-registrata');
    await pausa(1500);
  }
  esito(erroriBrowser.length === 0, 'nessun errore nel browser', erroriBrowser.length ? `${erroriBrowser.length}` : '');
  for (const e of erroriBrowser.slice(0, 8)) console.log(`    · ${e}`);
} finally {
  await chiudi();
}

process.exitCode = riepilogo() > 0 ? 1 : 0;
