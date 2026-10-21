import 'server-only';

import { createServiceSupabase } from '@kommessa/api/service';

import {
  richiedeModuloIntegrazione,
  type ScopeApi,
} from '@kommessa/api/scope-api';

import { autenticaToken } from '../../../_lib/api-token';

/**
 * Fondamenta dell'**API pubblica di Kommessa** (`/api/v1`).
 *
 * Non e' l'API "dell'integrazione con il gestionale di un cliente": e' l'API
 * del prodotto. Oggi la consuma un agente che parla con un gestionale, domani
 * potra' consumarla un portale cliente, un'app di terze parti o un altro
 * nostro servizio. Per
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
 * 5. **`external…` = dato del gestionale.** Nessun prefisso = dato di
 *    Kommessa. Il prefisso sta in testa, e vale per identificativi, codici e
 *    riferimenti — non per gli attributi descrittivi, altrimenti ce
 *    l'avrebbero tutti e smetterebbe di dire qualcosa.
 */

/**
 * Versione del contratto. Cambia solo per rotture, che vanno evitate.
 *
 * **2** (12/08/2026) — rinomina di sette campi per la regola `external…`.
 * Il caso che l'ha resa necessaria: `codice` significava il NOSTRO
 * (`CAN-00190`) in uscita da `/cantieri` e il LORO (`26084`) in entrata su
 * `/letture`. Un agente che rileggeva e riscriveva li invertiva senza che
 * niente desse errore, e le ore finivano sulla commessa di un altro.
 * Rottura netta, senza sinonimi di transizione: un solo consumatore, in
 * collaudo, che rilancia la lettura da zero.
 */
export const CONTRATTO = 2;

export interface ContestoApi {
  tenantId: string;
  tokenId: string;
  /**
   * I permessi del token. Le rotte li leggono per decidere **quanto** dare:
   * l'anagrafica del personale esce senza costo orario per chi ha solo la
   * lettura semplice. Vedi `profiloDipendenti` in `@kommessa/api/scope-api`.
   */
  scopes: readonly string[];
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
  /**
   * Il contrario di `collaudoEsterni`: identificativi che restano **non**
   * inviabili anche a scritture aperte. Vince su tutto il resto, perche' una
   * lista di esclusione scavalcabile non esclude niente.
   */
  esclusiEsterni: string[];
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
  scope: ScopeApi = 'integrazione',
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

  // ⭐ Il modulo Integrazione lo pretende il TOKEN, non la rotta. Un token del
  // gestionale deve restare fermabile spegnendo il modulo, come e' sempre
  // stato: se la richiesta dipendesse dalla rotta, lo stesso token su una
  // rotta di sola lettura scavalcherebbe quell'interruttore. Un token di sola
  // lettura invece non lo pretende — lo emette il super admin uno per uno, e
  // l'autorizzazione e' il token stesso: si toglie revocandolo.
  const vuoleModulo = richiedeModuloIntegrazione(token.scopes);
  let config: Record<string, unknown> = {};

  if (vuoleModulo) {
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

    config = riga.config ?? {};
  }

  return {
    ok: true,
    ctx: {
      tenantId: token.tenantId,
      tokenId: token.tokenId,
      scopes: token.scopes,
      // ⚠️ `sistema` resta nullo per i token di sola lettura, ed e' voluto: da
      // lui dipendono le mappature verso il gestionale, cioe' gli
      // identificativi di UN ALTRO sistema. Una timbratrice non deve vedere i
      // codici di ERGO.
      sistema: typeof config.sistema === 'string' ? config.sistema : null,
      // Il valore prudente e' il predefinito: se la configurazione e' assente
      // o storta, non si scrive niente da nessuna parte.
      modalita: config.modalita === 'attiva' ? 'attiva' : 'simulazione',
      collaudoEsterni: Array.isArray(config.collaudo_esterni)
        ? (config.collaudo_esterni as unknown[]).filter(
            (x): x is string => typeof x === 'string',
          )
        : [],
      esclusiEsterni: Array.isArray(config.esclusi_esterni)
        ? (config.esclusi_esterni as unknown[]).filter(
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
// Si chiede sempre un record in più del limite (vedi `impagina`) e PostgREST ne
// restituisce al massimo 1000 per richiesta: oltre 999 l'ultima pagina sparirebbe.
export const LIMITE_MAX = 999;

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

/**
 * Applica il cursore a una query: sulla **coppia** `(colonna, id)`, non sulla
 * sola colonna.
 *
 * ⚠️⚠️ Perche' esiste. Il commento su `scriviCursore` descriveva gia' la
 * regola giusta — «serve la coppia, non il solo timestamp» — ma tutte e sei le
 * rotte a elenco facevano `gt(colonna, t)` e basta. Con righe che condividono
 * l'istante, e **capita di continuo** perche' in Postgres `now()` e' costante
 * dentro una transazione, quelle dopo la prima pagina venivano **saltate in
 * silenzio**: chi legge non vede nessun errore, vede solo meno righe.
 * Misurato il 21/10/2026 su FPM: 32 dipendenti su 37 con lo stesso
 * `updated_at` (un aggiornamento in blocco) e 19 cantieri su 770 (la
 * promozione notturna dal gestionale).
 *
 * ⭐ Un'intenzione scritta in un commento e non verificata da un test e' solo
 * una bella frase: ora la regola sta in **un posto solo**, e una rotta nuova
 * che non la usa si vede.
 *
 * ⚠️ I valori vanno fra virgolette: un timestamp contiene `:` e `+`, e senza
 * virgolette PostgREST li interpreta. Le virgolette dentro il valore si
 * tolgono — un timestamp e un uuid non ne hanno, ma un filtro che si spezza su
 * un carattere inatteso e' il modo in cui questa API ha gia' fatto cadere una
 * pagina una volta.
 */
export function daCursore<Q extends { or: (filtro: string) => Q }>(
  q: Q,
  colonna: string,
  c: Cursore | null,
): Q {
  if (!c) return q;
  const t = c.t.replace(/"/g, '');
  const i = c.i.replace(/"/g, '');
  return q.or(`${colonna}.gt."${t}",and(${colonna}.eq."${t}",id.gt."${i}")`);
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
