/**
 * Banco: dove parte l'app installata (`start_url` = /avvio).
 *
 *   node scripts/banco-ui/avvio.mjs
 *
 * Su un computer (puntatore fine) /avvio porta all'ufficio; su un telefono
 * (puntatore coarse) porta all'app. Senza accesso si finisce al login con la
 * destinazione giusta in `next`; con l'accesso, a casa propria. Non scrive.
 */
import { apriChrome, vaiA, accedi, esito, riepilogo } from './comune.mjs';
import { valuta, finoA } from '../banco-upload/cdp.mjs';

const dove = (cdp) => valuta(cdp, `location.pathname + location.search`);

// ⚠️ Il caso «senza accesso» non si misura qui: Chrome, fra un'apertura e
// l'altra dello stesso banco, si porta dietro la sessione. Il manifest si
// legge con curl (`start_url` /avvio, `id` /mobile, `scope` /).
{
  const { cdp, chiudi } = await apriChrome({});
  try {
    await accedi(cdp, 'kantiere');
    const coarse = await valuta(cdp, `window.matchMedia('(pointer: coarse)').matches`);
    esito(coarse === false, 'computer: il puntatore e’ fine');
    await vaiA(cdp, '/avvio');
    await finoA(cdp, `location.pathname.startsWith('/office')`, { cosa: 'ufficio', timeoutMs: 40000 });
    esito(true, 'computer con accesso ufficio: /avvio → ufficio', await dove(cdp));
    const shell = await valuta(cdp, `!!document.querySelector('[data-app-shell]') && !document.querySelector('[data-bottom-nav], nav.fixed.bottom-0')`);
    esito(shell, 'computer: guscio dell’ufficio, non la barra del telefono');
  } finally {
    await chiudi();
  }
}
{
  const { cdp, chiudi } = await apriChrome({ mobile: true });
  try {
    await accedi(cdp, 'tecnico');
    const coarse = await valuta(cdp, `window.matchMedia('(pointer: coarse)').matches`);
    esito(coarse === true, 'telefono: il puntatore e’ coarse');
    await vaiA(cdp, '/avvio');
    await finoA(cdp, `location.pathname.startsWith('/mobile')`, { cosa: 'app', timeoutMs: 40000 });
    esito(true, 'telefono con accesso: /avvio → app', await dove(cdp));
  } finally {
    await chiudi();
  }
}
process.exit(riepilogo() === 0 ? 0 : 1);
