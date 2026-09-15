/**
 * Banco: Impostazioni Kantiere (ufficio demo DEMOC).
 *
 * Controlla le sezioni riordinate, l'esempio dell'orario ordinario calcolato con
 * la stessa funzione delle giornate, la validazione dei valori, la conferma
 * prima di salvare e che le impostazioni tolte non compaiano più.
 *
 * Non salva niente: alla conferma preme «Annulla».
 *
 *   node scripts/banco-ui/impostazioni.mjs
 */

import { apriChrome, vaiA, accedi, esito, riepilogo, foto, valuta, finoA } from './comune.mjs';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const testo = (cdp) => valuta(cdp, `document.body.innerText`);

async function imposta(cdp, id, v) {
  await valuta(
    cdp,
    `(() => {
      const el = document.getElementById(${JSON.stringify(id)});
      if (!el) return false;
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, ${JSON.stringify(v)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`,
  );
  await pausa(250);
}

async function clicca(cdp, re) {
  const ok = await valuta(
    cdp,
    `(() => {
      const re = new RegExp(${JSON.stringify(re)});
      const b = [...document.querySelectorAll('button')].filter((x) => x.getClientRects().length > 0 && re.test(x.textContent.trim())).pop();
      if (!b) return false;
      b.click();
      return true;
    })()`,
  );
  await pausa(400);
  return ok;
}

const esempio = (cdp) =>
  valuta(cdp, `[...document.querySelectorAll('table tbody tr')].map((r) => [...r.children].map((c) => c.textContent.trim()))`);

const { cdp, chiudi } = await apriChrome({ larghezza: 1440, altezza: 900 });
const erroriBrowser = [];
cdp.su('Runtime.exceptionThrown', (p) =>
  erroriBrowser.push(`eccezione: ${p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text}`),
);
cdp.su('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error') erroriBrowser.push(`console.error: ${p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)}`);
});

try {
  await accedi(cdp, 'kantiere');
  await vaiA(cdp, '/office/impostazioni/kantiere');
  await finoA(cdp, `/Orario ordinario giornaliero/.test(document.body.innerText)`, { cosa: 'impostazioni', timeoutMs: 30_000 });

  const sezioni = await valuta(
    cdp,
    `[...document.querySelectorAll('nav[aria-label="Sezioni impostazioni"] button')].map((b) => b.textContent.trim())`,
  );
  esito(
    JSON.stringify(sezioni) ===
      JSON.stringify(['Orario e ore', 'Turni', 'Pause', 'Viaggi e chilometri', 'Approvazione giornate', 'Anomalie', 'Kontabilità']),
    'le sezioni sono quelle nuove, in ordine',
    sezioni.join(' · '),
  );
  esito((await valuta(cdp, `document.getElementById('orario-ordinario')?.value`)) === '8', 'l’orario ordinario è quello del config (8 ore)');

  let righe = await esempio(cdp);
  esito(
    JSON.stringify(righe[0]) === JSON.stringify(['7:00', '2:00', '8:00', '0:00', '1:00']),
    'esempio: 7:00 di lavoro e 2:00 di viaggio fanno 8:00 ordinarie e 1:00 di viaggio eccedente',
    JSON.stringify(righe[0]),
  );
  esito(
    JSON.stringify(righe[1]) === JSON.stringify(['10:00', '1:00', '8:00', '2:00', '1:00']),
    'esempio: 10:00 di lavoro e 1:00 di viaggio fanno 2:00 straordinarie',
    JSON.stringify(righe[1]),
  );
  esito(
    /per le giornate dal 15\/09\/2026/.test(await testo(cdp)),
    'dice da quando il viaggio entra nelle ore ordinarie',
  );
  esito(
    await valuta(cdp, `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Salva')?.disabled === true`),
    'senza modifiche «Salva» è disattivato',
  );
  await foto(cdp, 'imp-01-orario');

  await imposta(cdp, 'orario-ordinario', '7.5');
  righe = await esempio(cdp);
  esito(
    JSON.stringify(righe[0]) === JSON.stringify(['6:30', '2:00', '7:30', '0:00', '1:00']),
    'cambiando l’orario (7,5 ore) l’esempio si ricalcola',
    JSON.stringify(righe[0]),
  );
  esito(/Modifiche non salvate/.test(await testo(cdp)), 'segnala le modifiche non salvate');

  await imposta(cdp, 'orario-ordinario', '30');
  esito(/Valore tra 1 e 24\./.test(await testo(cdp)), 'un valore fuori limite si segnala sul campo');
  await clicca(cdp, '^Salva$');
  esito(/Correggere: Orario ordinario giornaliero\./.test(await testo(cdp)), 'e «Salva» dice cosa correggere invece di salvare');
  await foto(cdp, 'imp-02-errore');

  await imposta(cdp, 'orario-ordinario', '7.5');
  await clicca(cdp, '^Salva$');
  await pausa(600);
  const conferma = await testo(cdp);
  esito(
    /Confermare le modifiche\?/.test(conferma) && /orario ordinario giornaliero 7:30/.test(conferma),
    'prima di salvare chiede conferma con il nuovo orario',
  );
  await foto(cdp, 'imp-03-conferma');
  await clicca(cdp, '^Annulla$');
  await pausa(400);
  esito(!/Salvato/.test(await testo(cdp)), 'annullando non si salva niente');

  await clicca(cdp, '^Viaggi e chilometri$');
  const viaggi = await testo(cdp);
  esito(/Tratte fra cantieri/.test(viaggi) && /Lavoro dalla sede sul progetto/.test(viaggi), 'Viaggi e chilometri riporta le regole fisse');
  esito(!/Conteggia i trasferimenti/.test(viaggi), 'l’interruttore dei trasferimenti non c’è più');
  await foto(cdp, 'imp-04-viaggi');

  await clicca(cdp, '^Approvazione giornate$');
  esito((await valuta(cdp, `document.getElementById('soglia-verifica')?.value`)) === '10', 'la soglia di verifica è 10 ore');

  await clicca(cdp, '^Anomalie$');
  const anomalie = await testo(cdp);
  esito(!/Ore massime giornaliere/.test(anomalie), 'il campo mai usato delle ore massime non c’è più');
  esito(
    (await valuta(cdp, `document.querySelectorAll('[role="switch"]').length`)) === 7,
    'sette controlli delle anomalie, ognuno con il suo interruttore',
  );
  await foto(cdp, 'imp-05-anomalie');

  esito(erroriBrowser.length === 0, 'nessun errore nel browser', erroriBrowser.length ? `${erroriBrowser.length}` : '');
  for (const e of erroriBrowser.slice(0, 8)) console.log(`    · ${e}`);
} finally {
  await chiudi();
}

process.exitCode = riepilogo() > 0 ? 1 : 0;
