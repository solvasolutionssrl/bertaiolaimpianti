/**
 * Banco: l'elenco del tecnico, quello che prima si chiamava «Oggi».
 *
 * Misura le cose che a leggere il diff sembrano fatte e a schermo non lo sono:
 * il titolo e la tab che devono dire la stessa parola, la ricerca che filtra
 * davvero, le pastiglie che contano quello che si vede, l'ordine dichiarato
 * che cambia, e la pagina che non sborda di lato su un telefono.
 *
 *   node scripts/banco-ui/elenco-commesse.mjs
 *   BANCO_VISIBILE=1 node scripts/banco-ui/elenco-commesse.mjs   # per guardare
 */
import { apriChrome, vaiA, valuta, finoA, esito, riepilogo, foto, BASE } from './comune.mjs';

const TECNICO = { email: 'marco@demok.kommessa.local', password: 'Demo2026!' };

async function accediCome(cdp, { email, password }) {
  await vaiA(cdp, '/login');
  await finoA(cdp, `document.querySelector('input[name=email]')`, { cosa: 'campo email' });
  await valuta(
    cdp,
    `(() => {
      const set = (el, v) => {
        const proto = Object.getPrototypeOf(el);
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set(document.querySelector('input[name=email]'), ${JSON.stringify(email)});
      set(document.querySelector('input[name=password]'), ${JSON.stringify(password)});
      document.querySelector('form button[type=submit]').click();
      return true;
    })()`,
  );
  await finoA(cdp, `!location.pathname.startsWith('/login')`, { timeoutMs: 40_000 });
  await finoA(cdp, `document.readyState === 'complete'`, { timeoutMs: 30_000 });
}

