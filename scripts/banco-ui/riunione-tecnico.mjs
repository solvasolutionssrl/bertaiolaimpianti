/**
 * Banco: un tecnico scrive una riunione, AI compresa.
 *
 * ⚠️ Questo banco nasce da un difetto che e' andato in produzione e ha
 * mangiato il lavoro di due riunioni vere. L'08/10 scrivere una riunione e'
 * diventato di ogni tecnico in squadra, ma **modificarla** era rimasto di
 * admin/ufficio — e il riassunto dell'AI non si scrive alla creazione: la
 * riunione nasce prima, il riassunto arriva subito dopo con un update. Quindi
 * per un tecnico la riunione si salvava, le cose da fare si creavano, e il
 * riassunto spariva. In silenzio, perche' il client non guardava nemmeno
 * l'esito di quella chiamata.
 *
 * ⭐ **Aprire un permesso vuol dire aprirlo per tutto il gesto**, non per la
 * prima chiamata del gesto.
 *
 *   node scripts/banco-ui/riunione-tecnico.mjs              # senza salvare
 *   BANCO_SALVA=1 node scripts/banco-ui/riunione-tecnico.mjs # giro completo
 *
 * Senza `BANCO_SALVA` arriva fino alla risposta dell'AI e non scrive niente.
 * Con, salva davvero sul tenant demo e controlla che il riassunto ci sia
 * ANCHE dopo il salvataggio: lascia una riunione «PROVA BANCO» da ripulire.
 */
import { apriChrome, vaiA, valuta, finoA, esito, riepilogo, BASE } from './comune.mjs';

const SALVA = process.env.BANCO_SALVA === '1';
const TECNICO = { email: 'marco@demok.kommessa.local', password: 'Demo2026!' };
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

