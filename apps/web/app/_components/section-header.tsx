import type { ReactNode } from 'react';
import { cn } from '@impiantixplus/ui';

/**
 * SectionHeader — header riusabile per le pagine office.
 *
 * Pattern grafico:
 *  - eyebrow micro, uppercase, tracking aperto, blu primary (l'accento brand)
 *  - titolo grande, semibold, tracking tight
 *  - description muted, max-w-2xl
 *  - actions slot a destra (CTA, filtri, badge…)
 *  - icona opzionale dentro un quadratino bg-primary-soft → "vivo"
 *
 * Server Component: nessun hook, niente "use client".
 */
export interface SectionHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  /**
   * Quando `true` mostra una sottile linea di separazione sotto al titolo —
   * utile dentro layout impostazioni o sezioni interne.
   */
  separator?: boolean;
  className?: string;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
  icon,
  separator = false,
  className,
}: SectionHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6',
        separator && 'border-b border-border pb-5',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span
            aria-hidden="true"
            className={cn(
              'mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
              'bg-primary-soft text-primary [&_svg]:size-4',
            )}
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 space-y-1.5">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="max-w-2xl text-sm leading-snug text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
