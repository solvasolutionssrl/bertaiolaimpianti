/**
 * Banco: **una foto si può guardare da vicino.**
 *
 * ⚠️ Perché serve un banco e non basta provare a mano: su questa applicazione
 * lo zoom del browser è **spento di proposito** (`maximumScale: 1`,
 * `userScalable: false`, `touch-action: manipulation` sul `body`) perché in
 * cantiere un pizzicotto preso coi guanti lascia la pagina storta. Quindi lo
 * zoom è tutto codice nostro: pizzicotto, rotellina, doppio clic, tasti. Un
 * pizzicotto non si prova a mano in un terminale, e i conti giusti nel modulo
 * puro non dicono niente su come sono collegati.
 *
 * ⚠️ Il dito e la rotellina sono **eventi veri** del browser via CDP, non
 * chiamate al DOM: `elemento.click()` ignora `pointer-events`, e tutta questa
 * storia nasce proprio da un banco che dava undici verdi su una tendina che
 * nessuno riusciva a toccare.
 *
 * Uso:
 *   node scripts/banco-ui/zoom-foto.mjs
 *   BANCO_VISIBILE=1 node scripts/banco-ui/zoom-foto.mjs
 */
import {
  apriChrome, vaiA, valuta, finoA, esito, riepilogo, accedi, clicVero, BASE,
} from './comune.mjs';

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

const { cdp, chiudi } = await apriChrome({ mobile: false, larghezza: 1440 });

/** La scala vera, letta dalla matrice della trasformazione calcolata. */
async function scalaDella(selettore) {
  return valuta(cdp, `(() => {
    const i = ${selettore};
    if (!i) return null;
    const t = getComputedStyle(i).transform;
    if (!t || t === 'none') return 1;
    const m = /matrix\\(([^)]+)\\)/.exec(t);
    if (!m) return null;
    const n = m[1].split(',').map(Number);
    return Math.round(n[0] * 1000) / 1000;
  })()`);
}

/** Lo spostamento vero (gli ultimi due numeri della matrice). */
async function spostamentoDi(selettore) {
  return valuta(cdp, `(() => {
    const i = ${selettore};
    if (!i) return null;
    const m = /matrix\\(([^)]+)\\)/.exec(getComputedStyle(i).transform || '');
    if (!m) return { x: 0, y: 0 };
    const n = m[1].split(',').map(Number);
    return { x: Math.round(n[4]), y: Math.round(n[5]) };
  })()`);
}

const FOTO = `[...document.querySelectorAll('[role=dialog] img')].find(i => i.style && i.style.transform)`;
const RIQUADRO = `(${FOTO})?.parentElement`;

async function centro(selettore) {
  return valuta(cdp, `(() => {
    const e = ${selettore};
    if (!e) return null;
    const r = e.getBoundingClientRect();
    if (r.width === 0) return null;
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
             largo: Math.round(r.width), alto: Math.round(r.height) };
  })()`);
}

const errori = [];

