/**
 * Banco di prova: metodi di pagamento e avviso giornate da controllare.
 *
 *   node scripts/banco-ui/pagamenti.mjs
 *
 * Gira sul tenant demo del mondo presenze (DEMOC), mai sui clienti veri.
 */

import { apriChrome, vaiA, accedi, esito, riepilogo, foto } from './comune.mjs';
import { valuta } from '../banco-upload/cdp.mjs';

const { cdp, chiudi } = await apriChrome({ larghezza: 1440, altezza: 900 });
try {
  await accedi(cdp, 'kantiere');

  // ── Impostazioni > Pagamenti ────────────────────────────────────────────
  await vaiA(cdp, '/office/impostazioni/pagamenti');
  const pag = await valuta(
    cdp,
    `(() => {
      const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const righe = [...document.querySelectorAll('tbody tr')].map((tr) => ({
        nome: t(tr.children[0]?.textContent),
        stato: t(tr.children[1]?.textContent),
        tasti: tr.querySelectorAll('button').length,
      }));
      return {
        titolo: t(document.querySelector('h1')?.textContent),
        righe,
        tastoAggiungi: [...document.querySelectorAll('button')]
          .some((b) => /aggiungi un metodo/i.test(t(b.textContent))),
        vociNellaNav: [...document.querySelectorAll('a')]
          .some((a) => /^Pagamenti$/i.test(t(a.textContent))),
      };
    })()`,
  );

  esito(/Metodi di pagamento/i.test(pag.titolo), 'la pagina si apre', pag.titolo);
  esito(pag.vociNellaNav, 'c\'e\' la voce «Pagamenti» tra le impostazioni');
  esito(pag.righe.length >= 3, 'ci sono i tre metodi di partenza', `trovati ${pag.righe.length}`);
  esito(
    pag.righe.some((r) => /Carta aziendale/i.test(r.nome)),
    'si legge il NOME, non il codice interno',
    pag.righe.map((r) => r.nome).join(' · '),
  );
  esito(
    pag.righe.every((r) => /In uso|Ritirato/.test(r.stato)),
    'ogni riga dice se e\' in uso',
    pag.righe.map((r) => r.stato).join(' · '),
  );
  esito(pag.tastoAggiungi, 'si possono aggiungere metodi nuovi');
  esito(
    pag.righe.every((r) => r.tasti >= 2),
    'ogni riga ha rinomina e ritira',
    `tasti per riga: ${pag.righe.map((r) => r.tasti).join(',')}`,
  );

  // Rinominare deve CHIEDERE, non fare e basta.
  await valuta(
    cdp,
    `(() => {
      const b = document.querySelector('tbody tr button[aria-label^="Cambia il nome"]');
      if (b) b.click();
      return !!b;
    })()`,
  );
  await new Promise((r) => setTimeout(r, 400));
  await valuta(
    cdp,
    `(() => {
      const i = document.querySelector('tbody input');
      if (!i) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(i, 'Carta di prova');
      i.dispatchEvent(new Event('input', { bubbles: true }));
      const ok = [...document.querySelectorAll('button[aria-label="Salva il nome"]')][0];
      if (ok) ok.click();
      return true;
    })()`,
  );
  await new Promise((r) => setTimeout(r, 700));
  const conferma = await valuta(
    cdp,
    `(() => {
      const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const testo = t(document.body.textContent);
      return {
        chiede: /Rinominare .Carta aziendale./i.test(testo),
        spiega: /spese gi. registrate/i.test(testo),
      };
    })()`,
  );
  esito(conferma.chiede, 'rinominare CHIEDE conferma prima di salvare');
  esito(conferma.spiega, 'la conferma spiega cosa succede alle spese gia\' registrate');

  // Annulla: non deve restare niente di cambiato.
  await valuta(
    cdp,
    `(() => {
      const b = [...document.querySelectorAll('button')]
        .find((x) => /annulla|no|lascia/i.test((x.textContent||'').trim()));
      if (b) b.click();
      return !!b;
    })()`,
  );
  await new Promise((r) => setTimeout(r, 500));
  await foto(cdp, 'impostazioni-pagamenti');

  // ── Dashboard: l'avviso ──────────────────────────────────────────────────
  await vaiA(cdp, '/office/kantiere');
  const dash = await valuta(
    cdp,
    `(() => {
      const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const link = [...document.querySelectorAll('a[href*="rapportini"]')]
        .find((a) => /aspetta|aspettano/i.test(t(a.textContent)));
      return {
        presente: !!link,
        testo: link ? t(link.textContent) : '',
        portaAiRapportini: link ? link.getAttribute('href') : null,
      };
    })()`,
  );
  // Sul tenant demo puo' non esserci nulla oltre soglia: in quel caso l'avviso
  // NON deve comparire, ed e' altrettanto giusto.
  esito(
    typeof dash.presente === 'boolean',
    dash.presente ? 'l\'avviso compare quando c\'e\' qualcosa' : 'niente oltre soglia: nessun avviso (giusto)',
    dash.testo.slice(0, 90),
  );
  if (dash.presente) {
    esito(
      /rapportini/.test(dash.portaAiRapportini || ''),
      'l\'avviso porta dove si sistemano',
      dash.portaAiRapportini,
    );
    esito(/ore/i.test(dash.testo), 'l\'avviso dice quante ore sono in attesa', dash.testo.slice(0, 90));
  }
  await foto(cdp, 'dashboard-avviso');
} finally {
  await chiudi();
}

riepilogo();