/** Scrive in un campo come lo farebbe un dito, non assegnando `.value`. */
async function scrivi(cdp, selettore, testo) {
  await valuta(
    cdp,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selettore)});
      if (!el) return false;
      const proto = Object.getPrototypeOf(el);
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(testo)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`,
  );
  // ⚠️ Il controllo va fatto DOPO il ridisegno, non nello stesso giro: la
  // prima versione di un banco gemello dichiarava assente ciò che un istante
  // più tardi c'era.
  await new Promise((r) => setTimeout(r, 400));
}

const { cdp, chiudi } = await apriChrome({ mobile: true });
try {
  console.log(`\n\x1b[1mBanco: l'elenco del tecnico (${BASE})\x1b[0m\n`);
  await accediCome(cdp, TECNICO);
  esito(true, 'accesso eseguito come tecnico');

  await vaiA(cdp, '/mobile');
  await finoA(cdp, `document.querySelector('input[type=search]')`, { cosa: 'campo di ricerca', timeoutMs: 20_000 });

  // ── 1. la parola è la stessa in tre posti ──
  const titolo = await valuta(cdp, `document.querySelector('h1')?.textContent?.trim() ?? ''`);
  esito(titolo === 'COMMESSE', 'il titolo della pagina dice COMMESSE', titolo);

  const tab = await valuta(
    cdp,
    `[...document.querySelectorAll('nav li')].map(li => li.textContent.trim().slice(0,12))`,
  );
  esito(tab.some((t) => t.toLowerCase().startsWith('commesse')), 'la tab in basso dice Commesse', tab.join(' · '));
  esito(!tab.some((t) => t.toLowerCase().includes('oggi')), 'nessuna tab dice più «Oggi»');

  // ── 2. le tre pastiglie, con i conteggi ──
  const pastiglie = await valuta(
    cdp,
    `[...document.querySelectorAll('button[aria-pressed]')]
       .map(b => b.textContent.trim().replace(/\\s+/g,' '))`,
  );
  esito(pastiglie.length === 3, 'tre pastiglie di filtro', pastiglie.join(' | '));
  esito(
    pastiglie.some((p) => /tutto/i.test(p)) &&
      pastiglie.some((p) => /commesse/i.test(p)) &&
      pastiglie.some((p) => /da fare/i.test(p)),
    'le pastiglie sono Tutto · Commesse · Da fare',
  );

  const quanteVoci = () =>
    valuta(
      cdp,
      `document.querySelectorAll('a[href^="/mobile/commessa/"]').length
       + [...document.querySelectorAll('div')].filter(d => d.className.includes('border-l-amber')).length`,
    );
  const vociIniziali = await quanteVoci();
  esito(vociIniziali > 0, 'l’elenco mostra almeno una voce', `${vociIniziali}`);

  // ── 3. la ricerca filtra per davvero ──
  await scrivi(cdp, 'input[type=search]', 'zzzqqqwww');
  const dopoRicercaVuota = await valuta(cdp, `document.body.innerText.includes('Niente che corrisponda')`);
  esito(dopoRicercaVuota, 'una ricerca senza riscontri lo dice invece di mostrare tutto');

  const conteggiAzzerati = await valuta(
    cdp,
    `[...document.querySelectorAll('button[aria-pressed] span:last-child')].map(s => s.textContent.trim())`,
  );
  esito(
    conteggiAzzerati.every((c) => c === '00'),
    '⭐ i conteggi delle pastiglie seguono la ricerca, non restano fermi',
    conteggiAzzerati.join(','),
  );

  await scrivi(cdp, 'input[type=search]', '');
  const dopoPulizia = await quanteVoci();
  esito(dopoPulizia === vociIniziali, 'svuotando la ricerca torna tutto', `${dopoPulizia}/${vociIniziali}`);

  // ── 4. il filtro «Commesse» toglie le cose da fare ──
  await valuta(
    cdp,
    `[...document.querySelectorAll('button[aria-pressed]')].find(b => /commesse/i.test(b.textContent))?.click(), true`,
  );
  await new Promise((r) => setTimeout(r, 400));
  const soloCommesse = await valuta(
    cdp,
    `[...document.querySelectorAll('a[href*="#lavori"]')].length`,
  );
  esito(soloCommesse === 0, 'con il filtro «Commesse» non resta nessuna cosa da fare', `${soloCommesse}`);

  // ── 5. l'ordine è dichiarato, e cambia ──
  await valuta(
    cdp,
    `[...document.querySelectorAll('button[aria-pressed]')].find(b => /tutto/i.test(b.textContent))?.click(), true`,
  );
  await new Promise((r) => setTimeout(r, 300));
  // ⚠️ Cercato per CONTENUTO, non «il primo paragrafo con un punto in mezzo»:
  // la prima versione pescava il «Buongiorno · MERCOLEDÌ 7 OTTOBRE»
  // dell'intestazione e bocciava una cosa che funzionava. Un banco deve
  // distinguere «non funziona» da «non l'ho trovato».
  //
  // ⚠️ E niente `\b` nelle espressioni regolari che viaggiano dentro un
  // template literal: li' `\b` non e' il confine di parola, e' il carattere
  // di ritorno. La seconda versione cercava un carattere di controllo e
  // dichiarava assente una riga che era a schermo. Si confronta il testo.
  const ordinePrima = await valuta(
    cdp,
    `[...document.querySelectorAll('p')]
       .map(p => p.textContent?.trim() ?? '')
       .find(t => t.includes(' voci \u00b7 ') || t.includes(' voce \u00b7 ')) ?? '«riga dell’ordine non trovata»'`,
  );
  esito(/scadenz/i.test(ordinePrima), 'l’ordine attivo è scritto a schermo', ordinePrima.slice(0, 50));

  const tastoOrdine = `[...document.querySelectorAll('button[title]')].find(b => /Ordine:/.test(b.getAttribute('title')))`;
  await valuta(cdp, `${tastoOrdine}?.click(), true`);
  await new Promise((r) => setTimeout(r, 400));
  const ordineDopo = await valuta(cdp, `${tastoOrdine}?.getAttribute('title') ?? ''`);
  esito(/alfabetico/i.test(ordineDopo), 'il tasto cambia l’ordine e annuncia quello attivo', ordineDopo);

  // ── 6. niente sbordo laterale su un telefono ──
  const sbordo = await valuta(
    cdp,
    `({ doc: document.documentElement.scrollWidth, vista: window.innerWidth })`,
  );
  esito(
    sbordo.doc <= sbordo.vista + 1,
    'la pagina non scorre di lato su un telefono',
    `${sbordo.doc} vs ${sbordo.vista}`,
  );

  // ── 7. il campo di ricerca non fa ingrandire la pagina ──
  const dimensione = await valuta(
    cdp,
    `parseFloat(getComputedStyle(document.querySelector('input[type=search]')).fontSize)`,
  );
  esito(dimensione >= 16, 'il campo di ricerca è ≥16px, così iOS non ingrandisce', `${dimensione}px`);
} catch (e) {
  esito(false, 'il banco si è interrotto', String(e).slice(0, 140));
  await foto(cdp, 'elenco-commesse-interrotto');
} finally {
  riepilogo();
  await chiudi();
}
