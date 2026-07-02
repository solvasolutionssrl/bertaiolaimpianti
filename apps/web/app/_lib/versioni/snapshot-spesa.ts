/**
 * Snapshot "contenuto" di una spesa + diff tra due snapshot.
 * Modulo puro (nessun import server / DB): riusabile lato action e in test.
 * Stesso pattern di ./snapshot (commesse).
 */

export interface SpesaSnapshot {
  categoria: string | null;
  cantiereId: string | null;
  ragioneSociale: string | null;
  importoTotale: number | null;
  importoIva: number | null;
  metodoPagamento: string | null;
  numeroPersone: number | null;
  dataScontrino: string | null;
  note: string | null;
}

export interface DiffEntry {
  campo: string;
  da: unknown;
  a: unknown;
}

const LABELS: Record<keyof SpesaSnapshot, string> = {
  categoria: 'Categoria',
  cantiereId: 'Cantiere',
  ragioneSociale: 'Esercente',
  importoTotale: 'Totale',
  importoIva: 'IVA',
  metodoPagamento: 'Pagamento',
  numeroPersone: 'Persone',
  dataScontrino: 'Data',
  note: 'Note',
};

/** Riga spesa minima necessaria a costruire lo snapshot. */
export interface SpesaRowForSnapshot {
  categoria: string | null;
  cantiere_id: string | null;
  ragione_sociale: string | null;
  importo_totale: number | null;
  importo_iva: number | null;
  metodo_pagamento: string | null;
  numero_persone: number | null;
  data_scontrino: string | null;
  note: string | null;
}

export function buildSnapshotSpesa(row: SpesaRowForSnapshot): SpesaSnapshot {
  return {
    categoria: row.categoria ?? null,
    cantiereId: row.cantiere_id ?? null,
    ragioneSociale: row.ragione_sociale ?? null,
    importoTotale: row.importo_totale ?? null,
    importoIva: row.importo_iva ?? null,
    metodoPagamento: row.metodo_pagamento ?? null,
    numeroPersone: row.numero_persone ?? null,
    dataScontrino: row.data_scontrino ?? null,
    note: row.note ?? null,
  };
}

export function diffSnapshotSpesa(prima: SpesaSnapshot, dopo: SpesaSnapshot): DiffEntry[] {
  const out: DiffEntry[] = [];
  (Object.keys(LABELS) as Array<keyof SpesaSnapshot>).forEach((k) => {
    const a = JSON.stringify(prima[k] ?? null);
    const b = JSON.stringify(dopo[k] ?? null);
    if (a !== b) {
      out.push({ campo: LABELS[k], da: prima[k] ?? null, a: dopo[k] ?? null });
    }
  });
  return out;
}
