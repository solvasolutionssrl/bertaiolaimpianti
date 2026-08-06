/**
 * Conversione dai dati di dominio Kommessa al payload canonico da accodare.
 *
 * Volutamente **pure**: nessuna query, nessun accesso a Supabase. Chi chiama
 * ha gia' letto le righe e risolto le mappature; qui si decide solo *cosa*
 * diventa un'operazione e *come* si descrive. Cosi' e' testabile senza DB —
 * ed e' la parte che sbaglia piu' facilmente, perche' e' piena di regole
 * ("gli straordinari sono un record a se'", "i km solo all'autista").
 *
 * Il dialetto del gestionale NON entra qui: vedi `integrazione.ts`.
 */

import {
  chiaveIdempotenza,
  descrizioneOre,
  descrizioneSpesa,
  descrizioneViaggio,
  type CategoriaSpesa,
  type CausaleOre,
  type PayloadKm,
  type PayloadOre,
  type PayloadSpesa,
  type RiferimentiEsterni,
} from './integrazione';

/** Un'operazione pronta per l'outbox: payload + chiave + tracciabilita'. */
export interface OperazioneDaAccodare {
  tipo: 'ore' | 'km' | 'spesa';
  payload: PayloadOre | PayloadKm | PayloadSpesa;
  idempotencyKey: string;
  origineTipo: string;
  origineId: string;
}

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

export interface SpesaDominio {
  id: string;
  categoria: string | null;
  /** Esercente, come letto dallo scontrino. */
  ragione_sociale: string | null;
  importo_totale: number | string;
  numero_persone: number | null;
  /** Data dello scontrino; se manca si ripiega sulla data di creazione. */
  data_scontrino: string | null;
  created_at: string;
  stato: string;
}

/**
 * Una spesa → una riga sul gestionale.
 *
 * Si accoda **solo se `confermata`**: una spesa in bozza e' ancora in
 * revisione (o in analisi AI) e sul gestionale non si potrebbe piu' correggere.
 */
export function operazioneDaSpesa(
  spesa: SpesaDominio,
  rif: RiferimentiEsterni,
  ctx: { persona?: string | null; commessa?: string | null; maxDescrizione?: number },
): OperazioneDaAccodare | null {
  if (spesa.stato !== 'confermata') return null;

  const importo = Number(spesa.importo_totale);
  if (!Number.isFinite(importo) || importo <= 0) return null;

  const data = soloData(spesa.data_scontrino ?? spesa.created_at);
  const categoria = categoriaSpesaCanonica(spesa.categoria);

  const payload: PayloadSpesa = {
    tipo: 'spesa',
    data,
    categoria,
    importoEur: arrotonda2(importo),
    descrizione: descrizioneSpesa({
      data,
      categoria,
      fornitore: spesa.ragione_sociale,
      persona: ctx.persona,
      numPersone: spesa.numero_persone,
      commessa: ctx.commessa,
      max: ctx.maxDescrizione,
    }),
    rif,
  };

  return {
    tipo: 'spesa',
    payload,
    idempotencyKey: chiaveIdempotenza('spesa', 'spese', spesa.id),
    origineTipo: 'spese',
    origineId: spesa.id,
  };
}

// ---------------------------------------------------------------------------
// Ore
// ---------------------------------------------------------------------------

/** Porta entrambe le colonne: quale conta lo decide `risolviCommessa`. */
export interface RigaRapportinoDominio extends RigaConLavoro {
  id: string;
  ore_ordinarie: number | string;
  ore_straordinarie: number | string;
  ore_viaggio: number | string;
  note: string | null;
}

/**
 * Una riga di rapportino → fino a **tre** registrazioni, una per causale.
 *
 * Il gestionale distingue ordinario, straordinario e viaggio con causali
 * diverse: sommarle perderebbe proprio l'informazione che serve alle paghe.
 * Le causali a zero non si accodano (una riga da 0 ore e' rumore).
 *
 * Granularita': **una riga per cantiere** — deciso col cliente. E' il dato che
 * serve al controllo di commessa; il totale giornaliero si ricava sommando,
 * il contrario no.
 */
