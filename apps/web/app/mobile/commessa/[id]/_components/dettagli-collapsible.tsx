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
 * "Dettagli" del lavoro nell'hero, come card dedicata: a riposo 2 righe con
 * "Leggi tutto", tap per espandere il testo integrale. La matita di modifica
 * (admin) è `absolute` dentro questa card `relative`, così resta nella card e
 * NON finisce nell'angolo dell'hero vicino al menu "⋯".
 */
export function DettagliCollapsible({ commessaId, testo, initial, canEdit }: Props) {
  const [open, setOpen] = React.useState(false);
  const hasTesto = !!testo;

  return (
    <div className="relative mt-3 overflow-hidden rounded-xl border border-primary-foreground/15 bg-primary-foreground/[0.06]">
      <button
        type="button"
        onClick={() => hasTesto && setOpen((o) => !o)}
        aria-expanded={open}
        disabled={!hasTesto}
        className="flex w-full flex-col gap-1 px-3.5 py-3 text-left"
      >
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-primary-foreground/55">
          Dettagli
        </span>
        {hasTesto ? (
          <span
            className={`pr-6 text-sm leading-relaxed text-primary-foreground/90 ${
              open ? '' : 'line-clamp-2'
            }`}
          >
            {testo}
          </span>
        ) : (
          <span className="text-[13px] italic text-primary-foreground/45">
            Nessun dettaglio lavoro.
          </span>
        )}
        {hasTesto ? (
          <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-primary-foreground/70">
            {open ? 'Comprimi' : 'Leggi tutto'}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </span>
        ) : null}
      </button>

      {/* Matita: assoluta MA dentro questa card (relative) → resta nella card. */}
      <DettagliEdit
        commessaId={commessaId}
        initial={initial}
        canEdit={canEdit}
        triggerClassName="text-primary-foreground/50 hover:bg-primary-foreground/10 hover:text-primary-foreground"
      />
    </div>
  );
}
