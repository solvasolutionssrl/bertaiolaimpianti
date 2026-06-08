/**
 * Tipi delle bozze commessa lato client (offline-first).
 *
 * Il payload coincide con l'input di creaCommessa (la finalizzazione lo
 * passa pari pari a finalizzaBozza → creaCommessa). Durante la stesura e'
 * parziale: i campi obbligatori (cliente + descrizione) vengono validati
 * solo alla finalizzazione lato server.
 */

import type { CreaCommessaServerInput } from '../../_actions/crea-commessa.schemas';

/**
 * Stato del form salvato nella bozza. Parziale finche' non finalizzata.
 *
 * `_clienteLabel` è un campo di SOLO DISPLAY (nome cliente esistente) per il
 * round-trip al resume: viene scartato silenziosamente da Zod alla
 * finalizzazione (lo schema commessa fa stripping delle chiavi sconosciute).
 */
export type BozzaPayload = Partial<CreaCommessaServerInput> & {
  _clienteLabel?: string;
};

/** Bozza come vive in IndexedDB (verita' locale). */
export interface LocalBozza {
  /** UUID v4 generato dal client: stabile anche offline. */
  id: string;
  /** Numero progressivo per-tenant, assegnato dal server al primo sync. */
  numeroBozza: number | null;
  payload: BozzaPayload;
  /** Epoch ms (clock client) dell'ultima modifica locale. */
  updatedAt: number;
  /** Epoch ms dell'ultimo sync server riuscito; null se mai sincronizzata. */
  lastSyncedAt: number | null;
  /** true se ci sono modifiche locali non ancora confermate dal server. */
  dirty: boolean;
}

/** Bozza come torna dal server (GET /api/bozze). */
export interface ServerBozza {
  id: string;
  numeroBozza: number | null;
  payload: BozzaPayload;
  createdAt: string;
  updatedAt: string;
}
