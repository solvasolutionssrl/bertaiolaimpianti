import { Activity } from 'lucide-react';
import { Badge, Card, CardContent } from '@impiantixplus/ui';
import { createServiceSupabase } from '@impiantixplus/api/service';
import { requirePlatformAdmin } from '../_lib/guard';
import { SectionHeader } from '../../_components/section-header';
import { AuditToolbar } from './_components/toolbar';

export const metadata = { title: 'Platform · Audit' };
export const dynamic = 'force-dynamic';

interface SP {
  tenant?: string;
  entityType?: string;
  action?: string;
  from?: string;
  to?: string;
}

export default async function AuditPage({ searchParams }: { searchParams: SP }) {
  await requirePlatformAdmin();
  const supabase = createServiceSupabase();

  const [tenantsRes, auditQ] = await Promise.all([
    supabase.from('tenants').select('id, slug, nome').order('nome'),
    (async () => {
      let q = supabase
        .from('audit_events')
        .select('id, created_at, tenant_id, entity_type, action, actor_role, actor_user_id, metadata')
        .order('created_at', { ascending: false })
        .limit(300);
      if (searchParams.tenant) q = q.eq('tenant_id', searchParams.tenant);
      if (searchParams.entityType) q = q.eq('entity_type', searchParams.entityType);
      if (searchParams.action) q = q.eq('action', searchParams.action);
      if (searchParams.from) q = q.gte('created_at', searchParams.from);
      if (searchParams.to) q = q.lte('created_at', searchParams.to);
      return q;
    })(),
  ]);

  const tenants = (tenantsRes.data ?? []) as any[];
  const events = (auditQ.data ?? []) as any[];
  const tenantById = new Map(tenants.map((t) => [t.id, t]));

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Platform"
        title="Audit globale"
        description="Eventi cross-tenant. Filtrabile per tenant, entity, action e date range."
        icon={<Activity />}
      />
      <AuditToolbar tenants={tenants} initial={searchParams} />
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {events.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nessun evento corrispondente al filtro.
            </p>
          ) : (
            events.map((e) => {
              const t = e.tenant_id ? tenantById.get(e.tenant_id) : null;
              return (
                <div
                  key={e.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
                >
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px]"
                  >
                    {t ? t.slug : 'PLATFORM'}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {e.entity_type}
                  </span>
                  <span className="font-medium tracking-tight">{e.action}</span>
                  {e.metadata?.platform ? (
                    <Badge className="border-transparent bg-accent/15 text-accent-foreground text-[10px]">
                      platform
                    </Badge>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {e.metadata?.actor_email ?? e.actor_role}
                  </span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString('it-IT', {
                      dateStyle: 'short',
                      timeStyle: 'medium',
                    })}
                  </span>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
