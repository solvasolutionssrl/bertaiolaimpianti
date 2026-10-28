/**
 * Abbina le righe nuove di una giornata a quelle già in tabella, per chiave
 * (cantiere + fase, oppure commessa).
 *
 * ⭐ **L'id di una riga di ore è stabile** (dal 28/10/2026). Prima ogni
 * salvataggio cancellava e reinseriva tutto, quindi una giornata corretta
 * cambiava id: chi legge da `/api/v1/ore` vedeva una riga mai vista, e il
 * registro delle scritture (indicizzato sull'id) non la riconosceva più come
 * già inviata. Su un gestionale append-only vuol dire ore scritte due volte.
 *
 * Una riga con la stessa chiave si AGGIORNA e tiene il suo id; una chiave
 * nuova si inserisce; una chiave sparita si cancella. Se in tabella ci sono due
 * righe con la stessa chiave (dati vecchi), la prima si tiene e l'altra va via.
 */
export interface AbbinamentoRighe<T> {
  aggiorna: Array<{ id: string; riga: T }>;
  inserisci: T[];
  cancella: string[];
}

export function abbinaRighe<T>(
  vecchie: Array<{ id: string; chiave: string }>,
  nuove: Array<{ chiave: string; riga: T }>,
): AbbinamentoRighe<T> {
  const libere = new Map<string, string[]>();
  for (const v of vecchie) {
    const ids = libere.get(v.chiave) ?? [];
    ids.push(v.id);
    libere.set(v.chiave, ids);
  }

  const aggiorna: Array<{ id: string; riga: T }> = [];
  const inserisci: T[] = [];
  for (const n of nuove) {
    const id = libere.get(n.chiave)?.shift();
    if (id) aggiorna.push({ id, riga: n.riga });
    else inserisci.push(n.riga);
  }

  const cancella = [...libere.values()].flat();
  return { aggiorna, inserisci, cancella };
}
