/**
 * Banco: il dettaglio espanso di una persona in «Presenze e ore» mostra la
 * giornata come UNA catena cronologica (proposta B, 26/10/2026).
 *
 * Misura la cosa di cui Luca si era lamentato: l'ORDINE. Prima le pause
 * uscivano in una lista dopo tutti i segmenti e i viaggi in un blocco a parte,
 * quindi una pausa delle 12:30 si leggeva sotto un segmento delle 13:00.
 *
 * Non scrive niente.
 *   node scripts/banco-ui/catena-giornata.mjs
 */
import { apriChrome, vaiA, accedi, esito, riepilogo, foto, clicVero } from './comune.mjs';
import { valuta, finoA } from '../banco-upload/cdp.mjs';

const { cdp, chiudi } = await apriChrome({ larghezza: 1600 });
try {
  await accedi(cdp, 'kantiere');
  await vaiA(cdp, '/office/kantiere/rapportini');
  await finoA(cdp, `[...document.querySelectorAll('button')].some((b) => /Compila giornata/.test(b.textContent))`, {
    cosa: 'pagina Presenze e ore',
    timeoutMs: 60000,
  });

  // Apro le righe finche' non trovo una giornata con abbastanza eventi da
  // misurare un ordine. Se non ce n'e' nessuna, lo DICO invece di misurare a
  // vuoto: un banco che non distingue «non funziona» da «non l'ho trovato»
  // e' peggio di nessun banco.
  const righe = await valuta(cdp, `document.querySelectorAll('tbody tr').length`);
  let trovata = 0;
  for (let i = 0; i < Math.min(righe, 14); i += 1) {
    await clicVero(cdp, `document.querySelectorAll('tbody tr')[${i}]`, { attesaMs: 500 });
    const n = await valuta(cdp, `document.querySelectorAll('[data-catena] [data-catena-riga]').length`);
    if (n >= 3) { trovata = n; break; }
    await clicVero(cdp, `document.querySelectorAll('tbody tr')[${i}]`, { attesaMs: 250 });
  }

  if (!trovata) {
    esito(false, 'NON MISURATO: nessuna giornata con almeno 3 eventi nel periodo mostrato', `righe viste: ${righe}`);
    console.log('\nSuggerimento: allarga il periodo coi filtri, o semina una giornata sul tenant demo.');
  } else {
    esito(true, `catena trovata: ${trovata} eventi in una giornata`);

    const c = await valuta(cdp, `(() => {
      const righe = [...document.querySelectorAll('[data-catena] [data-catena-riga]')];
      const ore = righe.map((r) => r.dataset.ora);
      const generi = righe.map((r) => r.dataset.catenaRiga);
      const min = (s) => { const m = /^(\\d{1,2}):(\\d{2})$/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
      const minuti = ore.map(min);
      let crescente = true, dove = null;
      for (let i = 1; i < minuti.length; i += 1) {
        if (minuti[i] == null || minuti[i - 1] == null) continue;
        if (minuti[i] < minuti[i - 1]) { crescente = false; dove = i; break; }
      }
      const sfondi = {};
      for (const r of righe) {
        const g = r.dataset.catenaRiga;
        if (!sfondi[g]) sfondi[g] = getComputedStyle(r).backgroundImage.slice(0, 60);
      }
      const iconePerGenere = {};
      for (const r of righe) {
        const g = r.dataset.catenaRiga;
        if (iconePerGenere[g] == null) iconePerGenere[g] = r.querySelectorAll('svg').length;
      }
      const vecchiTitoli = [...document.querySelectorAll('p')]
        .map((p) => p.textContent.trim())
        .filter((t) => /^(Timbrature sui cantieri|Viaggio)$/.test(t));
      return { ore, generi, crescente, dove, sfondi, iconePerGenere, vecchiTitoli,
               nPausa: generi.filter((g) => g === 'pausa').length,
               nViaggio: generi.filter((g) => g === 'viaggio').length,
               nLavoro: generi.filter((g) => g === 'lavoro').length };
    })()`);

    esito(c.crescente, '⭐ gli orari crescono nell\'ordine del DOM (era IL difetto)',
      `${c.ore.join(' · ')}${c.dove != null ? ` — scende alla posizione ${c.dove}` : ''}`);
    esito(c.vecchiTitoli.length === 0, 'i tre blocchi impilati non ci sono piu\'',
      c.vecchiTitoli.join(' | ') || 'nessun titolo vecchio');

    if (c.nPausa > 0) {
      const p = c.generi.indexOf('pausa');
      esito(c.generi[p - 1] === 'lavoro' && c.generi[p + 1] === 'lavoro',
        '⭐ la pausa sta FRA due segmenti di lavoro, non dopo entrambi',
        `${c.generi[p - 1]} → pausa → ${c.generi[p + 1]}`);
    } else {
      console.log('  · nessuna pausa in questa giornata: il caso non e\' stato misurato');
    }

    if (c.nViaggio > 0) {
      esito(true, `i viaggi sono dentro la catena, non in un blocco a parte (${c.nViaggio})`, c.generi.join(','));
    } else {
      console.log('  · nessuna tratta in questa giornata: il caso non e\' stato misurato');
    }

    const generiVisti = Object.keys(c.sfondi);
    const sfondiDistinti = new Set(Object.values(c.sfondi)).size;
    esito(sfondiDistinti === generiVisti.length,
      'ogni tipo di riga ha la sua tinta', `${generiVisti.join(',')} → ${sfondiDistinti} tinte`);
    esito(generiVisti.every((g) => c.iconePerGenere[g] >= 1),
      'ogni tipo di riga porta la sua icona', JSON.stringify(c.iconePerGenere));
  }

  await foto(cdp, 'catena-giornata-01');
} finally {
  await chiudi();
}
riepilogo();
