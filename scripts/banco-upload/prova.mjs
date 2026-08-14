/**
 * Banco di prova dell'area upload, guidando Chrome emulato iPhone.
 *
 * Le chiamate /api/upload/* e il "finto R2" sono intercettate: nessun byte
 * tocca la produzione. Quello che si esercita è il codice VERO del client —
 * MediaAttachSection, preparaMedia, UploadQueueProvider, engine, IndexedDB.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connetti, valuta, finoA, b64 } from './cdp.mjs';
import { avviaFintoR2 } from './finto-r2.mjs';

const TEMP = path.join(os.tmpdir(), 'kommessa-banco-upload');
const MEDIA = path.join(TEMP, 'media');
const PORTA_CDP = 9333;
const APP = process.env.APP_URL ?? 'http://127.0.0.1:3010';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const PART_SIZE = 10 * 1024 * 1024;
const R2 = 'http://127.0.0.1:3011';
const { server: srvR2, stato: r2 } = avviaFintoR2({ porta: 3011, velocitaMBs: 8 });

const esiti = [];
const ok = (nome, dettaglio = '') => esiti.push({ ok: true, nome, dettaglio });
const ko = (nome, dettaglio = '') => esiti.push({ ok: false, nome, dettaglio });
const controlla = (nome, cond, dettaglio = '') =>
  cond ? ok(nome, dettaglio) : ko(nome, dettaglio);

// ─── Finto server ──────────────────────────────────────────────────────────
const stato = {
  init: [], // corpi di /init osservati
  complete: [], // { fileRefId, haSha, parti }
  resume: [], // fileRefId
  files: new Map(), // fileRefId → { filename, size, mime, mode, fatte:Map }
  fallimenti: new Map(), // chiave parte → quante volte fallire ancora
  contatore: 0,
  latenzaMs: 250,
};

function rispostaInit(corpo) {
  const fileRefId = `fr-${++stato.contatore}`;
  const eVideo = (corpo.mime ?? '').startsWith('video/');
  const rec = {
    filename: corpo.filename,
    size: corpo.sizeBytes,
    mime: corpo.mime,
    mode: eVideo ? 'multipart' : 'single',
    fatte: new Map(),
  };
  stato.files.set(fileRefId, rec);
  if (!eVideo) {
    return {
      mode: 'single',
      fileRefId,
      uploadUrl: `${R2}/singolo?fr=${fileRefId}&n=1&f=${encodeURIComponent(corpo.filename)}`,
      expiresAt: new Date(Date.now() + 3600e3).toISOString(),
    };
  }
  const n = Math.ceil(corpo.sizeBytes / PART_SIZE);
  return {
    mode: 'multipart',
    fileRefId,
    uploadId: `up-${fileRefId}`,
    partSize: PART_SIZE,
    parts: Array.from({ length: n }, (_, i) => ({
      partNumber: i + 1,
      url: `${R2}/parte?fr=${fileRefId}&n=${i + 1}&f=${encodeURIComponent(corpo.filename)}`,
    })),
    expiresAt: new Date(Date.now() + 3600e3).toISOString(),
  };
}

function rispostaResume(fileRefId) {
  const rec = stato.files.get(fileRefId);
  if (!rec || rec.mode !== 'multipart') return { mode: 'scaduto' };
  const n = Math.ceil(rec.size / PART_SIZE);
  const mancanti = [];
  let byteGia = 0;
  for (let i = 1; i <= n; i++) {
    if (rec.fatte.has(i)) {
      byteGia += i === n ? rec.size - PART_SIZE * (n - 1) : PART_SIZE;
    } else {
      mancanti.push({ partNumber: i, url: `${R2}/parte?fr=${fileRefId}&n=${i}&f=${encodeURIComponent(rec.filename)}` });
    }
  }
  return {
    mode: 'multipart',
    fileRefId,
    uploadId: `up-${fileRefId}`,
    partSize: PART_SIZE,
    parts: mancanti,
    giaCaricate: [...rec.fatte.entries()].map(([partNumber, etag]) => ({ partNumber, etag })),
    bytesGiaCaricati: byteGia,
    expiresAt: new Date(Date.now() + 3600e3).toISOString(),
  };
}

async function montaIntercettazione(cdp) {
  await cdp.invia('Fetch.enable', {
    patterns: [
      { urlPattern: '*/api/upload/*', requestStage: 'Request' },
    ],
  });

  const corpoDi = async (requestId, request) => {
    if (request.postData) return request.postData;
    try {
      const r = await cdp.invia('Network.getRequestPostData', { requestId });
      return r.postData ?? '';
    } catch {
      return '';
    }
  };

  cdp.su('Fetch.requestPaused', async (ev) => {
    const { requestId, request } = ev;
    const url = new URL(request.url, APP);
    const json = async (dati, code = 200) =>
      cdp.invia('Fetch.fulfillRequest', {
        requestId,
        responseCode: code,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: b64(JSON.stringify(dati)),
      });

    try {
      if (url.pathname === '/api/upload/media/init') {
        const corpo = JSON.parse(await corpoDi(requestId, request));
        stato.init.push(corpo);
        return json(rispostaInit(corpo));
      }

      if (url.pathname.endsWith('/resume')) {
        const fileRefId = url.pathname.split('/').at(-2);
        stato.resume.push(fileRefId);
        for (const p of r2.parti) {
          if (p.fr === fileRefId && p.esito === 'ok') {
            stato.files.get(fileRefId)?.fatte.set(p.n, `"etag-${p.fr}-${p.n}"`);
          }
        }
        return json(rispostaResume(fileRefId));
      }

      if (url.pathname.endsWith('/complete')) {
        const fileRefId = url.pathname.split('/').at(-2);
        const corpo = JSON.parse((await corpoDi(requestId, request)) || '{}');
        const rec = stato.files.get(fileRefId);
        stato.complete.push({
          fileRefId,
          haSha: Boolean(corpo.sha256Hex),
          parti: corpo.parts?.length ?? 0,
          filename: rec?.filename,
        });
        return json({ ok: true, fileRefId, sizeBytes: rec?.size ?? 0, status: 'uploaded' });
      }

      if (url.pathname.endsWith('/abort')) return json({ ok: true });

      return cdp.invia('Fetch.continueRequest', { requestId });
    } catch (e) {
      try {
        await cdp.invia('Fetch.continueRequest', { requestId });
      } catch {
        /* richiesta già sparita */
      }
    }
  });
}

