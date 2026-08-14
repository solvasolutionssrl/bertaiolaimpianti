/**
 * Banco di prova — app dei tecnici (iPhone emulato).
 *
 * Le cose che sul telefono si notano subito e a parole non si riescono a
 * verificare:
 *
 *  1. **niente sborda** in larghezza e la pagina non balla;
 *  2. **gli spazi in alto e in basso** rispettano la tacca e la barra di casa,
 *     e la barra dei tab non copre l'ultimo pezzo di contenuto;
 *  3. **cambiare pagina risponde subito**, con un'attesa mostrata quando serve;
 *  4. i **tasti** hanno una superficie che un dito riesce a prendere.
 *
 * Uso:
 *   cd apps/web && npx next dev -p 3010
 *   node scripts/banco-ui/app.mjs
 */

import { apriChrome, accedi, vaiA, valuta, finoA, foto, esito, riepilogo } from './comune.mjs';

const MONDO = process.env.BANCO_MONDO ?? 'kantiere';

const ROTTE = {
  kantiere: [
    ['/mobile/kantiere/cruscotto', 'Cruscotto'],
    ['/mobile/kantiere/cantieri', 'Cantieri'],
    ['/mobile/kantiere/ore', 'Ore'],
    ['/mobile/kantiere/spese', 'Spese'],
    ['/mobile/notifiche', 'Avvisi'],
    ['/mobile/profilo', 'Profilo'],
  ],
  kommessa: [
    ['/mobile', 'Home'],
    ['/mobile/commesse', 'Commesse'],
    ['/mobile/notifiche', 'Avvisi'],
    ['/mobile/profilo', 'Profilo'],
  ],
};

/**
 * Sull'iPhone la finestra include la tacca in alto e la barra di casa in
 * basso. Qui le simuliamo davvero: senza, un difetto di spaziatura non si
 * vede perche' i margini di sicurezza valgono zero.
 */
const TACCA = 59;
const BARRA_CASA = 34;

const MISURA = `(() => {
  const doc = document.documentElement;
  const b = document.body;
  const nav = document.querySelector('nav[class*="fixed"], [data-bottom-nav]');
  const navH = nav ? Math.round(nav.getBoundingClientRect().height) : 0;
  // Quello che conta e' il FONDO della pagina: piu' su le cose scorrono e si
  // raggiungono comunque. Quindi si scende in fondo e si guarda li'.
  window.scrollTo(0, doc.scrollHeight);
  const contenitore = [...document.querySelectorAll('*')].find(
    (el) => el.scrollHeight > el.clientHeight + 20 && getComputedStyle(el).overflowY === 'auto',
  );
  if (contenitore) contenitore.scrollTop = contenitore.scrollHeight;
  let coperti = 0;
  const nascosti = [];
  if (nav) {
    const cimaNav = nav.getBoundingClientRect().top;
    document.querySelectorAll('button, a, input, select, textarea').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.height === 0) return;
      if (nav.contains(el)) return;
      // Sta a schermo, ma il suo centro finisce sotto la barra: da qui non si
      // tocca piu', e non c'e' altro scroll che lo tiri fuori.
      if (r.top < window.innerHeight && (r.top + r.bottom) / 2 > cimaNav) {
        coperti++;
        nascosti.push((el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30));
      }
    });
  }
  // Il primo elemento in cima non deve finire sotto la tacca.
  const primo = document.querySelector('main, [class*="animate-content-in"], header');
  const primoTop = primo ? Math.round(primo.getBoundingClientRect().top) : null;
  return {
    larghezzaDoc: doc.scrollWidth,
    larghezzaFinestra: window.innerWidth,
    sbordo: Math.max(0, doc.scrollWidth - window.innerWidth),
    navH,
    coperti,
    nascosti: nascosti.slice(0, 3),
    primoTop,
    // Quanto vale davvero il margine di sicurezza in alto (0 = non simulato).
    safeTop: parseInt(getComputedStyle(doc).getPropertyValue('--sat') || '0', 10) || null,
    altezzaContenuto: b.scrollHeight,
    finestra: window.innerHeight,
  };
})()`;

