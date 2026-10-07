/**
 * Banco: la registrazione troppo breve di una riunione.
 *
 * ## Il difetto
 *
 * Toccare due volte il microfono — cosa che capita di continuo con i guanti, o
 * quando non si è sicuri che abbia registrato — produce mezzo secondo di
 * audio. Gli altri cinque punti dell'app che registrano lo buttano via con un
 * avviso calmo; il modulo delle riunioni ha un registratore **tutto suo**, non
 * conosceva la soglia, e mandava quel mezzo secondo all'AI. L'AI non
 * riconosceva niente, la rotta rispondeva 422, e la persona si vedeva un
 * popup: «Trascrizione fallita».
 *
 * ⭐ **Non c'era un limite da togliere: ne mancava uno.** Sotto il decimo di
 * secondo rifiuta OpenAI stessa; il bordo esiste comunque, e l'unica cosa che
 * si può scegliere è come dirlo.
 *
 * ## Come si misura
 *
 * Chrome parte con un **microfono finto** (`--use-fake-device-for-media-stream`)
 * e il permesso già concesso: così si registra davvero per mezzo secondo,
 * invece di guardare il tasto e sperare.
 *
 *   node scripts/banco-ui/riunione-audio-corto.mjs
 *   BANCO_VISIBILE=1 node scripts/banco-ui/riunione-audio-corto.mjs
 *
 * Non salva niente: si ferma prima di scrivere la riunione.
 */
import {
  apriChrome, vaiA, valuta, finoA, esito, riepilogo, foto, BASE,
  clicVero,
} from './comune.mjs';

const TECNICO = { email: 'marco@demok.kommessa.local', password: 'Demo2026!' };
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

const { cdp, chiudi } = await apriChrome({ mobile: true, microfonoFinto: true });

try {
  console.log(`\n\x1b[1mBanco: registrazione troppo breve (${BASE})\x1b[0m\n`);

  await vaiA(cdp, '/login');
  await finoA(cdp, `document.querySelector('input[name=email]')`, { timeoutMs: 30_000 });
  await valuta(cdp, `(() => {
    const set = (el, v) => { const p = Object.getPrototypeOf(el);
      Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true })); };
    set(document.querySelector('input[name=email]'), ${JSON.stringify(TECNICO.email)});
    set(document.querySelector('input[name=password]'), ${JSON.stringify(TECNICO.password)});
    document.querySelector('form button[type=submit]').click();
    return true; })()`);
  await finoA(cdp, `!location.pathname.startsWith('/login')`, { timeoutMs: 40_000 });
  esito(true, 'accesso eseguito come tecnico');

  // Il microfono finto c'è davvero: se non ci fosse, tutto il resto non
  // misurerebbe niente e il banco direbbe verde per il motivo sbagliato.
  await valuta(cdp, `(() => {
    window.__mic = 'in corso';
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(s => { s.getTracks().forEach(t => t.stop()); window.__mic = 'si'; })
      .catch(() => { window.__mic = 'no'; });
    return true; })()`);
  await attendi(1200);
  const micOk = await valuta(cdp, `window.__mic`);
  esito(micOk === 'si', 'il browser ha un microfono utilizzabile', `getUserMedia: ${micOk}`);

  // ── si apre una commessa e il modulo della riunione ──
  await vaiA(cdp, '/mobile');
  await finoA(cdp, `document.querySelectorAll('a[href*="/mobile/commessa/"]').length > 0`, {
    timeoutMs: 25_000,
    cosa: 'una commessa nell elenco',
  });
  await valuta(cdp, `(document.querySelector('a[href*="/mobile/commessa/"]').click(), true)`);
  await finoA(cdp, `location.pathname.includes('/mobile/commessa/')`, { timeoutMs: 20_000 });
  await attendi(1500);

  await valuta(cdp, `(() => {
    const b = [...document.querySelectorAll('button, a')].find(x => /lavori|da fare/i.test(x.textContent));
    if (b) b.click();
    return true; })()`);
  await attendi(900);

  const apre = await valuta(cdp, `(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Riunione AI'));
    if (!b) return false;
    b.scrollIntoView({ block: 'center' });
    b.click();
    return true; })()`);
  await attendi(1500);
  await valuta(cdp, `(() => { const c = [...document.querySelectorAll('button')]
    .find(b => /^(continua|ok|procedi|conferma)$/i.test(b.textContent.trim())); if (c) c.click(); return true; })()`);
  await attendi(1200);

  const dialogAperto = await valuta(cdp, `Boolean(document.querySelector('[role=dialog]'))`);
  esito(apre && dialogAperto, 'il modulo della riunione si apre');

  // ── ⭐ mezzo secondo di registrazione ──
  const vai = await clicVero(
    cdp,
    `[...document.querySelectorAll('[role=dialog] button')].find(b => /detta a voce/i.test(b.textContent))`,
    { attesaMs: 900 },
  );
  esito(vai.fatto, 'la registrazione parte', vai.perche ?? '');

  const staRegistrando = await valuta(
    cdp,
    `[...document.querySelectorAll('[role=dialog] button')].some(b => /ferma registrazione/i.test(b.textContent))`,
  );
  esito(staRegistrando, 'il tasto diventa «Ferma registrazione»');

  // Mezzo secondo: il doppio tocco con i guanti.
  await attendi(500);
  const ferma = await clicVero(
    cdp,
    `[...document.querySelectorAll('[role=dialog] button')].find(b => /ferma registrazione/i.test(b.textContent))`,
    { attesaMs: 1200 },
  );
  esito(ferma.fatto, 'si ferma dopo mezzo secondo', ferma.perche ?? '');

  // ── cosa si vede ──
  await attendi(1200);
  const esitoVoce = await valuta(cdp, `(() => {
    const dialoghi = [...document.querySelectorAll('[role=dialog], [role=alertdialog]')];
    const testoTutto = dialoghi.map(d => d.textContent ?? '').join(' ');
    const avviso = [...document.querySelectorAll('[role=status]')]
      .map(p => (p.textContent ?? '').trim())
      .find(t => t.length > 0) ?? '';
    return {
      avviso,
      popupErrore: /trascrizione fallita|errore/i.test(testoTutto),
      staTrascrivendo: /trascrizione in corso/i.test(testoTutto),
      tastoTornato: [...document.querySelectorAll('[role=dialog] button')]
        .some(b => /detta a voce/i.test(b.textContent)),
    };
  })()`);

  esito(
    esitoVoce.avviso.length > 0 && /breve/i.test(esitoVoce.avviso),
    '⭐ compare un avviso calmo, in linea',
    esitoVoce.avviso || 'NESSUN AVVISO',
  );
  esito(
    !esitoVoce.popupErrore,
    '⭐ niente popup «Trascrizione fallita»',
    esitoVoce.popupErrore ? 'il popup di errore c’è ancora' : '',
  );
  esito(
    !esitoVoce.staTrascrivendo,
    '⭐ mezzo secondo non arriva nemmeno all’AI',
    esitoVoce.staTrascrivendo ? 'è partita la trascrizione' : 'scartato prima',
  );
  esito(esitoVoce.tastoTornato, 'il microfono è subito ripremibile');
} catch (e) {
  esito(false, 'il banco si è interrotto', String(e).slice(0, 200));
  try { await foto(cdp, 'riunione-audio-corto-interrotto'); } catch {}
} finally {
  riepilogo();
  await chiudi();
}
