/**
 * Banco: «Registra giornata» per chi lavora quasi sempre in sede.
 *
 * La domanda a cui risponde: è la stessa schermata di sempre, con il flag
 * girato? Cioè il lavoro nasce dalla sede (niente percorso da chiedere), e
 * spuntando «Lavoro presso il cliente» ricompare il da-dove-a-dove intero.
 *
 *   node scripts/banco-ui/registra-giornata-ufficio.mjs
 *
 * ⚠️ Serve il dipendente del tenant demo DEMOC collegato all'account tecnico
 * con `modalita_lavoro = 'ufficio'`. Se non c'è, il banco lo dice e si ferma
 * invece di passare a vuoto.
 *
 * ⚠️ Non registra niente: apre, compila e guarda. Va lanciato dalla radice del
 * repo (le foto finiscono in `scripts/banco-ui/esiti/`).
 */

import { apriChrome, vaiA, accedi, esito, riepilogo, foto } from './comune.mjs';
import { valuta, finoA } from '../banco-upload/cdp.mjs';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

const AIUTI = `
  const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const visibile = (el) => el.getClientRects().length > 0;
  const pagina = () => document.querySelector('[role="dialog"][aria-label="Registra giornata"]');
  const corpo = () => pagina()?.querySelector('.overflow-y-auto');
  const setValore = (el, v) => {
    const proto = Object.getPrototypeOf(el);
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
`;

