import 'server-only';

import { createServiceSupabase } from '@kommessa/api/service';

import { autenticaToken, type ScopeToken } from '../../../_lib/api-token';

/**
 * Fondamenta dell'**API pubblica di Kommessa** (`/api/v1`).
 *
 * Non e' l'API "dell'integrazione con ERGO": e' l'API del prodotto. Oggi la
 * consuma un agente che parla con un gestionale, domani potra' consumarla un
 * portale cliente, un'app di terze parti o un altro nostro servizio. Per
 * questo le risorse si chiamano come le cose che sono — `ore`, `spese`,
 * `cantieri` — e non come l'uso che se ne fa.
 *
 * Le regole valgono per ogni rotta presente e futura:
 *
 * 1. **Un formato di risposta solo.** Elenchi in `{dati, paginazione}`, errori
 *    in `{errore: {codice, messaggio}}`. Chi scrive un client lo impara una
 *    volta.
 * 2. **Paginazione a cursore, mai a pagina.** Con dati che cambiano mentre li
 *    leggi, `offset` salta o ripete righe. Il cursore no.
 * 3. **Lettura incrementale sempre disponibile.** Ogni elenco accetta
 *    `modificatoDopo`: al secondo giro si scarica solo il nuovo.
 * 4. **Additiva.** Si aggiungono campi e risorse, non si cambiano quelli che
 *    ci sono. Un client vecchio deve continuare a funzionare.
 */

/** Versione del contratto. Cambia solo per rotture, che vanno evitate. */
export const CONTRATTO = 1;

export interface ContestoApi {
  tenantId: string;
  tokenId: string;
  /** Gestionale del tenant, se ne ha uno configurato. */
  sistema: string | null;
  /**
   * `simulazione` = i record si leggono ma nessuno deve essere scritto
   * altrove. E' la sicura di collaudo, e i record lo dicono riga per riga con
   * `inviabile: false`.
   */
  modalita: 'simulazione' | 'attiva';
  /**
   * Identificativi esterni che restano inviabili anche in simulazione: serve a
   * provare su un cantiere solo, senza aprire tutto il resto.
   */
  collaudoEsterni: string[];
}

export function erroreApi(
  status: number,
  codice: string,
  messaggio: string,
  extra?: Record<string, unknown>,
): Response {
  return Response.json({ errore: { codice, messaggio, ...extra } }, { status });
}

export function rispostaElenco<T>(
  dati: T[],
  paginazione: { prossimo: string | null; altriRisultati: boolean },
): Response {
  return Response.json({ contratto: CONTRATTO, dati, paginazione });
}

// ---------------------------------------------------------------------------
// Autenticazione
// ---------------------------------------------------------------------------

export type EsitoGuard =
  | { ok: true; ctx: ContestoApi }
  | { ok: false; risposta: Response };

/**
 * Chi chiama si identifica con un token Bearer. Il tenant NON e' un parametro:
 * sta nel token. Se lo fosse, un token rubato potrebbe farsi dare i dati di un
 * altro cliente semplicemente cambiando un numero nell'indirizzo.
 */
export async function autenticaApi(
  request: Request,
  scope: ScopeToken = 'integrazione',
): Promise<EsitoGuard> {
  const token = await autenticaToken(request, scope);
  if (!token) {
    return {
      ok: false,
      risposta: erroreApi(
        401,
        'token_non_valido',
        'Token assente, scaduto, revocato o senza il permesso richiesto.',
      ),
    };
  }

  const service = createServiceSupabase();
  const { data, error } = await service
    .from('tenant_modules' as never)
    .select('attivo, config')
    .eq('tenant_id', token.tenantId)
    .eq('module_code', 'integrazione')
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      risposta: erroreApi(
        503,
        'configurazione_non_leggibile',
        'Non riesco a leggere la configurazione. Riprova più tardi.',
      ),
    };
  }

  const riga = data as unknown as {
    attivo: boolean;
    config: Record<string, unknown> | null;
  } | null;

  // Il modulo spento non e' un errore del chiamante ma una scelta
  // dell'ufficio: va detto in chiaro, altrimenti si insegue un guasto che non
  // c'e'.
  if (!riga?.attivo) {
    return {
      ok: false,
      risposta: erroreApi(
        403,
        'modulo_spento',
        'Il modulo di integrazione non è attivo per questo cliente.',
      ),
    };
  }

  const config = riga.config ?? {};
  return {
    ok: true,
    ctx: {
      tenantId: token.tenantId,
      tokenId: token.tokenId,
      sistema: typeof config.sistema === 'string' ? config.sistema : null,
      // Il valore prudente e' il predefinito: se la configurazione e' assente
      // o storta, non si scrive niente da nessuna parte.
      modalita: config.modalita === 'attiva' ? 'attiva' : 'simulazione',
      collaudoEsterni: Array.isArray(config.collaudo_esterni)
        ? (config.collaudo_esterni as unknown[]).filter(
            (x): x is string => typeof x === 'string',
          )
        : [],
    },
  };
}