export function operazioniDaRigaRapportino(
  riga: RigaRapportinoDominio,
  data: string,
  rif: RiferimentiEsterni,
  ctx: { persona?: string | null; commessa?: string | null; maxDescrizione?: number },
): OperazioneDaAccodare[] {
  const quote: { causale: CausaleOre; ore: number }[] = [
    { causale: 'ordinario', ore: Number(riga.ore_ordinarie) },
    { causale: 'straordinario', ore: Number(riga.ore_straordinarie) },
    { causale: 'viaggio', ore: Number(riga.ore_viaggio) },
  ];

  return quote
    .filter((q) => Number.isFinite(q.ore) && q.ore > 0)
    .map((q) => {
      const durataMin = Math.round(q.ore * 60);
      const payload: PayloadOre = {
        tipo: 'ore',
        data,
        durataMin,
        causale: q.causale,
        descrizione: descrizioneOre({
          causale: q.causale,
          durataMin,
          persona: ctx.persona,
          commessa: ctx.commessa,
          nota: riga.note,
          max: ctx.maxDescrizione,
        }),
        rif,
      };
      return {
        tipo: 'ore' as const,
        payload,
        idempotencyKey: chiaveIdempotenza(
          'ore',
          'rapportino_righe',
          riga.id,
          q.causale,
        ),
        origineTipo: 'rapportino_righe',
        origineId: riga.id,
      };
    });
}

// ---------------------------------------------------------------------------
// Km / viaggi
// ---------------------------------------------------------------------------

/**
 * Un tragitto. Porta `cantiere_id` (destinazione) e, sugli spostamenti fra
 * cantieri, `da_cantiere_id` (partenza): i km si imputano sempre alla
 * **destinazione**.
 */
export interface ViaggioDominio extends RigaConLavoro {
  id: string;
  distanza_km: number | string | null;
  autista: boolean;
  direzione: string;
  data: string;
}

/**
 * Un tragitto → una riga km sul gestionale.
 *
 * **Solo all'autista** vengono conteggiati i km: al passeggero l'auto non e'
 * costata nulla. Il passeggero non si accoda affatto — comparirebbe come un
 * rimborso che non gli spetta.
 */
export function operazioneDaViaggio(
  viaggio: ViaggioDominio,
  data: string,
  rif: RiferimentiEsterni,
  ctx: {
    persona?: string | null;
    partenza?: string | null;
    arrivo?: string | null;
    maxDescrizione?: number;
  },
): OperazioneDaAccodare | null {
  if (!viaggio.autista) return null;

  const km = Number(viaggio.distanza_km);
  if (!Number.isFinite(km) || km <= 0) return null;

  const payload: PayloadKm = {
    tipo: 'km',
    data,
    km: arrotonda2(km),
    ruolo: 'autista',
    descrizione: descrizioneViaggio({
      data,
      km: arrotonda2(km),
      ruolo: 'autista',
      persona: ctx.persona,
      partenza: ctx.partenza,
      arrivo: ctx.arrivo,
      max: ctx.maxDescrizione,
    }),
    rif,
  };

  return {
    tipo: 'km',
    payload,
    idempotencyKey: chiaveIdempotenza('km', 'timbratura_viaggio', viaggio.id),
    origineTipo: 'timbratura_viaggio',
    origineId: viaggio.id,
  };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Da timestamp a data secca. Il gestionale vuole il giorno di competenza, non
 * l'istante: si taglia la parte oraria senza convertire fusi, perche' la data
 * e' gia' quella corretta per l'ufficio che l'ha inserita.
 */
export function soloData(ts: string): string {
  return ts.slice(0, 10);
}

function arrotonda2(n: number): number {
  return Math.round(n * 100) / 100;
}
