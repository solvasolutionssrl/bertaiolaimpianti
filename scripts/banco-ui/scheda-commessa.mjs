/**
 * Banco: la scheda di una commessa vista da un utente **ufficio**.
 *
 * Nasce da una segnalazione vera: «un utente con privilegi ufficio non riesce
 * a modificare le note nella sezione Descrizione cantiere». Erano due cose
 * diverse attaccate:
 *
 *  1. la card «Descrizione cantiere» ripeteva il titolo — la stessa variabile,
 *     non un altro campo — e serviva solo a ospitare una matita;
 *  2. i **Dettagli del lavoro** mostravano la matita all'ufficio e poi
 *     rifiutavano il salvataggio («Solo gli admin…»), mentre lo stesso campo
 *     l'ufficio lo scriveva senza problemi dall'editor completo.
 *
 * ⚠️ Si accede come **ufficio**, non come il `demo@` di sempre, che è admin e
 * non avrebbe mai visto il difetto. È tutto il punto di questo banco.
 *
 *   node scripts/banco-ui/scheda-commessa.mjs
 *   BANCO_VISIBILE=1 node scripts/banco-ui/scheda-commessa.mjs   # per guardare
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
} from './comune.mjs';

const UFFICIO = {
  email: process.env.BANCO_EMAIL ?? 'ufficio@demok.kommessa.local',
  password: process.env.BANCO_PASSWORD ?? 'Demo2026!',
};

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

async function accediCome(cdp, { email, password }) {
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
      set(document.querySelector('input[name=email]'), ${JSON.stringify(email)});
      set(document.querySelector('input[name=password]'), ${JSON.stringify(password)});
      document.querySelector('form button[type=submit]').click();
      return true;
    })()`,
  );
  await finoA(cdp, `!location.pathname.startsWith('/login')`, {
    timeoutMs: 40_000,
    cosa: 'uscita dalla pagina di accesso',
  });
  await finoA(cdp, `document.readyState === 'complete'`, { timeoutMs: 30_000 });
}

const { cdp, chiudi } = await apriChrome({ larghezza: 1440, altezza: 980 });

try {
  await accediCome(cdp, UFFICIO);

  // Che sia davvero ufficio e non admin: se qui entrasse un admin, il banco
  // tornerebbe tutto verde senza aver misurato niente.
  await vaiA(cdp, '/office/commesse');
  await finoA(cdp, `document.querySelectorAll('table tbody tr').length > 0`, {
    timeoutMs: 30_000,
    cosa: 'elenco commesse',
  });

  // Apre la prima commessa dell'elenco (le righe non sono <a>: si clicca).
  await clicVero(cdp, `document.querySelector('table tbody tr')`);
  await finoA(cdp, `/\\/office\\/commesse\\/[0-9a-f-]{36}/.test(location.pathname)`, {
    timeoutMs: 30_000,
    cosa: 'scheda di una commessa',
  });
  await finoA(cdp, `document.readyState === 'complete'`, { timeoutMs: 20_000 });

  // ⚠️ Si aspetta il CONTENUTO, non solo `readyState`: sotto `loading.tsx` la
  // pagina è «completa» mentre ancora mostra lo scheletro, e ogni controllo
  // qui sotto passerebbe per il motivo sbagliato — nessun titolo, nessuna
  // matita, nessuna card: tutto «a posto» su una pagina vuota.
  await finoA(
    cdp,
    `!!document.querySelector('h2') && !!document.querySelector('a[href$="/modifica"]')`,
    { timeoutMs: 30_000, cosa: 'il riquadro di riepilogo della commessa' },
  );
  await attendi(400);

  // ── 1. la card che ripeteva il titolo non c'è più ──
  const cardDoppia = await valuta(
    cdp,
    `[...document.querySelectorAll('p,span,h2,h3')]
       .some((e) => (e.textContent || '').trim().toLowerCase() === 'descrizione cantiere')`,
  );
  esito(!cardDoppia, '⭐ la card «Descrizione cantiere» non c\'è più');

  // ── 2. e il titolo compare UNA volta sola ──
  const conteggio = await valuta(
    cdp,
    `(() => {
      const h2 = document.querySelector('h2');
      const t = (h2?.textContent || '').trim();
      if (!t || t === 'Senza descrizione') return { titolo: t, volte: -1 };
      const tutti = [...document.querySelectorAll('h2,p,span')]
        .filter((e) => e.children.length === 0)
        .filter((e) => (e.textContent || '').trim() === t);
      return { titolo: t, volte: tutti.length };
    })()`,
  );
  if (conteggio.volte === -1) {
    esito(false, 'questa commessa non ha un titolo: il banco non può misurare', conteggio.titolo);
  } else {
    esito(
      conteggio.volte === 1,
      'il titolo si legge una volta sola',
      `«${conteggio.titolo}» × ${conteggio.volte}`,
    );
  }

  // ── 3. la matita del titolo c'è, ed è raggiungibile dal dito ──
  const matitaTitolo = `document.querySelector('button[aria-label="Modifica descrizione cantiere"]')`;
  const ciSta = await valuta(cdp, `!!${matitaTitolo}`);
  esito(ciSta, 'la matita del titolo è sulla scheda (ufficio la vede)');
  if (ciSta) {
    const vicina = await valuta(
      cdp,
      `(() => {
        const h2 = document.querySelector('h2');
        const m = ${matitaTitolo};
        if (!h2 || !m) return null;
        const a = h2.getBoundingClientRect(), b = m.getBoundingClientRect();
        // Stessa banda verticale = è accanto al titolo, non in un riquadro sotto.
        return Math.abs(a.top - b.top) < 40 ? 'accanto' : 'altrove';
      })()`,
    );
    esito(vicina === 'accanto', 'e sta accanto al titolo, non in un riquadro suo', String(vicina));
  }

  // ── 4. i Dettagli del lavoro: l'ufficio li salva DAVVERO ──
  const matitaNote = `document.querySelector('button[aria-label="Modifica dettagli lavoro"]')`;
  const noteVisibili = await valuta(cdp, `!!${matitaNote}`);
  esito(noteVisibili, 'la matita dei «Dettagli del lavoro» è sulla scheda');

  if (noteVisibili) {
    const prima = await valuta(
      cdp,
      `(() => {
        const t = [...document.querySelectorAll('p')]
          .find((e) => (e.textContent||'').trim().toUpperCase() === 'DETTAGLI DEL LAVORO');
        const card = t?.closest('div');
        const testo = card?.querySelector('p.whitespace-pre-wrap');
        return testo ? testo.textContent : '';
      })()`,
    );

    await clicVero(cdp, matitaNote);
    await finoA(cdp, `document.querySelector('[role=dialog] textarea')`, {
      timeoutMs: 15_000,
      cosa: 'il riquadro dei dettagli',
    });

    const marchio = `banco ${Date.now()}`;
    const nuovo = `${(prima || '').trim()}\n${marchio}`.trim();
    await valuta(
      cdp,
      `(() => {
        const ta = document.querySelector('[role=dialog] textarea');
        const proto = Object.getPrototypeOf(ta);
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(ta, ${JSON.stringify(nuovo)});
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`,
    );
    await attendi(200);

    await clicVero(
      cdp,
      `[...document.querySelectorAll('[role=dialog] button')].find((b) => /Salva/i.test(b.textContent))`,
    );
    await attendi(2500);

    // ⚠️ Due esiti distinti, non uno: «il dialog si è chiuso» e «il testo è
    // cambiato» sono due fatti diversi, e il difetto segnalato stava proprio
    // nel mezzo — il dialog restava aperto con una riga rossa.
    const rosso = await valuta(
      cdp,
      `(() => {
        const e = document.querySelector('[role=dialog] [role=alert]');
        return e ? e.textContent.trim() : null;
      })()`,
    );
    esito(rosso === null, '⭐ salvando non compare nessun rifiuto', rosso ? `«${rosso}»` : 'nessuno');

    const chiuso = await valuta(cdp, `!document.querySelector('[role=dialog] textarea')`);
    esito(chiuso, 'il riquadro si chiude dopo il salvataggio');

    await finoA(cdp, `document.readyState === 'complete'`, { timeoutMs: 20_000 });
    await attendi(900);
    const scritto = await valuta(
      cdp,
      `document.body.innerText.includes(${JSON.stringify(marchio)})`,
    );
    esito(scritto, '⭐ e la nota è davvero sulla scheda (l\'ufficio ha scritto)');

    // Si ripulisce da solo: il tenant demo resta com'era.
    if (scritto) {
      await clicVero(cdp, matitaNote);
      await finoA(cdp, `document.querySelector('[role=dialog] textarea')`, { timeoutMs: 15_000 });
      await valuta(
        cdp,
        `(() => {
          const ta = document.querySelector('[role=dialog] textarea');
          const proto = Object.getPrototypeOf(ta);
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(ta, ${JSON.stringify(prima ?? '')});
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        })()`,
      );
      await attendi(200);
      await clicVero(
        cdp,
        `[...document.querySelectorAll('[role=dialog] button')].find((b) => /Salva/i.test(b.textContent))`,
      );
      await attendi(2500);
      const ripulito = await valuta(
        cdp,
        `!document.body.innerText.includes(${JSON.stringify(marchio)})`,
      );
      esito(ripulito, 'il banco rimette la nota com\'era');
    }
  }

  // ── 5. la creazione propone una frase, non un nome di cartella ──
  await vaiA(cdp, '/office/commesse/nuova');
  await finoA(cdp, `document.querySelector('#desc')`, {
    timeoutMs: 30_000,
    cosa: 'il campo Descrizione',
  });
  const campo = await valuta(
    cdp,
    `(() => {
      const i = document.querySelector('#desc');
      const lab = document.querySelector('label[for=desc]');
      return {
        max: Number(i.getAttribute('maxlength')),
        etichetta: (lab?.textContent || '').trim(),
        segnaposto: i.getAttribute('placeholder') || '',
      };
    })()`,
  );
  esito(campo.max >= 60, 'il campo accetta una frase (60 caratteri)', `maxlength=${campo.max}`);
  esito(
    !/camelcase/i.test(campo.etichetta) && !/cartella/i.test(campo.etichetta),
    'l\'etichetta non chiede più un nome di cartella',
    `«${campo.etichetta}»`,
  );
  esito(
    / /.test(campo.segnaposto),
    'e l\'esempio proposto ha gli spazi',
    `«${campo.segnaposto}»`,
  );

  // ── 6. l'anteprima della cartella combacia col formato vero ──
  // ⚠️ Si aspetta che la BOZZA abbia finito di caricarsi prima di scrivere:
  // `useBozzaDraft` rimette lo stato dal payload salvato poco dopo il mount, e
  // un valore battuto prima viene cancellato. Il banco misurava
  // «_Cliente_Commessa» e dava la colpa al codice.
  await attendi(2000);
  await valuta(
    cdp,
    `(() => {
      const set = (el, v) => {
        const proto = Object.getPrototypeOf(el);
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set(document.querySelector('#desc'), 'Impianti meccanici casa legno');
      return true;
    })()`,
  );
  await finoA(
    cdp,
    `[...document.querySelectorAll('code')].some((e) => (e.textContent||'').includes('Impianti'))`,
    { timeoutMs: 10_000, cosa: 'l\'anteprima che recepisce la descrizione' },
  );
  const percorso = await valuta(
    cdp,
    `(() => {
      const c = [...document.querySelectorAll('code')]
        .map((e) => (e.textContent || '').trim())
        .find((t) => t.includes('01_Richieste'));
      return c ?? null;
    })()`,
  );
  if (percorso === null) {
    esito(false, 'non trovo l\'anteprima del percorso', 'nessun <code> con 01_Richieste');
  } else {
    esito(
      percorso.includes('ImpiantiMeccaniciCasaLegno'),
      '⭐ la frase diventa CamelCase nel nome cartella',
      percorso,
    );
    // ⚠️ Il formato vero è `codice_cliente_lavoro`: due delle tre anteprime
    // disegnavano `Cliente_2026-10-08_Lavoro`, con una data che non esiste.
    esito(
      !/\d{4}-\d{2}-\d{2}/.test(percorso),
      'e non c\'è nessuna data nel nome (sta già nel codice)',
      percorso,
    );
    esito(!/\bBER\b/.test(percorso), 'né una sigla azienda scritta a mano', percorso);
  }
} catch (e) {
  esito(false, 'il banco si è interrotto', String(e).slice(0, 160));
  await foto(cdp, 'scheda-commessa-interrotto');
} finally {
  riepilogo();
  await chiudi();
}
