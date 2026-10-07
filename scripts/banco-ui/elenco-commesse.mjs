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

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));
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

  // ── 7. ⭐ la divisione fra un lavoro e il successivo si VEDE ──
  //
  // Prima era una colonna piatta: commesse e cose da fare mescolate per
  // urgenza, `gap-1.5` uguale fra tutte, e la differenza affidata al peso di
  // un'ombra. Qui si misura la geometria, non le classi: il rientro, lo
  // spazio fra i blocchi, la fascia delle cose senza lavoro.

  // L'ordine era stato messo su alfabetico dal controllo precedente: si torna
  // a «prima le scadenze», che e' quello che la gente vede aprendo l'app.
  await valuta(cdp, `${tastoOrdine}?.click(), true`);
  await new Promise((r) => setTimeout(r, 500));

  const geometria = await valuta(
    cdp,
    `(() => {
      const blocchi = [...document.querySelectorAll('[data-blocco-lavoro]')];
      if (blocchi.length === 0) return { blocchi: 0 };

      // Un blocco con dentro almeno una cosa da fare rientrata.
      const conFigli = blocchi.find(s => s.querySelector('ul > li'));
      let rientro = null, dentro = null, fra = null;
      if (conFigli) {
        const card = conFigli.querySelector('a[href*="/mobile/commessa/"]');
        const figlio = conFigli.querySelector('ul > li');
        if (card && figlio) {
          rientro = Math.round(figlio.getBoundingClientRect().left - card.getBoundingClientRect().left);
        }
        const figli = [...conFigli.querySelectorAll('ul > li')];
        if (figli.length > 1) {
          dentro = Math.round(figli[1].getBoundingClientRect().top - figli[0].getBoundingClientRect().bottom);
        } else {
          // ⚠️ Nessun blocco con due cose da fare: lo spazio interno si legge
          // dal CSS invece di non leggerlo. Un controllo che SPARISCE quando
          // non riesce a misurare e' peggio di uno che fallisce: il banco
          // dichiarava venti verdi e di questo non diceva niente.
          const ul = conFigli.querySelector('ul');
          dentro = ul ? Math.round(parseFloat(getComputedStyle(ul).rowGap || '0')) : null;
        }
      }
      if (blocchi.length > 1) {
        const a = blocchi[0].getBoundingClientRect(), b = blocchi[1].getBoundingClientRect();
        fra = Math.round(b.top - a.bottom);
      } else {
        const cont = blocchi[0]?.parentElement;
        fra = cont ? Math.round(parseFloat(getComputedStyle(cont).rowGap || '0')) : null;
      }
      // La linea verticale che lega le cose da fare al loro lavoro.
      const ul = document.querySelector('[data-blocco-lavoro] ul');
      const bordo = ul ? parseFloat(getComputedStyle(ul).borderLeftWidth) : 0;

      const senzaCommessa = [...document.querySelectorAll('h3')]
        .some(h => /senza commessa/i.test(h.textContent ?? ''));

      // Dentro un blocco il codice della commessa non si ripete.
      let codiceRipetuto = false;
      if (conFigli) {
        const card = conFigli.querySelector('a[href*="/mobile/commessa/"]');
        const codice = card ? (card.textContent ?? '').match(/[A-Z]{2,}-\d{2}-\d{3}/)?.[0] ?? null : null;
        if (codice) {
          codiceRipetuto = [...conFigli.querySelectorAll('ul > li')]
            .some(li => (li.textContent ?? '').includes(codice));
        }
      }
      return {
        blocchi: blocchi.length, rientro, dentro, fra, bordo, senzaCommessa, codiceRipetuto,
        conFigli: Boolean(conFigli),
      };
    })()`,
  );

  esito(geometria.blocchi > 1, 'l’elenco è fatto di blocchi, non di una colonna piatta', `${geometria.blocchi} blocchi`);
  esito(geometria.conFigli, 'almeno un lavoro ha le sue cose da fare dentro');
  if (geometria.conFigli) {
    esito(
      geometria.rientro !== null && geometria.rientro >= 12,
      '⭐ le cose da fare sono rientrate sotto il loro lavoro',
      `${geometria.rientro}px di rientro`,
    );
    esito(geometria.bordo >= 2, 'una linea verticale le lega al lavoro', `${geometria.bordo}px`);
    esito(!geometria.codiceRipetuto, 'dentro il blocco il codice non si ripete su ogni riga');
  }
  esito(
    geometria.fra !== null &&
      geometria.dentro !== null &&
      geometria.fra > geometria.dentro,
    '⭐ fra un lavoro e il successivo c’è più spazio che dentro un lavoro',
    geometria.fra === null || geometria.dentro === null
      ? 'NON MISURABILE: fra=' + geometria.fra + ' dentro=' + geometria.dentro
      : `${geometria.fra}px fra · ${geometria.dentro}px dentro`,
  );

  // ── 8. ⭐ arrivando da un avviso, la cosa giusta si accende ──
  //
  // ⚠️ Prima il collegamento di un avviso finiva con `#lavori`, un'àncora che
  // in tutto il repo non esiste — e che comunque non potrebbe selezionare una
  // tab. Si apriva la commessa e quale delle venti cose da fare fosse quella
  // dell'avviso lo si indovinava.
  const conEvidenzia = await valuta(cdp, `(() => {
    const a = document.querySelector('[data-blocco-lavoro] a[href*="evidenzia="]');
    return a ? a.getAttribute('href') : null;
  })()`);
  esito(Boolean(conEvidenzia), 'le cose da fare puntano alla loro riga, non a un’àncora morta', conEvidenzia ?? 'nessun collegamento');

  if (conEvidenzia) {
    await vaiA(cdp, conEvidenzia);
    await finoA(cdp, `location.pathname.startsWith('/mobile/commessa/')`, { timeoutMs: 20_000 }).catch(() => {});
    await attendi(1200);
    const acceso = await valuta(cdp, `(() => {
      const el = document.querySelector('.animate-evidenzia');
      if (!el) return { acceso: false };
      const id = ${JSON.stringify('evidenzia')};
      const atteso = new URL(location.href).searchParams.get(id);
      return {
        acceso: true,
        // L'anello deve stare attorno ALLA riga giusta, non alla prima.
        contieneIlTesto: (el.textContent || '').trim().length > 0,
        quante: document.querySelectorAll('.animate-evidenzia').length,
        atteso,
      };
    })()`);
    esito(acceso.acceso, '⭐ la riga dell’avviso si accende', acceso.acceso ? `${acceso.quante} riga/e` : 'nessun anello');
    if (acceso.acceso) {
      esito(acceso.quante === 1, 'se ne accende una sola', `${acceso.quante}`);
      // ⚠️ E si deve SPEGNERE: un anello che resta acceso torna a lampeggiare
      // a ogni ricaricamento, e dopo un po' non vuol dire piu' niente.
      await attendi(3500);
      const spento = await valuta(cdp, `document.querySelectorAll('.animate-evidenzia').length === 0`);
      esito(spento, '⭐ e si spegne da sola dopo qualche secondo');
    }
  }

  // ── 9. il campo di ricerca non fa ingrandire la pagina ──
  await vaiA(cdp, '/mobile');
  await finoA(cdp, `document.querySelector('input[type=search]')`, { timeoutMs: 20_000 });
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
