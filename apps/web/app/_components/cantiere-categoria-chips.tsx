'use client';

import { categoriaLabel } from '@/app/_lib/cantiere-categoria';

/**
 * Riga di chip per filtrare i cantieri per tipologia (categoria). Pensata per
 * il **desktop office** (c'è spazio orizzontale). Su mobile si usa invece il
 * dropdown compatto accanto alla ricerca.
 */
export function CategoriaChips({
  categorie,
  selected,
  onSelect,
  className = '',
}: {
  categorie: string[];
  selected: string | null;
  onSelect: (cat: string | null) => void;
  className?: string;
}) {
  if (categorie.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <Chip active={selected === null} onClick={() => onSelect(null)} label="Tutte" />
      {categorie.map((cat) => (
        <Chip
          key={cat}
          active={selected === cat}
          onClick={() => onSelect(cat)}
          label={categoriaLabel(cat)}
        />
      ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors ' +
        (active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground')
      }
    >
      {label}
    </button>
  );
}
