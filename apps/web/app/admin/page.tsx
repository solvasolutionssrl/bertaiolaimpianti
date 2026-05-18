import Link from 'next/link';
import {
  Activity,
  BarChart3,
  Building2,
  Briefcase,
  Database,
  HardDrive,
  RefreshCw,
  Users,
} from 'lucide-react';
import { Badge, Button, Card, CardContent, KpiCard } from '@impiantixplus/ui';
import { createServiceSupabase } from '@impiantixplus/api/service';
import { requirePlatformAdmin } from './_lib/guard';
import { UsageBar } from './_components/usage-bar';
import { TenantStatusBadge } from './_components/tenant-status-badge';
import { aggiornaUsageSnapshot } from './_actions/usage';
import { SectionHeader } from '../_components/section-header';

export const metadata = { title: 'Platform · Dashboard' };
export const dynamic = 'force-dynamic';

interface TenantRow {
  id: string;
  slug: string;
  nome: string;
  sospeso: boolean;
  sospeso_motivo: string | null;
  plan_id: string | null;
}

interface UsageRow {
  tenant_id: string;
  utenti_attivi: number;
  commesse_anno: number;
  commesse_totali: number;
  tickets_mese: number;
  storage_gb: number;
  ultima_attivita: string | null;
}

interface PlanRow {
  id: string;
  code: string;
  nome: string;
  max_utenti: number;
  max_commesse_anno: number;
  max_storage_gb: number;
  max_tickets_mese: number;
}

interface QuotaRow {
  tenant_id: string;
  max_utenti: number | null;
  max_commesse_anno: number | null;
  max_storage_gb: number | null;
  max_tickets_mese: number | null;
}

interface AuditRow {
  id: string;
  created_at: string;
  tenant_id: string | null;
  entity_type: string;
  action: string;
  metadata: Record<string, unknown> | null;
}

