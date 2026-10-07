/**
 * Banco: le tendine con ricerca dentro un dialog.
 *
 * ⚠️ Tre difetti, e sistemandone uno si rischiano gli altri:
 *
 *  1. Il pannello **tagliato**. `DialogContent` ha `overflow-y-auto` e una
 *     `transform`: insieme tagliano tutto ciò che sborda, anche un
 *     `position: fixed`. L'elenco delle persone finiva mozzato a metà.
 *  2. Il dialog che **si chiude da solo**. Portando il pannello su `body`,
 *     per Radix un clic su una voce è «fuori», e il dialog sparisce mentre si
 *     sta scegliendo.
 *  3. Il pannello **inerte**. Un dialog modale Radix spegne i puntatori su
 *     tutto il `<body>` e li riaccende **solo** nel proprio recinto: un
 *     pannello portato su `body` si vede e non si può toccare. Il dito lo
 *     attraversa e colpisce il campo che sta sotto. E la casella di ricerca ha
 *     un secondo problema sopra al primo: la gabbia del fuoco del dialog le
 *     strappa il cursore appena lo prende.
 *
 * ⚠️⚠️ **Questo banco ha mentito per settimane.** Dava 11 verdi scegliendo con
 * `elemento.click()`, che è una chiamata al DOM e **ignora `pointer-events`**:
 * misurava il documento, non il dito. Ora sceglie con `clicVero` e scrive con
 * `scriviVero` (eventi veri del browser, da `comune.mjs`). Se un domani si
 * torna a `.click()` qui dentro, il difetto 3 torna invisibile.
 *
 *   node scripts/banco-ui/tendine.mjs
 *   BANCO_MOBILE=1 node scripts/banco-ui/tendine.mjs
 */
import {
  apriChrome, vaiA, valuta, finoA, esito, riepilogo, accedi, BASE,
  clicVero, scriviVero, premiTasto, chiHaIlFuoco, chiRiceveIlTocco, centroDi, foto,
} from './comune.mjs';

const MOBILE = process.env.BANCO_MOBILE === '1';
const { cdp, chiudi } = await apriChrome({ mobile: MOBILE, larghezza: 1440 });

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

/** L'espressione JS che trova il pannello portato su body. */
const PANNELLO = `document.querySelector('[data-popover-portale]')`;
/** Il tasto che comanda una tendina, dentro il dialog. */
const COMBO = `[...document.querySelectorAll('[role=dialog] button[aria-haspopup=listbox]')].find(b => b.offsetParent !== null)`;

/** Apre un dialog dal tasto il cui testo combacia. Torna l'etichetta trovata. */
async function apriDialog(cdp, regexSorgente) {
  const nome = await valuta(cdp, `(() => {
    const b = [...document.querySelectorAll('button')]
      .filter(b => b.offsetParent !== null)
      .find(b => new RegExp(${JSON.stringify(regexSorgente)}, 'i').test(b.textContent));
    if (!b) return '';
    b.click();
    return b.textContent.replace(/[ \\t\\n\\r]+/g, ' ').trim();
  })()`);
  await attendi(900);
  return nome;
}

/** Chiude il dialog aperto con Esc, e aspetta che il velo sparisca. */
async function chiudiDialog(cdp) {
  await premiTasto(cdp, 'Escape', { attesaMs: 600 });
  await valuta(cdp, `(() => {
    const b = [...document.querySelectorAll('[role=dialog] button')]
      .find(b => /annulla|chiudi/i.test(b.textContent));
    if (b) b.click();
    return 1;
  })()`);
  await attendi(500);
}

