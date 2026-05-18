import { Badge, cn } from '@impiantixplus/ui';

/**
 * Badge stato tenant.
 * - Attivo → verde success
 * - Sospeso → rosso destructive (con motivo opzionale come tooltip)
 */
export function TenantStatusBadge({
  sospeso,
  motivo,
}: {
  sospeso: boolean;
  motivo?: string | null;
}) {
  if (sospeso) {
    return (
      <Badge
        variant="destructive"
        title={motivo ?? 'Sospeso'}
        className="border-transparent"
      >
        Sospeso
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-success/30 bg-success/10 text-success-foreground',
        'text-success',
      )}
    >
      Attivo
    </Badge>
  );
}
