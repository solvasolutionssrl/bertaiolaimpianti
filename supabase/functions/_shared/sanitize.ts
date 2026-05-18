// =====================================================================
// _shared/sanitize.ts — helper di normalizzazione per nomi cartella.
// Compatibile con la logica in packages/integrations/src/ai/index.ts.
// Spec: Tassonomia_Lavori.md §2.1.
// =====================================================================

/**
 * Sanifica un segmento di cartella:
 *  - rimuove accenti / diacritici
 *  - rimuove tutto ciò che non è [A-Za-z0-9]
 *  - tronca a `maxLen` (default 30)
 *
 * Esempi:
 *  "Sistemazione Bagno"  → "SistemazioneBagno"
 *  "Caldaia/Condominio"  → "CaldaiaCondominio"
 *  "Solare 6 kW"         → "Solare6kW"
 *  "Pò di tutto"         → "Poditutto"
 */
export function sanitizeFolderSegment(input: string, maxLen = 30): string {
  if (!input) return '';
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, maxLen);
}

/**
 * Estrae un identificativo compatto del cliente da usare come
 * prefisso della cartella commessa.
 *
 *  - persona fisica con "Nome Cognome"        → "Cognome"
 *  - persona fisica con "Cognome Nome"        → "Cognome" (prima parola)
 *  - "Comune di Castagnole delle Lanze"       → "ComuneCastagnole"
 *  - "Mario Rossi"                            → "Rossi"
 *  - ragione sociale lunga                    → CamelCase troncato 30 char
 *
 * Euristica:
 *  - se `tipo === 'persona_fisica'` e ci sono 2 parole, prende l'ultima.
 *  - altrimenti CamelCase di tutte le parole significative (>2 char).
 */
export interface ClienteInput {
  ragione_sociale: string;
  tipo?: 'persona_fisica' | 'azienda' | string;
}

const STOPWORDS = new Set([
  'di', 'da', 'del', 'della', 'dei', 'delle', 'dello', 'degli',
  'il', 'la', 'lo', 'i', 'gli', 'le', 'un', 'una', 'uno',
  'e', 'ed', 'o', 'a',
  's', 'r', 'l', 'srl', 'spa', 'snc', 'sas', 'sa',  // suffissi società
]);

export function cognomeOrRagione(cliente: ClienteInput, maxLen = 30): string {
  const raw = (cliente.ragione_sociale ?? '').trim();
  if (!raw) return 'Cliente';

  const tipo = (cliente.tipo ?? '').toLowerCase();
  const tokens = raw
    .split(/\s+/)
    .map((t) => t.replace(/[.,;:]+$/g, ''))
    .filter((t) => t.length > 0);

  if (tipo === 'persona_fisica' && tokens.length >= 2) {
    // Heuristic: ultimo token = cognome (caso italiano standard).
    const cognome = tokens[tokens.length - 1];
    const out = sanitizeFolderSegment(cognome, maxLen);
    return out || sanitizeFolderSegment(raw, maxLen) || 'Cliente';
  }

  // Azienda / ente: CamelCase delle parole significative, max 3 parole utili.
  const significant = tokens
    .filter((t) => !STOPWORDS.has(t.toLowerCase()))
    .slice(0, 3);

  const camel = significant
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
    .join('');

  const out = sanitizeFolderSegment(camel, maxLen);
  return out || sanitizeFolderSegment(raw, maxLen) || 'Cliente';
}

/**
 * Data ISO YYYY-MM-DD in Europe/Rome (locale operativo del cliente).
 * Edge gira in UTC; convertiamo manualmente.
 */
export function todayIsoEuropeRome(now: Date = new Date()): string {
  // Approssimazione robusta tramite formatToParts (Deno supporta Intl).
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}
