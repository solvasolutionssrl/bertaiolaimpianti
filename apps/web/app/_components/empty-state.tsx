import type { ComponentType, ReactNode, SVGProps } from 'react';
import { cn } from '@impiantixplus/ui';

/**
 * EmptyState — placeholder visuale "vivo" per liste vuote / risultati zero.
 *
 * Stile: bordo dashed, icona dentro circle bg-primary-soft, centered, padding
 * generoso. Copy caldo + CTA accent (slot `action`). Tono editoriale, niente
 * emoji, niente spinner.
 */
export interface EmptyStateProps {
  /** Componente Lucide-like (es. `<Icon />` da lucide-react). */
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Tono dell'illustrazione: primary (default) o accent (warm/CTA). */
  tone?: 'primary' | 'accent';
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = 'primary',
  className,
}: EmptyStateProps) {
  const circle =
    tone === 'accent'
      ? 'bg-accent-soft text-accent-soft-foreground'
      : 'bg-primary-soft text-primary';

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50',
        'px-6 py-16 text-center',
        className,
      )}
    >
      {Icon ? (
        <span
          aria-hidden="true"
          className={cn(
            'mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full shadow-soft',
            circle,
          )}
        >
          <Icon className="h-6 w-6" />
        </span>
      ) : null}
      <p className="text-base font-semibold tracking-tight text-foreground">
        {title}
      </p>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-6 flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
