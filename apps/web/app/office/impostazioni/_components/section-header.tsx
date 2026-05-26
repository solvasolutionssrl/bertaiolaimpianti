import type { ReactNode } from 'react';
import { cn } from '@kommessa/ui';

/**
 * SectionHeader compatto per le pagine di /impostazioni.
 *
 * Rispetto al SectionHeader globale (app/_components/section-header.tsx)
 * usa dimensioni ridotte: titolo text-base, nessun eyebrow, nessun box icona.
 * Mantiene la stessa API per retrocompatibilità con le pagine esistenti.
 */
export function SectionHeader({
  title,
  description,
  actions,
  icon: _icon,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b border-border pb-4',
        actions ? 'mb-5' : 'mb-5',
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="shrink-0">{actions}</div>
      ) : null}
    </div>
  );
}