// ---------------------------------------------------------------------------
// Paginazione a cursore
// ---------------------------------------------------------------------------

export const LIMITE_DEFAULT = 200;
export const LIMITE_MAX = 1000;

export interface Cursore {
  /** Timestamp dell'ultimo record consegnato. */
  t: string;
  /** Id dell'ultimo record: rompe la parita' quando due hanno lo stesso istante. */
  i: string;
}

/**
 * Il cursore e' opaco per chi lo riceve — si rimanda e basta — ma dentro e'
 * solo `(timestamp, id)`.
 *
 * Serve la coppia, non il solo timestamp: se dieci righe sono state
 * modificate nello stesso centesimo di secondo e la pagina si chiude in
 * mezzo a loro, con il solo timestamp o se ne perdono o se ne ripetono.
 */
export function scriviCursore(c: Cursore): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

export function leggiCursore(raw: string | null): Cursore | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Cursore;
    return typeof o?.t === 'string' && typeof o?.i === 'string' ? o : null;
  } catch {
    return null;
  }
}

export interface ParametriElenco {
  limite: number;
  cursore: Cursore | null;
  /** Solo i record toccati dopo questo istante. Base della lettura incrementale. */
  modificatoDopo: string | null;
  /** Filtro di comodo sul giorno di competenza. */
  dal: string | null;
  al: string | null;
  errore?: string;
}

export function leggiParametri(url: URL): ParametriElenco {
  const n = Number(url.searchParams.get('limite'));
  const limite =
    Number.isFinite(n) && n > 0 ? Math.min(Math.trunc(n), LIMITE_MAX) : LIMITE_DEFAULT;

  const cursoreRaw = url.searchParams.get('cursore');
  const cursore = leggiCursore(cursoreRaw);
  // Un cursore illeggibile non si ignora in silenzio: chi lo ha mandato
  // ripartirebbe dall'inizio senza accorgersene e rifarebbe tutto il lavoro.
  if (cursoreRaw && !cursore) {
    return {
      limite,
      cursore: null,
      modificatoDopo: null,
      dal: null,
      al: null,
      errore: 'Il cursore non è leggibile: riparti senza, oppure usa quello dell’ultima risposta.',
    };
  }

  const iso = (k: string): string | null => {
    const v = url.searchParams.get(k);
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };
  const giorno = (k: string): string | null => {
    const v = url.searchParams.get(k);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  };

  return {
    limite,
    cursore,
    modificatoDopo: iso('modificatoDopo'),
    dal: giorno('dal'),
    al: giorno('al'),
  };
}

/**
 * Confeziona la pagina: taglia all'ultimo elemento richiesto e prepara il
 * cursore per il giro dopo.
 *
 * Si chiede sempre un record in piu' del limite: e' il modo piu' semplice di
 * sapere se ce ne sono altri senza fare un secondo conteggio sul database.
 */
export function impagina<T>(
  righe: T[],
  limite: number,
  chiave: (r: T) => Cursore,
): { dati: T[]; paginazione: { prossimo: string | null; altriRisultati: boolean } } {
  const altriRisultati = righe.length > limite;
  const dati = altriRisultati ? righe.slice(0, limite) : righe;
  const ultimo = dati[dati.length - 1];
  return {
    dati,
    paginazione: {
      prossimo: altriRisultati && ultimo ? scriviCursore(chiave(ultimo)) : null,
      altriRisultati,
    },
  };
}

/** `2026-08-03T…` → `2026-08-03`. Il giorno di competenza non ha fuso. */
export function soloGiorno(ts: string | null | undefined): string | null {
  return ts ? ts.slice(0, 10) : null;
}

/** Legge il corpo JSON senza far esplodere la rotta su un body malformato. */
export async function leggiJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
