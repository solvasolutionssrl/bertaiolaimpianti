/**
 * Banco: le tendine con ricerca dentro un dialog.
 *
 * ⚠️ Due difetti opposti, e sistemandone uno si rischia l'altro:
 *
 *  1. Il pannello **tagliato**. `DialogContent` ha `overflow-y-auto` e una
 *     `transform`: insieme tagliano tutto ciò che sborda, anche un
 *     `position: fixed`. L'elenco delle persone finiva mozzato a metà.
 *  2. Il dialog che **si chiude da solo**. Portando il pannello su `body`,
 *     per Radix un clic su una voce è «fuori», e il dialog sparisce mentre si
 *     sta scegliendo.
 *
 * Il secondo e' peggio del primo, ed e' il motivo per cui la prima soluzione
 * era stata scartata. Qui si misurano tutti e due.
 *
 *   node scripts/banco-ui/tendine.mjs
 *   BANCO_MOBILE=1 node scripts/banco-ui/tendine.mjs
 */
import { apriChrome, vaiA, valuta, finoA, esito, riepilogo, accedi, BASE } from './comune.mjs';

const MOBILE = process.env.BANCO_MOBILE === '1';
const { cdp, chiudi } = await apriChrome({ mobile: MOBILE, larghezza: 1440 });

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  console.log(`\n\x1b[1mBanco: tendine dentro i dialog — ${MOBILE ? 'telefono' : 'computer'} (${BASE})\x1b[0m\n`);
  await accedi(cdp, 'kommessa');
  esito(true, 'accesso eseguito come ufficio');

  await vaiA(cdp, '/office/todo');
  await finoA(cdp, `document.querySelectorAll('button').length > 3`, { timeoutMs: 25_000 });

  // ── apre il dialog «Nuovo» ──
  // Il nome del tasto è stato letto dalla pagina, non indovinato: su
  // /office/todo si chiama «Richiesta al telefono».
  const apre = await valuta(cdp, `(() => {
    const b = [...document.querySelectorAll('button')]
      .filter(b => b.offsetParent !== null)
      .find(b => /richiesta al telefono|task su una commessa/i.test(b.textContent));
    if (!b) return '';
    b.click();
    // ATTENZIONE: qui serve la barra doppia. Questo codice viaggia dentro un
    // template literal, e li' la barra singola seguita da s non vale «spazio»:
    // vale la lettera s. Misurato: «Richiesta» tornava «Richie ta».
    // (E niente apici inversi in questo commento: chiuderebbero il literal.)
    return b.textContent.replace(/\\s+/g, ' ').trim();
  })()`);
  await attendi(900);
  const dialogAperto = await valuta(cdp, `Boolean(document.querySelector('[role=dialog]'))`);
  esito(dialogAperto, `il dialog si apre dal tasto «${apre}»`);

  // ── apre la tendina «Assegnato a» ──
  const apreTendina = await valuta(cdp, `(() => {
    const b = [...document.querySelectorAll('[role=dialog] button[aria-haspopup=listbox], [role=dialog] button[aria-expanded]')]
      .find(b => b.offsetParent !== null);
    if (!b) return false;
    b.scrollIntoView({ block: 'center' });
    b.click();
    return true;
  })()`);
  await attendi(700);
  esito(apreTendina, 'la tendina «Assegnato a» si apre');

  // ── 1. il pannello non e' tagliato ──
  const p = await valuta(cdp, `(() => {
    const el = document.querySelector('[data-popover-portale]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const dialog = document.querySelector('[role=dialog]');
    const d = dialog.getBoundingClientRect();
    // Un antenato che taglia: si risale cercando overflow diverso da visible.
    let taglia = null;
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const o = getComputedStyle(n).overflow;
      if (o !== 'visible') { taglia = n.tagName + '.' + (n.className || '').toString().slice(0, 30); break; }
    }
    return {
      dentroBody: el.parentElement === document.body,
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
  }

  // ── 2. ⭐ scegliendo, il dialog RESTA aperto ──
  const scelto = await valuta(cdp, `(() => {
    const v = document.querySelector('[data-popover-portale] [data-indice="1"]')
          ?? document.querySelector('[data-popover-portale] [data-indice="0"]');
    if (!v) return '';
    const t = v.textContent.trim();
    v.click();
    return t;
  })()`);
  await attendi(900);
  const dopo = await valuta(cdp, `({
    dialogAncoraLi: Boolean(document.querySelector('[role=dialog]')),
    tendinaChiusa: !document.querySelector('[data-popover-portale]'),
    tasto: [...document.querySelectorAll('[role=dialog] button[aria-expanded]')]
      .map(b => b.textContent.trim().slice(0, 40))[0] ?? '',
  })`);
  esito(dopo.dialogAncoraLi, '⭐ scegliendo una persona il dialog NON si chiude', dopo.dialogAncoraLi ? 'resta' : 'SPARITO');
  esito(dopo.tendinaChiusa, 'la tendina si chiude dopo la scelta');
  esito(
    scelto.length > 0 && dopo.tasto.includes(scelto.split('\n')[0].trim()),
    'il nome scelto compare sul tasto',
    `scelto «${scelto.slice(0, 24)}» · tasto «${dopo.tasto}»`,
  );
} catch (e) {
  esito(false, 'il banco si è interrotto', String(e).slice(0, 150));
} finally {
  riepilogo();
  await chiudi();
}
