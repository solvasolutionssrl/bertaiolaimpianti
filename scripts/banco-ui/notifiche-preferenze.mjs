/**
 * Banco: la pagina delle notifiche governa qualcosa.
 *
 * ⚠️ Questo banco esiste per una ragione precisa. Il 07/10 e' stato tolto dal
 * profilo un pannello di ventuno caselle perche' **non cambiava niente**: chi
 * le compilava credeva di aver deciso qualcosa. L'08/10 il pannello torna, e
 * il controllo che conta non e' «si vede» ma «la scelta resta e qualcuno la
 * legge». Qui si misura la prima meta': che l'interruttore sopravviva a un
 * ricaricamento. La seconda meta' — che il mittente la rispetti — sta nelle
 * prove di `pushAttiva`.
 *
 * Non si prova la consegna vera: Chrome senza un servizio di notifica non
 * puo' sottoscriversi, e dirlo e' meglio che finto-provarlo.
 *
 *   node scripts/banco-ui/notifiche-preferenze.mjs
 */
import { apriChrome, vaiA, valuta, finoA, esito, riepilogo, BASE } from './comune.mjs';

const TECNICO = { email: 'marco@demok.kommessa.local', password: 'Demo2026!' };

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
  await finoA(cdp, `!location.pathname.startsWith('/login')`, { timeoutMs: 40_000 });
}

const interruttori = `[...document.querySelectorAll('button[role=switch]')]`;

const { cdp, chiudi } = await apriChrome({ mobile: true });
try {
  console.log(`\n\x1b[1mBanco: le preferenze delle notifiche (${BASE})\x1b[0m\n`);
  await accediCome(cdp, TECNICO);
  esito(true, 'accesso eseguito come tecnico');

  // ── 1. la voce c'e' nel profilo ──
  await vaiA(cdp, '/mobile/profilo');
  await finoA(cdp, `document.readyState === 'complete'`, { timeoutMs: 20_000 });
  const voce = await valuta(
    cdp,
    `document.querySelector('a[href="/mobile/profilo/notifiche"]')?.textContent?.trim().slice(0,40) ?? null`,
  );
  esito(Boolean(voce), 'dal profilo si arriva alle notifiche', voce ?? 'voce assente');

  // ── 2. la pagina mostra solo gli avvisi del suo mestiere ──
  await vaiA(cdp, '/mobile/profilo/notifiche');
  await finoA(cdp, `${interruttori}.length > 0`, { cosa: 'interruttori', timeoutMs: 20_000 });

  const etichette = await valuta(
    cdp,
    `${interruttori}.map(b => b.getAttribute('aria-label') ?? '')`,
  );
  esito(etichette.length === 4, 'quattro interruttori, uno per avviso ammesso', `${etichette.length}`);
  esito(
    !etichette.some((e) => /approvare/i.test(e)),
    '⭐ niente «richieste da approvare»: un tecnico non le approva',
    etichette.join(' | ').slice(0, 70),
  );

  // ── 3. ogni voce dice QUANDO arriva ──
  const spiegazioni = await valuta(
    cdp,
    `[...document.querySelectorAll('p')].filter(p => /^Quando /.test(p.textContent?.trim() ?? '')).length`,
  );
  esito(
    spiegazioni === etichette.length,
    'ogni interruttore dice quando arriva l’avviso',
    `${spiegazioni}/${etichette.length}`,
  );

  // ── 4. ⭐ la scelta RESTA: e' tutto il punto di questo banco ──
  const primoStato = await valuta(cdp, `${interruttori}[0].getAttribute('aria-checked')`);
  esito(primoStato === 'true', 'il primo avviso nasce attivo (predefinito del mestiere)', primoStato);

  await valuta(cdp, `${interruttori}[0].click(), true`);
  await new Promise((r) => setTimeout(r, 1200));
  const dopoClick = await valuta(cdp, `${interruttori}[0].getAttribute('aria-checked')`);
  esito(dopoClick === 'false', 'l’interruttore si muove al tocco', dopoClick);

  await vaiA(cdp, '/mobile/profilo/notifiche');
  await finoA(cdp, `${interruttori}.length > 0`, { timeoutMs: 20_000 });
  const dopoRicarica = await valuta(cdp, `${interruttori}[0].getAttribute('aria-checked')`);
  esito(
    dopoRicarica === 'false',
    '⭐ la scelta è ancora lì dopo un ricaricamento: il pannello scrive davvero',
    dopoRicarica,
  );

  // Si rimette com'era: il banco gira sul tenant demo, ma lasciare una
  // preferenza spenta falserebbe la prova successiva.
  await valuta(cdp, `${interruttori}[0].click(), true`);
  await new Promise((r) => setTimeout(r, 1200));
  const ripristinato = await valuta(cdp, `${interruttori}[0].getAttribute('aria-checked')`);
  esito(ripristinato === 'true', 'rimesso come l’ho trovato', ripristinato);

  // ── 5. l'area del telefono dice la verita' su questo browser ──
  // ⚠️ Cercato DENTRO la sezione, non in tutta la pagina: la prima versione
  // di questo controllo pescava il sottotitolo «Cosa farti sapere, e su quale
  // telefono» e passava senza guardare niente di utile.
  const telefono = await valuta(
    cdp,
    `(() => {
      const titoli = [...document.querySelectorAll('h2')];
      const sezione = titoli.find(h => /su questo telefono/i.test(h.textContent ?? ''))?.parentElement;
      if (!sezione) return { trovata: false, testo: '' };
      const tasto = sezione.querySelector('button');
      const avviso = sezione.querySelector('p');
      return {
        trovata: true,
        testo: (tasto?.textContent ?? avviso?.textContent ?? '').trim().slice(0, 70),
      };
    })()`,
  );
  esito(
    telefono.trovata && telefono.testo.length > 0,
    'la sezione «su questo telefono» offre un gesto o spiega perché non può',
    telefono.testo || 'SEZIONE NON TROVATA',
  );

  // ── 6. niente sbordo e bersagli da dito ──
  const sbordo = await valuta(cdp, `({ doc: document.documentElement.scrollWidth, vista: window.innerWidth })`);
  esito(sbordo.doc <= sbordo.vista + 1, 'la pagina non scorre di lato', `${sbordo.doc} vs ${sbordo.vista}`);

  const altezze = await valuta(
    cdp,
    `${interruttori}.map(b => Math.round(b.getBoundingClientRect().height))`,
  );
  esito(
    altezze.every((h) => h >= 24),
    'gli interruttori sono abbastanza grandi per un dito',
    altezze.join(','),
  );
} catch (e) {
  esito(false, 'il banco si è interrotto', String(e).slice(0, 140));
} finally {
  riepilogo();
  await chiudi();
}
