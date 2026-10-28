/**
 * Banco di prova: monte ore e filtro per tipo di ferie e permessi (28/10/2026).
 *
 * - In Analisi c'e' la card «Monte ore» con «Vedi tutti», che apre la pagina
 *   globale con una riga per dipendente; il nome apre il dettaglio del mese.
 * - In ufficio, «Ferie e permessi» ha il filtro per tipo e filtra davvero (con
 *   il suo controllo negativo: un tipo scelto non lascia righe di altri tipi).
 * - Sul telefono la pagina permessi non sborda di lato a 390px.
 *
 *   node scripts/banco-ui/monte-ore-permessi.mjs
 */

import { apriChrome, vaiA, accedi, esito, riepilogo, clicVero, foto } from './comune.mjs';
import { valuta } from '../banco-upload/cdp.mjs';

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));
const testo = (s) => `(${s} || '').replace(/\\s+/g, ' ').trim()`;

{
  const { cdp, chiudi } = await apriChrome({ larghezza: 1440, altezza: 900 });
  try {
    await accedi(cdp, 'kantiere');

    await vaiA(cdp, '/office/personale/analisi');
    await attendi(1500);
    const card = await valuta(cdp, `${testo(`[...document.querySelectorAll('h2')].find((h) => /Monte ore/.test(h.textContent))?.textContent`)}`);
    esito(card.length > 0, 'in Analisi c\'e\' la card «Monte ore»', card);
    const vedi = `[...document.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Vedi tutti')`;
    esito(!!(await valuta(cdp, `!!${vedi}`)), 'la card ha «Vedi tutti»');

    await clicVero(cdp, vedi);
    await attendi(2500);
    const pagina = await valuta(cdp, `({ url: location.pathname, righe: document.querySelectorAll('tbody tr').length, titolo: ${testo(`document.querySelector('h1')?.textContent`)} })`);
    esito(pagina.url === '/office/personale/monte-ore', '«Vedi tutti» apre la pagina globale', pagina.url);
    esito(pagina.righe > 0, 'una riga per dipendente', `righe: ${pagina.righe}`);
    await foto(cdp, 'monte-ore-globale');

    const primo = `document.querySelector('tbody tr a')`;
    const nome = await valuta(cdp, `${testo(`${primo}?.textContent`)}`);
    await clicVero(cdp, primo);
    await attendi(2500);
    const dettaglio = await valuta(cdp, `({ titolo: ${testo(`document.querySelector('h1')?.textContent`)}, righe: document.querySelectorAll('tbody tr').length, url: location.search })`);
    esito(dettaglio.titolo.includes(nome), 'il nome apre il dettaglio di quella persona', dettaglio.titolo);
    esito(dettaglio.righe >= 1, 'il dettaglio ha una riga per giorno', `righe: ${dettaglio.righe}`);
    await foto(cdp, 'monte-ore-persona');

    await vaiA(cdp, '/office/personale/permessi');
    await attendi(1500);
    // «Tutte» per vedere ogni stato, poi il filtro per tipo.
    await clicVero(cdp, `[...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('Tutte'))`);
    await attendi(500);
    const filtro = `document.querySelector('[aria-label="Tipo di richiesta"]')`;
    const haFiltro = await valuta(cdp, `!!${filtro}`);
    esito(haFiltro, 'in ufficio c\'e\' il filtro per tipo di richiesta');
    if (haFiltro) {
      const contaPrima = await valuta(cdp, `document.querySelectorAll('[class*="divide-y"] > *').length`);
      await clicVero(cdp, filtro);
      await attendi(400);
      const voce = await valuta(cdp, `${testo(`[...document.querySelectorAll('[role="option"]')].filter((o) => !/Tutti i tipi/.test(o.textContent))[0]?.textContent`)}`);
      await clicVero(cdp, `[...document.querySelectorAll('[role="option"]')].filter((o) => !/Tutti i tipi/.test(o.textContent))[0]`);
      await attendi(600);
      const badge = await valuta(cdp, `[...document.querySelectorAll('[class*="divide-y"] > *')].map((r) => r.textContent)`);
      esito(badge.length > 0 && badge.length <= contaPrima, 'scelto un tipo, l\'elenco si restringe', `${contaPrima} → ${badge.length} (${voce})`);
      esito(badge.every((t) => t.includes(voce)), 'negativo: nessuna riga di un altro tipo', voce);
    }
  } finally {
    await chiudi();
  }
}

{
  const { cdp, chiudi } = await apriChrome({ mobile: true });
  try {
    await accedi(cdp, 'tecnico');
    await vaiA(cdp, '/mobile/permessi');
    await attendi(2000);
    const misura = await valuta(cdp, `({ largo: document.documentElement.scrollWidth, vista: window.innerWidth })`);
    esito(misura.largo <= misura.vista, 'sul telefono la pagina permessi non sborda di lato', `${misura.largo} su ${misura.vista}`);
    await foto(cdp, 'permessi-mobile');
  } finally {
    await chiudi();
  }
}

riepilogo();
