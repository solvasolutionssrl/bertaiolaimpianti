/**
 * Client CDP minimale (nessuna dipendenza: Node 24 ha WebSocket globale).
 * Serve a guidare Chrome come farebbe Puppeteer, che qui non è installato.
 */

export async function connetti(porta) {
  // /json/list può impiegare un attimo a esporre il target della pagina.
  let ws = null;
  for (let i = 0; i < 60 && !ws; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${porta}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page');
      if (page) ws = page.webSocketDebuggerUrl;
    } catch {
      /* Chrome non è ancora su */
    }
    if (!ws) await new Promise((r) => setTimeout(r, 250));
  }
  if (!ws) throw new Error('nessun target "page" su Chrome');

  const sock = new WebSocket(ws);
  await new Promise((res, rej) => {
    sock.addEventListener('open', res, { once: true });
    sock.addEventListener('error', rej, { once: true });
  });

  let id = 0;
  const attese = new Map();
  const ascoltatori = new Map();

  sock.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id != null) {
      const a = attese.get(msg.id);
      if (a) {
        attese.delete(msg.id);
        msg.error ? a.rej(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? '')})`)) : a.res(msg.result);
      }
      return;
    }
    for (const fn of ascoltatori.get(msg.method) ?? []) fn(msg.params);
  });

  return {
    invia(method, params = {}) {
      const mio = ++id;
      sock.send(JSON.stringify({ id: mio, method, params }));
      return new Promise((res, rej) => attese.set(mio, { res, rej }));
    },
    su(evento, fn) {
      if (!ascoltatori.has(evento)) ascoltatori.set(evento, []);
      ascoltatori.get(evento).push(fn);
    },
    chiudi() {
      sock.close();
    },
  };
}

/** Valuta JS nella pagina e ritorna il valore. */
export async function valuta(cdp, espressione, attendiPromise = false) {
  const r = await cdp.invia('Runtime.evaluate', {
    expression: espressione,
    returnByValue: true,
    awaitPromise: attendiPromise,
  });
  if (r.exceptionDetails) {
    throw new Error(`JS: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
  }
  return r.result.value;
}

/** Aspetta che una condizione JS diventi vera. */
export async function finoA(cdp, espressione, { timeoutMs = 30_000, ogniMs = 150, cosa = espressione } = {}) {
  const scadenza = Date.now() + timeoutMs;
  for (;;) {
    let ok = false;
    try {
      ok = await valuta(cdp, `!!(${espressione})`);
    } catch {
      ok = false; // pagina in navigazione: si riprova
    }
    if (ok) return true;
    if (Date.now() > scadenza) throw new Error(`timeout aspettando: ${cosa}`);
    await new Promise((r) => setTimeout(r, ogniMs));
  }
}

export const b64 = (s) => Buffer.from(s).toString('base64');
