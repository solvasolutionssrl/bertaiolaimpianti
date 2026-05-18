import { cn } from '@impiantixplus/ui';

/**
 * UsageBar — barra di progresso usage/quota.
 *
 * Tono basato su rapporto `used / quota`:
 *  - < 80%  → verde (success)
 *  - 80-95% → arancio (warning)
 *  - > 95%  → rosso (critical)
 *
 * `quota = null` → unlimited (mostra solo il valore corrente con barra
 * piatta a sfondo muted).
 */
export interface UsageBarProps {
  label: string;
  used: number;
  quota: number | null;
  /** Formatta valori (es. "1.2 GB" invece di "1.234567") */
  format?: (v: number) => string;
  /** Override label sotto (es. mostra "5/20 utenti" anziché ratio) */
  rightLabel?: string;
}

function defaultFormat(v: number): string {
  if (Number.isInteger(v)) return v.toLocaleString('it-IT');
  return v.toFixed(2);
}

export function UsageBar({
  label,
  used,
  quota,
  format = defaultFormat,
  rightLabel,
}: UsageBarProps) {
  const ratio = quota && quota > 0 ? used / quota : 0;
  const pct = Math.min(100, Math.round(ratio * 100));

  const tone =
    quota === null
      ? 'muted'
      : ratio > 0.95
        ? 'critical'
        : ratio > 0.8
          ? 'warning'
          : 'success';

  const toneClass = {
    muted: 'bg-muted-foreground/40',
    success: 'bg-success',
    warning: 'bg-accent',
    critical: 'bg-destructive',
  }[tone];

  const valoreRight =
    rightLabel ??
    (quota === null
      ? `${format(used)} · illimitato`
      : `${format(used)} / ${format(quota)}`);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            'font-mono text-xs tabular-nums',
            tone === 'critical'
              ? 'text-destructive font-semibold'
              : tone === 'warning'
                ? 'text-foreground font-semibold'
                : 'text-foreground',
          )}
        >
          {valoreRight}
        </p>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full transition-all duration-300', toneClass)}
          style={{ width: quota === null ? '4%' : `${Math.max(2, pct)}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
