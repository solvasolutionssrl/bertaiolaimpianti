'use client';

import * as React from 'react';
import { Check, ChevronDown, Users } from 'lucide-react';

interface GruppoOpt {
  id: string;
  nome: string;
  colore: string | null;
}

/**
 * Filtro gruppi lavoro **multi-select** (dropdown a checkbox). Vuoto = tutti.
 * Pilota sia la vista in griglia sia l'auto-scope dell'export.
 */
export function GruppoFilter({
  gruppi,
  sel,
  onChange,
}: {
  gruppi: GruppoOpt[];
  sel: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggle = (id: string) =>
    onChange(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);

  const label =
    sel.length === 0
      ? 'Tutti i gruppi'
      : sel.length === 1
        ? gruppi.find((g) => g.id === sel[0])?.nome ?? '1 gruppo'
        : `${sel.length} gruppi`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Filtra per gruppo lavoro"
        className={
          'flex h-9 items-center gap-1.5 rounded-md border bg-background px-2.5 text-sm focus:border-primary focus:outline-none ' +
          (sel.length > 0 ? 'border-primary text-primary' : 'border-input text-muted-foreground')
        }
      >
        <Users className="h-3.5 w-3.5" />
        <span className="max-w-[10rem] truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </button>
      {open ? (
        <div className="absolute left-0 z-40 mt-1 w-60 overflow-hidden rounded-lg border border-border bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/50"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              {sel.length === 0 ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
            </span>
            <span className="font-medium">Tutti i gruppi</span>
          </button>
          <div className="my-1 border-t border-border" />
          <div className="max-h-60 overflow-y-auto">
            {gruppi.map((g) => {
              const on = sel.includes(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggle(g.id)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/50"
                >
                  <span
                    className={
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border ' +
                      (on ? 'border-primary bg-primary text-white' : 'border-input')
                    }
                  >
                    {on ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: g.colore ?? '#94a3b8' }}
                  />
                  <span className="min-w-0 flex-1 truncate">{g.nome}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
