import { Badge, cn } from '@impiantixplus/ui';
import { AlertTriangle, CheckCircle2, Clock, TimerOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Status SLA possibili, esposti dalla view public.tickets_with_sla
 * (campo sla_status) e dalla function public.ticket_sla_status().
 */
export type SlaStatus =
  | 'ok'
  | 'risposta_a_rischio'
  | 'risposta_breach'
  | 'chiusura_a_rischio'
  | 'chiusura_breach';

interface BadgeConfig {
  label: string;
  className: string;
  icon: LucideIcon;
  /** True per stati che richiedono attenzione (filtro "Solo a rischio / breach"). */
  alert: boolean;
}

/**
 * Brand:
 *  - rischio  -> arancio (--accent)  via bg-accent
 *  - breach   -> rosso  (--destructive)
 *  - ok       -> muted neutro
 *
 * I colori vengono dai design token del preset Tailwind di @impiantixplus/ui,
 * NON da classi hardcoded di Tailwind (niente bg-orange-500 ecc.).
 */
const SLA_BADGE_CONFIG: Record<SlaStatus, BadgeConfig> = {
  ok: {
    label: 'SLA ok',
    className: 'bg-muted text-muted-foreground border border-border',
    icon: CheckCircle2,
    alert: false,
  },
  risposta_a_rischio: {
    label: 'Risposta vicina',
    className: 'bg-accent/30 text-accent-foreground border border-accent/40',
    icon: Clock,
    alert: true,
  },
  risposta_breach: {
    label: 'Risposta scaduta',
    className: 'bg-accent text-accent-foreground border border-accent',
    icon: TimerOff,
    alert: true,
  },
  chiusura_a_rischio: {
    label: 'Chiusura vicina',
    className: 'bg-accent/30 text-accent-foreground border border-accent/40',
    icon: AlertTriangle,
    alert: true,
  },
  chiusura_breach: {
    label: 'Chiusura scaduta',
    className:
      'bg-destructive text-destructive-foreground border border-destructive',
    icon: TimerOff,
    alert: true,
  },
};

/** True se lo status richiede attenzione (a rischio o breach). */
export function isSlaAlerting(status: SlaStatus | string | null | undefined): boolean {
  if (!status || !(status in SLA_BADGE_CONFIG)) return false;
  return SLA_BADGE_CONFIG[status as SlaStatus].alert;
}

export function SlaBadge({
  status,
  className,
  showIcon = true,
}: {
  status: SlaStatus | string | null | undefined;
  className?: string;
  showIcon?: boolean;
}) {
  const safe: SlaStatus =
    status && status in SLA_BADGE_CONFIG ? (status as SlaStatus) : 'ok';
  const cfg = SLA_BADGE_CONFIG[safe];
  const Icon = cfg.icon;

  return (
    <Badge
      variant="outline"
      className={cn('gap-1', cfg.className, className)}
      title={cfg.label}
    >
      {showIcon ? <Icon className="h-3 w-3" aria-hidden="true" /> : null}
      <span>{cfg.label}</span>
    </Badge>
  );
}
