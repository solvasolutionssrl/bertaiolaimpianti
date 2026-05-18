import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/cn';

/**
 * Badge — pill compatto "Operative Modern".
 * h-6, px-2.5, text-xs, tracking-tight. Hairline border per outline.
 * default = accent cobalt tint (su carta calda spicca senza urlare).
 */
const badgeVariants = cva(
  'inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium tracking-tight leading-none whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40 focus:ring-offset-1',
  {
    variants: {
      variant: {
        default:
          'border border-accent-foreground/10 bg-accent text-accent-foreground',
        secondary:
          'border border-border bg-muted text-foreground',
        destructive:
          'border border-transparent bg-destructive text-destructive-foreground',
        outline: 'border border-border bg-card text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
