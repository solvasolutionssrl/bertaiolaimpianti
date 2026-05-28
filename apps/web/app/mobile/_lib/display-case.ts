/**
 * Title-case "elegante" per il display dei dati nella PWA mobile.
 *
 * Scopo: rendere professionale l'aspetto dei dati anche quando il dato reale
 * è scritto male (tutto minuscolo, TUTTO MAIUSCOLO, ecc.). Usato SOLO lato PWA
 * per nomi/etichette: cliente, indirizzo, titolo lavoro, nomi persona.
 *
 * NON usare per:
 *  - path / nome_cartella raw / nomi file
 *  - codici interni (codice_interno) — vanno mostrati così come sono
 *  - dati "veri" lato office dove conta la fedeltà al dato originale
 *
 * Regole:
 *  - lowercase di tutto, poi prima lettera di ogni parola maiuscola
 *  - le stopword italiane (di, da, e, il, la, dei…) restano minuscole, tranne
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

function capWord(w: string): string {
  // Maiuscola dopo inizio parola o separatore interno (. ' - /)
  return w.replace(/(^|[.'\-/])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * Title-case con stopword italiane. La prima parola è sempre capitalizzata.
 * Ritorna stringa vuota per input nullo/vuoto.
 */
export function titoloCase(input: string | null | undefined): string {
  if (!input) return '';
  const s = input.trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  // split mantenendo i token di spazio così da preservare la spaziatura originale
  const tokens = lower.split(/(\s+)/);
  let firstWordSeen = false;
  return tokens
    .map((tok) => {
      if (tok.length === 0 || /^\s+$/.test(tok)) return tok;
      const isFirst = !firstWordSeen;
      firstWordSeen = true;
      if (!isFirst && MINUSCOLE.has(tok)) return tok;
      return capWord(tok);
    })
    .join('');
}

/**
 * Variante "null-safe con fallback": se il valore è vuoto ritorna il fallback
 * (non title-cased). Comodità per i template JSX.
 */
export function titoloCaseOr(input: string | null | undefined, fallback: string): string {
  const out = titoloCase(input);
  return out || fallback;
}
