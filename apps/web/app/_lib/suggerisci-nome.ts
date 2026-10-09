/**
 * Proposta di **descrizione** di una commessa a partire da voci di catalogo,
 * cliente e note — senza chiamare nessun modello.
 *
 * Logica deterministica leggibile: le voci dominanti hanno un'etichetta, e in
 * mancanza di voci si pescano le prime parole significative dalle note. È il
 * ripiego di `/api/suggerisci-nome` quando OpenAI non è configurata, risponde
 * male o non risponde affatto.
 *
 * ⭐ **Qui si scrivono frasi, non nomi di cartella.** Fino al 08/10/2026 questo
 * file proponeva `InstallazioneCaldaia`, perché quel valore diventava insieme
 * il titolo della commessa e il terzo segmento del nome cartella. Da quando i
 * due mestieri sono separati (`@kommessa/api/nome-cartella`), il CamelCase lo
 * deriva il server e qui resta la lingua italiana con gli spazi.
 *
 * Riferimenti:
 *  - Tassonomia_Lavori.md §2-3 (voci 1..38)
 *  - Flusso_Operativo.md §2 step 5 (capo edita la descrizione)
 */
import { tagliaAParolaIntera } from '@kommessa/api/testo';

import { MAX_DESCRIZIONE_COMMESSA } from '../_actions/crea-commessa.schemas';

export interface SuggerisciInput {
  voci?: number[];
  cliente?: string;
  note?: string;
}

export interface SuggerisciResult {
  proposta: string;
  alternatives: string[];
}

/**
 * Voci "dominanti" mappate a etichette brevi. L'ordine in questa lista
 * riflette la priorità: la prima trovata diventa la proposta principale.
 */
const ETICHETTE_DOMINANTI: ReadonlyArray<{ id: number; label: string }> = [
  { id: 17, label: 'Impianto solare' },
  { id: 18, label: 'Fotovoltaico' },
  { id: 19, label: 'Installazione caldaia' },
  { id: 15, label: 'Impianto gas' },
  { id: 14, label: 'Impianto di condizionamento' },
  { id: 13, label: 'Sistemazione bagno' },
  { id: 31, label: 'Montaggio bagni' },
  { id: 30, label: 'Pavimento radiante' },
  { id: 32, label: 'Centrale termica' },
  { id: 16, label: 'Aspirazione centralizzata' },
  { id: 11, label: 'Colonne sanitario' },
  { id: 12, label: 'Colonne riscaldamento' },
  { id: 28, label: 'Piatto doccia' },
];

/**
 * L'etichetta della prima voce dominante fra quelle scelte, se c'è.
 *
 * ⚠️ Esportata perché il ripiego senza AI della **dettatura**
 * (`api/voice/_lib/extract-prompt.ts`) aveva una copia a mano di questa
 * tabella — dieci voci invece di tredici, col commento «stessa logica di
 * suggerisci-nome» che era vero il giorno in cui è stato scritto. Due elenchi
 * della stessa cosa divergono sempre, e qui divergevano già.
 */
export function etichettaDominante(vociIds: readonly number[]): string | null {
  const voci = new Set(vociIds);
  return ETICHETTE_DOMINANTI.find((e) => voci.has(e.id))?.label ?? null;
}

/** Restituisce una proposta + lista di alternative. */
export function suggerisciDescrizione(input: SuggerisciInput): SuggerisciResult {
  const voci = new Set(input.voci ?? []);
  const matching = ETICHETTE_DOMINANTI.filter((e) => voci.has(e.id));

  if (matching.length > 0) {
    const first = matching[0]!;
    const rest = matching.slice(1);
    return {
      proposta: first.label,
      alternatives: rest.slice(0, 3).map((e) => e.label),
    };
  }

  // Ripiego: le prime parole significative dalle note.
  if (input.note && input.note.trim().length > 0) {
    const frase = primeParole(input.note);
    if (frase.length >= 3) {
      return { proposta: frase, alternatives: ['Nuova commessa'] };
    }
  }

  return { proposta: 'Nuova commessa', alternatives: [] };
}

/**
 * Le prime parole di un testo, come frase leggibile: maiuscola iniziale e
 * nient'altro toccato.
 *
 * ⚠️ Il taglio è **a parola intera** (`tagliaAParolaIntera`, condiviso): una
 * descrizione mozzata a metà parola finirebbe così nel nome della cartella su
 * Nextcloud, che non si rinomina più. Il tetto è lo stesso che accetta
 * `creaCommessa`, letto da lì e non riscritto qui.
 */
function primeParole(testo: string, max = MAX_DESCRIZIONE_COMMESSA): string {
  // Al massimo sei parole: oltre non è più un titolo, è una frase.
  const primeSei = testo.replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
  const fuori = tagliaAParolaIntera(primeSei, max);
  return fuori ? fuori.charAt(0).toUpperCase() + fuori.slice(1) : '';
}
