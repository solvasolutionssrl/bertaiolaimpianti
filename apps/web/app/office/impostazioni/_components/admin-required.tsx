import { Lock } from 'lucide-react';
import { Card, CardContent } from '@impiantixplus/ui';

export function AdminRequiredNotice({
  message = 'Solo gli amministratori del tenant possono modificare questa sezione.',
}: {
  message?: string;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex items-start gap-3 p-4 text-sm text-muted-foreground">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" aria-hidden="true" />
        <p>{message}</p>
      </CardContent>
    </Card>
  );
}
