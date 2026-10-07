/**
 * Banco: condividere un lavoro dalla PWA.
 *
 * ⚠️ Questo banco nasce da un difetto che e' vissuto in produzione senza che
 * nessuno lo segnalasse: **il tasto non apriva niente, per nessuno.** Il
 * componente stava dentro il Portal del menu «⋯», e al tocco React smontava
 * il Portal portandosi via lo stato appena impostato. Sembrava funzionare,
 * perche' il menu si chiude e chi guarda pensa di aver sbagliato il dito.
 *
 * Nessuna prova automatica premeva quel tasto. Adesso sì.
 *
 *   node scripts/banco-ui/condividi.mjs
 */
import { apriChrome, vaiA, valuta, finoA, esito, riepilogo, accedi, BASE } from './comune.mjs';

const { cdp, chiudi } = await apriChrome({ mobile: true });
try {
  console.log(`\n\x1b[1mBanco: condividere un lavoro (${BASE})\x1b[0m\n`);
  await accedi(cdp, 'kommessa');
  esito(true, 'accesso eseguito come ufficio');

  await vaiA(cdp, '/mobile/commesse');
  await finoA(cdp, `document.querySelector('a[href^="/mobile/commessa/"]')`, {
    cosa: 'una commessa', timeoutMs: 25_000,
  });
  const href = await valuta(cdp, `document.querySelector('a[href^="/mobile/commessa/"]').getAttribute('href')`);
  await vaiA(cdp, href);
  await finoA(cdp, `document.querySelectorAll('button').length > 3`, { timeoutMs: 25_000 });

  // ── 1. il menu «⋯» si apre ──
  const apertoMenu = await valuta(cdp, `(() => {
    const t = [...document.querySelectorAll('button')]
      .find(b => /^(⋯|…)$/.test(b.textContent.trim()) || /altre azioni|menu/i.test(b.getAttribute('aria-label') ?? ''));
    if (!t) return false;
    t.click();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 700));
  esito(apertoMenu, 'il menu «⋯» esiste e si apre');

  const voce = await valuta(cdp, `(() => {
    const b = [...document.querySelectorAll('button')].find(b => /condividi il lavoro/i.test(b.textContent));
    return b ? b.textContent.trim() : '';
  })()`);
  esito(voce.length > 0, 'la voce si chiama «Condividi il lavoro»', voce || 'non trovata');
  esito(!/cliente/i.test(voce), 'non dice «con il cliente»: non va per forza al cliente');

  // ── 2. ⭐ al tocco il dialog COMPARE (il difetto vissuto in produzione) ──
  await valuta(cdp, `([...document.querySelectorAll('button')]
    .find(b => /condividi il lavoro/i.test(b.textContent))?.click(), true)`);
  await new Promise((r) => setTimeout(r, 900));
  const dialog = await valuta(cdp, `(() => {
    const d = document.querySelector('[role=dialog][aria-label="Condividi il lavoro"]');
    if (!d) return null;
    const pannello = d.firstElementChild;
    const r = pannello.getBoundingClientRect();
    return {
      visibile: r.height > 50,
      bordoSotto: Math.round(innerHeight - r.bottom),
      altezzaVista: innerHeight,
      larghezza: Math.round(r.width),
      sborda: document.documentElement.scrollWidth > innerWidth + 1,
      raggioSotto: getComputedStyle(pannello).borderBottomLeftRadius,
    };
  })()`);
  esito(Boolean(dialog?.visibile), '⭐ il dialog compare davvero al tocco', dialog ? 'sì' : 'NON COMPARE');

  if (dialog) {
    // ── 3. non e' incollato al bordo dello schermo ──
    const percento = Math.round((dialog.bordoSotto / dialog.altezzaVista) * 100);
    esito(
      percento >= 8,
      'il pannello è staccato dal fondo di almeno il 10% dello schermo',
      `${dialog.bordoSotto}px su ${dialog.altezzaVista} = ${percento}%`,
    );
    esito(
      dialog.raggioSotto !== '0px',
      'gli angoli in basso sono tondi: è un pannello staccato, non tagliato',
      dialog.raggioSotto,
    );
    esito(!dialog.sborda, 'la pagina non scorre di lato con il dialog aperto');
  }

  // ── 4. i tasti che contano ci sono ──
  const tasti = await valuta(cdp, `[...document.querySelectorAll('[role=dialog] button')]
    .map(b => b.textContent.trim()).filter(t => t.length > 1 && t.length < 40)`);
  esito(
    tasti.some((t) => /crea il collegamento|invia il collegamento|rigenera|copia il collegamento/i.test(t)),
    'c’è il tasto principale',
    tasti.join(' · ').slice(0, 80),
  );
} catch (e) {
  esito(false, 'il banco si è interrotto', String(e).slice(0, 150));
} finally {
  riepilogo();
  await chiudi();
}
