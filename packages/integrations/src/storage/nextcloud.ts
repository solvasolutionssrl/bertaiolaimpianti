import type {
  StorageObject,
  StorageProvider,
  StorageProviderName,
  UploadOptions,
  UploadResult,
  SignedUrl,
} from './types';

interface Config {
  baseUrl: string;
  user: string;
  appPassword: string;
  /**
   * Cartella radice opzionale: se l'utente Nextcloud "tecnico app" vede
   * come root la sua home WebDAV, qui specifichiamo la sotto-cartella
   * condivisa entro cui l'app deve scrivere (es. "/Bertaiola Impianti").
   * Tutti i path passati ai metodi vengono prefissati con questo valore.
   * Default: '' (nessun prefisso → si scrive nella home dell'utente).
   */
  basePath?: string;
}

/**
 * Tempo massimo per una singola creazione di cartella. Generoso: Hetzner sta in
 * Germania e sotto carico rallenta. Serve a fermare la `fetch` che non torna
 * mai, non a tagliare quella lenta.
 */
const MKCOL_TIMEOUT_MS = 15_000;

/**
 * Nextcloud / Hetzner Storage Share adapter (WebDAV + OCS API).
 *
 * Status: provider candidato per produzione (Hetzner Storage Share era
 * la proposta v2). Implementazione dei metodi essenziali; al momento il
 * cliente ha la decisione del provider in TBD — vedi CLAUDE.md.
 */
export class NextcloudStorageProvider implements StorageProvider {
  readonly name: StorageProviderName = 'nextcloud';
  private readonly baseUrl: string;
  private readonly user: string;
  private readonly authHeader: string;
  private readonly basePath: string;