try {
  console.log(`\n\x1b[1mBanco: lo zoom delle foto (${BASE})\x1b[0m\n`);
  await cdp.invia('Runtime.enable');
  cdp.su?.('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error') errori.push((p.args ?? []).map((a) => a.value ?? a.description ?? '').join(' '));
  });

  await accedi(cdp, 'kommessa');
  esito(true, 'accesso eseguito come ufficio');

  // ── trova una commessa che abbia davvero delle foto ──────────────────
  await vaiA(cdp, '/office/commesse');
  await finoA(cdp, `document.querySelectorAll('a[href^="/office/commesse/"]').length > 1`, { timeoutMs: 25_000 });
  // ⚠️ **Le righe dell'elenco d'ufficio non sono collegamenti**: la commessa
  // si apre cliccando la riga, e `a[href^="/office/commesse/"]` trova solo
  // «panoramica» e «nuova». La prima versione di questo banco ne cercava gli
  // href, non ne trovava nessuno e concludeva «nessuna foto sul tenant demo»:
  // una diagnosi sbagliata su un'applicazione che funzionava, cioè il modo in
  // cui un banco mente senza accorgersene.
  //
  // E non «la prima che capita»: sul demo le foto stanno su DEMOK-26-001.
  const codici = await valuta(cdp, `(() => {
    const righe = [...document.querySelectorAll('tbody tr')].map(r => (r.textContent || '').trim());
    const ordinate = [...righe.filter(t => /DEMOK-26-001/.test(t)), ...righe.filter(t => !/DEMOK-26-001/.test(t))];
    return ordinate
      .map(t => (t.match(/[A-Z]{3,}-[0-9]{2}-[0-9]{3}/) || [''])[0])
      .filter(Boolean)
      .slice(0, 6);
  })()`);

  let quante = 0;
  for (const codice of codici) {
    await vaiA(cdp, '/office/commesse');
    await finoA(cdp, `document.querySelectorAll('tbody tr').length > 0`, { timeoutMs: 20_000 });
    const selettoreRiga =
      `[...document.querySelectorAll('tbody tr')].find(r => (r.textContent || '').includes(` +
      JSON.stringify(codice) + `))`;
    const apreRiga = await clicVero(cdp, selettoreRiga, { attesaMs: 2400 });
    if (!apreRiga.fatto) continue;
    await finoA(cdp, `/[0-9a-f-]{36}/.test(location.pathname)`, { timeoutMs: 15_000 }).catch(() => {});
    const dove = await valuta(cdp, `location.pathname`);
    const trovato = /\/office\/commesse\/[0-9a-f-]{36}/.exec(dove || '');
    if (!trovato) continue;
    await vaiA(cdp, `${trovato[0]}/foto`);
    await attendi(2200);
    quante = await valuta(cdp, `document.querySelectorAll('img[src*="/api/photo/"]').length`);
    if (quante > 0) break;
  }

  // ⚠️ Se non ci sono foto il banco NON tace e NON passa: dice che non ha
  // potuto misurare. Un controllo che sparisce invece di fallire è il modo in
  // cui un banco mente senza accorgersene.
  esito(quante > 0, 'ci sono foto da guardare', quante > 0 ? `${quante}` : 'NON MISURABILE: nessuna foto sul tenant demo');
  if (quante === 0) throw new Error('niente da misurare');

  // ── il visore si apre ────────────────────────────────────────────────
  const apre = await clicVero(cdp, `document.querySelector('button img, img[src*="/api/photo/"]')?.closest('button') || document.querySelector('img[src*="/api/photo/"]')`, { attesaMs: 1600 });
  await finoA(cdp, `Boolean(${FOTO})`, { timeoutMs: 12_000, cosa: 'la foto nel visore' }).catch(() => {});
  const cePe = await valuta(cdp, `Boolean(${FOTO})`);
  esito(apre.fatto && cePe, 'il visore si apre al clic sulla miniatura', apre.perche ?? '');
  await attendi(800);

  // ── a riposo ─────────────────────────────────────────────────────────
  const aRiposo = await scalaDella(FOTO);
  esito(aRiposo === 1, 'a riposo la foto è a grandezza naturale', `scala ${aRiposo}`);

  const indicatore = await valuta(cdp, `(() => {
    const s = [...document.querySelectorAll('[role=dialog] span')].find(e => /^\\d+%$/.test(e.textContent.trim()));
    return s ? s.textContent.trim() : '';
  })()`);
  esito(indicatore === '100%', '⭐ si vede a che ingrandimento si è', indicatore || 'nessun indicatore');

  // ── la rotellina ─────────────────────────────────────────────────────
  const c = await centro(RIQUADRO);
  esito(Boolean(c), 'il riquadro della foto si misura', c ? `${c.largo}×${c.alto}` : 'NON MISURABILE');
  if (c) {
    for (let i = 0; i < 4; i += 1) {
      await cdp.invia('Input.dispatchMouseEvent', {
        type: 'mouseWheel', x: c.x, y: c.y, deltaX: 0, deltaY: -140,
      });
      await attendi(140);
    }
    const dopo = await scalaDella(FOTO);
    esito(dopo > 1.2, '⭐ la rotellina ingrandisce', `scala ${aRiposo} → ${dopo}`);

    const indicatoreDopo = await valuta(cdp, `(() => {
      const s = [...document.querySelectorAll('[role=dialog] span')].find(e => /^\\d+%$/.test(e.textContent.trim()));
      return s ? s.textContent.trim() : '';
    })()`);
    esito(indicatoreDopo !== '100%', 'e l’indicatore lo dice', indicatoreDopo);

    // ── il trascinamento si ferma al bordo ─────────────────────────────
    //
    // ⭐ È la cosa che rende inservibili i visori fatti in casa: la foto
    // scorre via e non si sa come riportarla indietro.
    const primaDiTrascinare = await spostamentoDi(FOTO);
    await cdp.invia('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 8; i += 1) {
      await cdp.invia('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: c.x + i * 220, y: c.y + i * 220, button: 'left',
      });
      await attendi(50);
    }
    await cdp.invia('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x + 1760, y: c.y + 1760, button: 'left', clickCount: 1 });
    await attendi(350);
    const dopoTrascinare = await spostamentoDi(FOTO);
    // ⚠️ Due controlli, non uno. Il solo «sta sotto 1760» passerebbe anche se
    // il trascinamento non muovesse niente (zero e' minore di 1760): sembra
    // misurare il freno e misura solo che non e' esploso.
    esito(
      Boolean(dopoTrascinare) &&
        Boolean(primaDiTrascinare) &&
        (dopoTrascinare.x !== primaDiTrascinare.x || dopoTrascinare.y !== primaDiTrascinare.y),
      'il trascinamento muove davvero la foto',
      dopoTrascinare && primaDiTrascinare
        ? `da ${primaDiTrascinare.x},${primaDiTrascinare.y} a ${dopoTrascinare.x},${dopoTrascinare.y}`
        : 'NON MISURABILE',
    );
    esito(
      Boolean(dopoTrascinare) && Math.abs(dopoTrascinare.x) < 1760 && Math.abs(dopoTrascinare.y) < 1760,
      '⭐ e si ferma: a strappo non scappa fuori',
      dopoTrascinare
        ? `spostata di ${dopoTrascinare.x},${dopoTrascinare.y} px (chiesti 1760)`
        : 'NON MISURABILE',
    );
    // ⚠️ **Qui il banco si fermava a misurare una cosa che su questo tenant
    // non e' misurabile.** Il visore chiede il formato PIENO
    // (`/api/photo/<id>` senza `size=thumb`), e quella strada passa da
    // Nextcloud: i file del tenant dimostrativo stanno **solo su R2** (il seme
    // li scrive li' e li segna gia' sincronizzati, cosi' il cron non va a
    // cercarli dove non sono). Quindi la miniatura si vede, il formato pieno
    // no, e l'immagine arriva senza proporzioni: 1×1 pixel.
    //
    // I gesti si misurano lo stesso — ed e' quello che conta qui, perche' il
    // pizzicotto e la rotellina sono codice nostro. **Quanto esattamente si
    // ferma il freno** dipende dalle proporzioni dell'immagine, e quello si
    // prova dove si puo' provare davvero: le 22 asserzioni di
    // `packages/api/src/zoom-foto.test.ts`, con misure vere.
    const caricata = await valuta(cdp, `(() => {
      const i = ${FOTO};
      return i ? { w: i.naturalWidth, h: i.naturalHeight } : null;
    })()`);
    const riquadroVero = await valuta(cdp, `(${FOTO})?.offsetWidth ?? 0`);
    if (!caricata || caricata.w === 0 || riquadroVero < 8) {
      console.log(
        `     \x1b[2m· il formato pieno del demo non arriva (sta solo su R2): l'immagine` +
        ` misura ${riquadroVero}px, le proporzioni\n       non si possono misurare qui.` +
        ` Le misura zoom-foto.test.ts, con numeri veri.\x1b[0m`,
      );
    } else {
      const misure = await valuta(cdp, `(() => {
        const i = ${FOTO};
        const p = i?.parentElement;
        if (!i || !p) return null;
        const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(i).transform || '');
        if (!m) return null;
        const n = m[1].split(',').map(Number);
        const scala = n[0];
        return {
          x: Math.round(n[4]), y: Math.round(n[5]),
          maxX: Math.round(Math.max(0, (i.offsetWidth * scala - p.clientWidth) / 2)),
          maxY: Math.round(Math.max(0, (i.offsetHeight * scala - p.clientHeight) / 2)),
        };
      })()`);
      esito(
        Boolean(misure) &&
          Math.abs(Math.abs(misure.x) - misure.maxX) <= 2 &&
          Math.abs(Math.abs(misure.y) - misure.maxY) <= 2,
        '⭐ e il freno si ferma esattamente dove la foto finisce',
        misure
          ? `spostata ${misure.x},${misure.y} · massimo ${misure.maxX},${misure.maxY}`
          : 'NON MISURABILE',
      );
    }

    // ── il doppio clic rimette a posto ─────────────────────────────────
    for (const n of [1, 2]) {
      await cdp.invia('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: n });
      await cdp.invia('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: n });
      await attendi(90);
    }
    await attendi(420);
    const dopoDoppio = await scalaDella(FOTO);
    esito(dopoDoppio === 1, '⭐ il doppio clic la rimette a posto, da qualunque ingrandimento', `scala ${dopoDoppio}`);
  }

  // ── i tasti, per chi non prova né rotellina né pizzicotto ────────────
  const piu = `[...document.querySelectorAll('[role=dialog] button[aria-label]')].find(b => /^Ingrandisci$/i.test(b.getAttribute('aria-label')))`;
  const okPiu = await clicVero(cdp, piu, { attesaMs: 450 });
  const conTasto = await scalaDella(FOTO);
  esito(okPiu.fatto && conTasto > 1, '⭐ il tasto «+» ingrandisce', okPiu.fatto ? `scala ${conTasto}` : (okPiu.perche ?? ''));

  const aPosto = `[...document.querySelectorAll('[role=dialog] button[aria-label]')].find(b => /rimetti a posto/i.test(b.getAttribute('aria-label')))`;
  await clicVero(cdp, aPosto, { attesaMs: 450 });
  const tornata = await scalaDella(FOTO);
  esito(tornata === 1, 'e il tasto per rimetterla a posto funziona', `scala ${tornata}`);

  // ── il pizzicotto, che è il gesto del telefono ───────────────────────
  //
  // Due dita vere via CDP. ⚠️ Il visore sta dentro un dialog Radix, che con
  // `react-remove-scroll` annulla ogni `touchmove` che non venga da dentro di
  // sé: se l'ascoltatore nativo non fermasse l'evento prima, qui non si
  // muoverebbe niente.
  const c2 = await centro(RIQUADRO);
  if (c2) {
    const tocca = (punti) =>
      cdp.invia('Input.dispatchTouchEvent', {
        type: punti.length ? 'touchStart' : 'touchEnd',
        touchPoints: punti,
      });
    await tocca([
      { x: c2.x - 40, y: c2.y, id: 1 },
      { x: c2.x + 40, y: c2.y, id: 2 },
    ]);
    for (let i = 1; i <= 6; i += 1) {
      await cdp.invia('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: c2.x - 40 - i * 22, y: c2.y, id: 1 },
          { x: c2.x + 40 + i * 22, y: c2.y, id: 2 },
        ],
      });
      await attendi(60);
    }
    await cdp.invia('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await attendi(400);
    const conPizzico = await scalaDella(FOTO);
    esito(conPizzico > 1.2, '⭐ il pizzicotto con due dita ingrandisce', `scala ${conPizzico}`);
  } else {
    esito(false, '⭐ il pizzicotto con due dita ingrandisce', 'NON MISURABILE: riquadro non trovato');
  }

  esito(errori.length === 0, 'console pulita', errori.slice(0, 2).join(' | '));
} catch (e) {
  esito(false, 'il banco si è interrotto', String(e?.message ?? e));
} finally {
  await chiudi();
  riepilogo();
}
