import * as React from 'react';
import { Loader2 } from 'lucide-react';

import { cn } from '../lib/cn';

export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Etichetta accessibile (default: "Caricamento in corso"). */
  label?: string;
  /** Dimensione del cerchio: sm/md/lg (default md). */
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-8 w-8',
};

const Spinner = React.forwardRef<HTMLSpanElement, SpinnerProps>(
  ({ className, label = 'Caricamento in corso', size = 'md', ...rest }, ref) => {
    return (
      <span
        ref={ref}
        role="status"
        aria-live="polite"
        className={cn('inline-flex items-center text-muted-foreground', className)}
        {...rest}
      >
        <Loader2
          className={cn('animate-spin', sizeMap[size])}
          aria-hidden="true"
        />
        <span className="sr-only">{label}</span>
      </span>
    );
  },
);
Spinner.displayName = 'Spinner';

export { Spinner };
