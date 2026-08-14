/**
 * Banco di prova: il selettore di settimana della Pianificazione.
 *
 * Nasce da un dubbio concreto: al centro c'era scritto sempre «Oggi», e non si
 * capiva se le frecce cambiassero davvero settimana o se la pagina restasse
 * ferma. Qui si preme la freccia e si guarda **cosa cambia sullo schermo**:
 * numero di settimana, periodo, e l'indirizzo nella barra.
 *
 *   node scripts/banco-ui/pianificazione.mjs
 */

import { apriChrome, vaiA, accedi, esito, riepilogo, foto } from './comune.mjs';
import { valuta } from '../banco-upload/cdp.mjs';

const PATH = '/office/personale/pianificazione';

/** Legge quello che il selettore dice adesso. */
async function leggiSelettore(cdp) {
  return valuta(
    cdp,
    `(() => {
      const testo = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      // Il selettore e' il gruppo con le due frecce attorno al centro.
      const frecce = [...document.querySelectorAll('button[aria-label]')]
        .filter((b) => /settimana/i.test(b.getAttribute('aria-label') || ''));
      const gruppo = frecce[0] && frecce[0].parentElement;
      const centro = gruppo && gruppo.querySelector('div[aria-live]');
      const oggiBtn = [...document.querySelectorAll('button')]
        .find((b) => testo(b.textContent) === 'Oggi');
      return {
        centro: centro ? testo(centro.textContent) : null,
        frecce: frecce.length,
        oggiVisibile: !!oggiBtn,
        url: location.search,
        titoloRange: testo(document.querySelector('header p')?.textContent || ''),
      };
    })()`,
  );
}

async function premi(cdp, versoLabel) {
  await valuta(
    cdp,
    `(() => {
      const b = [...document.querySelectorAll('button[aria-label]')]
        .find((x) => (x.getAttribute('aria-label')||'').toLowerCase().includes('${versoLabel}'));
      if (!b) return 'non trovata';
      b.click();
      return 'ok';
    })()`,
  );
  // La navigazione e' un router.push: si aspetta che l'indirizzo cambi.
  await new Promise((r) => setTimeout(r, 1800));
}

const { cdp, chiudi } = await apriChrome({ larghezza: 1440, altezza: 900 });
try {
  await accedi(cdp, 'kantiere');
  await vaiA(cdp, PATH);

  const partenza = await leggiSelettore(cdp);
  esito(
    partenza.frecce === 2,
    'ci sono le due frecce',
    `trovate ${partenza.frecce}`,
  );
  esito(
    !!partenza.centro && /Sett\.\s*\d+/.test(partenza.centro),
    'al centro c\'e\' il numero di settimana',
    `dice: "${partenza.centro}"`,
  );
  esito(
    partenza.centro !== 'Oggi',
    'al centro NON c\'e\' piu\' la scritta fissa «Oggi»',
    `dice: "${partenza.centro}"`,
  );
  esito(
    partenza.oggiVisibile === false,
    'sulla settimana in corso il tasto «Oggi» non c\'e\' (non serve)',
    partenza.oggiVisibile ? 'ma c\'e\'' : '',
  );

  // ── avanti di una settimana ────────────────────────────────────────────
  await premi(cdp, 'successiva');
  const avanti = await leggiSelettore(cdp);
  esito(
    avanti.centro !== partenza.centro,
    'la freccia avanti cambia davvero settimana',
    `${partenza.centro} → ${avanti.centro}`,
  );
  esito(
    /lun=\d{4}-\d{2}-\d{2}/.test(avanti.url),
    'l\'indirizzo porta la settimana scelta',
    avanti.url,
  );
  esito(
    avanti.oggiVisibile === true,
    'fuori dalla settimana in corso compare «Oggi»',
    avanti.oggiVisibile ? '' : 'non e\' comparso',
  );
  esito(
    avanti.titoloRange !== partenza.titoloRange,
    'anche il periodo in alto si aggiorna',
    `${partenza.titoloRange.slice(0, 40)} → ${avanti.titoloRange.slice(0, 40)}`,
  );

  // ── indietro di due: deve tornare PRIMA della settimana di partenza ────
  await premi(cdp, 'precedente');
  await premi(cdp, 'precedente');
  const indietro = await leggiSelettore(cdp);
  esito(
    indietro.centro !== partenza.centro && indietro.centro !== avanti.centro,
    'la freccia indietro porta a una terza settimana diversa',
    `${avanti.centro} → ${indietro.centro}`,
  );

  // ── il tasto «Oggi» riporta alla settimana in corso ────────────────────
  await valuta(
    cdp,
    `(() => { const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='Oggi'); if(b) b.click(); return !!b; })()`,
  );
  await new Promise((r) => setTimeout(r, 1800));
  const tornato = await leggiSelettore(cdp);
  esito(
    tornato.centro === partenza.centro,
    'il tasto «Oggi» riporta alla settimana in corso',
    `${indietro.centro} → ${tornato.centro} (attesa ${partenza.centro})`,
  );

  await foto(cdp, 'pianificazione-selettore');
} finally {
  await chiudi();
}

riepilogo();
