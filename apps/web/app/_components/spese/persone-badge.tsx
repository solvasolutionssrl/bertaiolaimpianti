import { User, Users } from 'lucide-react';
import { cn } from '@kommessa/ui';

/**
 * Indicatore "per quante persone" di una spesa (coperti). Solo display:
 * - 1 persona → icona singola discreta (spesa normale);
 * - più persone → icona gruppo + numero, evidenziata.
 */
export function PersoneBadge({
  numero,
  className,
}: {
  numero: number | null | undefined;
  className?: string;
}) {
  const n =
    typeof numero === 'number' && Number.isFinite(numero) && numero > 0
      ? Math.floor(numero)
      : 1;

  if (n <= 1) {
    return (
      <span
        title="Spesa per 1 persona"
        className={cn('inline-flex items-center text-muted-foreground/70', className)}
      >
        <User className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">1 persona</span>
      </span>
    );
  }

  return (
    <span
      title={`Spesa per ${n} persone`}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-400',
        className,
      )}
    >
      <Users className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="text-[11px] font-semibold tabular-nums">{n}</span>
      <span className="sr-only">persone</span>
    </span>
  );
}
