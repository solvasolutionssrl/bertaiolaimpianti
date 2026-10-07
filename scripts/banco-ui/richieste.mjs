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
const INDIRIZZO = 'Via Roma 12, Valeggio sul Mincio';

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
  `[...document.querySelectorAll('div')].find(d => d.className && String(d.className).includes('hover:bg-background/60') && (d.textContent || '').includes(${JSON.stringify(testo)}))`;

/**
 * Una delle due colonne, per nome. ⚠️ Prima le righe si riconoscevano dalla
 * tinta ambra che ognuna portava addosso; adesso la tinta e' della colonna e
 * una riga, da sola, non dice piu' di che tipo e'. Si guarda dove sta.
 */
const colonna = (nome) =>
  `[...document.querySelectorAll('section')].find(s => new RegExp(${JSON.stringify(nome)}, 'i').test(s.querySelector('h2')?.textContent || ''))`;

/** Le righe dentro una colonna. */
const righeDi = (nome) =>
  `[...(${colonna(nome)}?.querySelectorAll('div') ?? [])].filter(d => d.className && String(d.className).includes('hover:bg-background/60'))`;

try {
  console.log(`\n\x1b[1mBanco: Task e richieste (${BASE})\x1b[0m\n`);
  await accedi(cdp, 'kommessa');
  esito(true, 'accesso eseguito come ufficio');

  await vaiA(cdp, '/office/todo');
  await finoA(cdp, `document.querySelectorAll('button').length > 3`, { timeoutMs: 25_000 });

  // ══ 1. registra una telefonata da un cliente che non c'è ═══════════════
  console.log('\n  \x1b[1mLa telefonata di un cliente nuovo\x1b[0m');

  await clicVero(cdp, `[...document.querySelectorAll('button')].filter(b => b.offsetParent !== null).find(b => /al telefono/i.test(b.textContent))`, { attesaMs: 900 });
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

  // Dove bisogna andare: e' la cosa che al tecnico mancava del tutto.
  await scriviIn(`document.querySelector('[role=dialog] #r_dove')`, INDIRIZZO);
  esito(
    (await valuta(cdp, `document.querySelector('[role=dialog] #r_dove')?.value ?? ''`)) === INDIRIZZO,
    'si può dire dove bisogna andare',
  );

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
    // ⭐ Le due cose si leggono ancora, ma con parole formali e **senza la
    // riga vuota**: prima si leggeva «In mano a nessuno» accanto a «Ci va
    // Mario», due modi di dire casalinghi che sembravano smentirsi. In un
    // elenco fitto le icone distinguono i due fatti e le parole stanno nel
    // suggerimento, dove si leggono per intero.
    const titoli = await valuta(cdp, `(() => {
      const d = ${rigaCon(TITOLO)};
      if (!d) return [];
      return [...d.querySelectorAll('[title]')].map(e => e.getAttribute('title'));
    })()`);
    const tutti = titoli.join(' || ');
    esito(/Responsabile:/i.test(tutti), '⭐ la riga dice chi ne risponde', (tutti.match(/Responsabile: [^|·]{0,24}/i) ?? [''])[0]);
    esito(
      /Tecnic[oi] assegnat[oi]:/i.test(tutti),
      '⭐ e dice anche chi ci va, con la parola giusta',
      (tutti.match(/Tecnic[oi] assegnat[oi]: [^|·]{0,24}/i) ?? [''])[0],
    );
    esito(
      !/nessuno/i.test(riga),
      '⭐ e NON scrive «nessuno» accanto a un nome',
      /nessuno/i.test(riga) ? riga.slice(0, 80) : 'nessuna riga vuota',
    );
    // ⭐ Chi ha risposto al telefono. Il campo c'era in tabella su tutte le
    // righe e non si vedeva da nessuna parte fuori dalla scheda di una
    // commessa.
    esito(
      /Registrata da /i.test(tutti),
      '⭐ la riga dice chi l\u2019ha registrata',
      (tutti.match(/Registrata da [^|·]{0,30}/i) ?? [''])[0],
    );
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
    const righe = ${righeDi('Task')};
    if (righe.length === 0) return { quante: 0 };
    return {
      quante: righe.length,
      conManda: righe.filter(d =>
        [...d.querySelectorAll('button[aria-label]')]
          .some(b => /^Manda qualcuno/i.test(b.getAttribute('aria-label') || ''))).length,
      conTecnici: righe.filter(d =>
        [...d.querySelectorAll('[title]')]
          .some(e => /Tecnic[oi] assegnat/i.test(e.getAttribute('title') || ''))).length,
      conAutore: righe.filter(d =>
        [...d.querySelectorAll('[title]')]
          .some(e => /^Creato da /i.test(e.getAttribute('title') || ''))).length,
    };
  })()`);
  esito(suiTask.quante > 0, 'ci sono task di commessa da guardare', `${suiTask.quante}`);
  if (suiTask.quante > 0) {
    esito(suiTask.conManda === 0, '⭐ nessun tasto «Manda…» su un task di commessa', `${suiTask.conManda} su ${suiTask.quante}`);
    esito(suiTask.conTecnici === 0, '⭐ nessun «Tecnici assegnati» su un task di commessa', `${suiTask.conTecnici} su ${suiTask.quante}`);
    esito(
      suiTask.conAutore > 0,
      '⭐ e anche un task dice chi l\u2019ha creato',
      `${suiTask.conAutore} su ${suiTask.quante}`,
    );
  }

  // ══ 2-ter. ⭐ due colonne, non un elenco con le richieste in cima ══════
  //
  // Prima erano un mucchio solo: le richieste stavano sopra perche' ordinate
  // prima, e nessuno poteva sapere se fosse una regola o un caso. Non sono la
  // stessa cosa e non si lavorano allo stesso modo.
  console.log('\n  \x1b[1mDue colonne affiancate\x1b[0m');

  const geo = await valuta(cdp, `(() => {
    const t = ${colonna('Task')};
    const r = ${colonna('Richieste')};
    if (!t || !r) return { ci: false, task: Boolean(t), richieste: Boolean(r) };
    const rt = t.getBoundingClientRect();
    const rr = r.getBoundingClientRect();
    const stile = (el) => {
      const c = el.querySelector('div');
      return c ? getComputedStyle(c).backgroundColor : '';
    };
    return {
      ci: true,
      affiancate: Math.abs(rt.top - rr.top) < 40,
      largoTask: Math.round(rt.width),
      largoRichieste: Math.round(rr.width),
      quotaTask: Math.round((rt.width / (rt.width + rr.width)) * 100),
      sfondoTask: stile(t),
      sfondoRichieste: stile(r),
    };
  })()`);

  esito(geo.ci, 'le due colonne ci sono entrambe', geo.ci ? 'Task + Richieste' : `task=${geo.task} richieste=${geo.richieste}`);
  if (geo.ci) {
    esito(geo.affiancate, '⭐ sono affiancate, non una sopra l\u2019altra', `Task ${geo.largoTask}px · Richieste ${geo.largoRichieste}px`);
    esito(
      geo.quotaTask >= 58 && geo.quotaTask <= 72,
      '⭐ i Task prendono circa due terzi dello spazio',
      `${geo.quotaTask}% / ${100 - geo.quotaTask}%`,
    );
    // Il colore dice che cosa e': blu i lavori, ambra le telefonate. E' lo
    // stesso segnale che le richieste hanno nei badge e sul telefono.
    const tinta = (c) => {
      const m = /rgba?\((\d+), (\d+), (\d+)/.exec(c || '');
      return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
    };
    const tt = tinta(geo.sfondoTask);
    const tr = tinta(geo.sfondoRichieste);
    esito(
      Boolean(tt && tr) && (tt.b > tt.r) && (tr.r > tr.b),
      '⭐ la tinta distingue le colonne: blu i task, ambra le richieste',
      `${geo.sfondoTask} vs ${geo.sfondoRichieste}`,
    );
  }

  // ══ 3. il cliente è finito in anagrafica ═══════════════════════════════
  console.log('\n  \x1b[1mIl cliente in anagrafica\x1b[0m');

  await clicVero(cdp, `[...document.querySelectorAll('button')].filter(b => b.offsetParent !== null).find(b => /al telefono/i.test(b.textContent))`, { attesaMs: 900 });
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

  const cerchietto = `${rigaCon(TITOLO)}?.querySelector('button[aria-label^="Segna come fatt"]')`;
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
    return d ? Boolean(d.querySelector('button[aria-label^="Segna come fatt"]')) : false;
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

  // ══ ⭐ la scheda della richiesta ════════════════════════════════════════
  //
  // ⚠️ Finora una richiesta era l'unica cosa dell'elenco che non si potesse
  // aprire: niente indirizzo, niente di cio' che era stato detto al telefono.
  const apreScheda = await clicVero(
    cdp,
    `[...document.querySelectorAll('[data-blocco-lavoro] a[href^="/mobile/richiesta/"]')]
       .find(a => (a.textContent || '').includes(${JSON.stringify(TITOLO)}))`,
    { attesaMs: 1500 },
  );
  esito(apreScheda.fatto, '⭐ la richiesta si apre dall’elenco', apreScheda.perche ?? '');

  if (apreScheda.fatto) {
    await finoA(cdp, `location.pathname.startsWith('/mobile/richiesta/')`, { timeoutMs: 15_000 }).catch(() => {});
    await attendi(900);
    const scheda = await valuta(cdp, `(() => {
      const h = document.querySelector('h1');
      const hero = h ? h.closest('[class*="bg-accent"]') : null;
      const scrim = [...document.querySelectorAll('div[aria-hidden="true"]')]
        .filter(d => d.className && String(d.className).includes('fixed') && String(d.className).includes('top-0'));
      const colori = scrim.map(d => getComputedStyle(d).backgroundColor);
      const testo = document.body.textContent || '';
      return {
        titolo: h ? h.textContent.trim() : null,
        heroArancione: Boolean(hero),
        sfondoHero: hero ? getComputedStyle(hero).backgroundColor : null,
        coloriStriscia: colori,
        vedeCliente: testo.includes(${JSON.stringify(CLIENTE)}),
        vedeIndirizzo: testo.includes('Via Roma 12'),
        tastoMappa: Boolean([...document.querySelectorAll('a')].find(a => /google\\.com\\/maps/.test(a.href))),
        tastoChiama: Boolean([...document.querySelectorAll('a')].find(a => a.href.startsWith('tel:'))),
        tastoFatta: Boolean([...document.querySelectorAll('button')].find(b => /segna come fatta/i.test(b.textContent))),
        sbordo: document.documentElement.scrollWidth - innerWidth,
      };
    })()`);
    esito(scheda.titolo === TITOLO, 'la scheda mostra la richiesta giusta', scheda.titolo ?? '—');
    esito(scheda.heroArancione, '⭐ l’intestazione è arancione, non blu', scheda.sfondoHero ?? '—');
    esito(
      Array.isArray(scheda.coloriStriscia) &&
        scheda.coloriStriscia.length > 0 &&
        scheda.coloriStriscia.some((c) => c === scheda.sfondoHero),
      '⚠️ e la striscia dietro l’isola è dello stesso colore',
      Array.isArray(scheda.coloriStriscia) ? scheda.coloriStriscia.join(' | ') : '—',
    );
    esito(scheda.vedeCliente, '⭐ si vede per chi è', scheda.vedeCliente ? '' : 'cliente assente');
    esito(scheda.vedeIndirizzo, '⭐ si vede DOVE bisogna andare');
    esito(scheda.tastoMappa, 'c’è il collegamento alla mappa');
    esito(scheda.tastoChiama, 'c’è il tasto per chiamare');
    esito(scheda.tastoFatta, 'c’è il tasto per segnarla fatta');
    esito(scheda.sbordo <= 1, 'la scheda non sborda di lato', `${scheda.sbordo}px`);
  }

  // ══ ⭐ l'avviso dice di cosa si tratta ═════════════════════════════════
  await vaiA(cdp, '/mobile/notifiche');
  await finoA(cdp, `document.querySelectorAll('button').length > 2`, { timeoutMs: 20_000 });
  await attendi(900);
  const avviso = await valuta(cdp, `(() => {
    const righe = [...document.querySelectorAll('button')]
      .filter(b => /affidat/i.test(b.textContent || ''));
    if (righe.length === 0) return { trovato: false };
    const t = (righe[0].textContent || '').split(/[\\s]+/).join(' ');
    return { trovato: true, testo: t.slice(0, 150) };
  })()`);
  esito(avviso.trovato, 'l’avviso è arrivato', avviso.testo ?? '');
  if (avviso.trovato) {
    esito(
      avviso.testo.includes(TITOLO),
      '⭐ l’avviso dice COSA, già nell’elenco',
      avviso.testo,
    );
    esito(avviso.testo.includes(CLIENTE), '⭐ e PER CHI');
    esito(avviso.testo.includes('Via Roma 12'), '⭐ e DOVE');
  }

  // Il tasto deve portare sulla scheda, non in un elenco di venti righe.
  await clicVero(cdp, `[...document.querySelectorAll('button')].find(b => /affidat/i.test(b.textContent || ''))`, { attesaMs: 900 });
  const vai = await valuta(cdp, `(() => {
    const b = [...document.querySelectorAll('button')].find(x => /apri la richiesta|vedi cosa fare|apri la commessa/i.test(x.textContent || ''));
    return b ? b.textContent.trim() : null;
  })()`);
  esito(vai === 'Apri la richiesta', '⭐ il tasto dice dove porta', vai ?? 'nessun tasto');
  if (vai) {
    await clicVero(cdp, `[...document.querySelectorAll('button')].find(x => /apri la richiesta/i.test(x.textContent || ''))`, { attesaMs: 1800 });
    const dove = await valuta(cdp, `location.pathname`);
    esito(dove.startsWith('/mobile/richiesta/'), '⭐ e porta sulla richiesta, non su un elenco', dove);
  }

  // Si torna all'elenco per chiudere la richiesta.
  await vaiA(cdp, '/mobile');
  await finoA(cdp, `document.querySelectorAll('[data-blocco-lavoro]').length > 0`, { timeoutMs: 25_000 }).catch(() => {});
  await attendi(700);

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