  constructor(config: Config) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.user = config.user;
    this.authHeader = `Basic ${Buffer.from(`${config.user}:${config.appPassword}`).toString('base64')}`;
    // Normalizza basePath: "/Bertaiola Impianti", senza trailing slash.
    // Stringa vuota = nessun prefisso.
    this.basePath = (config.basePath ?? '')
      .replace(/^\/*/, '/')
      .replace(/\/+$/, '');
  }

  /** Prefissa il path con basePath (se configurato). */
  private withBase(path: string): string {
    const clean = path.startsWith('/') ? path : `/${path}`;
    if (!this.basePath || this.basePath === '/') return clean;
    if (clean === '/' || clean === '') return this.basePath;
    return `${this.basePath}${clean}`;
  }

  private webdav(path: string): string {
    const prefixed = this.withBase(path);
    return `${this.baseUrl}/remote.php/dav/files/${this.user}${prefixed.startsWith('/') ? prefixed : `/${prefixed}`}`;
  }

  private async req(method: string, url: string, body?: BodyInit, headers: Record<string, string> = {}) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: this.authHeader, ...headers },
      body,
    });
    if (!res.ok && res.status !== 207 && res.status !== 405) {
      const text = await res.text().catch(() => '');
      throw new Error(`Nextcloud ${method} ${url} → ${res.status} ${text.slice(0, 200)}`);
    }
    return res;
  }

  /**
   * Cartelle gia' create da QUESTA istanza del provider.
   *
   * `MKCOL` non e' ricorsivo, quindi ogni cartella in fondo a un ramo chiede di
   * creare prima tutti i suoi genitori. Senza memoria, costruire l'albero
   * standard di una commessa (13 voci, fino a due livelli) faceva **49 MKCOL**
   * di cui circa **35 su cartelle create un attimo prima**: rispondevano 405,
   * ma il viaggio fino all'Irlanda si pagava comunque.
   *
   * La memoria vive quanto l'istanza, cioe' quanto una richiesta: non e' una
   * cache da invalidare, e non puo' dire il falso su una cartella creata da
   * qualcun altro, perche' `MKCOL` su una cartella esistente e' innocuo.
   */
  private readonly gia = new Set<string>();

  /**
   * Un solo MKCOL, con memoria e con un tempo massimo.
   *
   * ⚠️ Il timeout non e' un dettaglio: prima non c'era **nessun** `AbortSignal`,
   * e una `fetch` che restava appesa bloccava l'intera creazione della commessa
   * senza che niente scadesse mai.
   */
  private async mkcol(path: string): Promise<void> {
    if (this.gia.has(path)) return;
    let ultimo: unknown;
    // Due tentativi: `MKCOL` e' idempotente (405 = esiste gia'), quindi
    // ripetere non puo' fare danni, e un singolo intoppo di rete non deve
    // costare l'intera cartella della commessa.
    for (let tentativo = 0; tentativo < 2; tentativo += 1) {
      try {
        const res = await fetch(this.webdav(path), {
          method: 'MKCOL',
          headers: { Authorization: this.authHeader },
          signal: AbortSignal.timeout(MKCOL_TIMEOUT_MS),
        });
        // 201 Created · 405 Method Not Allowed (già esiste) · 409 Conflict
        if (![201, 405, 409].includes(res.status)) {
          throw new Error(`MKCOL ${path} → ${res.status}`);
        }
        this.gia.add(path);
        return;
      } catch (e) {
        ultimo = e;
      }
    }
    throw ultimo instanceof Error ? ultimo : new Error(`MKCOL ${path} fallito`);
  }

  async createFolder(path: string): Promise<void> {
    // MKCOL non è ricorsivo; dobbiamo creare i parent, dal piu' esterno.
    const segments = path.split('/').filter(Boolean);
    let current = '';
    for (const seg of segments) {
      current += `/${seg}`;
      await this.mkcol(current);
    }
  }

  /**
   * L'albero di una commessa, **un livello alla volta**.
   *
   * Dentro uno stesso livello le cartelle non dipendono l'una dall'altra:
   * `Preventivi`, `Schemi` e `Materiali` si possono creare insieme. Dipende
   * invece ogni livello dal precedente, perche' il genitore deve esistere.
   *
   * Prima era un ciclo `for … await`, una cartella per volta: con 150-400 ms di
   * viaggio verso Hetzner facevano da 8 a 30 secondi, **attesi** dentro la
   * creazione della commessa. Ora sono tre ondate.
   */
  async createFolderTree(rootPath: string, tree: string[]): Promise<void> {
    await this.createFolder(rootPath);

    // Si raccolgono tutti i percorsi, compresi gli intermedi (`Foto` esiste
    // solo perche' esiste `Foto/Sopralluogo`), raggruppati per profondita'.
    const perLivello = new Map<number, string[]>();
    for (const sub of tree) {
      let corrente = rootPath;
      for (const seg of sub.split('/').filter(Boolean)) {
        corrente += `/${seg}`;
        const profondita = corrente.split('/').filter(Boolean).length;
        const righe = perLivello.get(profondita) ?? [];
        if (!righe.includes(corrente)) righe.push(corrente);
        perLivello.set(profondita, righe);
      }
    }

    for (const profondita of [...perLivello.keys()].sort((a, b) => a - b)) {
      await Promise.all(perLivello.get(profondita)!.map((p) => this.mkcol(p)));
    }
  }

  async uploadFile(
    path: string,
    body: Blob | ArrayBuffer | Uint8Array,
    opts: UploadOptions = {},
  ): Promise<UploadResult> {
    const buffer =
      body instanceof Blob
        ? new Uint8Array(await body.arrayBuffer())
        : body instanceof ArrayBuffer
          ? new Uint8Array(body)
          : body;
    await this.req('PUT', this.webdav(path), new Blob([buffer as unknown as BlobPart]), {
      'Content-Type': opts.contentType ?? 'application/octet-stream',
    });
    return { path, size: buffer.byteLength };
  }

  async uploadStream(
    path: string,
    stream: ReadableStream<Uint8Array>,
    size: number,
    opts: UploadOptions = {},
  ): Promise<UploadResult> {
    const res = await fetch(this.webdav(path), {
      method: 'PUT',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': opts.contentType ?? 'application/octet-stream',
        'Content-Length': String(size),
      },
      body: stream,
      // duplex:'half' required in Node.js 18+ for streaming request bodies
      ...(({ duplex: 'half' }) as Record<string, unknown>),
    } as RequestInit);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Nextcloud PUT ${path} → ${res.status}: ${text.slice(0, 200)}`);
    }
    return { path, size };
  }

  async listFolder(path: string): Promise<StorageObject[]> {
    const res = await this.req(
      'PROPFIND',
      this.webdav(path),
      undefined,
      { Depth: '1', 'Content-Type': 'application/xml' },
    );
    const xml = await res.text();
    // Passiamo il path completo (con basePath del tenant) al parser: gli href
    // Nextcloud includono il basePath, quindi il check _isParent deve
    // confrontare segmenti omologhi. Altrimenti la cartella corrente
    // verrebbe inclusa come prima entry (bug visto in /Documenti).
    const entries = parsePropfindXml(xml, this.withBase(path));
    // Rimuovi il prefisso basePath dai path restituiti: il consumer lavora
    // con path "logici" relativi alla root del tenant.
    if (this.basePath && this.basePath !== '/') {
      const prefix = this.basePath.replace(/^\/+|\/+$/g, '');
      for (const e of entries) {
        if (e.path.startsWith(`/${prefix}/`)) {
          e.path = e.path.slice(prefix.length + 1) || '/';
        } else if (e.path === `/${prefix}`) {
          e.path = '/';
        }
      }
    }
    return entries;
  }

  async getDownloadUrl(path: string, expiresInSec = 3600): Promise<SignedUrl> {
    // Per share pubblici si userebbe l'OCS API; in prodotto interno è più
    // semplice generare un proxy URL firmato dal nostro backend, oppure
    // restituire un URL diretto autenticato (richiede sessione lato app).
    const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();
    return { url: this.webdav(path), expiresAt };
  }

  async delete(path: string): Promise<void> {
    await this.req('DELETE', this.webdav(path));
  }

  async move(from: string, to: string): Promise<void> {
    await this.req('MOVE', this.webdav(from), undefined, {
      Destination: this.webdav(to),
      Overwrite: 'T',
    });
  }

  async exists(path: string): Promise<boolean> {
    const res = await fetch(this.webdav(path), {
      method: 'PROPFIND',
      headers: { Authorization: this.authHeader, Depth: '0' },
    });
    return res.status === 207;
  }
}

function parsePropfindXml(xml: string, basePath: string): StorageObject[] {
  // Parser minimale; in produzione usare fast-xml-parser.
  // Normalizza basePath: no trailing slash, no leading slash → poi rimettiamo
  // tutto in modo coerente nei path output.
  const cleanBase = basePath.replace(/^\/+|\/+$/g, '');
  const baseSegments = cleanBase ? cleanBase.split('/') : [];

  const responses = xml.match(/<d:response[\s\S]*?<\/d:response>/g) ?? [];
  return responses
    .map((r) => {
      const href = r.match(/<d:href>(.*?)<\/d:href>/)?.[1] ?? '';
      const isDir = /<d:resourcetype>\s*<d:collection/.test(r);
      const size = Number(r.match(/<d:getcontentlength>(\d+)<\/d:getcontentlength>/)?.[1] ?? '0');
      const mime = r.match(/<d:getcontenttype>(.*?)<\/d:getcontenttype>/)?.[1] ?? 'application/octet-stream';
      const lastMod = r.match(/<d:getlastmodified>(.*?)<\/d:getlastmodified>/)?.[1] ?? '';

      // href tipico: "/remote.php/dav/files/<user>/<seg1>/<seg2>/.../<name>/"
      // Estraiamo i segmenti dopo "/files/<user>/" e li teniamo come hrefSegments.
      const decoded = decodeURIComponent(href);
      const filesMatch = decoded.match(/\/files\/[^/]+\/(.*)$/);
      const relative = (filesMatch?.[1] ?? '').replace(/\/+$/, '');
      const hrefSegments = relative ? relative.split('/') : [];

      const name = hrefSegments[hrefSegments.length - 1] ?? '';
      // path coerente con basePath del chiamante (no trailing slash)
      const path = '/' + hrefSegments.join('/');

      return {
        path,
        name,
        size,
        mimeType: mime,
        isDirectory: isDir,
        modifiedAt: lastMod,
        // Flag interna: questa entry È il parent (stesso numero di segmenti del basePath)
        _isParent: hrefSegments.length === baseSegments.length,
      };
    })
    .filter((o) => o.name && !o._isParent)
    .map(({ _isParent, ...rest }) => rest);
}
