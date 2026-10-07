/**
 * Banco: la board «Task e richieste», il giro che fa l'ufficio ogni giorno.
 *
 * Misura le quattro cose chieste dopo la riunione con la squadra:
 *
 *  1. ⭐ **La doppia assegnazione.** La segretaria affida la richiesta a un
 *     caposquadra (un account d'ufficio), lui manda uno o più tecnici, e la
 *     riga deve dire tutte e due le cose: chi ne risponde e chi ci va.
 *  2. **Il cliente nuovo** si registra al telefono, e finisce davvero in
 *     anagrafica: si verifica ricercandolo da un secondo modulo.
 *  5. **Spuntare chiede conferma**, e dicendo di no non succede niente — che
 *     è la metà che di solito non si prova.
 *  6. **Eliminare si può**, con conferma.
 *
 * ⚠️ **Scrive sul tenant demo e si ripulisce da solo**: la richiesta e la
 * scheda cliente create qui vengono cancellate in coda. Se il banco si
 * interrompe a metà restano, col prefisso «BANCO» nel nome.
 *
 * ⚠️ Si tocca con `clicVero`, mai con `elemento.click()`: una chiamata al DOM
 * ignora `pointer-events`, e questa pagina è piena di tendine portate su
 * `body` dentro dialog modali — esattamente il caso in cui un banco mente.
 *
 *   node scripts/banco-ui/richieste.mjs
 *   BANCO_VISIBILE=1 node scripts/banco-ui/richieste.mjs
 */
import {
  apriChrome, vaiA, valuta, finoA, esito, riepilogo, accedi, foto, BASE,
  clicVero, scriviVero, premiTasto,
} from './comune.mjs';

const { cdp, chiudi } = await apriChrome({ mobile: false, larghezza: 1440 });
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

/** Un nome riconoscibile: se qualcosa resta, si sa cos'è e da dove viene. */
const MARCA = `BANCO ${Date.now().toString().slice(-6)}`;
const TITOLO = `${MARCA} prova richiesta`;
const CLIENTE = `${MARCA} Cliente`;

/** Il tecnico del mondo commesse: su di lui si prova la seconda mano. */
const TECNICO = { email: 'marco@demok.kommessa.local', password: 'Demo2026!' };
const TECNICO_NOME = 'Marco';

/** Entra con credenziali esplicite (il tecnico non sta in ACCESSI). */
async function accediCon(cdp, { email, password }) {
  await vaiA(cdp, '/login');
  await finoA(cdp, `document.querySelector('input[name=email]')`, { cosa: 'campo email' });
  await valuta(cdp, `(() => {
    const set = (el, v) => {
      const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value');
      d.set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set(document.querySelector('input[name=email]'), ${JSON.stringify(email)});
    set(document.querySelector('input[name=password]'), ${JSON.stringify(password)});
    document.querySelector('form button[type=submit]').click();
    return 1;
  })()`);
  await finoA(cdp, `!location.pathname.startsWith('/login')`, { timeoutMs: 40_000 });
  await finoA(cdp, `document.readyState === 'complete'`, { timeoutMs: 30_000 });
}

/** Scrive in un campo trovato per etichetta o segnaposto, col dito e la tastiera. */
async function scriviIn(espressione, testo) {
  const c = await clicVero(cdp, espressione, { attesaMs: 200 });
  if (!c.fatto) return c;
  await scriviVero(cdp, testo);
  await attendi(150);
  return { fatto: true };
}

/** Il tasto di un dialog, per testo. */
const tastoDialog = (re) =>
  `[...document.querySelectorAll('[role=dialog] button')].filter(b => b.offsetParent !== null).find(b => new RegExp(${JSON.stringify(re)}, 'i').test(b.textContent))`;

/** La riga della board che contiene un certo testo. */
const rigaCon = (testo) =>
  `[...document.querySelectorAll('div')].find(d => d.className && String(d.className).includes('hover:bg-muted/30') && (d.textContent || '').includes(${JSON.stringify(testo)}))`;

