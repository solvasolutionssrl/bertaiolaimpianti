import * as React from 'react';

import { cn } from '../lib/cn';

/**
 * KpiCard — card KPI tono editoriale.
 *
 * - Label uppercase, tracking aperto, muted, micro (`text-xs`).
 * - Numero gigantesco `text-5xl` mono tabular tracking-tighter.
 * - Hairline border + shadow-soft. Hover: lift sottile (translate + shadow).
 * - Tone variants applicano un accent al numero + barra di sinistra.
 */
export type KpiTone = 'default' | 'warning' | 'critical' | 'success';

export interface KpiCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: KpiTone;
  icon?: React.ReactNode;
}

const toneStyles: Record<
  KpiTone,
  { bar: string; value: string; iconBg: string; iconFg: string }
> = {
  default: {
    bar: 'bg-primary',
    value: 'text-foreground',
    iconBg: 'bg-primary-soft',
    iconFg: 'text-primary',
  },
  warning: {
    bar: 'bg-accent',                   // arancio brand → operativo "vivo"
    value: 'text-foreground',
    iconBg: 'bg-accent-soft',
    iconFg: 'text-accent-soft-foreground',
  },
  critical: {
    bar: 'bg-destructive',
    value: 'text-destructive',
    iconBg: 'bg-destructive/10',
    iconFg: 'text-destructive',
  },
  success: {
    bar: 'bg-success',
    value: 'text-foreground',
    iconBg: 'bg-success/10',
    iconFg: 'text-success',
  },
};

const KpiCard = React.forwardRef<HTMLDivElement, KpiCardProps>(
  (
    { label, value, hint, tone = 'default', icon, className, ...rest },
    ref,
  ) => {
    const styles = toneStyles[tone];
    return (
      <div
        ref={ref}
        role="figure"
        aria-label={`${label}: ${typeof value === 'string' || typeof value === 'number' ? value : ''}`}
        className={cn(
          'group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-card p-5 shadow-soft',
          'transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-soft-md',
          className,
        )}
        {...rest}
      >
        {/* barra accent verticale sinistra, sottile */}
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-y-3 left-0 w-[2px] rounded-full',
            styles.bar,
          )}
        />

        <div className="flex items-start justify-between gap-3">
          <p className="pl-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>
          {icon ? (
            <span
              aria-hidden="true"
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-md [&_svg]:size-3.5',
                styles.iconBg,
                styles.iconFg,
              )}
            >
              {icon}
            </span>
          ) : null}
        </div>

        <p
          className={cn(
            'mt-6 pl-2 font-mono text-5xl font-medium leading-none tracking-tighter tabular-nums md:text-6xl',
            styles.value,
          )}
        >
          {value}
        </p>

        {hint ? (
          <p className="mt-3 pl-2 text-xs leading-snug text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
KpiCard.displayName = 'KpiCard';

export { KpiCard };
