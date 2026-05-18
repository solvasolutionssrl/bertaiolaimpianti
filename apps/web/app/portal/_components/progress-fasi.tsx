import { cn } from '@impiantixplus/ui';

export interface ProgressFasiProps {
  totali: number;
  completate: number;
  /** Variante compatta per le card della home. */
  compact?: boolean;
  className?: string;
}

/**
 * Barra di progresso fasi commessa.
 *
 * Calcolo: `completate / totali`. Se `totali === 0` mostra stato "in
 * preparazione" anziché 0% (commessa appena aperta, le fasi vengono
 * popolate dal capo via PWA).
 */
export function ProgressFasi({
  totali,
  completate,
  compact,
  className,
}: ProgressFasiProps) {
  const hasFasi = totali > 0;
  const pct = hasFasi ? Math.round((completate / totali) * 100) : 0;

  return (
    <div className={cn('w-full', className)} aria-live="polite">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span
          className={cn(
            'font-medium',
            compact ? 'text-xs' : 'text-sm',
            'text-foreground',
          )}
        >
          {compact ? 'Avanzamento' : 'Avanzamento lavori'}
        </span>
        <span
          className={cn(
            'tabular-nums font-semibold',
            compact ? 'text-xs' : 'text-sm',
            hasFasi ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {hasFasi
            ? `${completate}/${totali} fasi · ${pct}%`
            : 'In preparazione'}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Avanzamento lavori: ${pct} percento`}
        className={cn(
          'w-full overflow-hidden rounded-full bg-muted',
          compact ? 'h-2' : 'h-3',
        )}
      >
        <div
          className="h-full rounded-full bg-[var(--brand-color,theme(colors.primary.DEFAULT))] transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
