import type { CategoriaSpesa } from '@kommessa/api/spese';

/**
 * Meta delle categorie di spesa (label IT + classi colore badge), condivise
 * fra PWA, office e admin per coerenza visiva.
 */
export const CATEGORIA_META: Record<
  CategoriaSpesa,
  { label: string; badge: string; dot: string }
> = {
  hotel: {
    label: 'Hotel',
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    dot: 'bg-indigo-500',
  },
  ristorante: {
    label: 'Ristorante',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
  },
  bar: {
    label: 'Bar',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
  },
  trasporti: {
    label: 'Trasporti',
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
    dot: 'bg-sky-500',
  },
  carburante: {
    label: 'Carburante',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  varie: {
    label: 'Varie',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
  },
};

/** Ordine canonico per i selettori/filtri. */
export const CATEGORIE_ORDINATE: CategoriaSpesa[] = [
  'hotel',
  'ristorante',
  'bar',
  'trasporti',
  'carburante',
  'varie',
];
