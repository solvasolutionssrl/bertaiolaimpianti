/**
 * Finto R2: un server HTTP vero, che consuma il corpo LENTAMENTE.
 *
 * Serve perché intercettando i PUT dal protocollo di debug il corpo non viene
 * mai trasmesso: `xhr.upload.onprogress` non scatta e il progresso — cioè
 * proprio la cosa da collaudare — non esiste. Con un server vero gli eventi di
 * avanzamento sono quelli veri, e si può anche far cadere la connessione a
 * metà parte, come una rete di cantiere.
 */
import http from 'node:http';

export function avviaFintoR2({ porta = 3011, velocitaMBs = 8 } = {}) {
  const stato = {
    parti: [], // { fr, n, byte, esito }
    fallimenti: new Map(), // "fr#n" → quante volte ancora far cadere
    velocitaMBs,
  };

  const cors = (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'PUT, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', 'ETag');
  };

  const server = http.createServer((req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    const url = new URL(req.url, 'http://finto');
    const fr = url.searchParams.get('fr') ?? '?';
    const n = Number(url.searchParams.get('n') ?? 0);
    const nome = url.searchParams.get('f') ?? '';
    const chiave = `${nome}#${n}`;
    const daFar_cadere = (stato.fallimenti.get(chiave) ?? 0) > 0;

    let ricevuti = 0;
    const byteAlSecondo = stato.velocitaMBs * 1024 * 1024;

    req.on('data', (chunk) => {
      ricevuti += chunk.length;
      // Caduta di rete a metà parte: è il caso che ha fatto emergere il bug.
      if (daFar_cadere && ricevuti > 3 * 1024 * 1024 && !res.headersSent) {
        stato.fallimenti.set(chiave, stato.fallimenti.get(chiave) - 1);
        stato.parti.push({ fr, n, nome, byte: ricevuti, esito: 'errore-500' });
        // Risposta vera, non socket buttato giù: Chrome ritenta da solo una
        // connessione caduta prima della risposta, e l'app non vedrebbe nulla.
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('errore del deposito');
        return;
      }
      // Freno: senza, su localhost 10 MB volano via senza eventi intermedi.
      req.pause();
      setTimeout(() => req.resume(), (chunk.length / byteAlSecondo) * 1000);
    });

    req.on('end', () => {
      if (res.headersSent) return; // già risposto 500 a metà corpo
      stato.parti.push({ fr, n, nome, byte: ricevuti, esito: 'ok' });
      res.setHeader('ETag', `"etag-${fr}-${n}"`);
      res.writeHead(200);
      res.end('');
    });

    req.on('error', () => {
      /* connessione chiusa da noi */
    });
  });

  server.listen(porta, '127.0.0.1');
  return { server, stato };
}
