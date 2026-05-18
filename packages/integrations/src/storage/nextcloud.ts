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
}

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

  constructor(config: Config) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.user = config.user;
    this.authHeader = `Basic ${Buffer.from(`${config.user}:${config.appPassword}`).toString('base64')}`;
  }

  private webdav(path: string): string {
    return `${this.baseUrl}/remote.php/dav/files/${this.user}${path.startsWith('/') ? path : `/${path}`}`;
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

  async createFolder(path: string): Promise<void> {
    // MKCOL non è ricorsivo; dobbiamo creare i parent
    const segments = path.split('/').filter(Boolean);
    let current = '';
    for (const seg of segments) {
      current += `/${seg}`;
      const res = await fetch(this.webdav(current), {
        method: 'MKCOL',
        headers: { Authorization: this.authHeader },
      });
      // 201 Created · 405 Method Not Allowed (già esiste) · 409 Conflict
      if (![201, 405, 409].includes(res.status)) {
        throw new Error(`MKCOL ${current} → ${res.status}`);
      }
    }
  }

  async createFolderTree(rootPath: string, tree: string[]): Promise<void> {
    await this.createFolder(rootPath);
    for (const sub of tree) {
      await this.createFolder(`${rootPath}/${sub}`);
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
    await this.req('PUT', this.webdav(path), new Blob([buffer]), {
      'Content-Type': opts.contentType ?? 'application/octet-stream',
    });
    return { path, size: buffer.byteLength };
  }

  async listFolder(path: string): Promise<StorageObject[]> {
    const res = await this.req(
      'PROPFIND',
      this.webdav(path),
      undefined,
      { Depth: '1', 'Content-Type': 'application/xml' },
    );
    const xml = await res.text();
    return parsePropfindXml(xml, path);
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
