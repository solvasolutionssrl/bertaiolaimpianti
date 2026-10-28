/**
 * Banco di prova: nascondere persone dalla Pianificazione (28/10/2026).
 *
 * Si nasconde una persona dalla tendina «Nascondi persone…» e si guarda la
 * griglia: la riga deve sparire, **restare sparita dopo un ricaricamento**
 * (la scelta sta nel database, non nella pagina) e tornare quando la si
 * rimette. Alla fine la scelta si ripulisce da sola.
 *
 *   BANCO_BASE=http://localhost:3000 node scripts/banco-ui/pianificazione-nascosti.mjs
 */

import { apriChrome, vaiA, accedi, esito, riepilogo, clicVero } from './comune.mjs';
import { valuta } from '../banco-upload/cdp.mjs';

const PATH = '/office/personale/pianificazione';
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

const righe = (cdp) =>
  valuta(cdp, `[...document.querySelectorAll('tbody tr th')].map((t) => t.textContent.replace(/\\s+/g, ' ').trim())`);

const tasto = `document.querySelector('[aria-label="Persone nascoste"]')`;

async function scegliPrima(cdp, nome) {
  await clicVero(cdp, tasto);
  await attendi(400);
  const ok = await clicVero(
    cdp,
    `[...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.includes(${JSON.stringify(nome)}))`,
  );
  await attendi(300);
  // Chiude l'elenco premendo fuori.
  await valuta(cdp, `document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 1`);
  await attendi(1500);
  return ok;
}

const { cdp, chiudi } = await apriChrome({ larghezza: 1440, altezza: 900 });
try {
  await accedi(cdp, 'kantiere');
  await vaiA(cdp, PATH);
  await attendi(1500);

  const prima = await righe(cdp);
  esito(prima.length > 1, 'la griglia ha delle persone', `righe: ${prima.length}`);
  esito(!!(await valuta(cdp, `!!${tasto}`)), 'c\'e\' la tendina «Nascondi persone»');

  // Il nome come lo scrive la riga: si prende la parte prima di eventuali segni.
  const bersaglio = prima[0].split(' ').slice(0, 2).join(' ');
  await scegliPrima(cdp, bersaglio);
  const dopo = await righe(cdp);
  esito(dopo.length === prima.length - 1, 'nascosta una persona, la griglia ha una riga in meno', `${prima.length} → ${dopo.length}`);
  esito(!dopo.some((r) => r.startsWith(bersaglio)), `«${bersaglio}» non e' piu' in griglia`);

  await vaiA(cdp, PATH);
  await attendi(1500);
  const ricaricata = await righe(cdp);
  esito(ricaricata.length === dopo.length, 'dopo il ricaricamento resta nascosta', `righe: ${ricaricata.length}`);

  // Controllo negativo: chi non e' stato nascosto c'e' ancora.
  esito(ricaricata.some((r) => r.startsWith(prima[1].split(' ').slice(0, 2).join(' '))), 'le altre persone restano in griglia');

  await scegliPrima(cdp, bersaglio);
  const rimessa = await righe(cdp);
  esito(rimessa.length === prima.length, 'tolta dalle nascoste, la riga torna', `${rimessa.length}`);
} finally {
  riepilogo();
  await chiudi();
}