async function clicca(cdp, re, { dentro = 'document' } = {}) {
  const r = await valuta(
    cdp,
    `(() => {
      ${AIUTI}
      const radice = ${dentro};
      if (!radice) return 'contenitore assente';
      const re = new RegExp(${JSON.stringify(re)}, 'i');
      const el = [...radice.querySelectorAll('button, [role="option"], a')]
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
  await finoA(
    cdp,
    `[...document.querySelectorAll('[role="dialog"] h2')].some((h) => /Aggiungi cantiere/.test(h.textContent))`,
    { cosa: 'foglio cantieri' },
  );
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
  await pausa(600);
  return scelto;
}

/** Ore sul primo cantiere, scritte come farebbe il dito. */
async function ore(cdp, h) {
  await valuta(
    cdp,
    `(() => {
      ${AIUTI}
      const campo = pagina().querySelector('input[aria-label="ore"]');
      if (campo) setValore(campo, '${h}');
      return !!campo;
    })()`,
  );
  await pausa(300);
}

/** Lo stato della riga cantiere e del percorso, che è quello che ci interessa. */
const LEGGI = `(() => {
  ${AIUTI}
  const p = pagina();
  const testoCorpo = t(corpo()?.innerText);
  const lab = [...(p?.querySelectorAll('label') ?? [])]
    .find((l) => /Lavoro (presso il cliente|dalla sede)/i.test(l.textContent || ''));
  const box = lab?.querySelector('input[type=checkbox]');
  return {
    etichettaFlag: lab ? t(lab.textContent) : null,
    flagSpuntato: box ? box.checked : null,
    // Il percorso: la tappa «tutto il giorno in sede» oppure partenza e rientro.
    tuttoInSede: /tutto il giorno in sede/i.test(testoCorpo),
    // ⚠️ innerText restituisce il testo GIÀ TRASFORMATO dal CSS: questi titoli
    // sono in maiuscolo, quindi il confronto non deve distinguerle.
    haPartenza: /\\bPartenza\\b/i.test(testoCorpo),
    haRientro: /\\bRientro\\b/i.test(testoCorpo),
    chiGuidava: /Chi guidava/i.test(testoCorpo),
    // I pezzi che devono restare comunque.
    haInizio: !!p?.querySelector('input[type=time][aria-label="Inizio lavoro"]'),
    fine: t(p?.querySelector('[aria-label="Fine lavoro calcolata"]')?.textContent),
    haPausa: /Pausa pranzo/i.test(testoCorpo),
    sbordo: document.documentElement.scrollWidth > innerWidth || (p?.scrollWidth ?? 0) > innerWidth,
  };
})()`;

const { cdp, chiudi } = await apriChrome({ mobile: true });
const erroriBrowser = [];
cdp.su('Runtime.exceptionThrown', (p) =>
  erroriBrowser.push(
    `eccezione: ${p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text}`,
  ),
);
cdp.su('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error') {
    erroriBrowser.push(
      `console.error: ${p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)}`,
    );
  }
});

try {
  await accedi(cdp, 'tecnico');
  await vaiA(cdp, '/mobile/kantiere/ore');
  await finoA(
    cdp,
    `[...document.querySelectorAll('button')].some((b) => /Registra giornata/.test(b.textContent))`,
    { cosa: 'tasto Registra giornata', timeoutMs: 30_000 },
  );

  // Il caso di prova c'è? In modalità ufficio la scritta sotto il tasto non
  // nomina il viaggio, perché il viaggio è l'eccezione.
  const inUfficio = await valuta(
    cdp,
    `/Orario, pausa e lavori della giornata/.test(document.body.innerText)`,
  );
  if (!inUfficio) {
    console.log(
      '\n  Il tecnico demo non è in «Prevalenza ufficio»: metti\n' +
        "  `modalita_lavoro = 'ufficio'` sulla sua scheda (DEMOC) e rilancia.\n",
    );
    await foto(cdp, 'rgu-non-configurato');
    throw new Error('manca il caso di prova');
  }
  esito(true, 'la tab Ore presenta la giornata senza nominare il viaggio');

  await clicca(cdp, 'Registra giornata');
  await finoA(cdp, `!!document.querySelector('[role="dialog"][aria-label="Registra giornata"]')`, {
    cosa: 'pagina',
  });
  await pausa(900);

  // ── Appena aperto, prima ancora di scegliere il lavoro ────────────────────
  // ⚠️ Qui stava il buco della prima stesura: il banco aggiungeva subito un
  // cantiere, quindi non guardava mai la schermata che accoglie la persona. Ed
  // era proprio lì che «Partenza» e «Rientro» comparivano lo stesso.
  let s = await valuta(cdp, LEGGI);
  esito(
    s.haPartenza === false && s.haRientro === false,
    'appena aperto non accoglie con partenza e rientro',
    s.haPartenza || s.haRientro ? 'compaiono prima ancora di scegliere il lavoro' : '',
  );
  esito(s.tuttoInSede === true, 'appena aperto la giornata è già «in sede»');
  await foto(cdp, 'rgu-00-appena-aperto');

  // ── Un lavoro: nasce dalla sede ──────────────────────────────────────────
  esito(await aggiungiCantiere(cdp, 'Aurora'), 'aggiunge un lavoro dalla ricerca');
  await ore(cdp, 8);
  s = await valuta(cdp, LEGGI);

  esito(
    s.etichettaFlag === 'Lavoro presso il cliente',
    'il flag dice l’eccezione, non la regola',
    s.etichettaFlag ?? 'assente',
  );
  esito(s.flagSpuntato === false, 'di partenza non è spuntato: si lavora dalla sede');
  esito(s.tuttoInSede === true, 'il percorso dice che la giornata è tutta in sede');
  esito(
    s.haPartenza === false && s.haRientro === false,
    'non si chiede né partenza né rientro',
    s.haPartenza || s.haRientro ? 'compaiono lo stesso' : '',
  );

  // I pezzi che Luca ha chiesto di tenere.
  esito(s.haInizio === true, 'l’ora di inizio resta');
  esito(s.fine === '17:00', 'la fine si calcola da sola: 08:00 + 8:00 + 1:00 di pausa', s.fine);
  esito(s.haPausa === true, 'la pausa pranzo resta');
  esito(!s.sbordo, 'la pagina non sborda di lato');
  await foto(cdp, 'rgu-01-dalla-sede');

  // ── Spunto «presso il cliente»: torna il da dove a dove ───────────────────
  await valuta(
    cdp,
    `(() => {
      ${AIUTI}
      const lab = [...pagina().querySelectorAll('label')].find((l) => /Lavoro presso il cliente/i.test(l.textContent || ''));
      const box = lab?.querySelector('input[type=checkbox]');
      if (!box) return false;
      box.click();
      return true;
    })()`,
  );
  await pausa(1200);
  s = await valuta(cdp, LEGGI);

  esito(s.flagSpuntato === true, 'il flag si spunta');
  esito(
    s.haPartenza === true && s.haRientro === true,
    'spuntandolo compaiono partenza e rientro',
    !s.haPartenza || !s.haRientro ? 'il percorso non è tornato' : '',
  );
  esito(s.tuttoInSede === false, 'non è più una giornata tutta in sede');
  esito(s.chiGuidava === true, 'sulla tratta con strada si chiede chi guidava');
  esito(!s.sbordo, 'con il percorso aperto non sborda');
  await foto(cdp, 'rgu-02-presso-il-cliente');

  // ── E si torna indietro ──────────────────────────────────────────────────
  await valuta(
    cdp,
    `(() => {
      ${AIUTI}
      const lab = [...pagina().querySelectorAll('label')].find((l) => /Lavoro presso il cliente/i.test(l.textContent || ''));
      lab?.querySelector('input[type=checkbox]')?.click();
      return true;
    })()`,
  );
  await pausa(1000);
  s = await valuta(cdp, LEGGI);
  esito(
    s.tuttoInSede === true && s.haPartenza === false,
    'togliendo la spunta il percorso sparisce di nuovo',
  );

  esito(erroriBrowser.length === 0, 'nessun errore nel browser', erroriBrowser.join(' | '));
} finally {
  await chiudi();
}

riepilogo();