// ─── Utility pagina ────────────────────────────────────────────────────────
async function scegliFile(cdp, selettore, percorsi) {
  const { root } = await cdp.invia('DOM.getDocument', { depth: 1 });
  const { nodeId } = await cdp.invia('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: selettore,
  });
  if (!nodeId) throw new Error(`input non trovato: ${selettore}`);
  await cdp.invia('DOM.setFileInputFiles', { files: percorsi, nodeId });
}

/** Legge lo stato dei job dal pannello (DOM vero, come lo vede l'utente). */
const LEGGI_JOB = `
  Array.from(document.querySelectorAll('li')).map((li) => {
    const nome = li.querySelector('p.truncate')?.textContent ?? '';
    const stato = li.querySelector('p.tabular-nums')?.textContent ?? '';
    const m = stato.match(/(\\d+)%/);
    return { nome, stato, pct: m ? Number(m[1]) : null };
  }).filter((j) => j.nome)
`;

/** Nomi visti col cartellino "Caricato" nel pannello, accumulati nel tempo. */
const vistiCaricati = new Set();

async function osserva(cdp) {
  try {
    for (const j of await valuta(cdp, LEGGI_JOB)) {
      if (j.stato.includes('Caricato')) vistiCaricati.add(j.nome);
    }
  } catch {
    /* pagina in navigazione */
  }
}

/**
 * Aspetta che i file indicati siano finiti davvero: il finto R2 ha ricevuto il
 * /complete (prova lato server) e il pannello li ha mostrati "Caricato" (prova
 * lato utente). Il pannello sparisce da solo dopo qualche secondo, quindi le
 * osservazioni si accumulano invece di guardare una singola istantanea.
 */
