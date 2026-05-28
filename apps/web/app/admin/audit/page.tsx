import { Activity, ChevronDown } from 'lucide-react';
import { Badge, Card, CardContent } from '@kommessa/ui';
import { createServiceSupabase } from '@kommessa/api/service';
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

interface AuditRow {
  id: string;
  created_at: string;
  tenant_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_role: string | null;
  actor_user_id: string | null;
  metadata: Record<string, unknown> | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  await requirePlatformAdmin();
  const supabase = createServiceSupabase();

  const [tenantsRes, auditRes] = await Promise.all([
    supabase.from('tenants').select('id, slug, nome').order('nome'),
    (async () => {
      let q = supabase
        .from('audit_events')
        .select(
          'id, created_at, tenant_id, entity_type, entity_id, action, actor_role, actor_user_id, metadata, before_data, after_data',
        )
        .order('created_at', { ascending: false })
        .limit(500);
      if (searchParams.tenant) q = q.eq('tenant_id', searchParams.tenant);
      if (searchParams.entityType) q = q.eq('entity_type', searchParams.entityType);
      if (searchParams.action) q = q.eq('action', searchParams.action);
      if (searchParams.from) q = q.gte('created_at', searchParams.from);
      if (searchParams.to) q = q.lte('created_at', searchParams.to);
      return q;
    })(),
  ]);

  const tenants = (tenantsRes.data ?? []) as Array<{
    id: string;
    slug: string;
    nome: string;
  }>;
  const events = (auditRes.data ?? []) as AuditRow[];
  const tenantById = new Map(tenants.map((t) => [t.id, t]));

