/**
 * Banco: la giornata timbrata al terminale (Timbro), dal telefono e dall'ufficio.
 *
 *   node scripts/banco-ui/timbro.mjs
 *
 * Presuppone quattro timbri finti gia' in `timbri_grezzi` per il tecnico demo
 * di DEMOC (vedi la sessione del 22/10/2026) e il collegamento `attivo`.
 * SCRIVE sul tenant demo: la ripartizione crea timbrature vere. Si ripulisce
 * a mano dopo (il banco stampa cosa ha lasciato).
 */
import { apriChrome, vaiA, accedi, esito, riepilogo, foto, clicVero } from './comune.mjs';
import { valuta, finoA } from '../banco-upload/cdp.mjs';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const AIUTI = `
  const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const visibile = (el) => el.getClientRects().length > 0;
  const dialogo = () => document.querySelector('[role="dialog"][aria-label="Ripartisci la giornata"]');
`;

const { cdp, chiudi } = await apriChrome({ mobile: true });
try {
  await accedi(cdp, 'tecnico');
  await vaiA(cdp, '/mobile/kantiere/ore');
  await finoA(cdp, `document.body.innerText.includes('Inserisci le commesse')`, { cosa: 'card scatola', timeoutMs: 30000 }).catch(() => null);
  const s1 = await valuta(cdp, `(() => { ${AIUTI}
    const testo = t(document.body.innerText);
    return {
      card: /Inserisci le commesse sulle quali hai lavorato oggi/.test(testo),
      daRipartire: /Da ripartire/.test(testo),
      pillole: [...document.querySelectorAll('span[title]')].filter((x) => /badge al terminale/.test(x.title)).length,
      presenza: /8:33 di presenza/.test(testo),
      registraNascosto: !/Non hai timbrato\\?/.test(testo),
    };
  })()`);
  esito(s1.card, 'telefono: la card «Inserisci le commesse» compare');
  esito(s1.daRipartire, 'telefono: stato «Da ripartire»');
  esito(s1.pillole === 4, 'telefono: quattro passaggi al terminale', `trovati ${s1.pillole}`);
  esito(s1.presenza, 'telefono: presenza 8:33 (pausa timbrata esclusa)');
  esito(s1.registraNascosto, 'telefono: «Registra giornata» non si propone (la giornata e’ timbrata)');
  await foto(cdp, 'timbro-01-card');

  await clicVero(cdp, `[...document.querySelectorAll('button')].find((b) => /Inserisci le commesse/.test(b.textContent))`);
  await finoA(cdp, `document.querySelector('[role="dialog"][aria-label="Ripartisci la giornata"]')`, { cosa: 'dialog' });
  const s2 = await valuta(cdp, `(() => { ${AIUTI}
    const d = dialogo();
    const testo = t(d.innerText);
    const inizio = d.querySelector('input[type=time]');
    return {
      titolo: /Inserisci le commesse sulle quali hai lavorato oggi/.test(testo),
      timbrato: /timbrato 08:27 → 18:00/.test(testo) && /pausa 1:00/.test(testo),
      inizioFisso: inizio ? inizio.value === '08:27' && inizio.disabled : null,
      fineTimbrata: /18:00/.test(testo),
      daRipartire: /8:33/.test(testo),
      tasto: [...d.querySelectorAll('button')].some((b) => /Salva le ore/.test(b.textContent)),
    };
  })()`);
  esito(s2.titolo, 'dialog: titolo nuovo');
  esito(s2.timbrato, 'dialog: sottotitolo «timbrato 08:27 → 18:00 · pausa 1:00»');
  esito(s2.inizioFisso === true, 'dialog: inizio fisso a 08:27, non modificabile');
  esito(s2.daRipartire, 'dialog: 8:33 da ripartire');
  esito(s2.tasto, 'dialog: tasto «Salva le ore»');
  await foto(cdp, 'timbro-02-dialog');

  // Aggiungi un cantiere.
  await clicVero(cdp, `[...document.querySelector('[role="dialog"][aria-label="Ripartisci la giornata"]').querySelectorAll('button')].find((b) => /Aggiungi (il )?cantiere/.test(b.textContent))`);
  await finoA(cdp, `[...document.querySelectorAll('[role="dialog"] h2')].some((h) => /Aggiungi cantiere/.test(h.textContent))`, { cosa: 'foglio cantieri' });
  await clicVero(cdp, `(() => { const sheet = [...document.querySelectorAll('[role="dialog"]')].find((d) => /Aggiungi cantiere/.test(d.querySelector('h2')?.textContent || '')); return [...sheet.querySelectorAll('button')].find((b) => /Aurora/.test(b.textContent)); })()`);
  await pausa(700);
  const s3 = await valuta(cdp, `(() => { ${AIUTI}
    const d = dialogo();
    const scelto = [...d.querySelectorAll('[role=radio][aria-checked="true"]')].map((b) => t(b.textContent));
    return { etichetta: scelto.join(','), spuntato: scelto.includes('In sede'), inSede: /tutto il giorno in sede/i.test(t(d.innerText)), resto: /8:33 vanno sull’ultimo cantiere/.test(t(d.innerText)) };
  })()`);
  // Il tecnico demo e' in modalita' ufficio: il default e' «In sede».
  esito(s3.spuntato === true, 'riga cantiere: «In sede» scelto per default (persona in modalità ufficio)', s3.etichetta ?? '');
  esito(s3.inSede, 'percorso: «tutto il giorno in sede», nessun viaggio chiesto');
  esito(s3.resto, 'il resto delle ore va sull’ultimo cantiere');
  await foto(cdp, 'timbro-03-cantiere');

  // Le stime di viaggio arrivano in un paio di secondi: un dito vero non e' cosi' veloce.
  await pausa(4000);
  await clicVero(cdp, `[...document.querySelector('[role="dialog"][aria-label="Ripartisci la giornata"]').querySelectorAll('button')].find((b) => /Salva le ore/.test(b.textContent))`);
  const salvato = await finoA(cdp, `document.body.innerText.includes('Ore salvate')`, { cosa: 'conferma', timeoutMs: 30000 }).then(() => true).catch(() => false);
  esito(salvato, 'salvataggio: «Ore salvate»');
  await foto(cdp, 'timbro-04-salvato');
  await pausa(2500);

  await vaiA(cdp, '/mobile/kantiere/ore');
  await pausa(1500);
  const s4 = await valuta(cdp, `(() => { const testo = document.body.innerText; return { coperta: /già sui cantieri/.test(testo), card: /Inserisci le commesse/.test(testo), ore: /8:33/.test(testo) }; })()`);
  esito(s4.coperta && !s4.card, 'dopo: la giornata risulta coperta e la card sparisce');
  esito(s4.ore, 'dopo: le ore di oggi sono 8:33');
  await foto(cdp, 'timbro-05-dopo');

  // Ufficio.
  await accedi(cdp, 'kantiere');
  await vaiA(cdp, '/office/kantiere/rapportini');
  await pausa(1500);
  await clicVero(cdp, `[...document.querySelectorAll('tr')].find((r) => /Rinaldi/.test(r.textContent) && /In corso oggi|bg-emerald/.test(r.className + r.textContent))`).catch(() => null);
  await pausa(800);
  const s5 = await valuta(cdp, `(() => { const testo = document.body.innerText; return { passaggi: /Passaggi al terminale/i.test(testo), terminale: /Timbrata · terminale/i.test(testo), pannello: /da sistemare/.test(testo) }; })()`);
  esito(s5.passaggi, 'ufficio: il dettaglio mostra «Passaggi al terminale»');
  esito(s5.terminale, 'ufficio: l’origine delle timbrature dice «Timbrata · terminale»');
  esito(!s5.pannello, 'ufficio: nessuna giornata «da sistemare» (e’ stata ripartita)');
  await foto(cdp, 'timbro-06-ufficio');
} finally {
  await chiudi();
}
process.exit(riepilogo() === 0 ? 0 : 1);
