/**
 * Banco: «Esci» dal menu utente dell'ufficio porta davvero al login, anche in
 * un browser che non ha MAI aperto il telefono (quindi senza service worker).
 *
 * Il difetto (23/10/2026): `spegniSottoscrizionePush` aspettava
 * `navigator.serviceWorker.ready`, che senza una registrazione non si risolve
 * mai; il logout restava appeso alla prima riga e il menu si chiudeva e basta.
 *
 *   node scripts/banco-ui/logout-desktop.mjs
 */
import { apriChrome, accedi, esito, riepilogo, foto, clicVero } from './comune.mjs';
import { valuta, finoA } from '../banco-upload/cdp.mjs';

const { cdp, chiudi } = await apriChrome({ larghezza: 1440 });
try {
  await accedi(cdp, 'kantiere');
  const sw = await valuta(cdp, `navigator.serviceWorker.getRegistration().then((r) => !!r)`, true);
  esito(sw === false, 'premessa: nessun service worker registrato su /office', String(sw));
  await finoA(cdp, `document.querySelector('button[aria-label="Menu utente"]')`, { cosa: 'menu utente', timeoutMs: 60000 });
  await clicVero(cdp, `document.querySelector('button[aria-label="Menu utente"]')`);
  await finoA(cdp, `[...document.querySelectorAll('[role=menuitem]')].some((m) => /^Esci$/.test(m.textContent.trim()))`, { cosa: 'voce Esci' });
  await clicVero(cdp, `[...document.querySelectorAll('[role=menuitem]')].find((m) => /^Esci$/.test(m.textContent.trim()))`);
  let arrivato = true;
  try {
    await finoA(cdp, `location.pathname.startsWith('/login')`, { cosa: 'pagina di accesso', timeoutMs: 8000 });
  } catch {
    arrivato = false;
  }
  const dove = await valuta(cdp, `location.pathname`);
  esito(arrivato, '«Esci» porta al login entro 8 secondi', dove);
  await foto(cdp, 'logout-desktop-01');
} finally {
  await chiudi();
}
process.exit(riepilogo() === 0 ? 0 : 1);
