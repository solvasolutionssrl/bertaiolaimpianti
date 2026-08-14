import 'server-only';

import { createServiceSupabase } from '@kommessa/api/service';

import type { ContestoApi } from './api';

/**
 * Pezzi comuni a tutte le risorse di `/api/v1`.
 *
 * Due cose che ogni record porta con se', e che sono il cuore del contratto:
 *
 * - **`esportazioni`** — cosa e' gia' finito su un sistema esterno, e quando.
 *   Su un gestionale dove non si rilegge e non si cancella, questa e'
 *   l'informazione che impedisce di scrivere due volte. Vive qui e non solo
 *   nel giornale locale dell'agente, perche' quel giornale puo' sparire.
 *
 * - **`inviabile`** — se in questo momento e' lecito portarlo fuori. Non e'
 *   una proprieta' del dato: e' una decisione di Kommessa, che dipende dalla
 *   modalita' del tenant. In `simulazione` e' sempre `false`, e nessun agente
 *   corretto scrive nulla.
 */

export type Risorsa = 'ore' | 'spese' | 'viaggi' | 'cantieri' | 'dipendenti' | 'clienti';

export interface Esportazione {
  /** Distingue piu' scritture nate dallo stesso record (es. le causali delle ore). */
  variante: string;
  esito: 'ok' | 'errore';
  /** Quando e' finito sul sistema esterno, dichiarato da chi l'ha scritto. */
  scrittoAl: string;
  /** Quando ce l'ha comunicato: lo scarto misura il ritardo del collegamento. */
  registratoAl: string;
  /** Cosa ha risposto il sistema esterno (numero documento, protocollo...). */
  externalRiferimento: unknown;
  errore: string | null;
}

/**
 * Recupera in un colpo solo le esportazioni di un intero lotto.
 *
 * Una query per pagina, non una per record: con 200 righe la differenza fra
 * 1 e 200 interrogazioni e' fra una risposta immediata e un timeout.
 */
export async function esportazioniPerLotto(
  ctx: ContestoApi,
  risorsa: Risorsa,
  ids: string[],
): Promise<Map<string, Esportazione[]>> {
  const out = new Map<string, Esportazione[]>();
  if (ids.length === 0 || !ctx.sistema) return out;

  const service = createServiceSupabase();
  const { data } = await service
    .from('integrazione_scritture' as never)
    .select('risorsa_id, variante, esito, external_ref, errore, scritto_at, registrato_at')
    .eq('tenant_id', ctx.tenantId)
    .eq('sistema', ctx.sistema)
    .eq('risorsa', risorsa)
    .in('risorsa_id', ids);

  for (const r of (data ?? []) as unknown as {
    risorsa_id: string;
    variante: string;
    esito: 'ok' | 'errore';
    external_ref: unknown;
    errore: string | null;
    scritto_at: string;
    registrato_at: string;
  }[]) {
    const lista = out.get(r.risorsa_id) ?? [];
    lista.push({
      variante: r.variante,
      esito: r.esito,
      scrittoAl: r.scritto_at,
      registratoAl: r.registrato_at,
      externalRiferimento: r.external_ref,
      errore: r.errore,
    });
    out.set(r.risorsa_id, lista);
  }
  return out;
}

/**
 * Se questo record puo' essere portato fuori adesso.
 *
 * In `simulazione` la risposta e' no, con l'unica eccezione degli
 * identificativi elencati in `collaudo_esterni`: cosi' si prova la catena
 * intera su un cantiere solo, con il cliente davanti, senza rischiare di
 * riversare mesi di dati nel suo gestionale.
 *
 * Non e' il vecchio gate manuale per-riga, che non esiste piu': l'approvazione
 * dentro Kommessa e' gia' il consenso. Questa e' una sicura di collaudo, che
 * si toglie una volta sola.
 */
export function inviabile(ctx: ContestoApi, esternoCollegato: string | null): boolean {
  if (ctx.modalita === 'attiva') return true;
  return !!esternoCollegato && ctx.collaudoEsterni.includes(esternoCollegato);
}

// ---------------------------------------------------------------------------
// Mappature verso il sistema esterno
// ---------------------------------------------------------------------------

export interface Mappature {
  cantiere: Map<string, string>;
  commessa: Map<string, string>;
  dipendente: Map<string, string>;
  cliente: Map<string, string>;
}

const VUOTE: Mappature = {
  cantiere: new Map(),
  commessa: new Map(),
  dipendente: new Map(),
  cliente: new Map(),
};

/**
 * Gli identificativi sul sistema esterno, gia' risolti.
 *
 * Vengono serviti dentro ogni record (`commessa.externalId`,
 * `dipendente.externalId`) perche' altrimenti ogni agente dovrebbe
 * interrogare le mappature a parte e tenersele in memoria — lavoro identico
 * ripetuto da ognuno, e una occasione in piu' di sbagliare.
 */
export async function caricaMappature(ctx: ContestoApi): Promise<Mappature> {
  if (!ctx.sistema) return VUOTE;

  const service = createServiceSupabase();
  const { data } = await service
    .from('integrazione_mappature' as never)
    .select('entita, entita_id, external_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('sistema', ctx.sistema);

  const out: Mappature = {
    cantiere: new Map(),
    commessa: new Map(),
    dipendente: new Map(),
    cliente: new Map(),
  };
  for (const m of (data ?? []) as unknown as {
    entita: string;
    entita_id: string;
    external_id: string;
  }[]) {
    const mappa = out[m.entita as keyof Mappature];
    if (mappa) mappa.set(m.entita_id, m.external_id);
  }
  return out;
}

/**
 * Il committente di una commessa **secondo il gestionale**.
 *
 * Non si mappa a parte: e' il sistema esterno a sapere quale cliente sta
 * dietro a quale commessa, e ce lo dice quando ci manda le sue anagrafiche.
 */
export async function clienteDelleCommesse(
  ctx: ContestoApi,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ctx.sistema) return out;

  const service = createServiceSupabase();
  // ⚠️ La colonna e' `external_cliente_id` dal contratto 2 (migration
  // 20260812100000). Con il nome vecchio PostgREST non da' un campo vuoto:
  // fa fallire l'intera query, `data` torna null e OGNI record esce con
  // `externalClienteId: null` — in silenzio. E' successo davvero, e su un
  // gestionale i documenti di km e spese il committente lo pretendono quasi
  // sempre: senza, la scrittura la' fuori non parte nemmeno.
  const { data, error } = await service
    .from('integrazione_staging' as never)
    .select('external_id, external_cliente_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('sistema', ctx.sistema)
    .eq('entita', 'commessa')
    .not('external_cliente_id', 'is', null);

  if (error) return out;

  for (const r of (data ?? []) as unknown as {
    external_id: string;
    external_cliente_id: string;
  }[]) {
    out.set(r.external_id, r.external_cliente_id);
  }
  return out;
}

/** `450` → `7:30`. Comodita': il minuto resta comunque disponibile a parte. */
export function oreHMM(minuti: number): string {
  const m = Math.max(0, Math.round(minuti));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** I numerici di Postgres arrivano come stringa: qui tornano numeri. */
export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
