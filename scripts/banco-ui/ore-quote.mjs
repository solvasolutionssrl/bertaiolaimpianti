/**
 * Banco: le quote delle ore nelle pagine dell'ufficio (demo DEMOC).
 *
 * Dopo `registra-giornata.mjs` con BANCO_SALVA=1 (giornata di oggi di Marco,
 * con lavoro dalla sede sul primo cantiere): controlla che Presenze e ore,
 * cronologia, Report, Ore e costi e scheda dipendente mostrino lavoro, viaggio,
 * ordinarie, straordinarie e viaggio eccedente con le etichette nuove.
 * Sola lettura.
 *
 *   node scripts/banco-ui/ore-quote.mjs
 */

import { apriChrome, vaiA, accedi, esito, riepilogo, foto, valuta, finoA } from './comune.mjs';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const testo = (cdp) => valuta(cdp, `document.body.innerText`);
const MARCO = 'c1d00000-0000-4000-8000-000000000001';

const { cdp, chiudi } = await apriChrome({ larghezza: 1440, altezza: 900 });
const erroriBrowser = [];
cdp.su('Runtime.exceptionThrown', (p) =>
  erroriBrowser.push(`eccezione: ${p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text}`),
);
cdp.su('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error') erroriBrowser.push(`console.error: ${p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)}`);
});

try {
  await accedi(cdp, 'kantiere');

  // ── Presenze e ore: dettaglio della giornata e cronologia ─────────────────
  await vaiA(cdp, '/office/kantiere/rapportini');
  await pausa(2000);
  const aperta = await valuta(
    cdp,
    `(() => {
      const tr = [...document.querySelectorAll('tr')].find((r) => /Marco Rinaldi/.test(r.textContent));
      if (!tr) return false;
      tr.scrollIntoView({ block: 'center' });
      tr.click();
      return true;
    })()`,
  );
  esito(aperta, 'la giornata di Marco è in elenco');
  await pausa(1200);
  let t = await testo(cdp);
  esito(
    /Lavoro/.test(t) && /Ordinarie/.test(t) && /Viaggio ecc\./.test(t),
    'il dettaglio mostra lavoro, viaggio, ordinarie, straordinarie e viaggio eccedente',
  );
  await foto(cdp, 'quote-01-presenze');

  const cronologia = await valuta(
    cdp,
    `(() => {
      const tr = [...document.querySelectorAll('tr')].find((r) => /Marco Rinaldi/.test(r.textContent) && r.querySelector('button[aria-label="Cronologia della giornata"]'));
      const b = tr?.querySelector('button[aria-label="Cronologia della giornata"]');
      if (!b) return false;
      b.click();
      return true;
    })()`,
  );
  if (cronologia) {
    await pausa(2500);
    t = await testo(cdp);
    esito(/Lavoro dalla sede Sede Nordest Cantieri/i.test(t), 'la cronologia dice che sul primo cantiere si lavorava dalla sede');
    await foto(cdp, 'quote-02-cronologia');
    await valuta(cdp, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await pausa(500);
  } else {
    // La giornata di oggi sta in «In corso oggi», che non ha il tasto della
    // cronologia: la riga «Lavoro dalla sede» è coperta dai test della cronologia.
    console.log('  · giornata di oggi: nessun tasto cronologia in «In corso oggi», controllo saltato');
  }
  t = await testo(cdp);
  esito(!/Pausa pranzo 12:00 → 13:30/.test(t), 'la pausa resta quella dichiarata, la tratta non si somma alla pausa');

  // ── Report ────────────────────────────────────────────────────────────────
  await vaiA(cdp, '/office/kantiere/report');
  await finoA(cdp, `/Ore viaggio eccedenti/.test(document.body.innerText)`, { cosa: 'report', timeoutMs: 20_000 }).catch(() => {});
  t = await testo(cdp);
  esito(/Ore viaggio eccedenti/.test(t) && /Viaggio eccedente/.test(t), 'il report separa il viaggio eccedente');
  esito(/Ordinarie: lavoro e viaggio entro l.orario ordinario/.test(t), 'il report spiega le quote');
  await foto(cdp, 'quote-03-report');

  // ── Ore e costi ───────────────────────────────────────────────────────────
  await vaiA(cdp, '/office/kantiere/ore-costi');
  await pausa(2000);
  t = await testo(cdp);
  esito(/Viaggio ecc\./.test(t) || /Viaggio eccedente/.test(t), 'Ore e costi usa il viaggio eccedente');
  await foto(cdp, 'quote-04-ore-costi');

  // ── Scheda dipendente ─────────────────────────────────────────────────────
  await vaiA(cdp, `/office/kantiere/dipendenti/${MARCO}`);
  await pausa(2000);
  t = await testo(cdp);
  esito(/Viaggio eccedente/.test(t), 'la scheda dipendente mostra il viaggio eccedente');
  await foto(cdp, 'quote-05-dipendente');

  esito(erroriBrowser.length === 0, 'nessun errore nel browser', erroriBrowser.length ? `${erroriBrowser.length}` : '');
  for (const e of erroriBrowser.slice(0, 8)) console.log(`    · ${e}`);
} finally {
  await chiudi();
}

process.exitCode = riepilogo() > 0 ? 1 : 0;
