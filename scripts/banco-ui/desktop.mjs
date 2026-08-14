/**
 * Banco di prova — interfaccia ufficio (desktop).
 *
 * Guida un Chrome vero contro il server di sviluppo e misura le cose che a
 * occhio si notano solo "a volte":
 *
 *  1. la **sidebar** arriva sempre in fondo alla finestra, a ogni pagina e a
 *     ogni altezza di finestra (il difetto era: si alza e sotto resta vuoto);
 *  2. **cliccando una voce di menu** succede qualcosa entro poco, e la pagina
 *     cambia davvero (il difetto era: si pianta);
 *  3. nessuna pagina **sborda in orizzontale**;
 *  4. le pagine con dati vivi si **riaggiornano da sole**.
 *
 * Uso:
 *   cd apps/web && npx next dev -p 3010     # in un terminale
 *   node scripts/banco-ui/desktop.mjs       # dalla radice del repo
 *
 * `BANCO_VISIBILE=1` per vedere il browser mentre lavora.
 */

import { apriChrome, accedi, vaiA, valuta, finoA, foto, esito, riepilogo } from './comune.mjs';

const MONDO = process.env.BANCO_MONDO ?? 'kantiere';

/** Le pagine da girare, per mondo. */
const ROTTE = {
  kantiere: [
    ['/office/kantiere', 'Dashboard'],
    ['/office/kantiere/cantieri', 'Cantieri'],
    ['/office/kantiere/rapportini', 'Presenze e ore'],
    ['/office/kantiere/ore-costi', 'Ore e costi'],
    ['/office/kantiere/kontabilita', 'Kontabilità'],
    ['/office/kantiere/dipendenti', 'Dipendenti'],
    ['/office/kantiere/mezzi', 'Parco mezzi'],
    ['/office/kantiere/sedi', 'Sedi'],
    ['/office/kantiere/qr', 'QR code'],
    ['/office/kantiere/report', 'Report'],
    ['/office/clienti', 'Clienti'],
    ['/office/notifiche', 'Avvisi'],
    ['/office/impostazioni', 'Impostazioni'],
  ],
  kommessa: [
    ['/office', 'Dashboard'],
    ['/office/commesse', 'Commesse'],
    ['/office/todo', 'Task'],
    ['/office/clienti', 'Clienti'],
    ['/office/turni', 'Turni'],
    ['/office/notifiche', 'Avvisi'],
    ['/office/impostazioni', 'Impostazioni'],
  ],
};

/**
 * Misura la geometria della shell. Il numero che conta e' `vuotoSotto`:
 * quanti pixel di sfondo restano fra il fondo della sidebar e il fondo della
 * finestra. Deve essere 0.
 */
const MISURA = `(() => {
  const aside = document.querySelector('aside');
  const main = document.querySelector('main');
  const shell = aside && aside.closest('div.flex');
  if (!aside || !main) return { manca: true };
  const a = aside.getBoundingClientRect();
  const m = main.getBoundingClientRect();
  return {
    manca: false,
    finestra: window.innerHeight,
    asideTop: Math.round(a.top),
    asideBottom: Math.round(a.bottom),
    asideAltezza: Math.round(a.height),
    mainAltezza: Math.round(m.height),
    vuotoSotto: Math.round(window.innerHeight - a.bottom),
    // Sbordo orizzontale: il documento non deve essere piu' largo della finestra.
    sbordo: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    // La pagina intera non deve scrollare: scrolla solo <main>.
    scrollPagina: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
  };
})()`;