async function attendiFine(cdp, nomi, { timeoutMs = 120_000, cosa = '' } = {}) {
  const scadenza = Date.now() + timeoutMs;
  for (;;) {
    await osserva(cdp);
    const completati = new Set(stato.complete.map((c) => c.filename));
    if (nomi.every((n) => completati.has(n))) return;
    if (Date.now() > scadenza) {
      throw new Error(
        `timeout aspettando: ${cosa} — complete: ${[...completati]} · pannello: ${[...vistiCaricati]}`,
      );
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function campiona(cdp, ms, ogni = 80) {
  const serie = new Map();
  const fine = Date.now() + ms;
  while (Date.now() < fine) {
    let jobs = [];
    try {
      jobs = await valuta(cdp, LEGGI_JOB);
    } catch {
      /* pagina che naviga */
    }
    for (const j of jobs) {
      if (j.stato.includes('Caricato')) vistiCaricati.add(j.nome);
      if (j.pct == null) continue;
      if (!serie.has(j.nome)) serie.set(j.nome, []);
      const s = serie.get(j.nome);
      if (s.at(-1) !== j.pct) s.push(j.pct);
    }
    await new Promise((r) => setTimeout(r, ogni));
  }
  return serie;
}

/** Un calo è ammesso solo se azzera (nuovo tentativo); mai 80→20. */
function caliAnomali(serie) {
  const brutti = [];
  for (const [nome, valori] of serie) {
    for (let i = 1; i < valori.length; i++) {
      if (valori[i] < valori[i - 1] && valori[i] !== 0) {
        brutti.push(`${nome}: ${valori[i - 1]}% → ${valori[i]}%`);
      }
    }
  }
  return brutti;
}

// ─── Scenari ───────────────────────────────────────────────────────────────
async function preparaMedia() {
  fs.mkdirSync(MEDIA, { recursive: true });
  const attesi = ['foto_cantiere.jpg', 'foto_enorme.jpg', 'video_impianto_1.mp4', 'video_impianto_2.mp4'];
  if (attesi.every((f) => fs.existsSync(path.join(MEDIA, f)))) return;
  console.log('genero i file di prova…');
  const { default: sharp } = await import(
    path.join(process.cwd(), 'apps/web/node_modules/sharp/lib/index.js')
  );
  // Foto come quelle vere di un iPhone (~3 MB) e una sopra la valvola dei 12 MB.
  fs.writeFileSync(
    path.join(MEDIA, 'foto_cantiere.jpg'),
    await sharp({ create: { width: 4032, height: 3024, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 18 } } }).jpeg({ quality: 82 }).toBuffer(),
  );
  fs.writeFileSync(
    path.join(MEDIA, 'foto_enorme.jpg'),
    await sharp({ create: { width: 6000, height: 4500, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 65 } } }).jpeg({ quality: 92 }).toBuffer(),
  );
  // Due "video" da 40 MB: il contenuto non viene decodificato da nessuno.
  for (const nome of ['video_impianto_1.mp4', 'video_impianto_2.mp4']) {
    const buf = Buffer.alloc(40 * 1024 * 1024);
    for (let i = 0; i < buf.length; i += 4096) buf.writeUInt32LE((i * 2654435761) >>> 0, i);
    fs.writeFileSync(path.join(MEDIA, nome), buf);
  }
}

async function main() {
  await preparaMedia();
  const profilo = path.join(TEMP, 'profilo-chrome');
  fs.rmSync(profilo, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORTA_CDP}`,
    `--user-data-dir=${profilo}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ]);
  chrome.on('error', (e) => console.error('chrome:', e.message));

  const cdp = await connetti(PORTA_CDP);
  await cdp.invia('Page.enable');
  await cdp.invia('Runtime.enable');
  await cdp.invia('DOM.enable');
  await cdp.invia('Network.enable');
  // iPhone 14 Pro: viewport, densità, touch, user agent.
  await cdp.invia('Emulation.setDeviceMetricsOverride', {
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    mobile: true,
  });
  await cdp.invia('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.invia('Network.setUserAgentOverride', {
    userAgent: UA_IPHONE,
    platform: 'iPhone',
  });
  await montaIntercettazione(cdp);

  const vai = async () => {
    await cdp.invia('Page.navigate', { url: `${APP}/prova-upload` });
    await finoA(cdp, `document.querySelector('input[accept="image/*,video/*"]')`, {
      timeoutMs: 120_000,
      cosa: 'pagina di prova pronta (compilazione dev)',
    });
    // Il DOM c'e' ma React potrebbe non aver ancora agganciato i gestori: senza
    // questa attesa il tocco sul tasto non fa niente e il banco accusa l'app.
    await finoA(
      cdp,
      `(() => { const i = document.querySelector('input[accept="image/*,video/*"]');
        return Object.keys(i).some((k) => k.startsWith('__reactProps')); })()`,
      { timeoutMs: 60_000, cosa: 'React idratato' },
    );
  };
  const pulisci = async () => {
    await valuta(cdp, `indexedDB.deleteDatabase('kommessa-uploads') && 1`);
    await new Promise((r) => setTimeout(r, 300));
  };

  // ── Scenario E: l'avviso "il telefono sta preparando i file" ─────────────
  await vai();
  await pulisci();
  await vai();
  const testoAvviso = 'sta preparando i file';
  const vedoAvviso = `document.body.innerText.includes(${JSON.stringify(testoAvviso)})`;
  controlla('avviso assente prima di aprire il picker', !(await valuta(cdp, vedoAvviso)));
  // Tocco sul tasto "Foto e video" (in headless il picker non si apre: è
  // esattamente la condizione "iOS sta ancora preparando").
  await valuta(
    cdp,
    `Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Foto e video')).click(), 1`,
  );
  await new Promise((r) => setTimeout(r, 600));
  controlla('nessun avviso nei primi 600 ms (picker veloce)', !(await valuta(cdp, vedoAvviso)));
  await new Promise((r) => setTimeout(r, 1200));
  controlla('avviso mostrato quando il telefono ci mette', await valuta(cdp, vedoAvviso));

  // ── Scenario A+B: foto a piena qualità e valvola dei 12 MB ───────────────
  const fotoNormale = path.join(MEDIA, 'foto_cantiere.jpg');
  const fotoEnorme = path.join(MEDIA, 'foto_enorme.jpg');
  const dimNormale = fs.statSync(fotoNormale).size;
  const dimEnorme = fs.statSync(fotoEnorme).size;

  await scegliFile(cdp, 'input[accept="image/*,video/*"]', [fotoNormale, fotoEnorme]);
  controlla('avviso via appena arrivano i file', !(await valuta(cdp, vedoAvviso)));

  await attendiFine(cdp, ['foto_cantiere.jpg', 'foto_enorme.jpg'], {
    timeoutMs: 90_000,
    cosa: 'due foto caricate',
  });
  controlla(
    'le due foto risultano "Caricato" nel pannello',
    vistiCaricati.has('foto_cantiere.jpg') && vistiCaricati.has('foto_enorme.jpg'),
    [...vistiCaricati].join(', '),
  );

  const initNormale = stato.init.find((i) => i.filename === 'foto_cantiere.jpg');
  const initEnorme = stato.init.find((i) => i.filename.startsWith('foto_enorme'));
  controlla(
    'foto normale spedita a piena qualità',
    initNormale && initNormale.sizeBytes === dimNormale,
    `inviati ${initNormale?.sizeBytes} su ${dimNormale} byte`,
  );
  controlla(
    'foto sopra 12 MB ancora compressa (valvola)',
    initEnorme && initEnorme.sizeBytes < dimEnorme * 0.6,
    `${(dimEnorme / 1048576).toFixed(1)} MB → ${((initEnorme?.sizeBytes ?? 0) / 1048576).toFixed(1)} MB`,
  );
  controlla(
    'impronta SHA-256 calcolata sulle foto (sotto 16 MB)',
    stato.complete.length === 2 && stato.complete.every((c) => c.haSha),
  );

  // ── Scenario C: due video, con una parte che fallisce ────────────────────
  vistiCaricati.clear();
  await pulisci();
  await vai();
  r2.fallimenti.set('video_impianto_1.mp4#2', 1); // 2ª parte: connessione che cade a metà
  const video1 = path.join(MEDIA, 'video_impianto_1.mp4');
  const video2 = path.join(MEDIA, 'video_impianto_2.mp4');
  await scegliFile(cdp, 'input[accept="image/*,video/*"]', [video1, video2]);

  const serie = await campiona(cdp, 25_000);
  const anomalie = caliAnomali(serie);
  controlla(
    'il progresso non torna mai indietro (salvo azzeramento di un nuovo tentativo)',
    anomalie.length === 0,
    anomalie.join(' · ') || [...serie.entries()].map(([n, v]) => `${n}: ${v.join('→')}`).join(' | '),
  );

  await attendiFine(cdp, ['video_impianto_1.mp4', 'video_impianto_2.mp4'], {
    timeoutMs: 120_000,
    cosa: "due video caricati nonostante l'errore",
  });
  ok('entrambi i video arrivano in fondo dopo un errore di rete');
  controlla(
    'il tentativo dopo l\'errore RIPRENDE (chiede /resume)',
    stato.resume.length >= 1,
    `resume chiesti: ${stato.resume.length}`,
  );
  const completeVideo = stato.complete.filter((c) => c.filename?.startsWith('video_'));
  controlla(
    'niente SHA-256 sui video da 40 MB (nessun blocco a fine upload)',
    completeVideo.length === 2 && completeVideo.every((c) => !c.haSha),
  );
  controlla(
    'complete con tutte e 4 le parti per video',
    completeVideo.every((c) => c.parti === 4),
    completeVideo.map((c) => `${c.filename}: ${c.parti} parti`).join(' · '),
  );

  // ── Scenario D: l'utente chiude l'app a metà ─────────────────────────────
  vistiCaricati.clear();
  stato.complete.length = 0;
  await pulisci();
  await vai();
  await scegliFile(cdp, 'input[accept="image/*,video/*"]', [video1, video2]);
  // Aspetta che siano davvero in volo, poi simula la chiusura ricaricando.
  await finoA(cdp, `${LEGGI_JOB}.some((j) => j.pct !== null && j.pct > 10)`, {
    timeoutMs: 60_000,
    cosa: 'upload in corso prima della chiusura',
  });
  const primaDelRiavvio = stato.resume.length;
  await cdp.invia('Page.navigate', { url: `${APP}/prova-upload` });
  await finoA(cdp, `document.querySelector('input[accept="image/*,video/*"]')`, {
    timeoutMs: 60_000,
    cosa: 'pagina ricaricata',
  });
  const tornati = await finoA(cdp, `${LEGGI_JOB}.length >= 1`, {
    timeoutMs: 30_000,
    cosa: 'file ripescati dopo la riapertura',
  }).then(() => true, () => false);
  const etichette = await valuta(cdp, LEGGI_JOB);
  controlla('dopo la riapertura i file sono ancora in coda', tornati, JSON.stringify(etichette));
  controlla(
    'il pannello dice "Riprendo" (ambra) all\'utente',
    etichette.some((j) => j.stato.includes('Riprendo')),
    JSON.stringify(etichette),
  );
  await attendiFine(cdp, ['video_impianto_1.mp4', 'video_impianto_2.mp4'], {
    timeoutMs: 120_000,
    cosa: 'i due video finiscono dopo la riapertura',
  });
  ok('gli upload interrotti finiscono da soli alla riapertura');
  controlla(
    'la ripresa parte da dove era arrivata (chiede /resume al server)',
    stato.resume.length > primaDelRiavvio,
    `resume prima: ${primaDelRiavvio}, dopo: ${stato.resume.length}`,
  );


  // ── Scenario E: un file DATO PER PERSO riparte alla riapertura ───────────
  //
  // Prima i job falliti restavano rossi finché l'utente non li ritoccava a
  // mano: in cantiere non lo fa nessuno, e i file restavano lì per settimane.
  // Qui si semina in IndexedDB un job già "failed" (cioè con i tentativi
  // esauriti in una sessione precedente) e si verifica che riaprendo l'app
  // riparta da solo e arrivi in fondo.
  vistiCaricati.clear();
  stato.complete.length = 0;
  await pulisci();
  await vai();
  // Un caricamento vero, così IndexedDB esiste con i suoi store.
  await scegliFile(cdp, 'input[accept="image/*,video/*"]', [fotoNormale]);
  await attendiFine(cdp, ['foto_cantiere.jpg'], { timeoutMs: 60_000, cosa: 'foto di innesco' });

  const semina = await valuta(
    cdp,
    `new Promise((res) => {
      const req = indexedDB.open('kommessa-uploads');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['jobs', 'blobs'], 'readwrite');
        const id = 'seminato-1';
        const blob = new Blob([new Uint8Array(2 * 1024 * 1024)], { type: 'video/mp4' });
        tx.objectStore('blobs').put({ id, blob });
        tx.objectStore('jobs').put({
          id,
          status: 'failed',
          payload: {
            fileName: 'video_perso.mp4', fileMime: 'video/mp4', fileSize: blob.size,
            commessaId: '00000000-0000-0000-0000-0000000000aa', kind: 'video',
          },
          fileRefId: null, bytesUploaded: 0, bytesTotal: blob.size,
          attempt: 5, nextAttemptAt: null, lastError: 'R2 network error',
          createdAt: 1, updatedAt: 1,
        });
        tx.oncomplete = () => res('ok');
        tx.onerror = () => res('errore: ' + (tx.error && tx.error.message));
      };
      req.onerror = () => res('errore apertura');
    })`,
    true,
  );
  controlla('seminato in IndexedDB un file dato per perso', semina === 'ok', String(semina));

  await vai(); // = riapertura dell'app
  await attendiFine(cdp, ['video_perso.mp4'], {
    timeoutMs: 90_000,
    cosa: 'il file dato per perso riparte e arriva in fondo',
  });
  ok('un file fallito in una sessione precedente riparte alla riapertura');

  // ── Esito ────────────────────────────────────────────────────────────────
  console.log('\n──────── ESITO ────────');
  for (const e of esiti) {
    console.log(`${e.ok ? 'OK  ' : 'KO  '} ${e.nome}${e.dettaglio ? ` — ${e.dettaglio}` : ''}`);
  }
  const falliti = esiti.filter((e) => !e.ok).length;
  console.log(`\n${esiti.length - falliti}/${esiti.length} passati`);
  const cadute = r2.parti.filter((x) => x.esito !== 'ok');
  console.log(`finto R2: ${r2.parti.length} parti ricevute, ${cadute.length} cadute` +
    (cadute.length ? ` → ${cadute.map((c) => `${c.nome} parte ${c.n} a ${(c.byte/1048576).toFixed(1)} MB`).join(', ')}` : ''));
  const perParte = {};
  for (const x of r2.parti) perParte[`${x.nome}#${x.n}`] = (perParte[`${x.nome}#${x.n}`] ?? 0) + 1;
  console.log('parti ricevute piu\' di una volta:', Object.entries(perParte).filter(([, v]) => v > 1).map(([k, v]) => `${k}×${v}`).join(', ') || 'nessuna');
  cdp.chiudi();
  chrome.kill();
  srvR2.close();
  process.exit(falliti === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nBANCO INTERROTTO:', e.message);
  for (const es of esiti) console.log(`${es.ok ? 'OK  ' : 'KO  '} ${es.nome}${es.dettaglio ? ` — ${es.dettaglio}` : ''}`);
  process.exit(2);
});
