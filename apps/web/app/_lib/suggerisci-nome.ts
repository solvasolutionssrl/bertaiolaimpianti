/**
 * Helper locale per generare una proposta di descrizione/cartella
 * a partire da voci selezionate + cliente + note.
 *
 * Logica deterministica leggibile (no LLM): mapping voci → etichette
 * + euristica sulle note. Usata come fallback finché la Edge Function
 * `ai-name` non è disponibile (vedi /api/suggerisci-nome).
 *
 * Riferimenti:
 *  - Tassonomia_Lavori.md §2-3 (voci 1..38)
 *  - Flusso_Operativo.md §2 step 5 (capo edita la descrizione)
 */
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
 * Voci "dominanti" mappate a etichette CamelCase brevi. L'ordine in
 * questa lista riflette la priorità: la prima trovata diventa la
 * proposta principale.
 */
const ETICHETTE_DOMINANTI: ReadonlyArray<{ id: number; label: string }> = [
  { id: 17, label: 'ImpiantoSolare' },
  { id: 18, label: 'Fotovoltaico' },
  { id: 19, label: 'InstallazioneCaldaia' },
  { id: 15, label: 'ImpiantoGas' },
  { id: 14, label: 'ImpiantoCondizionamento' },
  { id: 13, label: 'SistemazioneBagno' },
  { id: 31, label: 'MontaggioBagni' },
  { id: 30, label: 'PavimentoRadiante' },
  { id: 32, label: 'CentraleTermica' },
  { id: 16, label: 'AspirazioneCentralizzata' },
  { id: 11, label: 'ColonneSanitario' },
  { id: 12, label: 'ColonneRiscaldamento' },
  { id: 28, label: 'PiattoDoccia' },
];

/**
 * Restituisce una proposta + lista di alternative.
 * Pulizia e CamelCase sono garantiti dall'output.
 */
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

  // Fallback: prime parole significative dalle note (max 30 char)
  if (input.note && input.note.trim().length > 0) {
    const camel = toCamelCase(input.note).slice(0, 30);
    if (camel.length >= 3) {
      return { proposta: camel, alternatives: ['NuovaCommessa'] };
    }
  }

  return { proposta: 'NuovaCommessa', alternatives: [] };
}

function toCamelCase(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}
