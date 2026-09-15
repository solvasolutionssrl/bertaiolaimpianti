/**
 * Banco: «Registra giornata» con il percorso (partenza, tratte, rientro, chi guidava).
 *
 * iPhone emulato, tecnico demo (DEMOC). Controlla le regole del 15/09/2026:
 * - si indica solo l'ora di inizio, la fine si calcola e la pagina mostra il conto;
 * - partenza e rientro sono di default la sede predefinita, senza abitazione
 *   privata; tutto il giorno in sede = né partenza né rientro;
 * - il tempo di ogni tratta fra cantieri si corregge dal suo menu, con un motivo;
 * - la pausa pranzo è arancione (tasti e barra);
 * - sulle tratte con strada «Chi guidava?» è un'etichetta compatta che si apre,
 *   e se manca la chiede il foglio «Il viaggio» all'invio;
 * - chi era passeggero conferma, e «No, guidavo io» riapre quella tratta.
 * Misura anche che il foglio stia sopra la barra dei tempi e che niente sbordi.
 *
 * Senza BANCO_SALVA non registra niente. Con BANCO_SALVA=1 registra la giornata
 * sul tenant demo: da ripulire dopo.
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
  const chip = (radice, prefisso) => [...(radice?.querySelectorAll('button[data-guida]') ?? [])].find((b) => b.dataset.guida.startsWith(prefisso));
  const cardDi = (radice, titolo) => [...(radice?.querySelectorAll('button[aria-expanded]') ?? [])].find((b) => new RegExp('^' + titolo, 'i').test(t(b.textContent)))?.parentElement;
`;

/** Clicca l'elemento visibile più in basso nel DOM che corrisponde. */
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
  await pausa(400);
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
      const card = pagina()?.querySelector('section.border-2')?.getBoundingClientRect();
      return {
        vh: innerHeight,
        sbordo: document.documentElement.scrollWidth > innerWidth || (pagina()?.scrollWidth ?? 0) > innerWidth,
        foglio: f ? { top: Math.round(f.top), bottom: Math.round(f.bottom) } : null,
        piede: piede ? { top: Math.round(piede.top), bottom: Math.round(piede.bottom) } : null,
        altezzaCard: card ? Math.round(card.height) : null,
        testoPiede: t(tastoRegistra()?.parentElement?.innerText),
        fine: t(pagina()?.querySelector('[aria-label="Fine lavoro calcolata"]')?.textContent),
        conto: t(pagina()?.querySelector('[aria-live="polite"]')?.textContent),
      };
    })()`,
  );
}

/** «Guidavo io» nel menu aperto dentro `dentro`, e il mezzo se non è già proposto. */
async function guidavoIo(cdp, dentro) {
  const ok = await clicca(cdp, '^Guidavo io$', {
    dentro: `[...(${dentro})?.querySelectorAll('[role="listbox"][aria-label="Chi guidava"]') ?? []].filter(visibile).pop()`,
  });
  await pausa(400);
  const mezzo = await valuta(
    cdp,
    `(() => {
      ${AIUTI}
      const sel = [...((${dentro})?.querySelectorAll('select[aria-label="Mezzo"]') ?? [])].filter(visibile).pop();
      if (!sel) return 'proposto';
      if (sel.value) return sel.value;
      const opz = [...sel.options].find((o) => o.value && !o.disabled && o.value !== 'non_in_elenco');
      setValore(sel, opz.value);
      return opz.textContent;
    })()`,
  );
  await pausa(400);
  return { ok, mezzo };
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
  esito(
    !(await valuta(cdp, `/Ore su un cantiere/.test(document.body.innerText)`)),
    'la tab Ore offre solo «Registra giornata»',
  );
  await clicca(cdp, 'Registra giornata');
  await finoA(cdp, `!!document.querySelector('[role="dialog"][aria-label="Registra giornata"]')`, { cosa: 'pagina' });
  await pausa(900);
  await foto(cdp, 'rg-01-vuota');

  // ── L'orario: solo l'inizio, la fine si calcola ─────────────────────────
  let m = await misura(cdp);
  esito(
    !(await valuta(cdp, `(() => { ${AIUTI} return !!pagina().querySelector('input[type=time][aria-label="Fine lavoro"]'); })()`)),
    'non si chiede più l’ora di fine',
  );
  esito(m.fine === '--:--', 'senza ore la fine non è ancora calcolata', m.fine);
  console.log(`  · altezza della card «La giornata»: ${m.altezzaCard}px`);
  esito(
    await valuta(cdp, `(() => { ${AIUTI} return [...pagina().querySelectorAll('button[aria-pressed="true"]')].some((b) => /1 h/.test(b.textContent) && b.className.includes('bg-amber-100')); })()`),
    'la pausa pranzo scelta è arancione',
  );

  // ── Un cantiere ─────────────────────────────────────────────────────────
  esito(await aggiungiCantiere(cdp, 'Aurora'), 'aggiunge un cantiere dalla ricerca');
  await ore(cdp, 0, 8);
  m = await misura(cdp);
  esito(m.fine === '17:00', 'la fine si calcola: 08:00 + 8:00 di lavoro + 1:00 di pausa', m.fine);
  esito(/= 17:00/.test(m.conto), 'la pagina mostra il conto della fine', m.conto);
  esito(/8:00 di lavoro/.test(m.testoPiede), 'la barra conta le ore di lavoro', m.testoPiede.slice(0, 50));
  esito(
    await valuta(cdp, `(() => { ${AIUTI} return !!tastoRegistra()?.parentElement?.querySelector('[data-segmento="pausa"].bg-amber-300'); })()`),
    'nella barra la pausa è arancione',
  );
  esito(!m.sbordo, 'la pagina non sborda di lato');
  await foto(cdp, 'rg-02-un-cantiere');

  // ── Partenza e rientro: di default la sede, niente abitazione privata ────
  esito(
    await valuta(cdp, `(() => { ${AIUTI} return /Sede Nordest/.test(cardDi(pagina(), 'Partenza')?.textContent || '') && /Sede Nordest/.test(cardDi(pagina(), 'Rientro')?.textContent || ''); })()`),
    'partenza e rientro sono già la sede predefinita',
  );
  await clicca(cdp, '^Partenza', { dentro: 'pagina()' });
  esito(
    await valuta(cdp, `(() => { ${AIUTI} const l = pagina().querySelector('[role="listbox"][aria-label="Partenza"]'); return !!l && !/Abitazione privata/.test(l.textContent); })()`),
    'fra le partenze non c’è l’abitazione privata',
  );
  await clicca(cdp, '^Partenza', { dentro: 'pagina()' });
  esito(await valuta(cdp, `(() => { ${AIUTI} return !!chip(pagina(), 'andata'); })()`), 'dalla sede al cantiere si chiede chi guidava');
  await foto(cdp, 'rg-03-default-sede');

  // ── Tutto il giorno in sede: né partenza né rientro ───────────────────────
  const spuntaSede = `(() => { ${AIUTI} const cb = [...pagina().querySelectorAll('label')].filter((l) => /Lavoro dalla sede sul progetto/.test(l.textContent)).map((l) => l.querySelector('input[type=checkbox]'))[0]; if (!cb) return null; cb.click(); return cb.checked; })()`;
  esito((await valuta(cdp, spuntaSede)) === true, 'si indica il lavoro dalla sede tutto il giorno');
  await pausa(700);
  esito(
    await valuta(cdp, `(() => { ${AIUTI} return !cardDi(pagina(), 'Partenza') && !cardDi(pagina(), 'Rientro') && /tutto il giorno in/.test(pagina().innerText) && !pagina().querySelector('button[data-guida]'); })()`),
    'tutto il giorno in sede: partenza, rientro e chi guidava non si chiedono',
  );
  await foto(cdp, 'rg-03b-tutto-in-sede');
  esito((await valuta(cdp, spuntaSede)) === false, 'tolta la sede tornano partenza e rientro');
  await pausa(700);

  // ── Due cantieri: la tratta chiede chi guidava ───────────────────────────
  esito(await aggiungiCantiere(cdp, 'Logistica'), 'aggiunge il secondo cantiere');
  await ore(cdp, 0, 4);
  await ore(cdp, 1, 4);
  await pausa(3000);
  await scorri(cdp, 'fondo');
  m = await misura(cdp);
  const tratta = await valuta(
    cdp,
    `(() => { ${AIUTI} const b = [...pagina().querySelectorAll('button[aria-expanded]')].find((x) => /^Diretta/.test(t(x.textContent))); return b ? t(b.textContent) : null; })()`,
  );
  esito(!!tratta, 'fra i due cantieri compare la tratta, con km e tempo', tratta ?? '');
  esito(
    await valuta(cdp, `(() => { ${AIUTI} return /Chi guidava\\?/.test(chip(pagina(), 'tratta:')?.getAttribute('aria-label') || ''); })()`),
    'sulla tratta c’è l’etichetta compatta «Chi guidava?»',
  );
  esito(m.fine !== '17:00' && /di tratte/.test(m.conto), 'la fine comprende la tratta fra i cantieri', m.conto);
  await foto(cdp, 'rg-04-due-cantieri');

  // Manca chi guidava: «Registra giornata» apre il foglio sul primo punto, la partenza.
  await clicca(cdp, '^Registra giornata$', { dentro: 'pagina()' });
  await pausa(800);
  m = await misura(cdp);
  esito(!!m.foglio, 'senza «chi guidava» si apre il foglio «Il viaggio»');
  esito(!!m.foglio && !!m.piede && m.foglio.bottom <= m.piede.top + 1, 'il foglio si ferma sopra la barra dei tempi', JSON.stringify({ foglio: m.foglio, piede: m.piede }));
  esito(
    await valuta(cdp, `(() => { ${AIUTI} return !!foglio()?.querySelector('[role="listbox"][aria-label="Chi guidava"]'); })()`),
    'il foglio si apre già sul menu di chi guidava',
  );
  await foto(cdp, 'rg-05-foglio-chi-guidava');
  const scelta = await guidavoIo(cdp, 'foglio()');
  esito(scelta.ok, 'nel foglio si sceglie «Guidavo io»', `mezzo: ${scelta.mezzo}`);
  esito(
    await valuta(cdp, `(() => { ${AIUTI} return /Guidavo io/.test(chip(foglio(), 'andata')?.getAttribute('aria-label') || '') && /Guidavo io/.test(chip(foglio(), 'tratta:')?.getAttribute('aria-label') || ''); })()`),
    'l’etichetta dice chi guidava, e la tratta dopo prende la stessa scelta',
  );
  await clicca(cdp, 'Torna alla giornata');

  // ── Tempo della tratta fra cantieri: si corregge dal suo menu ─────────────
  m = await misura(cdp);
  const finePrima = m.fine;
  await clicca(cdp, '^Diretta', { dentro: 'pagina()' });
  const pannello = `[...pagina().querySelectorAll('button[aria-expanded="true"]')].find((b) => /^Diretta/.test(t(b.textContent)))?.parentElement`;
  esito(
    await valuta(cdp, `(() => { ${AIUTI} return !!(${pannello})?.querySelector('button[aria-label="Più 5 minuti"]'); })()`),
    'anche la tratta fra cantieri ha il tempo modificabile',
  );
  esito(await clicca(cdp, 'Più 5 minuti', { dentro: pannello }), 'si aggiungono 5 minuti alla tratta');
  m = await misura(cdp);
  esito(!!finePrima && m.fine !== finePrima, 'la fine si sposta con il tempo della tratta', `${finePrima} → ${m.fine}`);
  esito(
    await valuta(cdp, `(() => { ${AIUTI} return /modificato/.test(t([...pagina().querySelectorAll('button[aria-expanded]')].find((b) => /^Diretta/.test(t(b.textContent)))?.textContent)); })()`),
    'la tratta risulta modificata',
  );
  await foto(cdp, 'rg-05b-tratta-modificata');
  // Si chiude dal titolo: con il menu aperto «Diretta» è anche un'opzione.
  await valuta(cdp, `(() => { ${AIUTI} [...pagina().querySelectorAll('button[aria-expanded="true"]')].find((b) => /^Diretta/.test(t(b.textContent)))?.click(); return true; })()`);
  await pausa(400);
  await clicca(cdp, '^Registra giornata$', { dentro: 'pagina()' });
  await pausa(800);
  const motivoTratta = await valuta(
    cdp,
    `(() => { ${AIUTI} const i = [...(foglio()?.querySelectorAll('input[placeholder^="Motivo della modifica"]') ?? [])].filter(visibile).pop(); if (!i) return false; setValore(i, 'traffico in tangenziale'); return true; })()`,
  );
  esito(motivoTratta, 'senza motivo il foglio apre la tratta e lo chiede');
  await pausa(400);
  await clicca(cdp, 'Torna alla giornata');

  // ── Rientro in sede (predefinito): prende l'ultima scelta, poi si cambia ──
  await pausa(500);
  esito(
    await valuta(cdp, `(() => { ${AIUTI} return /Guidavo io/.test(chip(pagina(), 'ritorno')?.getAttribute('aria-label') || ''); })()`),
    'il rientro prende l’ultima scelta di chi guidava',
  );
  await clicca(cdp, 'Chi guidava: Guidavo io', { dentro: `cardDi(pagina(), 'Rientro')` });
  await clicca(cdp, '^Ero passeggero$', { dentro: `cardDi(pagina(), 'Rientro')` });
  esito(
    await valuta(cdp, `(() => { ${AIUTI} return /Passeggero/.test(chip(pagina(), 'ritorno')?.getAttribute('aria-label') || ''); })()`),
    'sul rientro si indica «Passeggero»',
  );
  m = await misura(cdp);
  esito(/Rientro \d\d:\d\d/.test(m.testoPiede) && /Viaggio \d+:\d\d/.test(m.testoPiede), 'la barra mostra viaggio e rientro', m.testoPiede);
  await scorri(cdp, 'fondo');
  await foto(cdp, 'rg-06-rientro-passeggero');

  // ── Passeggero: conferma, e «No, guidavo io» riapre quella tratta ─────────
  await clicca(cdp, '^Registra giornata$', { dentro: 'pagina()' });
  await pausa(700);
  const conferma = await valuta(cdp, `(() => { ${AIUTI} return /Hai viaggiato da passeggero/.test(pagina()?.innerText || ''); })()`);
  esito(conferma, 'chi era passeggero su una tratta lo conferma');
  await foto(cdp, 'rg-07-conferma-passeggero');
  if (conferma) {
    await clicca(cdp, 'No, guidavo io', { dentro: 'pagina()' });
    await pausa(900);
    esito(
      await valuta(cdp, `(() => { ${AIUTI} const c = cardDi(pagina(), 'Rientro'); return !!c?.querySelector('[role="listbox"][aria-label="Chi guidava"]'); })()`),
      '«No, guidavo io» riapre chi guidava sul rientro',
    );
    await foto(cdp, 'rg-08-rientro-riaperto');
    const r = await guidavoIo(cdp, `cardDi(pagina(), 'Rientro')`);
    esito(r.ok, 'sul rientro si corregge in «Guidavo io»', `mezzo: ${r.mezzo}`);
  }

  // ── Salvataggio vero, solo se richiesto (tenant demo, da ripulire dopo) ──
  if (process.env.BANCO_SALVA === '1') {
    await clicca(cdp, '^Registra giornata$', { dentro: 'pagina()' });
    await finoA(cdp, `/Giornata registrata/.test(document.body.innerText)`, {
      cosa: 'giornata registrata',
      timeoutMs: 45_000,
    });
    esito(true, 'la giornata si registra');
    await foto(cdp, 'rg-09-registrata');
    await pausa(1500);
  }
  esito(erroriBrowser.length === 0, 'nessun errore nel browser', erroriBrowser.length ? `${erroriBrowser.length}` : '');
  for (const e of erroriBrowser.slice(0, 8)) console.log(`    · ${e}`);
} finally {
  await chiudi();
}

process.exitCode = riepilogo() > 0 ? 1 : 0;
