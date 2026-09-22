/**
 * Banco di prova: il giustificativo di un'assenza, nei due punti in cui vive.
 *
 * Nasce da una domanda del cliente che era già un sintomo: «ma dove me lo
 * chiede?». Il certificato era un secondo passaggio su un'altra schermata, e
 * non lo trovava nessuno. Ora l'attestato sta dentro il popup che crea
 * l'assenza, in una colonna che compare solo quando serve.
 *
 *   node scripts/banco-ui/giustificativo.mjs
 *
 * ⚠️ Va lanciato dalla radice del repo: le foto finiscono in
 * `scripts/banco-ui/esiti/` a partire dalla cartella corrente.
 */

import { apriChrome, vaiA, accedi, esito, riepilogo, foto, valuta, finoA } from './comune.mjs';

const PATH = '/office/personale/permessi';

const APRI_NUOVA = `(() => {
  const b = [...document.querySelectorAll('button')]
    .find((x) => (x.textContent || '').trim().startsWith('Nuova richiesta'));
  if (!b) return false;
  b.click();
  return true;
})()`;

/** Il tipo è una select nativa: si scrive il valore e si avvisa React. */
const scegliTipo = (codice) => `(() => {
  const d = document.querySelector('[role=dialog]');
  const s = d && d.querySelector('select');
  if (!s) return false;
  const opt = [...s.options].find((o) => o.value === ${JSON.stringify(codice)});
  if (!opt) return 'tipo assente';
  const proto = Object.getPrototypeOf(s);
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(s, ${JSON.stringify(codice)});
  s.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

const LEGGI_POPUP = `(() => {
  const d = document.querySelector('[role=dialog]');
  if (!d) return null;
  const testo = (d.innerText || '').replace(/\\s+/g, ' ').trim();
  return {
    titolo: d.querySelector('h2')?.textContent?.trim() ?? null,
    larghezza: Math.round(d.getBoundingClientRect().width),
    // ⚠️ Confronti senza distinzione di maiuscole: le etichette di sezione
    // sono rese in maiuscoletto dal CSS, e \`innerText\` restituisce il testo
    // gia' trasformato. Cercare «Attestato» com'e' scritto nel sorgente qui
    // non trova niente, e la prova boccia un'interfaccia che funziona.
    colonnaAttestato: /attestato/i.test(testo),
    areaTrascinamento: /Trascina qui il PDF/i.test(testo),
    campoNumero: !!d.querySelector('#numero-attestato'),
    diceObbligatorio: /obbligatorio/i.test(testo),
    sceltaInTesta: /cosa registri/i.test(testo),
    // Il popup non deve mai scorrere in orizzontale.
    sbordaInOrizzontale: d.scrollWidth > d.clientWidth + 1,
    testo: testo.slice(0, 420),
  };
})()`;

/**
 * Il popup ci sta in altezza e i tasti si vedono?
 *
 * La domanda nasce da un difetto vero: scorreva l'intero popup, cosi' Annulla
 * e Salva finivano sotto il bordo e bisognava scorrere per trovarli. Deve
 * scorrere il CORPO, non il popup.
 */
const MISURA_ALTEZZA = `(() => {
  const d = document.querySelector('[role=dialog]');
  if (!d) return null;
  const r = d.getBoundingClientRect();
  const tasto = [...d.querySelectorAll('button')].find((b) => {
    const t = (b.textContent || '').trim();
    return t.startsWith('Crea richiesta') || t.startsWith('Registra assenza');
  });
  const tr = tasto ? tasto.getBoundingClientRect() : null;
  return {
    altezzaPopup: Math.round(r.height),
    altezzaFinestra: window.innerHeight,
    dentroLaFinestra: r.top >= -1 && r.bottom <= window.innerHeight + 1,
    tastoVisibile: !!tr && tr.bottom <= window.innerHeight + 1 && tr.top >= 0,
    popupScorre: d.scrollHeight > d.clientHeight + 1,
  };
})()`;

const CHIUDI = `(() => {
  const b = [...document.querySelectorAll('[role=dialog] button')]
    .find((x) => (x.textContent || '').trim() === 'Annulla');
  if (b) { b.click(); return true; }
  return false;
})()`;

const MOSTRA_TUTTE = `(() => {
  const b = [...document.querySelectorAll('button')]
    .find((x) => (x.textContent || '').trim().startsWith('Tutte'));
  if (!b) return false;
  b.click();
  return true;
})()`;

const LEGGI_PASTIGLIA = `(() => {
  const b = [...document.querySelectorAll('button')]
    .find((x) => /PUC|Giustificativo|Documento allegato/.test(x.textContent || ''));
  if (!b) return null;
  return { testo: (b.textContent || '').replace(/\\s+/g, ' ').trim() };
})()`;

const { cdp, chiudi } = await apriChrome({ larghezza: 1440, altezza: 980 });
try {
  await accedi(cdp, 'kantiere');
  await vaiA(cdp, PATH);

  // ── Il popup che crea l'assenza ────────────────────────────────────────
  await valuta(cdp, APRI_NUOVA);
  await finoA(cdp, `document.querySelector('[role=dialog]')`, { cosa: 'apertura di Nuova richiesta' });
  await new Promise((r) => setTimeout(r, 400));

  const stretto = await valuta(cdp, LEGGI_POPUP);
  esito(stretto?.sceltaInTesta === true, 'la scelta «Cosa registri» sta in testa, non in fondo');
  esito(
    stretto?.colonnaAttestato === false,
    'per un permesso normale la colonna attestato non c\'e\'',
    stretto?.colonnaAttestato ? 'ma compare' : '',
  );
  const largoPrima = stretto?.larghezza ?? 0;
  await foto(cdp, 'assenza-popup-stretto');

  const altStretto = await valuta(cdp, MISURA_ALTEZZA);
  esito(
    altStretto?.tastoVisibile === true,
    'col popup stretto i tasti si vedono senza scorrere',
    `popup ${altStretto?.altezzaPopup}px su finestra ${altStretto?.altezzaFinestra}px`,
  );

  const scelta = await valuta(cdp, scegliTipo('malattia'));
  if (scelta !== true) {
    esito(false, 'il tipo «Malattia» e\' fra quelli attivi', String(scelta));
  } else {
    await new Promise((r) => setTimeout(r, 500));
    const largo = await valuta(cdp, LEGGI_POPUP);
    esito(largo?.colonnaAttestato === true, 'scegliendo Malattia compare la colonna dell\'attestato');
    esito(largo?.campoNumero === true, 'il campo del numero sta in alto nella colonna');
    esito(largo?.areaTrascinamento === true, 'sotto c\'e\' l\'area dove trascinare il PDF');
    esito(largo?.diceObbligatorio === true, 'per la malattia il numero risulta obbligatorio');
    esito(
      (largo?.larghezza ?? 0) > largoPrima + 200,
      'il popup si allarga solo quando serve la seconda colonna',
      `${largoPrima}px → ${largo?.larghezza}px`,
    );
    esito(largo?.sbordaInOrizzontale === false, 'il popup non sborda in orizzontale');
    await foto(cdp, 'assenza-popup-malattia');

    const alt = await valuta(cdp, MISURA_ALTEZZA);
    esito(
      alt?.dentroLaFinestra === true,
      'il popup ci sta tutto nella finestra',
      `${alt?.altezzaPopup}px su ${alt?.altezzaFinestra}px`,
    );
    esito(alt?.tastoVisibile === true, 'Annulla e Salva restano visibili senza scorrere');
    esito(
      alt?.popupScorre === false,
      'scorre il corpo, non tutto il popup',
      alt?.popupScorre ? 'scorre il popup intero: i tasti se ne vanno sotto' : '',
    );

    // ── Il difetto peggiore: scrivere un refuso e salvare sulla persona
    //    sbagliata. Scrivere DEVE annullare la scelta e dirlo.
    await valuta(
      cdp,
      `(() => {
        const i = document.querySelector('#cerca-dipendente');
        if (!i) return 'campo assente';
        const proto = Object.getPrototypeOf(i);
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, 'zzzqqq');
        i.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`,
    );
    await new Promise((r) => setTimeout(r, 400));
    const refuso = await valuta(
      cdp,
      `(() => {
        const d = document.querySelector('[role=dialog]');
        if (!d) return null;
        const t = (d.innerText || '').replace(/\\s+/g, ' ');
        return {
          avvisa: /Nessun dipendente scelto/i.test(t),
          tendinaVuota: /Nessun dipendente con questo nome/i.test(t),
        };
      })()`,
    );
    esito(
      refuso?.avvisa === true,
      'un refuso nella ricerca annulla la scelta e lo dice',
      refuso?.avvisa ? '' : 'nessun avviso: si salverebbe sulla persona di prima',
    );
    esito(refuso?.tendinaVuota === true, 'la tendina dice che non ha trovato nessuno');

    console.log(`\n  Testo del popup: ${largo?.testo ?? '(vuoto)'}\n`);
  }

  await valuta(cdp, CHIUDI);
  await new Promise((r) => setTimeout(r, 400));

  // ── Il popup di modifica, sulla riga dell'assenza ──────────────────────
  await valuta(cdp, MOSTRA_TUTTE);
  await new Promise((r) => setTimeout(r, 600));
  const pastiglia = await valuta(cdp, LEGGI_PASTIGLIA);
  if (!pastiglia) {
    console.log(
      '\n  Nessuna assenza con giustificativo sul tenant demo: la seconda parte si salta.\n' +
        '  Per provarla, crea una malattia da «Nuova richiesta» e rilancia.',
    );
  } else {
    esito(
      /PUC/.test(pastiglia.testo),
      'sulla riga dell\'assenza si vede lo stato dell\'attestato',
      pastiglia.testo,
    );
    await foto(cdp, 'assenza-pastiglia');
  }
} finally {
  await chiudi();
}

riepilogo();