const { cdp, chiudi } = await apriChrome({ mobile: true });
try {
  console.log(`\n\x1b[1mBanco: la riunione di un tecnico (${BASE})${SALVA ? ' — SALVA' : ''}\x1b[0m\n`);

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
  await finoA(cdp, `!location.pathname.startsWith('/login')`, { timeoutMs: 45_000 });
  esito(true, 'accesso eseguito come tecnico');

  await finoA(cdp, `document.querySelector('a[href^="/mobile/commessa/"]')`, { timeoutMs: 25_000 });
  const href = await valuta(cdp, `document.querySelector('a[href^="/mobile/commessa/"]').getAttribute('href')`);
  await vaiA(cdp, href.split('#')[0]);

  const haIlTasto = await finoA(
    cdp,
    `[...document.querySelectorAll('button')].some(b => b.textContent.includes('Riunione AI'))`,
    { timeoutMs: 25_000 },
  ).then(() => true).catch(() => false);
  esito(haIlTasto, 'il tasto «Riunione AI» c’è per un tecnico in squadra');

  await valuta(cdp, `([...document.querySelectorAll('button')]
    .find(b => b.textContent.includes('Riunione AI')).scrollIntoView({ block: 'center' }), true)`);
  await attendi(500);
  await valuta(cdp, `([...document.querySelectorAll('button')]
    .find(b => b.textContent.includes('Riunione AI')).click(), true)`);
  await attendi(1500);
  await valuta(cdp, `(() => { const c = [...document.querySelectorAll('button')]
    .find(b => /^(continua|ok|procedi|conferma)$/i.test(b.textContent.trim())); if (c) c.click(); return true; })()`);
  await attendi(1200);

  const apertoDialog = await valuta(cdp, `Boolean(document.querySelector('[role=dialog]'))`);
  esito(apertoDialog, 'il modulo della riunione si apre');

  const marca = 'PROVA BANCO ' + new Date().toISOString().slice(0, 16);
  await valuta(cdp, `(() => {
    const set = (el, v) => { const p = Object.getPrototypeOf(el);
      Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true })); };
    const t = document.querySelector('[role=dialog] input[type=text], [role=dialog] input:not([type])');
    if (t) set(t, ${JSON.stringify(marca)});
    const a = document.querySelector('[role=dialog] textarea');
    if (a) set(a, 'Caldaia del 2004 in lavanderia da sostituire. Scarico fumi a parete da rifare col kit coassiale. Radiatori in ghisa senza valvole termostatiche, proposto di montarle.');
    return true; })()`);
  await attendi(400);

  // Quanto testo c'è PRIMA: il riassunto si riconosce perché il contenuto
  // cresce. Misurare solo la lunghezza finale non distingue il riassunto dal
  // testo che ha scritto il banco — e la prima versione di questo controllo
  // passava proprio così, dichiarando «riassunto ricevuto» su 166 caratteri
  // che erano i suoi.
  const primaDellAI = await valuta(cdp, `Math.max(0, ...[...document.querySelectorAll('[role=dialog] textarea')].map(e => (e.value ?? '').length))`);

  await valuta(cdp, `([...document.querySelectorAll('[role=dialog] button')]
    .find(b => /riscrivi con ai/i.test(b.textContent))?.click(), true)`);

  // ⚠️ L'AI ci mette una quindicina di secondi, e nel frattempo compare un
  // avviso con un tasto «Capito» che va chiuso: lasciarlo lì blocca il resto.
  // Un timeout corto qui dichiarava un guasto che non c'era.
  let rispostaAI = null;
  for (let i = 0; i < 60; i += 1) {
    await valuta(cdp, `([...document.querySelectorAll('button')]
      .find(b => /^capito$/i.test(b.textContent.trim()))?.click(), true)`);
    const s = await valuta(cdp, `({
      negato: [...document.querySelectorAll('[role=dialog] p, [role=dialog] div')]
        .map(e => e.textContent?.trim() ?? '')
        .find(t => /capo squadra|policy|non consentito|non hai i permessi/i.test(t) && t.length < 170) ?? '',
      tasti: [...document.querySelectorAll('[role=dialog] button')].map(b => b.textContent.trim()).filter(Boolean),
    })`);
    if (s.negato) { rispostaAI = { ok: false, dettaglio: s.negato }; break; }
    if (s.tasti.some((t) => /salva riunione/i.test(t))) { rispostaAI = { ok: true, tasti: s.tasti }; break; }
    await attendi(1000);
  }
  esito(
    Boolean(rispostaAI?.ok),
    '⭐ l’AI risponde a un tecnico (non è riservata al capo squadra)',
    rispostaAI?.ok ? rispostaAI.tasti.find((t) => /salva riunione/i.test(t)) : (rispostaAI?.dettaglio ?? 'nessuna risposta in 60s'),
  );

  const dopoLAI = await valuta(cdp, `Math.max(0, ...[...document.querySelectorAll('[role=dialog] textarea')].map(e => (e.value ?? '').length))`);
  esito(
    dopoLAI > primaDellAI,
    'il riassunto arriva davvero (il contenuto cresce)',
    `${primaDellAI} → ${dopoLAI} caratteri`,
  );

  if (!SALVA) {
    console.log('\n  (senza BANCO_SALVA=1 non salvo: il giro si ferma qui)');
  } else {
    await valuta(cdp, `([...document.querySelectorAll('[role=dialog] button')]
      .find(b => /salva riunione/i.test(b.textContent))?.click(), true)`);
    await attendi(5000);

    const dopo = await valuta(cdp, `({
      chiuso: !document.querySelector('[role=dialog]'),
      erroreRiassunto: document.body.innerText.includes('il riassunto no'),
      testo: document.body.innerText,
    })`);
    esito(dopo.chiuso, 'il modulo si chiude dopo il salvataggio');
    esito(
      !dopo.erroreRiassunto,
      '⭐ nessun «riunione salvata, ma il riassunto no»',
      dopo.erroreRiassunto ? 'IL RIASSUNTO NON SI È SALVATO' : 'ok',
    );

    // ⭐ Il controllo che conta: il riassunto deve esserci ANCHE ricaricando
    // la pagina, cioè deve essere finito a database e non solo a schermo.
    await vaiA(cdp, href.split('#')[0]);
    await attendi(2500);
    const inPagina = await valuta(cdp, `document.body.innerText.includes(${JSON.stringify(marca)})`);
    esito(inPagina, 'la riunione compare nella scheda dopo il ricaricamento');
    console.log(`\n  ⚠ lasciata la riunione «${marca}» sul tenant demo: da ripulire.`);
  }
} catch (e) {
  esito(false, 'il banco si è interrotto', String(e).slice(0, 150));
} finally {
  riepilogo();
  await chiudi();
}
