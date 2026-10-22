/**
 * Banco: i tasti disegnati nella ricerca rapida (⌘K) su un PC Windows.
 *
 *   node scripts/banco-ui/palette-tasti.mjs
 *
 * Chrome si dichiara Windows: il badge deve dire «Ctrl K», non «⌘K», e le
 * frecce e l'invio sono icone, non glifi che in qualche font escono vuoti.
 */
import { apriChrome, vaiA, accedi, esito, riepilogo, foto, clicVero } from './comune.mjs';
import { valuta, finoA } from '../banco-upload/cdp.mjs';

const { cdp, chiudi } = await apriChrome({});
try {
  await cdp.invia('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', platform: 'Win32' });
  await accedi(cdp, 'kantiere');
  await vaiA(cdp, '/office/kantiere');
  await finoA(cdp, `document.querySelector('input[aria-label="Ricerca rapida"]')`, { cosa: 'ricerca', timeoutMs: 40000 });
  const badge = await valuta(cdp, `document.querySelector('input[aria-label="Ricerca rapida"]').parentElement.querySelector('kbd')?.innerText.replace(/\\s+/g,' ').trim()`);
  esito(badge === 'Ctrl K', 'header: il badge dice «Ctrl K» su Windows', badge);
  await clicVero(cdp, `document.querySelector('input[aria-label="Ricerca rapida"]')`);
  await new Promise((r) => setTimeout(r, 1500));
  await foto(cdp, 'palette-tasti-00-dopo-clic');
  const aperta = await valuta(cdp, `!!document.querySelector('[role=dialog] kbd')`);
  if (!aperta) {
    // Il clic non l'ha aperta: Ctrl+K, come farebbe chi conosce la scorciatoia.
    await cdp.invia('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 2 });
    await cdp.invia('Input.dispatchKeyEvent', { type: 'keyUp', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 2 });
  }
  await finoA(cdp, `document.querySelector('[role=dialog] kbd')`, { cosa: 'palette', timeoutMs: 15000 });
  esito(aperta, 'palette: si apre dal clic sulla ricerca (altrimenti con Ctrl+K)');
  const t = await valuta(cdp, `[...document.querySelectorAll('[role=dialog]')].pop().innerText`);
  esito(!/[⏎↑↓⌘]/.test(t), 'palette: nessun glifo da tastiera nel testo', (t.match(/[⏎↑↓⌘]/g) ?? []).join(''));
  esito(/Ctrl K/i.test(t), 'palette: in basso «Ctrl K» (la scritta è in maiuscolo via CSS)');
  const icone = await valuta(cdp, `[...document.querySelectorAll('[role=dialog] kbd svg')].length`);
  esito(icone >= 3, 'palette: frecce e invio sono icone', String(icone));
  await foto(cdp, 'palette-tasti-01');
} finally {
  await chiudi();
}
process.exit(riepilogo() === 0 ? 0 : 1);
