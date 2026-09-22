/**
 * Banco di prova: la giornata di chi lavora in sede (modalità ufficio).
 *
 * La domanda a cui risponde: una persona in «Prevalenza ufficio» apre l'app e
 * trova la SUA giornata, o trova ancora le domande del cantiere? E la trova
 * dove atterra davvero, senza sapere nessun indirizzo?
 *
 *   node scripts/banco-ui/modalita-ufficio.mjs
 *
 * ⚠️ Serve un dipendente del tenant demo DEMOC, collegato all'account tecnico,
 * con `modalita_lavoro = 'ufficio'`. Se non c'è, il banco lo dice e si ferma
 * invece di passare a vuoto.
 *
 * ⚠️ Va lanciato dalla radice del repo: le foto finiscono in
 * `scripts/banco-ui/esiti/`.
 */

import { apriChrome, vaiA, accedi, esito, riepilogo, foto, valuta, finoA } from './comune.mjs';

/** Dove atterrano i non-manager: è lì che la giornata deve comparire. */
const ATTERRAGGIO = '/mobile/kantiere/cantieri';
const HOME_KANTIERE = '/mobile/kantiere';

const LEGGI_PAGINA = `(() => {
  const t = (document.body.innerText || '').replace(/\\s+/g, ' ');
  return {
    // Modalità ufficio
    iniziaGiornata: /Inizia giornata/i.test(t),
    scegliSuCosa: /Scegli su cosa lavori/i.test(t),
    statoNonIniziata: /Giornata non ancora iniziata/i.test(t),
    // Modalità cantiere: NON deve comparire il suo tasto di avvio
    iniziaTurno: /Inizia turno/i.test(t),
    // I collegamenti restano
    leMieOre: /Le mie ore/i.test(t),
    scansiona: /Scansiona QR/i.test(t),
    testo: t.slice(0, 320),
  };
})()`;

const APRI_SCELTA = `(() => {
  const b = [...document.querySelectorAll('button')]
    .find((x) => /Inizia giornata/i.test(x.textContent || ''));
  if (!b) return false;
  b.click();
  return true;
})()`;

const LEGGI_FOGLIO = `(() => {
  const d = document.querySelector('[role=dialog]');
  if (!d) return null;
  const t = (d.innerText || '').replace(/\\s+/g, ' ');
  return {
    titolo: d.querySelector('h2')?.textContent?.trim() ?? null,
    // Un passo solo: non deve chiedere da dove si parte.
    chiedeDaDoveParti: /da dove parti/i.test(t),
    haRicerca: !!d.querySelector('input[type=search]'),
    testo: t.slice(0, 220),
  };
})()`;

const { cdp, chiudi } = await apriChrome({ mobile: true });
try {
  await accedi(cdp, 'tecnico');

  // ── Dove la persona atterra ────────────────────────────────────────────
  await vaiA(cdp, ATTERRAGGIO);
  await new Promise((r) => setTimeout(r, 600));
  const atterraggio = await valuta(cdp, LEGGI_PAGINA);

  if (!atterraggio?.iniziaGiornata) {
    console.log(
      '\n  Il tecnico demo non è in «Prevalenza ufficio»: metti\n' +
        "  `modalita_lavoro = 'ufficio'` sulla sua scheda (DEMOC) e rilancia.\n" +
        `  A schermo c'è: ${atterraggio?.testo ?? '(vuoto)'}`,
    );
    await foto(cdp, 'ufficio-atterraggio-non-configurato');
    throw new Error('manca il caso di prova');
  }

  esito(true, 'la giornata compare dove la persona atterra', ATTERRAGGIO);
  esito(
    atterraggio.statoNonIniziata === true,
    'dice lo stato di oggi senza girarci intorno',
  );
  esito(
    atterraggio.iniziaTurno === false,
    'niente «Inizia turno» del cantiere: un solo modo di iniziare',
    atterraggio.iniziaTurno ? 'ci sono due tasti di avvio' : '',
  );
  esito(atterraggio.leMieOre === true, 'le ore restano a portata');
  esito(
    atterraggio.scansiona === true,
    'lo scanner resta raggiungibile: un giorno in cantiere ci va anche lei',
  );
  await foto(cdp, 'ufficio-atterraggio');

  // ── Il foglio: si sceglie SU COSA, non DA DOVE ─────────────────────────
  await valuta(cdp, APRI_SCELTA);
  await finoA(cdp, `document.querySelector('[role=dialog]')`, { cosa: 'apertura della scelta' });
  await new Promise((r) => setTimeout(r, 500));
  const foglio = await valuta(cdp, LEGGI_FOGLIO);
  esito(
    /Su cosa lavori/i.test(foglio?.titolo ?? ''),
    'il foglio chiede su cosa si lavora',
    foglio?.titolo ?? 'assente',
  );
  esito(
    foglio?.chiedeDaDoveParti === false,
    'un passo solo: non chiede da dove si parte',
    foglio?.chiedeDaDoveParti ? 'chiede ancora la partenza' : '',
  );
  esito(foglio?.haRicerca === true, 'si può cercare il lavoro');
  await foto(cdp, 'ufficio-scelta-lavoro');

  // ── Anche la home Kantiere mostra la stessa giornata ───────────────────
  await vaiA(cdp, HOME_KANTIERE);
  await new Promise((r) => setTimeout(r, 600));
  const home = await valuta(cdp, LEGGI_PAGINA);
  esito(
    home?.iniziaGiornata === true && home?.iniziaTurno === false,
    'la stessa giornata anche dalla home Kantiere',
  );
  await foto(cdp, 'ufficio-home');
} finally {
  await chiudi();
}

riepilogo();
