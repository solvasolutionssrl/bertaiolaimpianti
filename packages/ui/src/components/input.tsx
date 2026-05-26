import * as React from 'react';

import { cn } from '../lib/cn';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Input — campo testuale "Operative Modern".
 * Card-bg, hairline border, focus ring sottile cobalt.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          // text-base (16px) su mobile per evitare l'auto-zoom di iOS Safari
          // quando l'input riceve focus. Su tablet+ (sm:) torniamo a text-sm.
          'flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-base text-foreground sm:text-sm',
          'ring-offset-background shadow-soft transition-[box-shadow,border-color] duration-150',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
          'placeholder:text-muted-foreground/70',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:border-ring/40',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/40',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
