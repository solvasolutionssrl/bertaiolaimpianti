/**
 * Banco di prova: il popup del giustificativo di un'assenza.
 *
 * Nasce da una richiesta precisa del cliente — «un popup carino, con la
 * possibilita' di scaricarlo» — e da una domanda che il codice non sa
 * rispondere: si vede bene? La pastiglia sulla riga dell'assenza si nota?
 * L'area dove si trascina il certificato si capisce che e' un'area?
 *
 * Serve un'assenza di tipo malattia sul tenant demo DEMOC. Se non c'e', il
 * banco lo dice e si ferma invece di fingere che vada tutto bene.
 *
 *   node scripts/banco-ui/giustificativo.mjs
 *
 * ⚠️ Va lanciato dalla radice del repo: le foto finiscono in
 * `scripts/banco-ui/esiti/` a partire dalla cartella corrente.
 */

import { apriChrome, vaiA, accedi, esito, riepilogo, foto, valuta, finoA } from './comune.mjs';

const PATH = '/office/personale/permessi';

/** Mostra anche le assenze gia' approvate: il filtro parte su «Da approvare». */
const MOSTRA_TUTTE = `(() => {
  const b = [...document.querySelectorAll('button')]
    .find((x) => (x.textContent || '').trim().startsWith('Tutte'));
  if (!b) return false;
  b.click();
  return true;
})()`;

/** La pastiglia del giustificativo sulla riga dell'assenza. */
const LEGGI_PASTIGLIA = `(() => {
  const b = [...document.querySelectorAll('button')]
    .find((x) => /PUC|Giustificativo|Documento allegato/.test(x.textContent || ''));
  if (!b) return null;
  const s = getComputedStyle(b);
  return {
    testo: (b.textContent || '').replace(/\\s+/g, ' ').trim(),
    sfondo: s.backgroundColor,
    larghezza: Math.round(b.getBoundingClientRect().width),
  };
})()`;

const APRI_PASTIGLIA = `(() => {
  const b = [...document.querySelectorAll('button')]
    .find((x) => /PUC|Giustificativo|Documento allegato/.test(x.textContent || ''));
  if (!b) return false;
  b.click();
  return true;
})()`;

const LEGGI_POPUP = `(() => {
  const d = document.querySelector('[role=dialog]');
  if (!d) return null;
  const testo = (d.innerText || '').replace(/\\s+/g, ' ').trim();
  const link = [...d.querySelectorAll('a')].map((a) => (a.textContent || '').trim());
  return {
    titolo: d.querySelector('h2')?.textContent?.trim() ?? null,
    areaTrascinamento: /Trascina qui il certificato/.test(d.innerText || ''),
    diceObbligatorio: /obbligatorio/.test(d.innerText || ''),
    haTipiNumero: /PUC/.test(testo) && /Protocollo/.test(testo) && /Codice fiscale/.test(testo),
    link,
    larghezza: Math.round(d.getBoundingClientRect().width),
    testo: testo.slice(0, 500),
  };
})()`;

const { cdp, chiudi } = await apriChrome({ larghezza: 1440, altezza: 980 });
try {
  await accedi(cdp, 'kantiere');
  await vaiA(cdp, PATH);
  await valuta(cdp, MOSTRA_TUTTE);
  await new Promise((r) => setTimeout(r, 600));

  const pastiglia = await valuta(cdp, LEGGI_PASTIGLIA);
  if (!pastiglia) {
    console.log(
      '\n  Nessuna assenza con giustificativo su DEMOC: creane una di tipo malattia e rilancia.',
    );
    await foto(cdp, 'giustificativo-elenco-vuoto');
    throw new Error('manca il caso di prova');
  }

  esito(
    /PUC mancante/.test(pastiglia.testo),
    'sulla riga si vede subito che il PUC manca',
    pastiglia.testo,
  );
  esito(
    pastiglia.sfondo.includes('254') || pastiglia.sfondo.includes('251'),
    'la pastiglia e\' ambra finche\' il numero non c\'e\'',
    pastiglia.sfondo,
  );
  await foto(cdp, 'giustificativo-pastiglia');

  await valuta(cdp, APRI_PASTIGLIA);
  await finoA(cdp, `document.querySelector('[role=dialog]')`, { cosa: 'apertura del popup' });
  await new Promise((r) => setTimeout(r, 500));

  const popup = await valuta(cdp, LEGGI_POPUP);
  esito(popup?.titolo === 'Giustificativo', 'il popup si apre', popup?.titolo ?? 'assente');
  esito(popup?.areaTrascinamento === true, 'c\'e\' l\'area dove trascinare il certificato');
  esito(
    popup?.diceObbligatorio === true,
    'per la malattia dice che il numero e\' obbligatorio',
  );
  esito(popup?.haTipiNumero === true, 'si puo\' scegliere fra PUC, protocollo e codice fiscale');
  esito(
    (popup?.larghezza ?? 0) > 400 && (popup?.larghezza ?? 0) < 700,
    'il popup ha una larghezza da popup, non da pagina',
    `${popup?.larghezza}px`,
  );

  await foto(cdp, 'giustificativo-popup');
  console.log(`\n  Testo del popup: ${popup?.testo ?? '(vuoto)'}\n`);
} finally {
  await chiudi();
}

riepilogo();