try {
  console.log(`\n\x1b[1mBanco: Task e richieste (${BASE})\x1b[0m\n`);
  await accedi(cdp, 'kommessa');
  esito(true, 'accesso eseguito come ufficio');

  await vaiA(cdp, '/office/todo');
  await finoA(cdp, `document.querySelectorAll('button').length > 3`, { timeoutMs: 25_000 });

  // ══ 1. registra una telefonata da un cliente che non c'è ═══════════════
  console.log('\n  \x1b[1mLa telefonata di un cliente nuovo\x1b[0m');

  await clicVero(cdp, `[...document.querySelectorAll('button')].filter(b => b.offsetParent !== null).find(b => /richiesta al telefono/i.test(b.textContent))`, { attesaMs: 900 });
  esito(
    await valuta(cdp, `Boolean(document.querySelector('[role=dialog]'))`),
    'il modulo della telefonata si apre',
  );

  await scriviIn(`document.querySelector('[role=dialog] #r_titolo')`, TITOLO);

  // Il cliente: si cerca, non si trova, si compila la scheda.
  const campoCliente = `[...document.querySelectorAll('[role=dialog] input')].find(i => /nome del cliente/i.test(i.getAttribute('placeholder') || ''))`;
  await scriviIn(campoCliente, CLIENTE);
  await attendi(900);

  const nuovo = await clicVero(cdp, tastoDialog('cliente nuovo|^crea «|crea «'), { attesaMs: 600 });
  esito(nuovo.fatto, '⭐ si può dire «è un cliente nuovo»', nuovo.perche ?? '');

  if (nuovo.fatto) {
    // ⭐ Gli stessi sei campi del modulo «nuova commessa», e senza passi in
    // mezzo: c'era un «è una persona o un'azienda?» che adesso è il secondo
    // campo della scheda, come nel modulo della commessa.
    const campi = await valuta(cdp, `[...document.querySelectorAll('[role=dialog] label')].map(l => l.textContent.trim())`);
    const attesi = ['Tipo', 'Indirizzo', 'Citt', 'Telefono', 'Email'];
    const mancanti = attesi.filter((a) => !campi.some((c) => c.toLowerCase().startsWith(a.toLowerCase())));
    esito(
      mancanti.length === 0,
      '⭐ la scheda ha gli stessi campi del modulo «nuova commessa»',
      mancanti.length === 0 ? campi.slice(1, 7).join(' · ') : `mancano: ${mancanti.join(', ')}`,
    );

    const tel = `(() => {
      const lab = [...document.querySelectorAll('[role=dialog] label')].find(l => /^telefono$/i.test(l.textContent.trim()));
      return lab ? document.getElementById(lab.getAttribute('for')) : null;
    })()`;
    await scriviIn(tel, '3401234567');
  }

  // Chi se ne occupa: la prima persona dell'elenco.
  const comboOccupa = `[...document.querySelectorAll('[role=dialog] button[aria-haspopup=listbox]')].filter(b => b.offsetParent !== null)[0]`;
  await clicVero(cdp, comboOccupa, { attesaMs: 600 });
  const sceltoOccupa = await valuta(cdp, `(() => {
    const p = document.querySelector('[data-popover-portale]');
    const v = p && (p.querySelector('[data-indice="1"]') || p.querySelector('[data-indice="0"]'));
    return v ? v.textContent.trim().split('\\n')[0] : '';
  })()`);
  await clicVero(cdp, `document.querySelector('[data-popover-portale] [data-indice="1"]') || document.querySelector('[data-popover-portale] [data-indice="0"]')`, { attesaMs: 500 });
  esito(sceltoOccupa.length > 0, 'si sceglie chi se ne occupa', sceltoOccupa);

  // Chi ci va: la tendina multipla, che e' il pezzo nuovo. Si sceglie **il
  // tecnico**, non la prima voce: piu' avanti si entra come lui e si controlla
  // che la richiesta gli sia arrivata davvero.
  const comboVa = `[...document.querySelectorAll('[role=dialog] button[aria-haspopup=listbox]')].filter(b => b.offsetParent !== null).slice(-1)[0]`;
  await clicVero(cdp, comboVa, { attesaMs: 600 });
  const voceTecnico = `[...document.querySelectorAll('[data-popover-portale] [data-indice]')].find(v => /${TECNICO_NOME}/i.test(v.textContent))`;
  const sceltoVa = await valuta(cdp, `(() => { const v = ${voceTecnico}; return v ? v.textContent.trim().split('\\n')[0] : ''; })()`);
  const okVa = await clicVero(cdp, voceTecnico, { attesaMs: 500 });
  esito(okVa.fatto && sceltoVa.length > 0, '⭐ si può mandare qualcuno: «Chi ci va»', sceltoVa || (okVa.perche ?? ''));
  // ⚠️ La tendina multipla si chiude col suo «Fatto», non con Escape: Escape
  // arriverebbe al dialog sotto e chiuderebbe il modulo intero, buttando via
  // quello che si e' appena compilato. Il banco ci e' cascato.
  await clicVero(cdp, `[...document.querySelectorAll('[data-popover-portale] button')].find(b => /fatto/i.test(b.textContent))`, { attesaMs: 500 });
  const dialogVivo = await valuta(cdp, `Boolean(document.querySelector('[role=dialog]'))`);
  esito(dialogVivo, 'scegliendo chi ci va il modulo non si chiude');

  const salva = await clicVero(cdp, tastoDialog('registra richiesta'), { attesaMs: 2500 });
  esito(salva.fatto, 'la richiesta si registra', salva.perche ?? '');
  await finoA(cdp, `!document.querySelector('[role=dialog]')`, { timeoutMs: 15_000, cosa: 'chiusura del modulo' }).catch(() => {});
  await attendi(1200);

  // ══ 2. la riga dice tutte e due le cose ════════════════════════════════
  console.log('\n  \x1b[1mLa riga: in mano a, e chi ci va\x1b[0m');

  const riga = await valuta(cdp, `(() => {
    const d = ${rigaCon(TITOLO)};
    return d ? (d.textContent || '').replace(/[ \\t\\n\\r]+/g, ' ').trim() : null;
  })()`);
  esito(Boolean(riga), 'la richiesta compare nella board', riga ? riga.slice(0, 70) : 'NON TROVATA');
  if (riga) {
    esito(/in mano a/i.test(riga), '⭐ la riga dice chi ne risponde', (riga.match(/In mano a [^·]{0,24}/i) ?? [''])[0]);
    esito(/ci v[ae]/i.test(riga), '⭐ e dice anche chi ci va', (riga.match(/Ci v[ae] [^·]{0,24}/i) ?? [''])[0]);
  }

  // ══ 2-bis. ⭐ sui task di commessa la catena doppia NON c'è ════════════
  //
  // ⚠️ Per mezza giornata c'è stata anche lì, ed era troppo: dentro una
  // commessa il lavoro ha gia' la sua squadra e la cosa da fare ha un
  // assegnatario solo. Un campo che esiste dove non serve non e' neutro: e'
  // una domanda in piu' a cui qualcuno prova a rispondere, e una seconda
  // verita' su «chi se ne occupa» dove ce n'era una sola e chiara.
  // ⚠️ `\\d` e non `\d`: questo codice viaggia dentro un template literal, e
  // li' `\d` vale la lettera «d». La prima versione cercava «DEMOK-d2-d3»,
  // non trovava nessuna riga, e dichiarava «0 task di commessa» su una board
  // che ne aveva trentaquattro. E' la stessa trappola gia' scritta in cima a
  // `elenco-commesse.mjs`, e ci sono ricascato lo stesso.
  console.log('\n  \x1b[1mSui task di commessa, niente seconda mano\x1b[0m');

  const suiTask = await valuta(cdp, `(() => {
    const righe = [...document.querySelectorAll('div')]
      .filter(d => d.className && String(d.className).includes('hover:bg-muted/30'));
    // Una riga di task di commessa si riconosce dal codice commessa e
    // dall'assenza del badge «Richiesta».
    const diCommessa = righe.filter(d => {
      const t = d.textContent || '';
      return !/Richiesta/.test(t) && /[A-Z]{2,}-\\d{2}-\\d{3}/.test(t);
    });
    if (diCommessa.length === 0) return { quante: 0 };
    return {
      quante: diCommessa.length,
      conManda: diCommessa.filter(d =>
        [...d.querySelectorAll('button[aria-label]')]
          .some(b => /^Manda qualcuno/i.test(b.getAttribute('aria-label') || ''))).length,
      conCiVa: diCommessa.filter(d => /Ci v[ae] /.test(d.textContent || '')).length,
      conInManoA: diCommessa.filter(d => /In mano a/.test(d.textContent || '')).length,
    };
  })()`);
  esito(suiTask.quante > 0, 'ci sono task di commessa da guardare', `${suiTask.quante}`);
  if (suiTask.quante > 0) {
    esito(suiTask.conManda === 0, '⭐ nessun tasto «Manda…» su un task di commessa', `${suiTask.conManda} su ${suiTask.quante}`);
    esito(suiTask.conCiVa === 0, '⭐ nessuna riga «Ci va…» su un task di commessa', `${suiTask.conCiVa} su ${suiTask.quante}`);
    esito(suiTask.conInManoA === 0, 'e nemmeno «In mano a»: lì si dice solo il nome', `${suiTask.conInManoA} su ${suiTask.quante}`);
  }

  // ══ 3. il cliente è finito in anagrafica ═══════════════════════════════
  console.log('\n  \x1b[1mIl cliente in anagrafica\x1b[0m');

  await clicVero(cdp, `[...document.querySelectorAll('button')].filter(b => b.offsetParent !== null).find(b => /richiesta al telefono/i.test(b.textContent))`, { attesaMs: 900 });
  await scriviIn(campoCliente, CLIENTE);
  await attendi(1400);
  const trovato = await valuta(cdp, `(() => {
    const t = document.querySelector('[role=dialog]')?.textContent ?? '';
    return t.includes(${JSON.stringify(CLIENTE)}) && !/non è in anagrafica|cliente nuovo/i.test(t.split(${JSON.stringify(CLIENTE)})[1] ?? '');
  })()`);
  const elenco = await valuta(cdp, `[...document.querySelectorAll('[role=dialog] ul li button')].map(l => l.textContent.trim()).join(' | ').slice(0, 120)`);
  esito(
    typeof elenco === 'string' && elenco.includes(CLIENTE),
    '⭐ la scheda cliente è stata creata davvero, e si ritrova cercandola',
    elenco ? elenco.slice(0, 70) : `trovato=${trovato}`,
  );
  await premiTasto(cdp, 'Escape', { attesaMs: 700 });
  await clicVero(cdp, tastoDialog('annulla'), { attesaMs: 700 });

  // ══ 4. spuntare chiede, e dire di no non fa niente ═════════════════════
  console.log('\n  \x1b[1mSpuntare, e dire di no\x1b[0m');

  const cerchietto = `${rigaCon(TITOLO)}?.querySelector('button[aria-label="Completa TODO"]')`;
  const c1 = await clicVero(cdp, cerchietto, { attesaMs: 700 });
  esito(c1.fatto, 'il cerchietto per spuntare c’è', c1.perche ?? '');

  const chiesto = await valuta(cdp, `(() => {
    const d = document.querySelector('[role=alertdialog], [role=dialog]');
    return d ? (d.textContent || '').replace(/[ \\t\\n\\r]+/g, ' ').trim().slice(0, 90) : null;
  })()`);
  esito(
    Boolean(chiesto) && /fatta|complet/i.test(chiesto),
    '⭐ spuntare chiede conferma invece di farlo e basta',
    chiesto ?? 'NESSUNA DOMANDA',
  );

  await clicVero(cdp, tastoDialog('annulla'), { attesaMs: 800 });
  const ancoraAperta = await valuta(cdp, `(() => {
    const d = ${rigaCon(TITOLO)};
    return d ? Boolean(d.querySelector('button[aria-label="Completa TODO"]')) : false;
  })()`);
  esito(
    ancoraAperta,
    '⭐ dicendo di no non si spunta niente',
    ancoraAperta ? 'resta da fare' : 'SPUNTATA LO STESSO',
  );

  // ══ 4-bis. ⭐ il tecnico vede quello su cui l'hanno mandato ════════════
  //
  // Questo e' il pezzo che attraversa la RLS: la richiesta non e' assegnata a
  // lui (ne risponde il caposquadra) e non ha una commessa a cui appoggiarsi,
  // quindi l'unica strada perche' compaia e' la squadra. Senza questo
  // controllo si starebbe solo guardando la schermata di chi l'ha scritta.
  console.log('\n  \x1b[1mDall\'altra parte: il tecnico\x1b[0m');

  await accediCon(cdp, TECNICO);
  await vaiA(cdp, '/mobile');
  await finoA(cdp, `document.querySelectorAll('[data-blocco-lavoro]').length > 0`, {
    timeoutMs: 25_000,
    cosa: 'l elenco del tecnico',
  }).catch(() => {});
  await attendi(700);

  const vistaDalTecnico = await valuta(cdp, `document.body.textContent.includes(${JSON.stringify(TITOLO)})`);
  esito(vistaDalTecnico, '⭐ il tecnico vede la richiesta su cui l’hanno mandato');

  const doveSta = await valuta(cdp, `(() => {
    const b = [...document.querySelectorAll('[data-blocco-lavoro]')]
      .find(s => (s.textContent || '').includes(${JSON.stringify(TITOLO)}));
    return b ? b.getAttribute('data-blocco-lavoro') : null;
  })()`);
  esito(
    doveSta === 'senza-commessa',
    'e sta nel blocco «senza commessa», non in mezzo ai lavori',
    doveSta ?? 'non trovata in nessun blocco',
  );

  // ⭐ E deve poterla **chiudere**. Una richiesta e' l'unica cosa da fare che
  // non ha una pagina dove aprirla: senza un tasto qui, chi ci era andato non
  // aveva modo di dire che era fatta.
  const cerchiettoTecnico = `(() => {
    const b = [...document.querySelectorAll('[data-blocco-lavoro] button[aria-label]')]
      .filter(x => /fatta/i.test(x.getAttribute('aria-label') || ''));
    return b.find(x => {
      const riga = x.closest('div');
      return riga && (riga.textContent || '').includes(${JSON.stringify(TITOLO)});
    }) ?? null;
  })()`;
  const spunta = await clicVero(cdp, cerchiettoTecnico, { attesaMs: 800 });
  esito(spunta.fatto, '⭐ dal telefono la richiesta si può chiudere', spunta.perche ?? '');

  if (spunta.fatto) {
    const domanda = await valuta(cdp, `(() => {
      const d = document.querySelector('[role=dialog], [role=alertdialog]');
      return d ? (d.textContent || '').split(/[\\s]+/).join(' ').trim().slice(0, 70) : null;
    })()`);
    esito(Boolean(domanda) && /fatta/i.test(domanda), 'e chiede conferma anche qui', domanda ?? 'NESSUNA DOMANDA');
    await clicVero(cdp, `[...document.querySelectorAll('[role=dialog] button, [role=alertdialog] button')].find(b => /è fatta/i.test(b.textContent))`, { attesaMs: 1500 });
    // ⚠️ Si guarda l'ELENCO, non tutta la pagina: il titolo resta nel dialog
    // di conferma finche' quello e' a schermo, e il banco dichiarava fallita
    // una chiusura riuscita. E' la seconda volta oggi.
    const sparita = await finoA(
      cdp,
      `![...document.querySelectorAll('[data-blocco-lavoro]')]
         .some(s => (s.textContent || '').includes(${JSON.stringify(TITOLO)}))`,
      { timeoutMs: 15_000, cosa: 'la richiesta chiusa' },
    ).then(() => true).catch(() => false);
    esito(sparita, '⭐ chiusa, sparisce dalle sue cose da fare');
  }

  // Si torna in ufficio per chiudere il giro.
  // ⚠️ Fra le COMPLETATE: il tecnico l'ha appena chiusa, e la board di
  // partenza mostra solo cio' che e' aperto. (Che e' anche la prova che la
  // chiusura dal telefono e' arrivata fino al database.)
  await accediCon(cdp, { email: 'demo@demok.kommessa.local', password: 'Demo2026!' });
  await vaiA(cdp, '/office/todo?stato=completato');
  await finoA(cdp, `document.querySelectorAll('button').length > 3`, { timeoutMs: 25_000 });
  await attendi(500);

  // ══ 5. eliminare, con conferma ═════════════════════════════════════════
  console.log('\n  \x1b[1mEliminare\x1b[0m');

  const cestino = `${rigaCon(TITOLO)}?.querySelector('button[aria-label^="Elimina"]')`;
  const e1 = await clicVero(cdp, cestino, { attesaMs: 700 });
  esito(e1.fatto, '⭐ dalla board si può eliminare una richiesta', e1.perche ?? '');

  const chiestoDel = await valuta(cdp, `(() => {
    const d = document.querySelector('[role=alertdialog], [role=dialog]');
    return d ? (d.textContent || '').replace(/[ \\t\\n\\r]+/g, ' ').trim().slice(0, 120) : null;
  })()`);
  esito(
    Boolean(chiestoDel) && /elimin/i.test(chiestoDel),
    'anche eliminare chiede conferma',
    chiestoDel ?? 'NESSUNA DOMANDA',
  );

  await clicVero(cdp, tastoDialog('^elimina$'), { attesaMs: 1200 });
  // ⚠️ Si ASPETTA che sparisca, non si fotografa un istante dopo il clic: la
  // pagina si ricarica dal server e ci mette il suo. La prima versione dava
  // rosso su una riga che il database aveva gia' cancellato — verificato
  // contandole: zero. Un banco che fotografa troppo presto inventa guasti.
  const sparita = await finoA(
    cdp,
    // ⚠️ Si guarda la RIGA, non tutta la pagina: il titolo compare anche nel
    // dialog di conferma, e finche' quello e' a schermo il testo c'e'.
    `!${rigaCon(TITOLO)}`,
    { timeoutMs: 12_000, cosa: 'la sparizione della richiesta' },
  ).then(() => true).catch(() => false);
  const dove = sparita
    ? ''
    : await valuta(cdp, `(() => {
        const d = document.querySelector('[role=dialog]');
        return d ? 'c e ancora un dialog aperto' : 'la riga e rimasta nella board';
      })()`);
  esito(sparita, 'la richiesta è sparita dalla board', dove);

  // ══ pulizia: la scheda cliente creata dal banco ════════════════════════
  // La ricerca dei clienti e' un modulo GET: si va diretti all'indirizzo
  // invece di simulare la pressione di Invio.
  await vaiA(cdp, `/office/clienti?q=${encodeURIComponent(MARCA)}`);
  await finoA(cdp, `document.querySelectorAll('button[aria-label="Azioni"]').length > 0`, {
    timeoutMs: 20_000,
    cosa: 'la riga del cliente creato dal banco',
  }).catch(() => {});
  const azioni = await clicVero(cdp, `[...document.querySelectorAll('button[aria-label="Azioni"]')][0]`, { attesaMs: 700 });
  const voci = await valuta(cdp, `[...document.querySelectorAll('[role=menuitem]')].map(m => m.textContent.trim()).join(' | ')`);
  const vElimina = await clicVero(cdp, `[...document.querySelectorAll('[role=menuitem]')].find(m => /elimina/i.test(m.textContent))`, { attesaMs: 900 });
  const domanda = await valuta(cdp, `(document.querySelector('[role=dialog], [role=alertdialog]')?.textContent ?? '').slice(0, 60)`);
  const conferma = await clicVero(cdp, `[...document.querySelectorAll('[role=dialog] button, [role=alertdialog] button')].find(b => /^elimina$/i.test(b.textContent.trim()))`, { attesaMs: 2000 });
  if (!azioni.fatto || !vElimina.fatto || !conferma.fatto) {
    console.log(`     \x1b[2mdiagnosi: azioni=${azioni.fatto} voci=[${voci}] elimina=${vElimina.fatto} domanda="${domanda}" conferma=${conferma.fatto} ${conferma.perche ?? ''}\x1b[0m`);
  }
  // ⚠️ Si guarda se la RIGA e' sparita, non se il nome compare da qualche
  // parte nella pagina: il nome resta nella casella di ricerca e nel messaggio
  // «nessun risultato per…», e il banco dichiarava fallita una pulizia
  // riuscita. Verificato sui dati: le righe c'erano state tolte davvero.
  await attendi(900);
  const pulito = await valuta(
    cdp,
    `document.querySelectorAll('button[aria-label="Azioni"]').length === 0`,
  );
  esito(pulito, 'il banco ha ripulito la scheda cliente che aveva creato', pulito ? '' : `DA TOGLIERE A MANO: «${CLIENTE}»`);
} catch (e) {
  esito(false, 'il banco si è interrotto', String(e).slice(0, 200));
  try { await foto(cdp, 'richieste-interrotto'); } catch {}
  console.log(`\n  \x1b[33mSe qualcosa è rimasto sul demo, cerca «${MARCA}».\x1b[0m`);
} finally {
  riepilogo();
  await chiudi();
}
