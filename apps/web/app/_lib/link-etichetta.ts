import { risolviTitoloCommessa } from './commessa-display';

/**
 * Etichetta di una commessa per la lista del comando iOS.
 *
 * ⚠️ Vive qui e in nessun altro posto: `/api/link/commesse` la **genera** e
 * `/api/link/upload` la **ri-risolve** per ritrovare la commessa. Se le due
 * costruzioni divergessero anche di uno spazio, la scelta dell'utente non
 * troverebbe più corrispondenza e l'upload fallirebbe in silenzio.
 *
 * Il codice va in testa: è la prima cosa che si cerca con l'occhio scorrendo
 * una lista lunga, e su iOS quella lista non ha un campo di ricerca.
 */
export interface CommessaPerEtichetta {
  codice_interno: string | null;
  nome_cartella: string | null;
  descrizione_ai_finale: string | null;
  descrizione_ai_proposta: string | null;
  note_iniziali: string | null;
  clienteNome: string | null;
}

export function etichettaCommessa(c: CommessaPerEtichetta): string {
  const titolo = risolviTitoloCommessa({
    descrizione_ai_finale: c.descrizione_ai_finale,
    descrizione_ai_proposta: c.descrizione_ai_proposta,
    note_iniziali: c.note_iniziali,
    nome_cartella: c.nome_cartella,
    codice_interno: c.codice_interno,
    cliente_nome: c.clienteNome,
  });
  return [c.codice_interno, titolo, c.clienteNome].filter(Boolean).join(' · ');
}
