/**
 * Due cose che restano dopo il passaggio all'API a risorse.
 *
 * Il resto di questo modulo — costruttori di payload, preset di descrizioni,
 * chiavi di idempotenza — se n'e' andato con la coda di lavoro: adesso le
 * politiche di traduzione stanno da chi conosce il sistema di destinazione,
 * non qui.
 *
 * Sopravvivono soltanto due cose, entrambe pure e testate:
 *  - `risolviCommessa`, unico punto del codice che sa della doppia colonna;
 *  - `categoriaSpesaCanonica`, che accorpa le nostre categorie fini nelle
 *    macro-voci contabili.
 */

/**
 * Macro-voci di spesa: l'accorpamento che serve a chi tiene i conti, piu'
 * grosso delle categorie che l'utente sceglie in app.
 */
export type CategoriaSpesa = 'ristorante' | 'albergo' | 'carburante' | 'altro';

// ---------------------------------------------------------------------------
// Da quale colonna arriva l'unita' di lavoro
// ---------------------------------------------------------------------------

/**
 * Il mondo in cui vive il tenant (`tenants.app_mode`).
 *
 * Le tabelle operative portano DUE colonne per l'unita' di lavoro —
 * `cantiere_id` (→ `cantieri`) e `commessa_id` (→ `commesse`) — perche' i due
 * mondi sono nati in momenti diversi e convivono nello stesso schema. Per un
 * tenant Kantiere come FPM `commessa_id` e' sempre NULL; per un tenant
 * Kommessa vale il contrario.
 */
export type MondoTenant = 'kantiere' | 'kommessa' | 'full';

/** Quale tabella di dominio regge l'unita' di lavoro. */
export type EntitaLavoro = 'cantiere' | 'commessa';

export interface RigaConLavoro {
  cantiere_id?: string | null;
  commessa_id?: string | null;
}

export interface LavoroRisolto {
  /** Su quale tabella puntare per la mappatura verso il gestionale. */
  entita: EntitaLavoro;
  id: string;
  /**
   * `true` quando la colonna attesa per quel mondo era vuota e si e' preso
   * l'altra. Non e' un errore da bloccare — i dati storici sono misti — ma
   * chi accoda lo segnala, altrimenti una migrazione mancata resta invisibile.
   */
  daFallback: boolean;
}

/**
 * Sceglie da quale colonna leggere l'unita' di lavoro, in base al mondo del
 * tenant. E' l'unico punto del codice che sa della doppia colonna: da qui in
 * avanti si parla solo di "commessa" in senso neutro.
 *
 * `full` (tenant con entrambi i mondi) preferisce il cantiere, perche' e' li'
 * che vivono ore e presenze.
 */
export function risolviCommessa(
  riga: RigaConLavoro,
  mondo: MondoTenant,
): LavoroRisolto | null {
  const cantiere = vuotoANull(riga.cantiere_id);
  const commessa = vuotoANull(riga.commessa_id);

  const ordine: EntitaLavoro[] =
    mondo === 'kommessa' ? ['commessa', 'cantiere'] : ['cantiere', 'commessa'];

  for (let i = 0; i < ordine.length; i++) {
    const entita = ordine[i]!;
    const id = entita === 'cantiere' ? cantiere : commessa;
    if (id) return { entita, id, daFallback: i > 0 };
  }
  return null;
}

function vuotoANull(v: string | null | undefined): string | null {
  return v && v.trim() !== '' ? v : null;
}

// ---------------------------------------------------------------------------
// Spese
// ---------------------------------------------------------------------------

/**
 * Le categorie di Kommessa sono piu' fini di quelle che servono al gestionale
 * (l'utente sceglie "bar" o "trasporti", il controllo di commessa ragiona per
 * macro-voci). Qui si accorpa. `bar` finisce con i pasti: e' una consumazione,
 * non una categoria a se' per chi tiene i conti.
 */
const CATEGORIA_SPESA: Record<string, CategoriaSpesa> = {
  hotel: 'albergo',
  ristorante: 'ristorante',
  bar: 'ristorante',
  carburante: 'carburante',
  trasporti: 'altro',
  varie: 'altro',
};

export function categoriaSpesaCanonica(categoria: string | null | undefined): CategoriaSpesa {
  return CATEGORIA_SPESA[(categoria ?? '').toLowerCase()] ?? 'altro';
}


/** I numerici di Postgres arrivano come stringa: qui tornano numeri. */
export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