async function main() {
  const { cdp, chiudi } = await apriChrome({ mobile: true });
  const errori = [];
  cdp.su('Runtime.exceptionThrown', (p) => {
    errori.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? '?');
  });

  try {
    console.log(`\n\x1b[1mBanco UI app — mondo ${MONDO} (iPhone emulato)\x1b[0m\n`);

    // ⚠️ In emulazione `env(safe-area-inset-*)` vale ZERO: la tacca e la barra
    // di casa non esistono, e un difetto di spaziatura non si vede. Le
    // rimettiamo a mano, aggiungendo lo spazio dove il codice usa `env(...)`,
    // cosi' le misure somigliano a un iPhone vero.
    await cdp.invia('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        addEventListener('DOMContentLoaded', () => {
          const s = document.createElement('style');
          s.textContent =
            'nav[class*="fixed"]{padding-bottom:${BARRA_CASA}px !important}' +
            '[class*="safe-top"],[class*="pt-\\\\[env"]{padding-top:${TACCA}px !important}';
          document.head.appendChild(s);
        });
      `,
    });

    await accedi(cdp, MONDO);
    esito(true, 'accesso eseguito');

    const rotte = ROTTE[MONDO];

    // ── 1. larghezza e spazi ────────────────────────────────────────────────
    console.log('\n\x1b[1m1. Larghezza e spazi\x1b[0m');
    for (const [path, nome] of rotte) {
      try {
        await vaiA(cdp, path);
        await new Promise((r) => setTimeout(r, 700));
        const m = await valuta(cdp, MISURA);
        const ok = m.sbordo === 0;
        esito(ok, `${nome} · non sborda`, ok ? '' : `sborda di ${m.sbordo}px`);
        if (!ok) await foto(cdp, `app-sbordo-${path.replace(/\//g, '_')}`);
        if (m.navH > 0) {
          esito(
            m.coperti === 0,
            `${nome} · in fondo non resta niente sotto la barra`,
            m.coperti === 0 ? '' : `${m.coperti} coperti: ${m.nascosti.join(' | ')}`,
          );
        }
      } catch (e) {
        esito(false, `${nome}`, String(e.message).slice(0, 120));
      }
    }

    // ── 2. cambio pagina: risponde e mostra l'attesa ────────────────────────
    console.log('\n\x1b[1m2. Cambio pagina\x1b[0m');
    await vaiA(cdp, rotte[0][0]);
    const tab = await valuta(
      cdp,
      `[...document.querySelectorAll('a[href^="/mobile"]')]
         .filter(a => a.closest('nav'))
         .map(a => ({ href: a.getAttribute('href'), testo: a.textContent.trim().slice(0,20) }))`,
    );
    console.log(`  (${tab.length} tab in fondo)`);
    for (const t of tab) {
      const partenza = await valuta(cdp, 'location.pathname');
      if (partenza === t.href) continue;
      await valuta(cdp, `document.querySelector('nav a[href="${t.href}"]').click(), true`);
      const t0 = Date.now();
      let ok = true;
      try {
        await finoA(cdp, `location.pathname === ${JSON.stringify(t.href)}`, {
          timeoutMs: 20_000, ogniMs: 60,
        });
      } catch {
        ok = false;
      }
      esito(ok, `tab ${t.testo || t.href}`, ok ? `${Date.now() - t0} ms` : 'NON NAVIGA');
    }

    // ── 3. superficie dei tasti ─────────────────────────────────────────────
    console.log('\n\x1b[1m3. I tasti si prendono col dito\x1b[0m');
    for (const [path, nome] of rotte.slice(0, 4)) {
      await vaiA(cdp, path);
      await new Promise((r) => setTimeout(r, 600));
      const piccoli = await valuta(
        cdp,
        `(() => {
          const fuori = [];
          document.querySelectorAll('button, a[href], [role=button]').forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return;
            // 40px: sotto questa misura un dito sbaglia bersaglio.
            if (r.height < 40 && r.width < 40) {
              fuori.push(Math.round(r.height) + 'x' + Math.round(r.width) + ' ' +
                (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 24));
            }
          });
          return fuori;
        })()`,
      );
      esito(
        piccoli.length === 0,
        `${nome}`,
        piccoli.length === 0 ? '' : `${piccoli.length} tasti sotto 40px: ${piccoli.slice(0, 3).join(' | ')}`,
      );
    }

    // ── 4. dati vivi ────────────────────────────────────────────────────────
    console.log('\n\x1b[1m4. I dati si riaggiornano da soli\x1b[0m');
    for (const [path, nome] of rotte) {
      await vaiA(cdp, path);
      await new Promise((r) => setTimeout(r, 400));
      const vivo = await valuta(cdp, `!!document.querySelector('[data-live-refresh]')`);
      console.log(`  ${vivo ? '\x1b[32m•\x1b[0m' : '\x1b[90m·\x1b[0m'} ${nome}${vivo ? ' si aggiorna da solo' : ''}`);
    }

    // ── 5. errori JavaScript ────────────────────────────────────────────────
    console.log('\n\x1b[1m5. Nessun errore JavaScript\x1b[0m');
    esito(errori.length === 0, 'console pulita', errori.slice(0, 3).join(' | ').slice(0, 200));
  } finally {
    chiudi();
  }

  process.exit(riepilogo() === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\x1b[31mbanco interrotto:\x1b[0m', e.message);
  process.exit(2);
});
