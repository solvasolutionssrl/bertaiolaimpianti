import { Card, CardContent } from '@impiantixplus/ui';
import { History } from 'lucide-react';
import { createServerSupabase } from '@impiantixplus/api/server';
import { EmptyState } from '../../../../_components/empty-state';
import { descriviAuditEvent, fmtDataOra } from '../../../_lib/format';

export const dynamic = 'force-dynamic';

export default async function CronologiaTab({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('audit_events')
    .select('id, entity_type, entity_id, action, metadata, created_at, actor_role')
    .or(
      `and(entity_type.eq.commessa,entity_id.eq.${params.id}),and(entity_type.eq.commessa_voce,entity_id.like.${params.id}%)`,
    )
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = error ? [] : data ?? [];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Nessun evento registrato"
        description="Tutte le azioni — cambi di stato, upload, modifiche — compariranno qui in ordine cronologico."
      />
    );
  }

  return (
    <Card>
      <CardContent className="divide-y divide-border p-0">
        {rows.map((e: any) => (
          <div key={e.id} className="flex items-start gap-3 p-3 text-sm">
            <span className="w-36 shrink-0 font-mono text-xs text-muted-foreground">
              {fmtDataOra(e.created_at)}
            </span>
            <span className="flex-1">{descriviAuditEvent(e)}</span>
            <span className="text-xs uppercase text-muted-foreground">
              {e.actor_role ?? '—'}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
