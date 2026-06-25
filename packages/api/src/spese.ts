/**
 * Logica pura per le spese di cantiere (Kontabilità).
 * Niente I/O: solo parsing/validazione testabile.
 */

export const CATEGORIE_SPESA = [
  'hotel',
  'ristorante',
  'bar',
  'trasporti',
  'carburante',
  'varie',
] as const;
export type CategoriaSpesa = (typeof CATEGORIE_SPESA)[number];

export function isCategoriaSpesa(s: unknown): s is CategoriaSpesa {
  return typeof s === 'string' && (CATEGORIE_SPESA as readonly string[]).includes(s);
}

/** Normalizza una categoria sconosciuta a 'varie'. */
export function normalizzaCategoria(s: unknown): CategoriaSpesa {
  return isCategoriaSpesa(s) ? s : 'varie';
}

/**
 * Converte un importo testuale in number, o null se non parsabile.
 * Gestisce: "1.234,50" (IT), "15,90" (IT), "15.90" (EN), "€ 8,00".
 */
export function parseImportoIt(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  let s = raw.replace(/[^0-9.,-]/g, '').trim();
  if (!s || s === '-' || s === '.' || s === ',') return null;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // l'ultimo separatore in ordine e' il decimale; l'altro e' delle migliaia
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    s = s.replace(',', '.');
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Soglia minima di estrazione: per salvare una spesa servono almeno
 * l'importo totale (> 0) e la data dello scontrino. Sotto questa soglia
 * la PWA chiede una nuova scansione.
 */
export function estrazioneSufficiente(x: {
  importo_totale: number | null;
  data_scontrino: string | null;
}): boolean {
  return (
    typeof x.importo_totale === 'number' &&
    Number.isFinite(x.importo_totale) &&
    x.importo_totale > 0 &&
    !!x.data_scontrino
  );
}

/** Imponibile = totale - iva, arrotondato a 2 decimali, solo se entrambi noti. */
export function calcolaImponibile(
  totale: number | null,
  iva: number | null,
): number | null {
  if (typeof totale !== 'number' || !Number.isFinite(totale)) return null;
  if (typeof iva !== 'number' || !Number.isFinite(iva)) return null;
  return Math.round((totale - iva) * 100) / 100;
}
