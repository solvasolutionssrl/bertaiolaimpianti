import * as React from 'react';

import { cn } from '../lib/cn';

/**
 * StatoBadge — badge stato commessa "Operative Modern".
 *
 * Pallino colorato (size-1.5 rounded-full) + label. Bordo hairline su
 * superficie carta (bg-card) per leggibilità su tabelle/dashboard senza
 * affaticare. Niente emoji.
 *
 * Mapping ufficiale (token `stato.*`):
 *  - aperta      → verde forest
 *  - in_corso    → cobalt (primary)
 *  - collaudo    → amber
 *  - critica     → rosso
 *  - completata  → ink scuro
 *  - bozza       → slate
 *  - archiviata  → dark slate
 */
export type Stato =
  | 'aperta'
  | 'collaudo'
  | 'in_corso'
  | 'completata'
  | 'archiviata'
  | 'bozza'
  | 'critica';

interface StatoSpec {
  label: string;
  /** Classe statica per il pallino — Tailwind JIT-safe. */
  dot: string;
  /** Classe statica per il testo. */
  text: string;
}

const SPECS: Record<Stato, StatoSpec> = {
  aperta: {
    label: 'Aperta',
    dot: 'bg-stato-aperta',
    text: 'text-foreground',
  },
  in_corso: {
    label: 'In corso',
    dot: 'bg-stato-in-corso',
    text: 'text-foreground',
  },
  collaudo: {
    label: 'Collaudo',
    dot: 'bg-stato-collaudo',
    text: 'text-foreground',
  },
  critica: {
    label: 'Critica',
    dot: 'bg-stato-critica',
    text: 'text-foreground',
  },
  completata: {
    label: 'Completata',
    dot: 'bg-stato-completata',
    text: 'text-muted-foreground',
  },
  bozza: {
    label: 'Bozza',
    dot: 'bg-stato-bozza',
    text: 'text-muted-foreground',
  },
  archiviata: {
    label: 'Archiviata',
    dot: 'bg-stato-archiviata',
    text: 'text-muted-foreground',
  },
};

export interface StatoBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  stato: Stato;
  /**
   * Compat: l'API legacy esponeva `hideEmoji`. La nuova UI non usa emoji,
   * il flag resta per non rompere consumer ma è no-op.
   */
  hideEmoji?: boolean;
  /** Sostituisce la label di default. */
  label?: string;
}

const StatoBadge = React.forwardRef<HTMLSpanElement, StatoBadgeProps>(
  ({ stato, label, className, hideEmoji: _hideEmoji, ...rest }, ref) => {
    const spec = SPECS[stato] ?? SPECS.bozza;
    return (
      <span
        ref={ref}
        role="status"
        aria-label={`Stato: ${label ?? spec.label}`}
        className={cn(
          'inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-xs font-medium tracking-tight leading-none whitespace-nowrap',
          spec.text,
          className,
        )}
        {...rest}
      >
        <span
          aria-hidden="true"
          className={cn('size-1.5 rounded-full shrink-0', spec.dot)}
        />
        <span>{label ?? spec.label}</span>
      </span>
    );
  },
);
StatoBadge.displayName = 'StatoBadge';

export { StatoBadge };