  // Lookup actor: query batch users per gli actor_user_id presenti.
  const actorIds = Array.from(
    new Set(
      events
        .map((e) => e.actor_user_id)
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const actorById = new Map<
    string,
    { id: string; display_name: string | null }
  >();
  if (actorIds.length > 0) {
    const { data: usersRes } = await supabase
      .from('users')
      .select('id, display_name')
      .in('id', actorIds);
    for (const u of (usersRes ?? []) as Array<{
      id: string;
      display_name: string | null;
    }>) {
      actorById.set(u.id, u);
    }
  }

  // Aggregazioni per il pannello "panoramica filtro".
  const counterByTenant = new Map<string, number>();
  const counterByEntityType = new Map<string, number>();
  const counterByAction = new Map<string, number>();
  for (const e of events) {
    const tenantKey = e.tenant_id ?? 'PLATFORM';
    counterByTenant.set(tenantKey, (counterByTenant.get(tenantKey) ?? 0) + 1);
    counterByEntityType.set(
      e.entity_type,
      (counterByEntityType.get(e.entity_type) ?? 0) + 1,
    );
    counterByAction.set(e.action, (counterByAction.get(e.action) ?? 0) + 1);
  }
  const topTenants = [...counterByTenant.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const topEntities = [...counterByEntityType.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const topActions = [...counterByAction.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Platform"
        title="Audit globale"
        description={`Ultimi ${events.length} eventi (cap 500). Filtra per tenant, entity, action, periodo. Esporta CSV per analisi esterne.`}
        icon={<Activity />}
      />

      <AuditToolbar tenants={tenants} initial={searchParams} />

      {/* Pannello sintesi: chip cliccabili per applicare/togliere il filtro
          → si possono usare come quick-filter. */}
      {events.length > 0 ? (
        <Card>
          <CardContent className="space-y-3 py-3 text-xs">
            <SummaryRow
              label="Tenant"
              items={topTenants.map(([id, n]) => ({
                key: id,
                label:
                  id === 'PLATFORM' ? 'PLATFORM' : tenantById.get(id)?.slug ?? id.slice(0, 8),
                count: n,
              }))}
            />
            <SummaryRow
              label="Entity"
              items={topEntities.map(([t, n]) => ({ key: t, label: t, count: n }))}
            />
            <SummaryRow
              label="Action"
              items={topActions.map(([a, n]) => ({ key: a, label: a, count: n }))}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {events.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nessun evento corrispondente al filtro.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((e) => {
                const t = e.tenant_id ? tenantById.get(e.tenant_id) : null;
                const actor = e.actor_user_id ? actorById.get(e.actor_user_id) : null;
                const hasDetails =
                  (e.metadata && Object.keys(e.metadata).length > 0) ||
                  e.before_data !== null ||
                  e.after_data !== null;
                return (
                  <li key={e.id}>
                    <details className="group">
                      <summary
                        className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm transition-colors ${
                          hasDetails
                            ? 'cursor-pointer hover:bg-muted/40'
                            : 'cursor-default'
                        }`}
                      >
                        {hasDetails ? (
                          <ChevronDown
                            className="h-3 w-3 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                            aria-hidden="true"
                          />
                        ) : (
                          <span className="h-3 w-3 shrink-0" aria-hidden="true" />
                        )}
                        <Badge
                          variant="outline"
                          className="shrink-0 font-mono text-[10px]"
                        >
                          {t ? t.slug : 'PLATFORM'}
                        </Badge>
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          {e.entity_type}
                        </span>
                        <span className="shrink-0 font-medium tracking-tight">
                          {e.action}
                        </span>
                        {e.metadata?.platform ? (
                          <Badge className="shrink-0 border-transparent bg-accent/15 text-accent-foreground text-[10px]">
                            platform
                          </Badge>
                        ) : null}
                        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                          {actor
                            ? actor.display_name ?? actor.id.slice(0, 8)
                            : (e.metadata?.actor_email as string | undefined) ??
                              e.actor_role ??
                              '—'}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          {new Date(e.created_at).toLocaleString('it-IT', {
                            dateStyle: 'short',
                            timeStyle: 'medium',
                          })}
                        </span>
                      </summary>
                      {hasDetails ? (
                        <div className="space-y-2 border-t border-border/60 bg-muted/30 px-4 py-3 text-[11px]">
                          <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1">
                            <span className="font-mono text-muted-foreground">
                              entity_id
                            </span>
                            <span className="break-all font-mono">
                              {e.entity_id}
                            </span>
                            {actor ? (
                              <>
                                <span className="font-mono text-muted-foreground">
                                  actor
                                </span>
                                <span className="break-all">
                                  {actor.display_name ?? actor.id}
                                  {e.actor_role ? (
                                    <Badge
                                      variant="outline"
                                      className="ml-1.5 text-[9px]"
                                    >
                                      {e.actor_role}
                                    </Badge>
                                  ) : null}
                                </span>
                              </>
                            ) : null}
                          </div>
                          {e.metadata && Object.keys(e.metadata).length > 0 ? (
                            <JsonBlock label="metadata" data={e.metadata} />
                          ) : null}
                          {e.before_data ? (
                            <JsonBlock label="before" data={e.before_data} tone="muted" />
                          ) : null}
                          {e.after_data ? (
                            <JsonBlock label="after" data={e.after_data} tone="success" />
                          ) : null}
                        </div>
                      ) : null}
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryRow({
  label,
  items,
}: {
  label: string;
  items: Array<{ key: string; label: string; count: number }>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 inline-block min-w-[60px] font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {items.map((it) => (
        <Badge
          key={it.key}
          variant="outline"
          className="font-mono text-[10px]"
        >
          {it.label}
          <span className="ml-1.5 tabular-nums opacity-70">{it.count}</span>
        </Badge>
      ))}
    </div>
  );
}

function JsonBlock({
  label,
  data,
  tone,
}: {
  label: string;
  data: Record<string, unknown>;
  tone?: 'muted' | 'success';
}) {
  const colorClass =
    tone === 'success'
      ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
      : tone === 'muted'
        ? 'border-amber-500/30 bg-amber-500/[0.04]'
        : 'border-border bg-card';
  return (
    <div>
      <p className="mb-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <pre
        className={`max-h-64 overflow-auto rounded border px-2 py-1.5 font-mono text-[10px] leading-snug ${colorClass}`}
      >
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
