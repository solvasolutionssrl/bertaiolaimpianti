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
  /**
   * Le fasi del turno (dal 26/10/2026). Facoltative: finche' il cliente resta
   * in «Solo evento» arrivano `null`, e un firmware vecchio non le manda mai.
   * ⚠️ Non si legge `direction` quando c'e' una fase: vedi
   * `@kommessa/api/timbro-passo`.
   */
  step?: string | null;
  step_source?: string | null;
  shift_was_open?: boolean | null;
  previous_punch_id?: string | null;
  previous_occurred_at?: string | null;
}

/** Cosa risponde Timbro a una scrittura: `duplicate` se l'id c'era gia'. */
export interface EsitoPunchScritto {
  id?: string;
  result?: 'created' | 'duplicate' | string;
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

  /**
   * `GET /me`: chi siamo per Timbro, e **cosa ci lascia fare la chiave**.
   *
   * ⚠️ La risposta e' annidata (`{ key, tenant }`), non piatta: il tipo di
   * prima la dichiarava piatta e quindi leggeva `undefined` su tutto. Non si
   * vedeva perche' non la chiamava nessuno.
   */
  me(): Promise<{
    key?: { id?: string; name?: string; prefix?: string; scopes?: string[]; last_used_at?: string | null };
    tenant?: { id?: string; name?: string; slug?: string; timezone?: string };
  }> {
    return this.chiama('GET', '/me');
  }

  punches(q: {
    updatedSince?: string;
    from?: string;
    to?: string;
    status?: string;
    /** `device` | `manual` | `api`. Non si filtra lato Timbro: vedi `importaTimbri`. */
    source?: string;
    step?: string;
  }): Promise<PunchTimbro[]> {
    return this.tutte<PunchTimbro>('/punches', {
      updated_since: q.updatedSince,
      from: q.from,
      to: q.to,
      status: q.status,
      source: q.source,
      step: q.step,
    });
  }

  /**
   * Scrive su Timbro una NOSTRA timbratura, cosi' il terminale sa in che punto
   * del turno e' la persona anche quando ha timbrato dall'app.
   *
   * ⚠️ Idempotente sull'`id`: si passa **sempre** l'id della nostra riga, mai
   * uno nuovo. Riprovare non crea doppioni; due id diversi per lo stesso gesto
   * sì, e nessuno se ne accorgerebbe.
   * ⚠️ Vuole lo scope `punches:write`, che la chiave di sola lettura non ha:
   * chi chiama deve reggere un 401/403 senza rompersi.
   */
  creaPunch(p: {
    id: string;
    employeeExternalId: string;
    occurredAt: string;
    passo?: string | null;
    direzione?: 'in' | 'out' | null;
    nota?: string | null;
  }): Promise<EsitoPunchScritto> {
    return this.chiama('POST', '/punches', {
      body: {
        id: p.id,
        employee_external_id: p.employeeExternalId,
        occurred_at: p.occurredAt,
        // Se abbiamo la fase si manda quella e basta: la direzione la ricava
        // Timbro, e mandarle entrambe incoerenti e' un 422.
        ...(p.passo ? { step: p.passo } : p.direzione ? { direction: p.direzione } : {}),
        ...(p.nota ? { note: p.nota } : {}),
      },
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
