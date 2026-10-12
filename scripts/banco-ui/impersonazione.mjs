/**
 * Banco di prova: **entrare nell'app come una persona di un cliente.**
 *
 * Misura le tre cose che al 12/10/2026 erano rotte o impossibili:
 *
 *  1. si **sceglie chi**, con il mestiere a fianco — prima il tasto visibile
 *     pescava un amministratore qualsiasi (`.limit(1)` senza ordinamento) e in
 *     tre mesi 56 impersonazioni su 56 sono finite su un amministratore;
 *  2. il tasto **«indietro» del browser non chiude l'impersonazione** — prima
 *     ripassava da `/admin/...`, che rimandava a una GET che la terminava:
 *     56 iniziate, 8 chiuse dalla porta;
 *  3. un **tecnico** atterra nel guscio del telefono, non nell'ufficio.
 *
 * ⚠️ **Serve un accesso da super admin, e non sta nel sorgente.** Le
 * credenziali dei tenant dimostrativi sono già un problema dichiarato
 * (`BANCO_PASSWORD`); quelle di un super admin aprono **tutti** i clienti,
 * produzione compresa, e non si scrivono in un file versionato né si passano
 * in un prompt. Si danno a questo banco dall'ambiente:
 *
 *   BANCO_SUPER_EMAIL=... BANCO_SUPER_PASSWORD=... node scripts/banco-ui/impersonazione.mjs
 *
 * Senza quelle due variabili il banco **lo dice e si ferma** invece di
 * misurare a vuoto: un banco che non distingue «non funziona» da «non ho
 * potuto provare» è peggio di nessun banco.
 */

import {
  apriChrome,
  vaiA,
  valuta,
  finoA,
  clicVero,
  esito,
  riepilogo,
  foto,
  BASE,
} from './comune.mjs';

const EMAIL = process.env.BANCO_SUPER_EMAIL ?? '';
const PASSWORD = process.env.BANCO_SUPER_PASSWORD ?? '';

/** Il cliente dimostrativo del mondo commesse: ha un admin, un ufficio, due tecnici. */
const CLIENTE = process.env.BANCO_TENANT ?? 'Rossi Impianti (DEMO)';

if (!EMAIL || !PASSWORD) {
  console.log(
    '\n\x1b[33mNON MISURATO\x1b[0m — questo banco entra come super admin di piattaforma,\n' +
      'e quelle credenziali non stanno nel repo (aprono tutti i clienti, produzione\n' +
      'compresa). Passale dall’ambiente:\n\n' +
      '  BANCO_SUPER_EMAIL=... BANCO_SUPER_PASSWORD=... node scripts/banco-ui/impersonazione.mjs\n',
  );
  process.exit(0);
}

/** Accesso come super admin: il codice azienda si lascia vuoto. */
async function accediSuperAdmin(cdp) {
  await vaiA(cdp, '/login');
  await finoA(cdp, `document.querySelector('input[name=email]')`, { cosa: 'campo email' });
  await valuta(
    cdp,
    `(() => {
      const set = (el, v) => {
        const proto = Object.getPrototypeOf(el);
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set(document.querySelector('input[name=email]'), ${JSON.stringify(EMAIL)});
      set(document.querySelector('input[name=password]'), ${JSON.stringify(PASSWORD)});
      document.querySelector('form button[type=submit]').click();
      return true;
    })()`,
  );
  await finoA(cdp, `!location.pathname.startsWith('/login')`, {
    timeoutMs: 40_000,
    cosa: 'uscita dalla pagina di accesso',
  });
}

/** La barra arancione dell'impersonazione, se c'è: testo intero. */
const BARRA = `(() => {
  const b = [...document.querySelectorAll('[role=alert]')]
    .find((e) => /stai guardando l/i.test(e.innerText || ''));
  return b ? b.innerText.replace(/[ \\t\\n\\r]+/g, ' ').trim() : null;
})()`;

