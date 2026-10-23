/**
 * Banco: il foglio «Attiva le notifiche» all'apertura dell'app.
 *
 *   node scripts/banco-ui/notifiche-foglio.mjs
 *
 * Tre forme: si puo' attivare (tasto grande, «Non ora» lo mette via per la
 * sessione), permesso negato (istruzioni), iPhone fuori dall'app installata
 * (i due passi per la Home). Non scrive.
 */
import { apriChrome, vaiA, accedi, esito, riepilogo, foto, clicVero } from './comune.mjs';
import { valuta, finoA } from '../banco-upload/cdp.mjs';

const FOGLIO = `document.querySelector('[data-foglio-notifiche]')`;
const testo = (cdp) => valuta(cdp, `(${FOGLIO})?.innerText.replace(/\\s+/g,' ').trim() ?? ''`);
const bottone = (re) => `[...document.querySelectorAll('[data-foglio-notifiche] button')].find((b) => new RegExp(${JSON.stringify(re)}).test(b.textContent.trim()))`;

// ── 1. Android/Chrome: si puo' attivare ──
{
  const { cdp, chiudi } = await apriChrome({ mobile: true });
  try {
    // Su un Mac l'emulazione tiene `platform` MacIntel con il touch: per il
    // foglio e' un iPad. Qui si vuole un Android.
    await cdp.invia('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36', platform: 'Linux armv8l' });
    await accedi(cdp, 'tecnico', { foglioNotifiche: true });
    await vaiA(cdp, '/mobile/kantiere/cantieri');
    await finoA(cdp, `(${FOGLIO})?.dataset.foglioNotifiche === 'spento'`, { cosa: 'foglio', timeoutMs: 60000 });
    const t = await testo(cdp);
    esito(/Attiva le notifiche/.test(t) && /Commesse e attività assegnate/.test(t) && /Ore da inserire/.test(t) && /Più tardi/.test(t), 'foglio: titolo, i tre motivi, il tasto e «Più tardi»', t.slice(0, 120));
    const geom = await valuta(cdp, `(() => { const b = ${bottone('^Attiva le notifiche')}; const r = b.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), vw: innerWidth }; })()`);
    esito(geom.h >= 52 && geom.w >= geom.vw * 0.8, 'foglio: tasto grande, a tutta larghezza', JSON.stringify(geom));
    await foto(cdp, 'notifiche-foglio-01-attiva');
    await clicVero(cdp, bottone('^Più tardi$'));
    await finoA(cdp, `!${FOGLIO}`, { cosa: 'foglio chiuso' });
    esito(true, 'foglio: «Non ora» lo mette via');
    await vaiA(cdp, '/mobile/kantiere/ore');
    await new Promise((r) => setTimeout(r, 2500));
    esito(!(await valuta(cdp, `!!${FOGLIO}`)), 'foglio: nella stessa sessione non ricompare');
    // Permesso negato: le istruzioni.
    await cdp.invia('Browser.setPermission', { permission: { name: 'notifications' }, setting: 'denied', origin: 'http://localhost:3010' }).catch(() => null);
    await valuta(cdp, `sessionStorage.removeItem('kommessa.notifiche.proposto')`);
    await vaiA(cdp, '/mobile/kantiere/cantieri');
    await finoA(cdp, `(${FOGLIO})?.dataset.foglioNotifiche === 'negato'`, { cosa: 'foglio negato', timeoutMs: 30000 });
    esito(/bloccate/.test(await testo(cdp)) && /Impostazioni/.test(await testo(cdp)), 'foglio: col permesso negato spiega dove riaprirlo');
    await foto(cdp, 'notifiche-foglio-02-negato');
  } finally {
    await chiudi();
  }
}
// ── 2. iPhone in Safari (non installata): i due passi per la Home ──
{
  const { cdp, chiudi } = await apriChrome({ mobile: true });
  try {
    await cdp.invia('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
    await accedi(cdp, 'tecnico', { foglioNotifiche: true });
    await vaiA(cdp, '/mobile/kantiere/cantieri');
    await finoA(cdp, `(${FOGLIO})?.dataset.foglioNotifiche === 'serve_home'`, { cosa: 'foglio iPhone', timeoutMs: 60000 });
    const t = await testo(cdp);
    esito(/Metti Kommessa in Home/.test(t) && /Condividi/.test(t) && /Aggiungi alla schermata Home/.test(t), 'iPhone in Safari: i due passi per la Home', t.slice(0, 120));
    await foto(cdp, 'notifiche-foglio-03-iphone');
  } finally {
    await chiudi();
  }
}
process.exit(riepilogo() === 0 ? 0 : 1);
