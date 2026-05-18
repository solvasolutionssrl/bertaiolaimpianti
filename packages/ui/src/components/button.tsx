import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/cn';

/**
 * Button — pulsante "Operative Modern" per impiantiXplus.
 *
 * Direzione visiva: tipografia Geist, hairline borders, radius 10px,
 * focus ring sottile cobalt. Tap target generosi (≥40/44/48px) per
 * uso indistintamente desktop e mobile.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md',
    'text-sm font-medium tracking-tight',
    'ring-offset-background transition-[background-color,border-color,box-shadow,color,transform] duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
    'active:translate-y-px',
  ].join(' '),
  {
    variants: {
      variant: {
        // Ink near-black on warm paper: il bottone "principale" è scuro,
        // contrastato e neutro — l'accento cobalt resta riservato a link/badge.
        default:
          'bg-foreground text-background hover:bg-foreground/90 active:bg-foreground/95',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-input bg-card text-foreground shadow-soft hover:bg-accent hover:text-accent-foreground hover:border-accent-foreground/20',
        secondary:
          'bg-muted text-foreground hover:bg-muted/70 border border-border',
        ghost:
          'text-foreground hover:bg-accent hover:text-accent-foreground',
        link:
          'text-primary underline-offset-4 hover:underline px-0 h-auto',
      },
      size: {
        sm: 'min-h-10 h-10 px-3 text-xs',
        default: 'min-h-11 h-11 px-4',
        lg: 'min-h-12 h-12 px-6 text-base',
        icon: 'h-10 w-10 min-h-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
