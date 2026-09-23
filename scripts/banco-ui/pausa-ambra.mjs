/**
 * Banco: la scelta della pausa nelle superfici AMBRA del telefono.
 *
 * Sono i punti dove la pausa si dichiara perche' NON e' stata timbrata: QR,
 * fine turno da app e capo, modifica giornata. Montano tutti lo stesso
 * componente con gli stessi parametri (tre scelte, tono ambra), quindi una
 * foto sola li racconta davvero tutti.
 *
 *   node scripts/banco-ui/pausa-ambra.mjs
 *
 * ⚠️ Serve un TURNO APERTO da piu' della soglia (5h) senza pausa timbrata,
 * altrimenti il blocco non compare per niente. Lo stato si prepara a parte e si
 * toglie dopo: questo script non scrive niente.
 */

import { apriChrome, vaiA, accedi, esito, riepilogo, foto, valuta, finoA } from './comune.mjs';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

/** Chiude la giornata, comunque si chiami il tasto nelle due modalita'. */
const CHIUDI = `(() => {
  const b = [...document.querySelectorAll('button')]
    .filter((x) => x.getClientRects().length > 0)
    .find((x) => /Fine turno|Chiudi (la )?giornata|Termina/i.test(x.textContent || ''));
  if (!b) return false;
  b.scrollIntoView({ block: 'center' });
  b.click();
  return true;
})()`;

/** Spunta «Ho fatto la pausa pranzo», che e' cio' che rivela le scelte. */
const SPUNTA_PAUSA = `(() => {
  const l = [...document.querySelectorAll('label')]
    .find((x) => /Ho fatto la pausa pranzo/i.test(x.textContent || ''));
  const c = l?.querySelector('input[type=checkbox]');
  if (!c) return false;
  c.click();
  return true;
})()`;

const LEGGI = `(() => {
  const t = (document.body.innerText || '').replace(/\\s+/g, ' ');
  const campo = document.querySelector('input[aria-label^="Altra durata"]');
  const riga = campo ? campo.closest('div')?.parentElement : null;
  const bottoni = [...document.querySelectorAll('button')]
    .map((b) => (b.textContent || '').trim())
    .filter((x) => /^(NO|\\d+ min|1 h)$/.test(x));
  return {
    promptPausa: /Pausa pranzo non rilevata/i.test(t),
    scelte: bottoni,
    haCampoLibero: !!campo,
    altezzaRiga: riga ? Math.round(riga.getBoundingClientRect().height) : null,
    sbordo: document.documentElement.scrollWidth > innerWidth,
  };
})()`;

const { cdp, chiudi } = await apriChrome({ mobile: true });
try {
  await accedi(cdp, 'tecnico');
  await vaiA(cdp, '/mobile/kantiere/cantieri');
  await pausa(1200);

  if (!(await valuta(cdp, CHIUDI))) {
    console.log('\n  Nessun tasto per chiudere la giornata: manca il turno aperto di prova.\n');
    await foto(cdp, 'pausa-ambra-senza-turno');
    throw new Error('manca lo stato di prova');
  }
  await finoA(cdp, `!!document.querySelector('[role=dialog]')`, { cosa: 'foglio di chiusura' });
  await pausa(800);

  let s = await valuta(cdp, LEGGI);
  esito(s?.promptPausa === true, 'compare l’avviso della pausa non rilevata', s?.promptPausa ? '' : 'assente');

  esito(await valuta(cdp, SPUNTA_PAUSA), 'si dichiara di aver fatto la pausa');
  await pausa(600);
  s = await valuta(cdp, LEGGI);

  esito(s?.haCampoLibero === true, 'c’è il campo per un’altra durata');
  esito(
    (s?.scelte ?? []).join(' ') === '30 min 45 min 1 h',
    'le scelte rapide sono le stesse di ovunque',
    (s?.scelte ?? []).join(' ') || 'nessuna',
  );
  esito(!s?.sbordo, 'non sborda di lato');
  console.log(`  · altezza della riga pausa: ${s?.altezzaRiga}px`);
  await foto(cdp, 'pausa-ambra-fine-turno');
} finally {
  await chiudi();
}

riepilogo();
