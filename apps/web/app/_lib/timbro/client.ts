import 'server-only';

/**
 * Il client HTTP verso l'API di Timbro. Un posto solo per: il Bearer, la
 * paginazione a cursore, il `429` con `Retry-After`, e la forma degli errori.
 *
 * ⚠️ E' la prima chiamata in uscita verso un host esterno di tutto il repo (a
 * parte OpenAI): quindi un timeout **sempre**, e nessuna chiamata senza la
 * `AbortSignal`. Una `fetch` appesa su Vercel tiene la funzione aperta fino
 * al suo limite, e il giro successivo del cron si accavalla.
 */

export interface PunchTimbro {
  id: string;
  employee_id: string | null;
  employee_external_id: string | null;
  kind: string | null;
  badge_code: string | null;
  device_id: string | null;
  direction: 'in' | 'out' | null;
  occurred_at: string | null;
  time_source: string | null;
  source: string | null;
  status: 'valid' | 'voided' | string;
  voided_at: string | null;
  void_reason: string | null;
  note: string | null;
  received_at: string | null;
  updated_at: string;
}

export interface EmployeeTimbro {
  id: string;
  first_name: string | null;
  last_name: string | null;
  employee_code: string | null;
  external_id: string | null;
  active: boolean;
  birth_date?: string | null;
  updated_at?: string;
}

export interface DeviceTimbro {
  id: string;
  name?: string | null;
  online?: boolean;
  firmware_version?: string | null;
  last_seen_at?: string | null;
  site_id?: string | null;
}

interface Pagina<T> {
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}

export class ErroreTimbro extends Error {
  constructor(
    public readonly stato: number,
    public readonly codice: string,
    messaggio: string,
  ) {
    super(messaggio);
    this.name = 'ErroreTimbro';
  }
}

const TIMEOUT_MS = 15_000;
/** Pagine per giro: 20 × 500 = 10.000 timbri, molto oltre un giorno di un'azienda. */
const MAX_PAGINE = 20;

export class ClientTimbro {
  constructor(
    private readonly urlBase: string,
    private readonly token: string,
  ) {}

  private async chiama<T>(
    metodo: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    percorso: string,
    opzioni: { query?: Record<string, string | undefined>; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(this.urlBase.replace(/\/$/, '') + percorso);
    for (const [k, v] of Object.entries(opzioni.query ?? {})) {
      if (v !== undefined && v !== '') url.searchParams.set(k, v);
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
          ...(opzioni.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: opzioni.body !== undefined ? JSON.stringify(opzioni.body) : undefined,
        signal: ctrl.signal,
        cache: 'no-store',
      });
      const testo = await res.text();
      let json: unknown = null;
      try {
        json = testo ? JSON.parse(testo) : null;
      } catch {
        json = null;
      }
      if (!res.ok) {
        const e = (json ?? {}) as { error?: string; code?: string; message?: string };
        const codice = e.code ?? e.error ?? `http_${res.status}`;
        const msg = e.message ?? (typeof e.error === 'string' ? e.error : '') ?? '';
        throw new ErroreTimbro(res.status, codice, msg || `Timbro ha risposto ${res.status}`);
      }
      return json as T;
    } catch (e) {
      if (e instanceof ErroreTimbro) throw e;
      if (e instanceof Error && e.name === 'AbortError') {
        throw new ErroreTimbro(0, 'timeout', `Timbro non ha risposto entro ${TIMEOUT_MS / 1000} secondi.`);
      }
      throw new ErroreTimbro(0, 'rete', e instanceof Error ? e.message : 'Errore di rete verso Timbro.');
    } finally {
      clearTimeout(timer);
    }
  }

  /** Scorre tutte le pagine di un elenco. */
  private async tutte<T>(percorso: string, query: Record<string, string | undefined>): Promise<T[]> {
    const out: T[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < MAX_PAGINE; i++) {
      const pagina = await this.chiama<Pagina<T>>('GET', percorso, {
        query: { ...query, limit: '500', cursor },
      });
      out.push(...(pagina.data ?? []));
      if (!pagina.has_more || !pagina.next_cursor) break;
      cursor = pagina.next_cursor;
    }
    return out;
  }

  /** `GET /me`: chi siamo per Timbro. Serve a provare il token. */
  me(): Promise<{ tenant_id?: string; name?: string; timezone?: string; scopes?: string[] }> {
    return this.chiama('GET', '/me');
  }

  punches(q: { updatedSince?: string; from?: string; to?: string; status?: string }): Promise<PunchTimbro[]> {
    return this.tutte<PunchTimbro>('/punches', {
      updated_since: q.updatedSince,
      from: q.from,
      to: q.to,
      status: q.status,
    });
  }

  employees(q: { active?: boolean } = {}): Promise<EmployeeTimbro[]> {
    return this.tutte<EmployeeTimbro>('/employees', {
      active: q.active === undefined ? undefined : String(q.active),
    });
  }

  /** Collega un dipendente di Timbro al nostro: scrive il nostro id in `external_id`. */
  collegaEmployee(employeeId: string, externalId: string): Promise<EmployeeTimbro> {
    return this.chiama('PATCH', `/employees/${encodeURIComponent(employeeId)}`, {
      body: { external_id: externalId },
    });
  }

  devices(): Promise<DeviceTimbro[]> {
    return this.chiama<Pagina<DeviceTimbro> | DeviceTimbro[]>('GET', '/devices').then((r) =>
      Array.isArray(r) ? r : (r.data ?? []),
    );
  }

  webhooks(): Promise<Array<{ id: string; url: string; events?: string[]; active?: boolean }>> {
    return this.chiama<Pagina<{ id: string; url: string; events?: string[]; active?: boolean }> | Array<{ id: string; url: string }>>(
      'GET',
      '/webhooks',
    ).then((r) => (Array.isArray(r) ? r : (r.data ?? [])));
  }

  creaWebhook(url: string, events: string[]): Promise<{ id: string; secret: string }> {
    return this.chiama('POST', '/webhooks', { body: { url, events } });
  }

  eliminaWebhook(id: string): Promise<unknown> {
    return this.chiama('DELETE', `/webhooks/${encodeURIComponent(id)}`);
  }

  provaWebhook(id: string): Promise<unknown> {
    return this.chiama('POST', `/webhooks/${encodeURIComponent(id)}/test`);
  }
}