async function main() {
  const { cdp, chiudi } = await apriChrome({ larghezza: 1440, altezza: 900 });
  try {
    console.log('\n\x1b[1m1. Accesso come super admin\x1b[0m');
    await accediSuperAdmin(cdp);
    const dove = await valuta(cdp, 'location.pathname');
    esito(String(dove).startsWith('/admin'), 'si entra nella console di piattaforma', String(dove));

    console.log('\n\x1b[1m2. Si sceglie CHI, non un ruolo a caso\x1b[0m');
    await vaiA(cdp, '/admin/tenants');
    await finoA(cdp, `document.body.innerText.includes(${JSON.stringify(CLIENTE)})`, {
      cosa: `la riga di ${CLIENTE}`,
    });

    // Il menu «⋯» della riga del cliente dimostrativo.
    const rigaMenu = `(() => {
      const r = [...document.querySelectorAll('tr')]
        .find((t) => (t.innerText || '').includes(${JSON.stringify(CLIENTE)}));
      return r ? r.querySelector('button[aria-label="Altre azioni"]') : null;
    })()`;
    const apertoMenu = await clicVero(cdp, rigaMenu);
    esito(apertoMenu.fatto, 'il menu della riga si apre', apertoMenu.perche ?? '');

    const vociMenu = await valuta(
      cdp,
      `[...document.querySelectorAll('[role=menuitem]')].map((e) => e.innerText.trim())`,
    );
    esito(
      Array.isArray(vociMenu) && vociMenu.some((v) => /entra come/i.test(v)),
      'il menu dice «Entra come…», non «Impersona tenant»',
      JSON.stringify(vociMenu),
    );

    const apriScelta = await clicVero(
      cdp,
      `[...document.querySelectorAll('[role=menuitem]')].find((e) => /entra come/i.test(e.innerText))`,
    );
    esito(apriScelta.fatto, 'la voce apre la scelta della persona', apriScelta.perche ?? '');

    await finoA(cdp, `document.querySelector('[role=dialog]')`, { cosa: 'il dialog della scelta' });
    // ⚠️ Il dialog legge le persone dal server all'apertura: si aspetta che
    // abbia finito, altrimenti si misura lo stato «sto leggendo».
    await finoA(
      cdp,
      `!/sto leggendo/i.test(document.querySelector('[role=dialog]').innerText)`,
      { timeoutMs: 20_000, cosa: 'le persone caricate' },
    );

    const pastiglie = await valuta(
      cdp,
      `[...document.querySelectorAll('[role=dialog] button[aria-pressed]')].map((e) => e.innerText.trim())`,
    );
    esito(
      Array.isArray(pastiglie) &&
        ['Tutti', 'Amministratori', 'Ufficio', 'Tecnici'].every((v) => pastiglie.includes(v)),
      '⭐ si filtra per mestiere: Tutti · Amministratori · Ufficio · Tecnici',
      JSON.stringify(pastiglie),
    );

    // La tendina: si apre e mostra le persone raggruppate per mestiere.
    const apriTendina = await clicVero(
      cdp,
      `document.querySelector('[role=dialog] [aria-label="Persona da impersonare"]')`,
    );
    esito(apriTendina.fatto, 'la tendina delle persone si apre', apriTendina.perche ?? '');

    const elenco = await valuta(
      cdp,
      `(() => {
        const p = document.querySelector('[data-popover-portale]');
        if (!p) return null;
        return p.innerText.replace(/[ \\t]+/g, ' ').split('\\n').map((s) => s.trim()).filter(Boolean);
      })()`,
    );
    esito(
      Array.isArray(elenco) && elenco.some((r) => /Ufficio/.test(r)) && elenco.some((r) => /Tecnici/.test(r)),
      'le persone sono raggruppate per mestiere',
      Array.isArray(elenco) ? `${elenco.length} righe` : 'NESSUN PANNELLO',
    );
    esito(
      Array.isArray(elenco) && !elenco.some((r) => /\b(office|tecnico|admin)\b/.test(r)),
      'nessun valore grezzo del ruolo a schermo',
      Array.isArray(elenco) ? (elenco.filter((r) => /\b(office|tecnico|admin)\b/.test(r))[0] ?? 'ok') : '',
    );

    console.log('\n\x1b[1m3. Si entra come UFFICIO, e la barra dice chi e con che mestiere\x1b[0m');
    const scegliUfficio = await clicVero(
      cdp,
      `(() => {
        const p = document.querySelector('[data-popover-portale]');
        if (!p) return null;
        const voci = [...p.querySelectorAll('[role=option]')];
        return voci.find((v) => /ufficio/i.test(v.innerText)) ?? null;
      })()`,
    );
    esito(scegliUfficio.fatto, 'si sceglie una persona dell’ufficio', scegliUfficio.perche ?? '');

    const tastoEntra = await valuta(
      cdp,
      `(() => {
        const b = [...document.querySelectorAll('[role=dialog] button')]
          .find((e) => /^Entra come /.test(e.innerText.trim()));
        return b ? { testo: b.innerText.trim(), spento: b.disabled } : null;
      })()`,
    );
    esito(
      tastoEntra && !tastoEntra.spento,
      '⭐ il tasto dice il nome di chi hai scelto',
      tastoEntra ? tastoEntra.testo : 'TASTO ASSENTE',
    );

    await clicVero(
      cdp,
      `[...document.querySelectorAll('[role=dialog] button')].find((e) => /^Entra come /.test(e.innerText.trim()))`,
      { attesaMs: 1200 },
    );
    await finoA(cdp, `location.pathname.startsWith('/office')`, {
      timeoutMs: 40_000,
      cosa: 'atterraggio nel guscio dell’ufficio',
    });
    await finoA(cdp, `${BARRA} !== null`, { timeoutMs: 20_000, cosa: 'la barra dell’impersonazione' });

    const barra = await valuta(cdp, BARRA);
    esito(/ufficio/i.test(String(barra)), '⭐ la barra dice il MESTIERE, non solo il nome', String(barra));
    esito(
      String(barra).includes('·'),
      'la barra dice anche di quale cliente',
      String(barra),
    );
    await foto(cdp, 'impersonazione-ufficio');

    console.log('\n\x1b[1m4. ⚠️ Il tasto «indietro» NON chiude l’impersonazione\x1b[0m');
    // Si torna indietro: la pagina di prima è `/admin/tenants`, che col JWT del
    // cliente faceva scattare il guard. Prima finiva su una GET che chiudeva
    // tutto senza chiedere niente.
    await cdp.invia('Page.navigate', { url: `${BASE}/admin/tenants` });
    await finoA(cdp, `document.readyState === 'complete'`, { timeoutMs: 30_000 });
    await finoA(cdp, `document.body.innerText.trim().length > 0`, { timeoutMs: 30_000 });

    const dopoIndietro = await valuta(cdp, 'location.pathname');
    esito(
      dopoIndietro === '/impersonazione',
      '⭐ si finisce sulla pagina che CHIEDE, non su una GET che chiude',
      String(dopoIndietro),
    );
    const testoBivio = await valuta(
      cdp,
      `document.body.innerText.replace(/[ \\t\\n\\r]+/g, ' ').trim()`,
    );
    esito(
      /torna alla console/i.test(String(testoBivio)) && /continua a guardare/i.test(String(testoBivio)),
      'offre le due strade: tornare o continuare',
      String(testoBivio).slice(0, 110),
    );
    await foto(cdp, 'impersonazione-bivio');

    const continua = await clicVero(
      cdp,
      `[...document.querySelectorAll('a')].find((e) => /continua a guardare/i.test(e.innerText))`,
      { attesaMs: 1200 },
    );
    esito(continua.fatto, 'si può continuare a guardare', continua.perche ?? '');
    await finoA(cdp, `${BARRA} !== null`, { timeoutMs: 30_000, cosa: 'la barra, ancora al suo posto' });
    esito(true, '⭐ l’impersonazione è ancora viva dopo l’«indietro»', String(await valuta(cdp, BARRA)));

    console.log('\n\x1b[1m5. Dal tasto della barra si torna in console\x1b[0m');
    const esci = await clicVero(
      cdp,
      `[...document.querySelectorAll('[role=alert] button')].find((e) => /torna alla console/i.test(e.innerText))`,
      { attesaMs: 2000 },
    );
    esito(esci.fatto, 'il tasto della barra risponde', esci.perche ?? '');
    await finoA(cdp, `location.pathname.startsWith('/admin')`, {
      timeoutMs: 40_000,
      cosa: 'rientro nella console',
    });
    esito(
      (await valuta(cdp, BARRA)) === null,
      'in console non c’è più nessuna barra',
      String(await valuta(cdp, 'location.pathname')),
    );

    console.log('\n\x1b[1m6. Un TECNICO atterra nel guscio del telefono\x1b[0m');
    await vaiA(cdp, '/admin/tenants');
    await finoA(cdp, `document.body.innerText.includes(${JSON.stringify(CLIENTE)})`, {
      cosa: `la riga di ${CLIENTE}`,
    });
    await clicVero(cdp, rigaMenu);
    await clicVero(
      cdp,
      `[...document.querySelectorAll('[role=menuitem]')].find((e) => /entra come/i.test(e.innerText))`,
    );
    await finoA(
      cdp,
      `document.querySelector('[role=dialog]') && !/sto leggendo/i.test(document.querySelector('[role=dialog]').innerText)`,
      { timeoutMs: 20_000, cosa: 'le persone caricate' },
    );
    // Pastiglia «Tecnici», poi la prima voce.
    await clicVero(
      cdp,
      `[...document.querySelectorAll('[role=dialog] button[aria-pressed]')].find((e) => e.innerText.trim() === 'Tecnici')`,
    );
    await clicVero(cdp, `document.querySelector('[role=dialog] [aria-label="Persona da impersonare"]')`);
    const sceltoTecnico = await clicVero(
      cdp,
      `(() => {
        const p = document.querySelector('[data-popover-portale]');
        return p ? (p.querySelectorAll('[role=option]')[0] ?? null) : null;
      })()`,
    );
    esito(sceltoTecnico.fatto, 'si sceglie un tecnico', sceltoTecnico.perche ?? '');
    await clicVero(
      cdp,
      `[...document.querySelectorAll('[role=dialog] button')].find((e) => /^Entra come /.test(e.innerText.trim()))`,
      { attesaMs: 1500 },
    );
    await finoA(cdp, `location.pathname.startsWith('/mobile')`, {
      timeoutMs: 40_000,
      cosa: 'atterraggio nel guscio del telefono',
    });
    esito(
      String(await valuta(cdp, 'location.pathname')).startsWith('/mobile'),
      '⭐ un tecnico non passa dall’ufficio: atterra dove lavora',
      String(await valuta(cdp, 'location.pathname')),
    );
    await finoA(cdp, `${BARRA} !== null`, { timeoutMs: 20_000, cosa: 'la barra sul telefono' });
    const barraTecnico = await valuta(cdp, BARRA);
    esito(/tecnico/i.test(String(barraTecnico)), 'la barra dice «tecnico»', String(barraTecnico));
    await foto(cdp, 'impersonazione-tecnico');

    // Si richiude, per non lasciare il browser (e il registro) a metà.
    await clicVero(
      cdp,
      `[...document.querySelectorAll('[role=alert] button')].find((e) => /torna alla console/i.test(e.innerText))`,
      { attesaMs: 2000 },
    );
    await finoA(cdp, `location.pathname.startsWith('/admin')`, { timeoutMs: 40_000, cosa: 'rientro finale' });
    esito(true, 'il banco si è richiuso da sé');
  } finally {
    chiudi();
  }

  process.exit(riepilogo() === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\x1b[31mBANCO INTERROTTO\x1b[0m', e?.message ?? e);
  process.exit(1);
});
