/**
 * Banco: com'e' messa la scelta della pausa pranzo nelle sue superfici.
 *
 * Serve a GUARDARLA, non solo a testarla: la riga deve restare una sola e il
 * campo libero deve leggersi come un campo, non come una scelta disattivata.
 * Il difetto piu' grosso trovato su questo componente e' venuto fuori cosi',
 * aprendo la foto, con tutti i test verdi.
 *
 *   node scripts/banco-ui/pausa-superfici.mjs
 *
 * Copre il dialog «Correggi giornata» dell'ufficio (schermo largo, tre scelte).
 * Le superfici ambra del telefono (QR, fine turno, modifica giornata) montano
 * lo stesso componente con gli stessi parametri: si fotografano a parte, con un
 * turno lungo aperto apposta.
 *
 * ⚠️ Non scrive niente: apre, guarda, fotografa.
 */

import { apriChrome, vaiA, accedi, esito, riepilogo, foto, valuta, finoA } from './comune.mjs';

/** Le giornate del tenant demo sono di luglio: il periodo va chiesto. */
const PERIODO = 'from=2026-07-08&to=2026-07-15';

/**
 * ⚠️ Il tasto che apre «Correggi giornata» e' un'icona SENZA testo e SENZA
 * etichetta accessibile: non lo si puo' cercare per nome. Si riconosce perche'
 * e' l'unico pulsante anonimo, e in ogni riga sta accanto a «Cronologia della
 * giornata». (Che non abbia un nome e' un difetto suo, non del banco.)
 */
const APRI_MODIFICA = `(() => {
  const b = [...document.querySelectorAll('button')]
    .filter((x) => x.getClientRects().length > 0)
    .find((x) => !(x.textContent || '').trim() && !x.getAttribute('aria-label'));
  if (!b) return false;
  b.scrollIntoView({ block: 'center' });
  b.click();
  return true;
})()`;

const LEGGI_PAUSA = `(() => {
  const d = document.querySelector('[role=dialog]');
  if (!d) return null;
  const bottoni = [...d.querySelectorAll('button')]
    .map((b) => (b.textContent || '').trim())
    .filter((t) => /^(NO|\\d+ min|1 h)$/.test(t));
  const campo = d.querySelector('input[aria-label^="Altra durata"]');
  const riga = campo ? campo.closest('div')?.parentElement : null;
  return {
    titolo: d.querySelector('h2')?.textContent?.trim() ?? null,
    scelte: bottoni,
    haCampoLibero: !!campo,
    // Una riga sola: tutti i figli della riga devono stare alla stessa altezza.
    altezzaRiga: riga ? Math.round(riga.getBoundingClientRect().height) : null,
    sbordo: document.documentElement.scrollWidth > innerWidth,
  };
})()`;

const { cdp, chiudi } = await apriChrome();
try {
  await accedi(cdp, 'kantiere');
  await vaiA(cdp, `/office/kantiere/rapportini?${PERIODO}`);
  await finoA(
    cdp,
    `[...document.querySelectorAll('button')].some((b) => /Cronologia della giornata/i.test(b.getAttribute('aria-label') || ''))`,
    { cosa: 'elenco giornate', timeoutMs: 60_000 },
  );

  esito(await valuta(cdp, APRI_MODIFICA), 'si apre «Correggi giornata» su una giornata vera');
  await finoA(cdp, `!!document.querySelector('[role=dialog]')`, { cosa: 'dialog' });
  await new Promise((r) => setTimeout(r, 700));

  const p = await valuta(cdp, LEGGI_PAUSA);
  esito(p?.haCampoLibero === true, 'c’è il campo per un’altra durata', p?.haCampoLibero ? '' : 'assente');
  esito(
    (p?.scelte ?? []).join(' ') === '30 min 45 min 1 h',
    'le scelte rapide sono le stesse di ovunque',
    (p?.scelte ?? []).join(' ') || 'nessuna',
  );
  esito(!p?.sbordo, 'la pagina non sborda di lato');
  console.log(`  · altezza della riga pausa: ${p?.altezzaRiga}px`);
  await foto(cdp, 'pausa-ufficio-correggi');
} finally {
  await chiudi();
}

riepilogo();
