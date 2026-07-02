'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { DettagliEdit } from '../../../../_components/dettagli-edit';

interface Props {
  commessaId: string;
  testo: string | null;
  initial: string | null;
  canEdit: boolean;
}

/**
 * "Dettagli" del lavoro nell'hero: a riposo una riga sola (per non far occupare
 * all'header mezzo schermo), tap per espandere il testo integrale. La matita di
 * modifica (admin) resta separata e non innesca l'espansione.
 */
export function DettagliCollapsible({ commessaId, testo, initial, canEdit }: Props) {
  const [open, setOpen] = React.useState(false);
  const hasTesto = !!testo;

  return (
    <div className="mt-3 border-t border-primary-foreground/10 pt-3">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => hasTesto && setOpen((o) => !o)}
          aria-expanded={open}
          disabled={!hasTesto}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <span className="mt-0.5 shrink-0 text-[10px] font-bold uppercase tracking-[0.06em] text-primary-foreground/50">
            Dettagli
          </span>
          {hasTesto ? (
            <span
              className={`text-[13px] leading-relaxed text-primary-foreground/90 ${
                open ? '' : 'line-clamp-1'
              }`}
            >
              {testo}
            </span>
          ) : (
            <span className="text-[12px] italic text-primary-foreground/40">
              Nessun dettaglio lavoro.
            </span>
          )}
          {hasTesto ? (
            <ChevronDown
              className={`mt-0.5 h-4 w-4 shrink-0 text-primary-foreground/45 transition-transform ${
                open ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          ) : null}
        </button>
        <DettagliEdit
          commessaId={commessaId}
          initial={initial}
          canEdit={canEdit}
          triggerClassName="text-primary-foreground/40 hover:bg-primary-foreground/10 hover:text-primary-foreground"
        />
      </div>
    </div>
  );
}
