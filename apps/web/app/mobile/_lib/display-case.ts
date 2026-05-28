/**
 * Title-case "elegante" per il display dei dati nella PWA mobile.
 *
 * Scopo: rendere professionale l'aspetto dei dati anche quando il dato reale
 * è scritto male (tutto minuscolo, TUTTO MAIUSCOLO, camelCase). Usato SOLO lato
 * PWA per nomi/etichette: cliente, indirizzo, titolo lavoro, nomi persona.
 *
 * NON usare per:
 *  - path / nome_cartella raw / nomi file
 *  - codici interni (codice_interno) — vanno mostrati così come sono
 *  - dati "veri" lato office dove conta la fedeltà al dato originale
 *
 * Regole:
 *  - split del camelCase in parole: "AllacciamentoVasca" → "Allacciamento Vasca"
 *  - le sigle/acronimi corti tutti maiuscoli restano intatti: "WC", "PVC", "SRL"
 *  - le parole con maiuscola interna (es. "iGuzzini") preservano le maiuscole
 *  - per il resto: prima lettera di ogni parola maiuscola, il resto minuscolo
 *    ("VIA ROMA" → "Via Roma", "via roma" → "Via Roma")
 *  - le stopword italiane (di, da, e, dei, sant'…) restano minuscole, tranne
 *    quando sono la prima parola
 *  - gestisce separatori interni: punto, apostrofo, trattino, slash
 *    ("g. verdi" → "G. Verdi", "dell'orto" → "Dell'Orto")
 */

const MINUSCOLE = new Set([
  'di', 'da', 'de', 'del', 'dello', 'della', 'dei', 'degli', 'delle',
  'dal', 'dallo', 'dalla', 'dai', 'dagli', 'dalle',
  'e', 'ed', 'o', 'od', 'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una',
  'in', 'con', 'su', 'per', 'tra', 'fra', 'a', 'al', 'allo', 'alla', 'ai', 'agli', 'alle',
  'nel', 'nello', 'nella', 'nei', 'negli', 'nelle',
  'sul', 'sullo', 'sulla', 'sui', 'sugli', 'sulle',
]);

/** Maiuscola dopo inizio parola o separatore interno (. ' - /), resto minuscolo. */
function capWordLower(w: string): string {
  return w
    .toLowerCase()
    .replace(/(^|[.'\-/])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Prima lettera maiuscola lasciando intatto il resto (preserva maiuscole interne). */
function upFirst(w: string): string {
  return w.replace(/^(\p{L})/u, (ch) => ch.toUpperCase());
}

const VOCALI = /[aeiouàáâäèéêëìíîïòóôöùúûü]/i;

function fixWord(w: string, isFirst: boolean): string {
  const lower = w.toLowerCase();
  // stopword italiane minuscole (mai la prima parola)
  if (!isFirst && MINUSCOLE.has(lower)) return lower;
  // sigla/acronimo corto SENZA vocali → preserva (WC, PVC, SRL, SNC, TV).
  // Le parole brevi con vocali (VIA, ROMA, SPA) vengono invece normalizzate.
  if (w.length <= 4 && /^\p{Lu}[\p{Lu}\p{N}]*$/u.test(w) && !VOCALI.test(w)) return w;
  // maiuscola interna residua (es. McX, iPhone) → preserva, garantisci prima maiuscola
  if (/\p{Ll}\p{Lu}/u.test(w)) return upFirst(w);
  // default: normalizza (minuscolo + prima lettera maiuscola)
  return capWordLower(w);
}

/**
 * Title-case robusto. La prima parola è sempre capitalizzata.
 * Ritorna stringa vuota per input nullo/vuoto.
 */
export function titoloCase(input: string | null | undefined): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (!trimmed) return '';
  // split del camelCase:
  //  1) minuscola/cifra seguita da Maiuscola  ("AllacciamentoVasca" → "… Vasca")
  //  2) confine acronimo→parola               ("WCScarico" → "WC Scarico")
  const spaced = trimmed
    .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2');
  const tokens = spaced.split(/(\s+)/);
  let firstSeen = false;
  return tokens
    .map((tok) => {
      if (tok.length === 0 || /^\s+$/.test(tok)) return tok;
      const isFirst = !firstSeen;
      firstSeen = true;
      return fixWord(tok, isFirst);
    })
    .join('');
}

/**
 * Variante con fallback: se il valore è vuoto ritorna il fallback (non
 * title-cased). Comodità per i template JSX.
 */
export function titoloCaseOr(input: string | null | undefined, fallback: string): string {
  const out = titoloCase(input);
  return out || fallback;
}
