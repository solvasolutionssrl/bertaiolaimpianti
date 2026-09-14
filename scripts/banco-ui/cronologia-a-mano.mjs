/**
 * Banco: giornata con ore scritte a mano e SENZA timbrature, lato ufficio.
 *
 * Prima la cronologia mostrava solo il viaggio di ritorno: il lavoro non aveva
 * nessun pallino, perché nessuna timbratura dice quando è cominciato. Ora c'è
 * un evento generico «5:00 di lavoro ordinario», senza orario, prima del
 * ritorno; e la riga di Presenze e ore dice «Senza timbrature · 5:00 di lavoro».
 *
 * Richiede la giornata di prova sul tenant demo DEMOC: Marco, 13/09, 5 ore
 * ordinarie + ritorno di 190 km, nota «PROVA BANCO LAVORO A MANO».
 *
 *   node scripts/banco-ui/cronologia-a-mano.mjs
 */

import { apriChrome, vaiA, accedi, esito, riepilogo, foto } from './comune.mjs';
import { valuta } from '../banco-upload/cdp.mjs';

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

const { cdp, chiudi } = await apriChrome({ larghezza: 1440, altezza: 900 });
try {
  await accedi(cdp, 'kantiere');
  await vaiA(cdp, '/office/kantiere/rapportini');
  await attendi(1500);

  const riga = await valuta(
    cdp,
    `(() => {
      const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const tr = [...document.querySelectorAll('tr')].find((r) => /Marco Rinaldi/.test(r.textContent) && /viaggio 4:10/.test(r.textContent));
      return tr ? t(tr.textContent) : null;
    })()`,
  );
  esito(!!riga, 'la giornata di prova è in elenco', riga ? riga.slice(0, 120) : 'non trovata');
  esito(/Senza timbrature · 5:00 di lavoro/.test(riga ?? ''), 'la riga dice «Senza timbrature · 5:00 di lavoro» invece di «Nessuna timbratura»');

  const aperto = await valuta(
    cdp,
    `(() => {
      const tr = [...document.querySelectorAll('tr')].find((r) => /Marco Rinaldi/.test(r.textContent) && /viaggio 4:10/.test(r.textContent));
      const b = tr && tr.querySelector('button[aria-label="Cronologia della giornata"]');
      if (!b) return false;
      b.click();
      return true;
    })()`,
  );
  esito(aperto, 'si apre la cronologia');
  await attendi(2500);

  const p = await valuta(
    cdp,
    `(() => {
      const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const d = document.querySelector('[role="dialog"]');
      if (!d) return null;
      const voci = [...d.querySelectorAll('ol li')].map((li) => ({
        ora: t(li.children[0]?.textContent),
        titolo: t(li.querySelector('p.font-medium')?.textContent),
        dettaglio: [...li.querySelectorAll('p.text-xs')].map((x) => t(x.textContent)),
      }));
      return { voci };
    })()`,
  );
  const titoli = p ? p.voci.map((v) => v.titolo) : [];
  const iLavoro = titoli.indexOf('5:00 di lavoro ordinario');
  const iRitorno = titoli.indexOf('Viaggio di ritorno');
  esito(iLavoro >= 0, 'c’è il pallino del lavoro', titoli.join(' → '));
  esito(iLavoro >= 0 && iRitorno > iLavoro, 'il lavoro viene prima del viaggio di ritorno');
  esito(iLavoro >= 0 && p.voci[iLavoro].ora === '', 'senza un orario finto', iLavoro >= 0 ? `ora «${p.voci[iLavoro].ora}»` : '');
  esito(
    iLavoro >= 0 && p.voci[iLavoro].dettaglio.some((x) => /orario non è indicato/.test(x)),
    'spiega perché manca l’orario',
  );
  await foto(cdp, 'cronologia-lavoro-a-mano');
} finally {
  await chiudi();
}

riepilogo();
