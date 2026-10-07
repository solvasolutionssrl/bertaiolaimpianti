/**
 * Banco: cosa vede un TECNICO del mondo commesse.
 *
 * È il controllo che conta di più dei lavori del 07/10/2026: aprire un lavoro
 * è diventato un potere (`capo_squadra`), e un tecnico che non ce l'ha non
 * deve più trovarsi davanti il microfono al centro della barra — che lo
 * portava a un flusso che non poteva concludere.
 *
 *   node scripts/banco-ui/tecnico-poteri.mjs
 *   BANCO_VISIBILE=1 node scripts/banco-ui/tecnico-poteri.mjs   # per guardare
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
  await finoA(cdp, `document.readyState === 'complete'`, { timeoutMs: 30_000 });
}

const { cdp, chiudi } = await apriChrome({ mobile: true });
try {
  console.log(`\n\x1b[1mBanco: i poteri del tecnico (${BASE})\x1b[0m\n`);
  await accediCome(cdp, TECNICO);
  esito(true, 'accesso eseguito come tecnico');

  await vaiA(cdp, '/mobile');

  // ── 1. la barra in basso ──
  const barra = await valuta(
    cdp,
    `(() => {
      const nav = document.querySelector('nav');
      if (!nav) return null;
      const voci = [...nav.querySelectorAll('li')].map((li) => {
        const a = li.querySelector('a');
        const b = li.querySelector('button');
        return {
          testo: li.textContent.trim().slice(0, 14),
          tipo: a ? 'link' : b ? 'spento' : 'altro',
          href: a ? a.getAttribute('href') : null,
        };
      });
      return voci;
    })()`,
  );
  esito(Array.isArray(barra) && barra.length === 5, 'cinque voci nella barra', `${barra?.length}`);

  const centrale = barra?.[2];
  esito(centrale?.tipo === 'spento', 'la voce centrale è spenta, non un collegamento', `${centrale?.tipo}`);
  esito(
    !barra?.some((v) => v.href === '/mobile/voice-intake'),
    'nessun collegamento alla dettatura',
  );
  esito(
    barra?.some((v) => v.testo.toLowerCase().includes('tecnico')),
    'la voce centrale dice che è un profilo da tecnico',
    centrale?.testo ?? '',
  );

  // ── 2. toccandola, spiega ──
  await valuta(cdp, `document.querySelectorAll('nav li button')[0].click(), true`);
  let messaggio = '';
  try {
    await finoA(cdp, `document.body.innerText.includes('capo squadra')`, { timeoutMs: 6000 });
    messaggio = await valuta(
      cdp,
      `[...document.querySelectorAll('div,p')].map(e=>e.textContent).find(t=>t&&t.includes('capo squadra'))?.slice(0,90) ?? ''`,
    );
  } catch { /* resta vuoto */ }
  esito(messaggio.includes('capo squadra'), 'al tocco spiega a chi rivolgersi', messaggio.slice(0, 60));

  // ── 3. le azioni rapide non propongono di aprire lavori ──
  await vaiA(cdp, '/mobile');
  const rapide = await valuta(
    cdp,
    `[...document.querySelectorAll('a[href^="/mobile"]')]
       .filter(a => !a.closest('nav'))
       .map(a => a.getAttribute('href'))`,
  );
  esito(
    !rapide.includes('/mobile/sopralluogo') && !rapide.includes('/mobile/voice-intake'),
    'niente «Sopralluogo» né «Voce» nella home',
    rapide.filter((h) => h.includes('sopralluogo') || h.includes('voice')).join(', ') || 'nessuno',
  );

  // ── 4. l'indirizzo battuto a mano spiega, e NON lascia una pagina bianca ──
  //
  // ⚠️ Il primo tentativo era un `redirect('/mobile')`, e questo controllo lo
  // ha bocciato: sotto un `loading.tsx` l'indirizzo restava quello e lo schermo
  // mostrava solo la barra in basso. Qui si misura che ci sia una spiegazione.
  for (const indirizzo of ['/mobile/voice-intake', '/mobile/sopralluogo']) {
    await vaiA(cdp, indirizzo);
    const testo = await valuta(cdp, 'document.body.innerText');
    const soloBarra = testo.replace(/\s+/g, ' ').trim().length < 80;
    esito(
      !soloBarra && testo.includes('capo squadra'),
      `${indirizzo} spiega invece di lasciare una pagina bianca`,
      soloBarra ? 'PAGINA VUOTA' : testo.replace(/\s+/g, ' ').slice(0, 55),
    );
  }

  // ── 5. dentro una commessa: niente tab File, e il tasto nero c'è ──
  await vaiA(cdp, '/mobile');
  const commessa = await valuta(
    cdp,
    `document.querySelector('a[href^="/mobile/commessa/"]')?.getAttribute('href') ?? null`,
  );
  if (commessa) {
    await vaiA(cdp, commessa);
    const tab = await valuta(
      cdp,
      `[...document.querySelectorAll('[role=tab]')].map(t => t.textContent.trim().slice(0,10))`,
    );
    esito(tab.length === 3, 'tre tab, non quattro', tab.join(' · '));
    esito(
      !tab.some((t) => t.toLowerCase().startsWith('file')),
      'il tab «File» non c’è',
    );
    const nero = await valuta(
      cdp,
      `[...document.querySelectorAll('button')].some(b => b.textContent.includes('Nuovo Da Fare'))`,
    );
    esito(nero, 'il tasto «Nuovo Da Fare» c’è anche per un tecnico');
    const riunione = await valuta(
      cdp,
      `[...document.querySelectorAll('button')].some(b => b.textContent.includes('Riunione AI'))`,
    );
    // ⚠️ Fino all'08/10 questo controllo diceva il contrario: «il tasto non
    // c'è». Era giusto per il codice e sbagliato per il prodotto — e in ogni
    // caso non funzionava per nessun tecnico, perché la RLS di
    // `commessa_riunione` ammetteva solo admin e ufficio: un capo squadra
    // passava il controllo dell'app e veniva fermato dal database.
    esito(riunione, 'il tasto «Riunione AI» c’è per ogni tecnico in squadra');
  } else {
    esito(false, 'nessuna commessa assegnata al tecnico demo', 'non posso provare la scheda');
  }

  // ── 6. console pulita ──
  const errori = await valuta(cdp, 'window.__banco_errori?.length ?? 0');
  esito(errori === 0, 'console pulita', errori ? `${errori} errori` : '');
} finally {
  await chiudi();
}
riepilogo();
