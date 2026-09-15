/**
 * Banco: «Lavoro dalla sede sul progetto» nell'avvio e nella chiusura del turno.
 *
 * iPhone emulato, tecnico demo (DEMOC). Senza BANCO_SALVA controlla solo il
 * foglio «Da dove parti?». Con BANCO_SALVA=1 avvia davvero un turno dalla sede
 * sul cantiere Aurora, apre il cambio cantiere e chiude rientrando in sede:
 * sul tenant demo, da ripulire dopo.
 *
 *   node scripts/banco-ui/lavoro-da-sede.mjs
 */

import { apriChrome, vaiA, accedi, esito, riepilogo, foto, valuta, finoA } from './comune.mjs';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const testo = (cdp) => valuta(cdp, `document.body.innerText`);

async function clicca(cdp, re, { dentro = 'document' } = {}) {
  const r = await valuta(
    cdp,
    `(() => {
      const radice = ${dentro};
      if (!radice) return 'contenitore assente';
      const re = new RegExp(${JSON.stringify(re)}, 'i');
      const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const el = [...radice.querySelectorAll('button, [role="option"], a')]
        .filter((x) => x.getClientRects().length > 0 && !x.disabled)
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

/** Spunta (o toglie) la casella con quell'etichetta, l'ultima visibile. */
async function spunta(cdp, re) {
  const r = await valuta(
    cdp,
    `(() => {
      const re = new RegExp(${JSON.stringify(re)});
      const cb = [...document.querySelectorAll('label')]
        .filter((l) => l.getClientRects().length > 0 && re.test(l.textContent))
        .map((l) => l.querySelector('input[type=checkbox]'))
        .filter(Boolean)
        .pop();
      if (!cb) return null;
      cb.click();
      return cb.checked;
    })()`,
  );
  await pausa(500);
  return r;
}

const { cdp, chiudi } = await apriChrome({ mobile: true });
const erroriBrowser = [];
cdp.su('Runtime.exceptionThrown', (p) =>
  erroriBrowser.push(`eccezione: ${p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text}`),
);
cdp.su('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error') erroriBrowser.push(`console.error: ${p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)}`);
});

try {
  await accedi(cdp, 'tecnico');
  await vaiA(cdp, '/mobile/kantiere');
  await finoA(cdp, `[...document.querySelectorAll('button')].some((b) => /Inizia turno/.test(b.textContent))`, {
    cosa: 'tasto Inizia turno',
    timeoutMs: 30_000,
  });
  await clicca(cdp, 'Inizia turno');
  await finoA(cdp, `!!document.querySelector('input[aria-label="Cerca cantiere"]')`, { cosa: 'ricerca cantiere' });
  await valuta(
    cdp,
    `(() => {
      const el = document.querySelector('input[aria-label="Cerca cantiere"]');
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, 'Aurora');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`,
  );
  await pausa(600);
  esito(await clicca(cdp, 'Aurora'), 'si sceglie il cantiere');
  // Il tasto porta anche il nome del cantiere scelto: «Continua · …».
  esito(await clicca(cdp, '^Continua'), 'si passa a «Da dove parti?»');
  await finoA(cdp, `/Da dove parti\\?/.test(document.body.innerText) && !/Carico le sedi/.test(document.body.innerText)`, {
    cosa: 'foglio partenza',
    timeoutMs: 20_000,
  });
  await pausa(2500);

  let t = await testo(cdp);
  esito(/Lavoro dalla sede sul progetto/.test(t), 'il foglio offre «Lavoro dalla sede sul progetto»');
  // L'etichetta del riquadro è in maiuscolo via CSS e innerText la restituisce così;
  // il testo «nessun km né tempo di viaggio» resta minuscolo e non la confonde.
  esito(/TEMPO DI VIAGGIO/.test(t), 'di default si va in cantiere: dalla sede c’è un tempo di viaggio');
  await foto(cdp, 'sede-01-partenza');

  esito((await spunta(cdp, 'Lavoro dalla sede sul progetto')) === true, 'si indica il lavoro dalla sede');
  t = await testo(cdp);
  esito(/Parti dalla sede in cui lavori/.test(t) && !/TEMPO DI VIAGGIO/.test(t), 'dalla sede predefinita non c’è viaggio');
  await foto(cdp, 'sede-02-dalla-sede');

  if (/Hotel Europa/.test(t)) {
    await clicca(cdp, 'Hotel Europa');
    await pausa(3500);
    t = await testo(cdp);
    esito(/TEMPO DI VIAGGIO/.test(t), 'da un’altra sede il viaggio arriva alla sede predefinita');
    await foto(cdp, 'sede-03-da-hotel');
    await clicca(cdp, 'Sede Nordest');
    await pausa(600);
  } else {
    console.log('  · Hotel Europa non è una partenza ammessa per questo cantiere: controllo saltato');
  }

  if (process.env.BANCO_SALVA === '1') {
    esito(await clicca(cdp, '^Avvia turno$'), 'si avvia il turno');
    await finoA(cdp, `/Turno in corso/i.test(document.body.innerText)`, { cosa: 'turno avviato', timeoutMs: 30_000 });
    await pausa(1200);
    t = await testo(cdp);
    esito(/dalla sede Sede Nordest/i.test(t), 'la card del turno dice che si lavora dalla sede', (t.match(/Timbrato alle[^\n]*/) ?? [''])[0]);
    await foto(cdp, 'sede-04-turno');

    await clicca(cdp, '^Cambia cantiere$');
    await pausa(1500);
    esito(/Lavoro dalla sede sul progetto/.test(await testo(cdp)), 'anche il cambio cantiere offre il lavoro dalla sede');
    await foto(cdp, 'sede-05-cambio');
    await clicca(cdp, '^Chiudi$');
    await pausa(600);

    await clicca(cdp, '^Termina turno');
    await finoA(cdp, `/Dove vai adesso\\?/.test(document.body.innerText)`, { cosa: 'dialog fine turno', timeoutMs: 15_000 });
    await pausa(800);
    t = await testo(cdp);
    esito(
      /Rientro nella sede in cui hai lavorato/.test(t) && !/stima\.\.\./.test(t),
      'rientrando nella sede in cui si è lavorato non c’è viaggio di ritorno',
    );
    await foto(cdp, 'sede-06-fine-turno');
    await clicca(cdp, '^Termina turno$', { dentro: `[...document.querySelectorAll('[role="dialog"]')].pop()` });
    await finoA(cdp, `!/Turno in corso/i.test(document.body.innerText)`, { cosa: 'turno chiuso', timeoutMs: 30_000 });
    esito(true, 'il turno si chiude');
    await foto(cdp, 'sede-07-chiuso');
  }

  esito(erroriBrowser.length === 0, 'nessun errore nel browser', erroriBrowser.length ? `${erroriBrowser.length}` : '');
  for (const e of erroriBrowser.slice(0, 8)) console.log(`    · ${e}`);
} finally {
  await chiudi();
}

process.exitCode = riepilogo() > 0 ? 1 : 0;
