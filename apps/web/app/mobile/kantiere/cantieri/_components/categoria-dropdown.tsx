'use client';

import * as React from 'react';
import { SlidersHorizontal, Check } from 'lucide-react';

import { categoriaLabel } from '@/app/_lib/cantiere-categoria';

/**
 * Filtro tipologia compatto per la PWA: sta a DESTRA del campo ricerca, inline,
 * stessa altezza (~25% di larghezza). Bottone che apre un menù a tendina.
 */
export function CategoriaDropdown({
  categorie,
  selected,
  onSelect,
}: {
  categorie: string[];
  selected: string | null;
  onSelect: (cat: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const attivo = selected !== null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Filtra per tipologia"
        className={
          'flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border px-2.5 text-sm font-medium shadow-soft transition-colors ' +
          (attivo
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border bg-card text-muted-foreground')
        }
      >
        <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{attivo ? categoriaLabel(selected) : 'Tipo'}</span>
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-1.5 max-h-72 w-56 overflow-auto rounded-xl border border-border bg-card p-1 shadow-lg">
          <Opt
            label="Tutte le tipologie"
            active={selected === null}
            onClick={() => {
              onSelect(null);
              setOpen(false);
            }}
          />
          {categorie.map((cat) => (
            <Opt
              key={cat}
              label={categoriaLabel(cat)}
              active={selected === cat}
              onClick={() => {
                onSelect(cat);
                setOpen(false);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Opt({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ' +
        (active ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-muted')
      }
    >
      <span className="truncate">{label}</span>
      {active ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
    </button>
  );
}