export default async function AdminDashboardPage() {
  await requirePlatformAdmin();
  const supabase = createServiceSupabase();
  const oggi = new Date().toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Tutti i fetch in parallelo
  const [tenantsRes, usageRes, plansRes, quotaRes, auditRes, totalUsersRes] =
    await Promise.all([
      supabase
        .from('tenants')
        .select('id, slug, nome, sospeso, sospeso_motivo, plan_id'),
      supabase
        .from('tenant_usage_snapshot')
        .select(
          'tenant_id, utenti_attivi, commesse_anno, commesse_totali, tickets_mese, storage_gb, ultima_attivita',
        ),
      supabase
        .from('plans')
        .select('id, code, nome, max_utenti, max_commesse_anno, max_storage_gb, max_tickets_mese'),
      supabase
        .from('tenant_quotas')
        .select('tenant_id, max_utenti, max_commesse_anno, max_storage_gb, max_tickets_mese'),
      supabase
        .from('audit_events')
        .select('id, created_at, tenant_id, entity_type, action, metadata')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('attivo', true)
        .eq('is_platform_admin', false),
    ]);

  const tenants = (tenantsRes.data ?? []) as TenantRow[];
  const usage = (usageRes.data ?? []) as UsageRow[];
  const plans = (plansRes.data ?? []) as PlanRow[];
  const quotas = (quotaRes.data ?? []) as QuotaRow[];
  const audit = (auditRes.data ?? []) as AuditRow[];

  const usageByTenant = new Map(usage.map((u) => [u.tenant_id, u]));
  const planById = new Map(plans.map((p) => [p.id, p]));
  const quotaByTenant = new Map(quotas.map((q) => [q.tenant_id, q]));
  const tenantById = new Map(tenants.map((t) => [t.id, t]));

  const tenantsAttivi = tenants.filter((t) => !t.sospeso).length;
  const tenantsSospesi = tenants.filter((t) => t.sospeso).length;
  const utentiTotali = totalUsersRes.count ?? 0;
  const commesseTotali = usage.reduce((s, u) => s + (u.commesse_totali ?? 0), 0);
  const storageGB = usage.reduce((s, u) => s + Number(u.storage_gb ?? 0), 0);

  // ---- Tenants a rischio ----
  function quotaPer(t: TenantRow): {
    max_utenti: number | null;
    max_commesse_anno: number | null;
    max_storage_gb: number | null;
    max_tickets_mese: number | null;
  } {
    const plan = t.plan_id ? planById.get(t.plan_id) : undefined;
    const override = quotaByTenant.get(t.id);
    return {
      max_utenti: override?.max_utenti ?? plan?.max_utenti ?? null,
      max_commesse_anno:
        override?.max_commesse_anno ?? plan?.max_commesse_anno ?? null,
      max_storage_gb: override?.max_storage_gb ?? plan?.max_storage_gb ?? null,
      max_tickets_mese:
        override?.max_tickets_mese ?? plan?.max_tickets_mese ?? null,
    };
  }

  const rischio: Array<{
    tenant: TenantRow;
    metriche: Array<{ label: string; used: number; quota: number | null; ratio: number }>;
  }> = [];
  for (const t of tenants) {
    if (t.sospeso) continue;
    const u = usageByTenant.get(t.id);
    if (!u) continue;
    const q = quotaPer(t);
    const metriche = [
      { label: 'Utenti', used: u.utenti_attivi, quota: q.max_utenti },
      { label: 'Commesse anno', used: u.commesse_anno, quota: q.max_commesse_anno },
      { label: 'Storage (GB)', used: Number(u.storage_gb), quota: q.max_storage_gb },
      { label: 'Tickets mese', used: u.tickets_mese, quota: q.max_tickets_mese },
    ].map((m) => ({
      ...m,
      ratio: m.quota && m.quota > 0 ? m.used / m.quota : 0,
    }));
    if (metriche.some((m) => m.ratio > 0.8)) {
      rischio.push({ tenant: t, metriche });
    }
  }

  // Server Action per il bottone "Aggiorna snapshot"
  async function refreshSnapshot() {
    'use server';
    await aggiornaUsageSnapshot(null);
  }

  return (
    <div className="space-y-8">
      {/* ===== Hero ===== */}
      <header className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-soft">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {oggi}
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
            Platform overview
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Sintesi cross-tenant di SOLVA · impiantiXplus
          </p>
        </div>
        <form action={refreshSnapshot}>
          <Button type="submit" variant="outline" size="sm">
            <RefreshCw className="h-3.5 w-3.5" />
            Aggiorna snapshot
          </Button>
        </form>
      </header>

      {/* ===== KPI ===== */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Tenants attivi"
          value={tenantsAttivi}
          icon={<Building2 />}
          tone="success"
        />
        <KpiCard
          label="Tenants sospesi"
          value={tenantsSospesi}
          icon={<Building2 />}
          tone={tenantsSospesi > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          label="Utenti totali"
          value={utentiTotali}
          icon={<Users />}
          tone="default"
        />
        <KpiCard
          label="Commesse totali"
          value={commesseTotali}
          icon={<Briefcase />}
          tone="default"
        />
        <KpiCard
          label="Storage usato (GB)"
          value={storageGB.toFixed(1)}
          icon={<HardDrive />}
          tone="default"
        />
      </section>

      {/* ===== Tenants a rischio ===== */}
      <section className="space-y-4">
        <SectionHeader
          eyebrow="Quote"
          title="Tenants con quota a rischio"
          description="Tenant dove almeno una metrica supera l'80% del limite del piano."
          icon={<BarChart3 />}
        />
        {rischio.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nessun tenant sopra la soglia. Tutto in regola.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {rischio.map(({ tenant, metriche }) => (
              <Card key={tenant.id} className="overflow-hidden">
                <CardContent className="space-y-3 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/admin/tenants/${tenant.id}`}
                        className="text-base font-semibold tracking-tight hover:text-primary"
                      >
                        {tenant.nome}
                      </Link>
                      <p className="font-mono text-xs text-muted-foreground">
                        {tenant.slug}
                      </p>
                    </div>
                    <TenantStatusBadge sospeso={tenant.sospeso} />
                  </div>
                  <div className="space-y-2.5 pt-1">
                    {metriche
                      .filter((m) => m.ratio > 0.5) // mostra anche metriche "tranquille" se >50% per contesto
                      .sort((a, b) => b.ratio - a.ratio)
                      .map((m) => (
                        <UsageBar
                          key={m.label}
                          label={m.label}
                          used={m.used}
                          quota={m.quota}
                          format={(v) =>
                            m.label.includes('Storage')
                              ? `${Number(v).toFixed(2)}`
                              : String(v)
                          }
                        />
                      ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ===== Attività recente ===== */}
      <section className="space-y-4">
        <SectionHeader
          eyebrow="Attività"
          title="Attività recente cross-tenant"
          description="Ultimi 10 audit_events registrati sull'intera platform."
          icon={<Activity />}
        />
        <Card>
          <CardContent className="divide-y divide-border py-0">
            {audit.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nessun evento registrato.
              </p>
            ) : (
              audit.map((e) => {
                const tenant = e.tenant_id ? tenantById.get(e.tenant_id) : undefined;
                const isPlatform = e.metadata?.platform === true;
                return (
                  <div
                    key={e.id}
                    className="flex flex-wrap items-center gap-3 py-3"
                  >
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {tenant ? tenant.slug : 'PLATFORM'}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {e.entity_type}
                    </span>
                    <span className="text-sm font-medium tracking-tight">
                      {e.action}
                    </span>
                    {isPlatform ? (
                      <Badge className="border-transparent bg-accent/15 text-accent-foreground text-[10px]">
                        platform
                      </Badge>
                    ) : null}
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString('it-IT', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