async function main() {
  const { cdp, chiudi } = await apriChrome({ larghezza: 1440, altezza: 900 });
  const errori = [];
  cdp.su('Runtime.exceptionThrown', (p) => {
    errori.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? '?');
  });

  try {
    console.log(`\n\x1b[1mBanco UI desktop — mondo ${MONDO}\x1b[0m\n`);
    await accedi(cdp, MONDO);
    esito(true, 'accesso eseguito');

    // ── 1. sidebar a tutta altezza, pagina per pagina ───────────────────────
    console.log('\n\x1b[1m1. Sidebar sempre in fondo\x1b[0m');
    const rotte = ROTTE[MONDO];
    for (const [path, nome] of rotte) {
      try {
        await vaiA(cdp, path);
        // un attimo perche' l'idratazione finisca di assestare il layout
        await new Promise((r) => setTimeout(r, 400));
        const m = await valuta(cdp, MISURA);
        if (m.manca) {
          esito(false, `${nome}`, 'niente <aside>/<main>: pagina fuori dalla shell?');
          continue;
        }
        const ok = m.vuotoSotto === 0 && m.sbordo === 0 && m.scrollPagina === 0;
        esito(
          ok,
          `${nome}`,
          ok
            ? `sidebar ${m.asideAltezza}px = finestra`
            : [
                m.vuotoSotto !== 0 ? `VUOTO SOTTO ${m.vuotoSotto}px` : '',
                m.sbordo !== 0 ? `sborda ${m.sbordo}px` : '',
                m.scrollPagina !== 0 ? `la pagina scrolla ${m.scrollPagina}px` : '',
              ]
                .filter(Boolean)
                .join(' · '),
        );
        if (!ok) await foto(cdp, `sidebar-${path.replace(/\//g, '_')}`);
      } catch (e) {
        esito(false, `${nome}`, String(e.message).slice(0, 120));
      }
    }

    // ── 2. la prova severa: finestra bassa su OGNI pagina ───────────────────
    // A 520px di altezza il contenuto sfora sempre, quindi se una pagina ha
    // ancora uno scroll fantasma qui viene fuori. A finestra grande il difetto
    // si vedeva solo dove il contenuto era abbastanza lungo: era il motivo per
    // cui capitava "a volte".
    console.log('\n\x1b[1m2. Finestra bassa (520px): la pagina non deve scrollare\x1b[0m');
    await cdp.invia('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 520, deviceScaleFactor: 1, mobile: false,
    });
    for (const [path, nome] of rotte) {
      try {
        await vaiA(cdp, path);
        await new Promise((r) => setTimeout(r, 500));
        const m = await valuta(cdp, MISURA);
        // la prova che conta: scrollo la finestra e la sidebar non si sposta
        const tenuta = await valuta(
          cdp,
          `(() => {
            const a = document.querySelector('aside');
            if (!a) return { manca: true };
            const prima = Math.round(a.getBoundingClientRect().top);
            window.scrollTo(0, 800);
            const dopo = Math.round(a.getBoundingClientRect().top);
            window.scrollTo(0, 0);
            return { manca: false, prima, dopo, scivolata: prima !== dopo };
          })()`,
        );
        const ok = !m.manca && m.scrollPagina === 0 && !tenuta.scivolata;
        esito(
          ok,
          `${nome}`,
          ok ? '' : `scroll fantasma ${m.scrollPagina}px — la sidebar scivola da ${tenuta.prima} a ${tenuta.dopo}`,
        );
      } catch (e) {
        esito(false, `${nome}`, String(e.message).slice(0, 120));
      }
    }
    await cdp.invia('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
    });

    // ── 3. click sulle voci di menu: risponde? ──────────────────────────────
    console.log('\n\x1b[1m3. Le voci di menu rispondono al click\x1b[0m');
    await vaiA(cdp, rotte[0][0]);
    const voci = await valuta(
      cdp,
      `[...document.querySelectorAll('aside nav a[href^="/office"]')].map(a => ({
        href: a.getAttribute('href'), testo: a.textContent.trim()
      }))`,
    );
    console.log(`  (${voci.length} voci trovate)`);
    for (const v of voci) {
      const partenza = await valuta(cdp, 'location.pathname');
      if (partenza === v.href) continue;
      await valuta(
        cdp,
        `document.querySelector('aside nav a[href="${v.href}"]').click(), true`,
      );
      const t0 = Date.now();
      let arrivato = false;
      try {
        await finoA(cdp, `location.pathname === ${JSON.stringify(v.href)}`, {
          timeoutMs: 20_000, ogniMs: 60, cosa: `arrivo su ${v.href}`,
        });
        arrivato = true;
      } catch { /* rimasto fermo */ }
      const ms = Date.now() - t0;
      esito(arrivato, `${v.testo || v.href}`, arrivato ? `${ms} ms` : 'NON NAVIGA');
      if (arrivato) {
        // e dopo il cambio pagina la sidebar deve restare a posto
        await new Promise((r) => setTimeout(r, 300));
        const m = await valuta(cdp, MISURA);
        if (!m.manca && m.vuotoSotto !== 0) {
          esito(false, `  ↳ dopo il click su ${v.testo}`, `VUOTO SOTTO ${m.vuotoSotto}px`);
        }
      }
    }

    // ── 4. segnale di attesa durante il cambio pagina ───────────────────────
    console.log('\n\x1b[1m4. Durante l\'attesa si vede qualcosa\x1b[0m');
    for (const [path, nome] of rotte.slice(0, 6)) {
      const partenza = await valuta(cdp, 'location.pathname');
      if (partenza === path) continue;
      // rallentiamo la rete per rendere l'attesa visibile
      await cdp.invia('Network.emulateNetworkConditions', {
        offline: false, latency: 400, downloadThroughput: 200_000, uploadThroughput: 200_000,
      });
      await valuta(cdp, `(document.querySelector('aside nav a[href="${path}"]')||{click(){}}).click(), true`);
      // entro mezzo secondo dal click deve esserci UN segno: skeleton, spinner,
      // o la voce marcata come attiva.
      await new Promise((r) => setTimeout(r, 500));
      const segno = await valuta(
        cdp,
        `(() => {
          const skel = document.querySelectorAll('[class*="animate-pulse"]').length;
          const spin = document.querySelectorAll('[class*="animate-spin"]').length;
          const attiva = !!document.querySelector('aside nav a[href="${path}"][aria-current="page"]');
          const barra = !!document.querySelector('[data-attesa-navigazione]');
          return { skel, spin, attiva, barra };
        })()`,
      );
      const c = segno.skel > 0 || segno.spin > 0 || segno.attiva || segno.barra;
      esito(c, `${nome}`, c ? '' : 'NESSUN SEGNO nei primi 500 ms');
      await cdp.invia('Network.emulateNetworkConditions', {
        offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
      });
      await finoA(cdp, `location.pathname === ${JSON.stringify(path)}`, { timeoutMs: 25_000 }).catch(() => {});
    }

    // ── 5. aggiornamento automatico ─────────────────────────────────────────
    console.log('\n\x1b[1m5. I dati si riaggiornano da soli\x1b[0m');
    await vaiA(cdp, rotte[0][0]);
    const vivo = await valuta(
      cdp,
      `(() => {
        const el = document.querySelector('[data-live-refresh]');
        return el ? Number(el.getAttribute('data-live-refresh')) : 0;
      })()`,
    );
    esito(vivo === 60000, 'la dashboard si aggiorna da sola ogni minuto',
      vivo === 0 ? 'non si aggiorna' : vivo === 60000 ? '' : `ogni ${vivo} ms`);

    // ── 6. i tasti: ci sono, e rispondono ───────────────────────────────────
    // Non si preme davvero tutto (aprirebbe dialog e salverebbe roba): si
    // controlla che ogni tasto sia raggiungibile, abbia un nome leggibile e
    // non sia disabilitato senza motivo. Un tasto senza nome è invisibile a
    // chi usa il lettore di schermo, e indecifrabile per chiunque nei log.
    console.log('\n\x1b[1m6. I tasti\x1b[0m');
    for (const [path, nome] of rotte) {
      await vaiA(cdp, path);
      await new Promise((r) => setTimeout(r, 500));
      const t = await valuta(
        cdp,
        `(() => {
          const tutti = [...document.querySelectorAll('button, [role=button]')]
            .filter((b) => b.getBoundingClientRect().height > 0);
          const senzaNome = tutti.filter(
            (b) => !(b.textContent || '').trim() && !b.getAttribute('aria-label') && !b.title,
          ).length;
          const sotto = tutti.filter((b) => {
            const r = b.getBoundingClientRect();
            return r.height < 24 || r.width < 24;
          }).length;
          return { totale: tutti.length, senzaNome, sotto };
        })()`,
      );
      const ok = t.senzaNome === 0 && t.sotto === 0;
      esito(
        ok,
        `${nome} · ${t.totale} tasti`,
        ok ? '' : `${t.senzaNome} senza nome, ${t.sotto} troppo piccoli`,
      );
    }

    // ── 7. apertura e chiusura di un dialog ─────────────────────────────────
    // Il difetto classico: si apre, si chiude, e resta il velo grigio sopra la
    // pagina che blocca ogni click. Da fuori sembra che l'app si sia piantata.
    console.log('\n\x1b[1m7. I dialog si chiudono davvero\x1b[0m');
    for (const [path, nome] of rotte.slice(0, 6)) {
      await vaiA(cdp, path);
      await new Promise((r) => setTimeout(r, 500));
      const esitoDialog = await valuta(
        cdp,
        `(() => {
          const apri = [...document.querySelectorAll('button')].find((b) =>
            /nuov|aggiungi|crea|modifica|filtri/i.test(b.textContent || ''),
          );
          if (!apri) return { saltato: true };
          apri.click();
          return { saltato: false };
        })()`,
      );
      if (esitoDialog.saltato) {
        console.log(`  \x1b[90m·\x1b[0m ${nome}: nessun tasto che apra qualcosa`);
        continue;
      }
      await new Promise((r) => setTimeout(r, 700));
      const aperto = await valuta(cdp, `!!document.querySelector('[role=dialog]')`);
      if (!aperto) {
        console.log(`  \x1b[90m·\x1b[0m ${nome}: il tasto non apre un dialog`);
        continue;
      }
      await valuta(cdp, `document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true})), true`);
      await new Promise((r) => setTimeout(r, 600));
      const residuo = await valuta(
        cdp,
        `(() => {
          const d = document.querySelector('[role=dialog]');
          // Il velo: un elemento fisso a tutto schermo che intercetta i click.
          const velo = [...document.querySelectorAll('div')].some((el) => {
            const s = getComputedStyle(el);
            if (s.position !== 'fixed' || s.pointerEvents === 'none') return false;
            const r = el.getBoundingClientRect();
            return r.width >= window.innerWidth - 2 && r.height >= window.innerHeight - 2
              && s.visibility !== 'hidden' && s.display !== 'none';
          });
          return { dialogAncoraLi: !!d, velo, bodyBloccato: getComputedStyle(document.body).overflow === 'hidden' };
        })()`,
      );
      esito(
        !residuo.dialogAncoraLi && !residuo.velo,
        `${nome} · dialog aperto e chiuso`,
        residuo.dialogAncoraLi ? 'non si chiude con Esc' : residuo.velo ? 'RESTA IL VELO sopra la pagina' : '',
      );
    }

    // ── 8. errori JavaScript raccolti per strada ────────────────────────────
    console.log('\n\x1b[1m8. Nessun errore JavaScript\x1b[0m');
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