try {
  console.log(`\n\x1b[1mBanco: tendine dentro i dialog — ${MOBILE ? 'telefono' : 'computer'} (${BASE})\x1b[0m\n`);
  await accedi(cdp, 'kommessa');
  esito(true, 'accesso eseguito come ufficio');

  await vaiA(cdp, '/office/todo');
  await finoA(cdp, `document.querySelectorAll('button').length > 3`, { timeoutMs: 25_000 });

  // ══ PARTE 1 — tendina corta: «Chi se ne occupa» nella richiesta al telefono ══
  console.log('\n  \x1b[1mLa richiesta al telefono · «Chi se ne occupa»\x1b[0m');

  const apre = await apriDialog(cdp, 'richiesta al telefono');
  esito(
    await valuta(cdp, `Boolean(document.querySelector('[role=dialog]'))`),
    `il dialog si apre dal tasto «${apre}»`,
  );

  // Il tasto della tendina si tocca con il dito vero: è dentro il dialog,
  // quindi questo deve funzionare anche col difetto 3 presente.
  const apreTendina = await clicVero(cdp, COMBO, { attesaMs: 700 });
  esito(apreTendina.fatto, 'la tendina si apre al tocco', apreTendina.perche ?? '');

  const p = await valuta(cdp, `(() => {
    const el = ${PANNELLO};
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const d = document.querySelector('[role=dialog]').getBoundingClientRect();
    let taglia = null;
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const o = getComputedStyle(n).overflow;
      if (o !== 'visible') { taglia = n.tagName + '.' + (n.className || '').toString().slice(0, 30); break; }
    }
    return {
      dentroBody: el.parentElement === document.body,
      puntatori: getComputedStyle(el).pointerEvents,
      puntatoriBody: getComputedStyle(document.body).pointerEvents,
      alto: Math.round(r.height),
      sottoLaVista: Math.round(r.bottom - innerHeight),
      oltreIlDialog: Math.round(r.bottom - d.bottom),
      antenatoCheTaglia: taglia,
      voci: el.querySelectorAll('[data-indice]').length,
    };
  })()`);
  esito(Boolean(p), 'il pannello esiste', p ? `${p.voci} voci` : 'NON TROVATO');

  if (p) {
    esito(p.dentroBody, '⭐ il pannello è figlio di <body>: nessun riquadro lo taglia');
    esito(p.antenatoCheTaglia === null, 'nessun antenato con overflow che possa tagliarlo', p.antenatoCheTaglia ?? 'nessuno');
    esito(p.sottoLaVista <= 2, 'il pannello sta dentro lo schermo', `sborda di ${p.sottoLaVista}px`);
    esito(p.voci > 0, 'si vedono le persone', `${p.voci}`);

    // ── ⭐ il difetto 3, misurato due volte ──
    esito(
      p.puntatori !== 'none',
      '⭐ il pannello riceve i puntatori',
      `pannello: ${p.puntatori} · body: ${p.puntatoriBody}`,
    );

    const voce = `${PANNELLO}.querySelector('[data-indice="1"]') ?? ${PANNELLO}.querySelector('[data-indice="0"]')`;
    const c = await centroDi(cdp, voce);
    const sotto = c ? await chiRiceveIlTocco(cdp, c.x, c.y) : null;
    esito(
      Boolean(sotto) && /BUTTON|SPAN|DIV/.test(sotto.tag) && await valuta(cdp, `(() => {
        const v = ${voce};
        const r = v.getBoundingClientRect();
        const e = document.elementFromPoint(Math.round(r.left + r.width/2), Math.round(r.top + r.height/2));
        return !!(e && (e === v || v.contains(e)));
      })()`),
      '⭐ il dito arriva alla voce e non la attraversa',
      sotto ? `in quel punto risponde <${sotto.tag}> «${sotto.testo}»` : 'nessun elemento',
    );
  }

  // ── ⭐ si sceglie col dito, e il dialog resta ──
  const voce = `${PANNELLO}.querySelector('[data-indice="1"]') ?? ${PANNELLO}.querySelector('[data-indice="0"]')`;
  const nomeVoce = await valuta(cdp, `(() => { const v = ${voce}; return v ? v.textContent.trim() : ''; })()`);
  const sceglie = await clicVero(cdp, voce, { attesaMs: 900 });
  esito(sceglie.fatto, '⭐ la voce si può scegliere col dito', sceglie.perche ?? '');

  const dopo = await valuta(cdp, `({
    dialogAncoraLi: Boolean(document.querySelector('[role=dialog]')),
    tendinaChiusa: !${PANNELLO},
    tasto: [...document.querySelectorAll('[role=dialog] button[aria-haspopup=listbox]')]
      .map(b => b.textContent.trim().slice(0, 40))[0] ?? '',
  })`);
  esito(dopo.dialogAncoraLi, '⭐ scegliendo una persona il dialog NON si chiude', dopo.dialogAncoraLi ? 'resta' : 'SPARITO');
  esito(dopo.tendinaChiusa, 'la tendina si chiude dopo la scelta');
  esito(
    nomeVoce.length > 0 && dopo.tasto.includes(nomeVoce.split('\n')[0].trim()),
    'il nome scelto compare sul tasto',
    `scelto «${nomeVoce.slice(0, 24)}» · tasto «${dopo.tasto}»`,
  );

  await chiudiDialog(cdp);

  // ══ PARTE 2 — tendina lunga: la ricerca ══════════════════════════════════
  // La casella di ricerca compare solo oltre le 8 voci. Sul tenant demo le
  // persone sono quattro, le commesse diciotto: la ricerca si prova lì.
  console.log('\n  \x1b[1mTask su una commessa · la casella «Cerca»\x1b[0m');

  const apre2 = await apriDialog(cdp, 'task su una commessa');
  esito(
    await valuta(cdp, `Boolean(document.querySelector('[role=dialog]'))`),
    `il dialog si apre dal tasto «${apre2}»`,
  );

  const apreLunga = await clicVero(cdp, COMBO, { attesaMs: 800 });
  esito(apreLunga.fatto, 'la tendina delle commesse si apre al tocco', apreLunga.perche ?? '');

  const lunga = await valuta(cdp, `(() => {
    const el = ${PANNELLO};
    if (!el) return null;
    const inp = el.querySelector('input');
    return {
      voci: el.querySelectorAll('[data-indice]').length,
      haRicerca: Boolean(inp),
      segnaposto: inp ? (inp.getAttribute('placeholder') || '') : '',
    };
  })()`);
  esito(Boolean(lunga) && lunga.voci > 8, 'ci sono abbastanza voci per la ricerca', lunga ? `${lunga.voci} voci` : '—');
  esito(Boolean(lunga?.haRicerca), 'la casella di ricerca compare', lunga?.segnaposto ?? '');

  if (lunga?.haRicerca) {
    // ⭐ Il fuoco deve STARE nella casella. La gabbia del dialog lo strappa.
    const fuoco = await chiHaIlFuoco(cdp, '[data-popover-portale]');
    esito(
      fuoco?.dentro === true && fuoco.tag === 'INPUT',
      '⭐ il cursore sta nella casella di ricerca',
      fuoco ? `ce l'ha <${fuoco.tag}> «${fuoco.etichetta}»` : 'nessuno',
    );

    // ⭐ E scrivendo, l'elenco si deve restringere.
    const prima = lunga.voci;
    await scriviVero(cdp, 'a');
    await attendi(400);
    const dopoUna = await valuta(cdp, `(() => {
      const el = ${PANNELLO};
      if (!el) return null;
      const inp = el.querySelector('input');
      return { voci: el.querySelectorAll('[data-indice]').length, scritto: inp ? inp.value : '(casella sparita)' };
    })()`);
    esito(
      dopoUna?.scritto === 'a',
      '⭐ quello che si batte finisce nella casella',
      `nella casella c'è «${dopoUna?.scritto ?? '—'}»`,
    );
    esito(
      Boolean(dopoUna) && dopoUna.voci <= prima,
      'scrivendo, l\'elenco si restringe',
      `da ${prima} a ${dopoUna?.voci ?? '—'} voci`,
    );

    // La scelta col dito funziona anche con la ricerca in corso.
    if (dopoUna && dopoUna.voci > 0) {
      const sceglie2 = await clicVero(cdp, `${PANNELLO}.querySelector('[data-indice="0"]')`, { attesaMs: 800 });
      esito(sceglie2.fatto, 'si sceglie col dito anche dopo aver cercato', sceglie2.perche ?? '');
      esito(
        await valuta(cdp, `Boolean(document.querySelector('[role=dialog]'))`),
        'il dialog è ancora aperto dopo la scelta',
      );
    }
  }
} catch (e) {
  esito(false, 'il banco si è interrotto', String(e).slice(0, 200));
  try { await foto(cdp, 'tendine-interrotto'); } catch {}
} finally {
  riepilogo();
  await chiudi();
}
