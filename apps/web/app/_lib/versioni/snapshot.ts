/**
 * Snapshot "contenuto" di una commessa + diff tra due snapshot.
 *
 * Lo snapshot NON include i campi congelati (codice_interno / nome_cartella /
 * cloud_folder_path) né le voci/tipologie: il ripristino è solo-contenuti, le
 * cartelle fisiche su Nextcloud non si toccano mai.
 *
 * Modulo puro (nessun import server / DB): riusabile lato action e in test.
 */

export interface SnapshotReferente {
  nome: string;
  ruolo: string | null;
  telefono: string | null;
  email: string | null;
}

export interface CommessaSnapshot {
  descrizioneFinale: string | null;
  indirizzoCantiere: string | null;
  noteIniziali: string | null;
  isCritica: boolean | null;
  stato: string | null;
  responsabileId: string | null;
  clienteId: string | null;
  referenti: SnapshotReferente[];
}

export interface DiffEntry {
  campo: string;
  da: unknown;
  a: unknown;
}

const LABELS: Record<keyof CommessaSnapshot, string> = {
  descrizioneFinale: 'Descrizione',
  indirizzoCantiere: 'Indirizzo cantiere',
  noteIniziali: 'Note iniziali',
  isCritica: 'Criticità',
  stato: 'Stato',
  responsabileId: 'Responsabile',
  clienteId: 'Cliente',
  referenti: 'Referenti',
};

/** Riga commessa minima necessaria a costruire lo snapshot. */
export interface CommessaRowForSnapshot {
  descrizione_ai_finale: string | null;
  cliente_indirizzo_cantiere: string | null;
  note_iniziali: string | null;
  is_critica: boolean | null;
  stato: string | null;
  responsabile_id: string | null;
  cliente_id: string | null;
}

/** Normalizza i referenti in ordine stabile (per nome+telefono) per confronto. */
function normReferenti(
  ref: ReadonlyArray<{
    nome?: string | null;
    ruolo?: string | null;
    telefono?: string | null;
    email?: string | null;
  }>,
): SnapshotReferente[] {
  return ref
    .map((r) => ({
      nome: (r.nome ?? '').trim(),
      ruolo: r.ruolo?.trim() || null,
      telefono: r.telefono?.trim() || null,
      email: r.email?.trim() || null,
    }))
    .filter((r) => r.nome.length > 0)
    .sort((a, b) =>
      `${a.nome}|${a.telefono ?? ''}`.localeCompare(`${b.nome}|${b.telefono ?? ''}`),
    );
}

export function buildSnapshot(
  row: CommessaRowForSnapshot,
  referenti: ReadonlyArray<{
    nome?: string | null;
    ruolo?: string | null;
    telefono?: string | null;
    email?: string | null;
  }> = [],
): CommessaSnapshot {
  return {
    descrizioneFinale: row.descrizione_ai_finale ?? null,
    indirizzoCantiere: row.cliente_indirizzo_cantiere ?? null,
    noteIniziali: row.note_iniziali ?? null,
    isCritica: row.is_critica ?? null,
    stato: row.stato ?? null,
    responsabileId: row.responsabile_id ?? null,
    clienteId: row.cliente_id ?? null,
    referenti: normReferenti(referenti),
  };
}

export function diffSnapshot(
  prima: CommessaSnapshot,
  dopo: CommessaSnapshot,
): DiffEntry[] {
  const out: DiffEntry[] = [];
  (Object.keys(LABELS) as Array<keyof CommessaSnapshot>).forEach((k) => {
    const a = JSON.stringify(prima[k] ?? null);
    const b = JSON.stringify(dopo[k] ?? null);
    if (a !== b) {
      out.push({ campo: LABELS[k], da: prima[k] ?? null, a: dopo[k] ?? null });
    }
  });
  return out;
}
