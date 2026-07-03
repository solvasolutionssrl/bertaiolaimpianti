/**
 * Helper condivisi (server + client) per i campi cantiere introdotti col
 * popolamento FPM: `codice_commessa` (codice del cliente) e `categoria`
 * (tipologia di lavoro). Puri, nessun import server-only → usabili ovunque.
 */

/**
 * Codice mostrato all'utente = **codice commessa del cliente** (`codice_commessa`),
 * con fallback al codice interno `CAN-xxx` quando manca (cantieri non importati).
 * È l'identificativo visibile e cercabile ovunque.
 */
export function codiceCantiereMostrato(c: {
  codice_commessa?: string | null;
  codice?: string | null;
}): string | null {
  return (c.codice_commessa && c.codice_commessa.trim()) || c.codice || null;
}

/** Etichetta leggibile della categoria (Title Case da "QUADRI" → "Quadri"). */
export function categoriaLabel(cat: string | null | undefined): string {
  if (!cat) return '';
  return cat
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Palette tenue per i tag categoria (chip). Classi letterali → JIT Tailwind ok.
const TONI = [
  'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
  'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300',
  'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
  'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300',
  'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300',
  'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300',
];

/** Classi tailwind (bordo+sfondo+testo) STABILI per una categoria. */
export function categoriaTono(cat: string | null | undefined): string {
  if (!cat) return 'border-border bg-muted/50 text-muted-foreground';
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = (h + cat.charCodeAt(i)) % TONI.length;
  return TONI[h] ?? 'border-border bg-muted/50 text-muted-foreground';
}
