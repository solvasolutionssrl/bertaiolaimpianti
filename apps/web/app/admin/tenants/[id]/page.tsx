import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Building2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@impiantixplus/ui';
import { createServiceSupabase } from '@impiantixplus/api/service';
import { requirePlatformAdmin } from '../../_lib/guard';
import { TenantStatusBadge } from '../../_components/tenant-status-badge';
import { UsageBar } from '../../_components/usage-bar';
import { TenantDetailHeaderActions } from './_components/header-actions';
import { TabUtenti } from './_components/tab-utenti';
import { TabQuote } from './_components/tab-quote';
import { TabStorage } from './_components/tab-storage';
import { TabBranding } from './_components/tab-branding';
import { TabNoteInterne } from './_components/tab-note-interne';

export const dynamic = 'force-dynamic';

export default async function TenantDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requirePlatformAdmin();
  const supabase = createServiceSupabase();

  const [tenantRes, usageRes, quotaRes, plansRes, utentiRes, auditRes] =
    await Promise.all([
      supabase
        .from('tenants')
        .select('*')
        .eq('id', params.id)
        .maybeSingle(),
      supabase
        .from('tenant_usage_snapshot')
        .select('*')
        .eq('tenant_id', params.id)
        .maybeSingle(),
      supabase
        .from('tenant_quotas')
        .select('*')
        .eq('tenant_id', params.id)
        .maybeSingle(),
      supabase
        .from('plans')
        .select('id, code, nome, prezzo_mensile_eur, max_utenti, max_commesse_anno, max_storage_gb, max_tickets_mese, attivo, ordine')
        .order('ordine'),
      supabase
        .from('users')
        .select('id, display_name, role, attivo, created_at')
        .eq('tenant_id', params.id)
        .order('display_name'),
      supabase
        .from('audit_events')
        .select('id, created_at, entity_type, entity_id, action, actor_role, metadata')
        .eq('tenant_id', params.id)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

  const tenant: any = tenantRes.data;
  if (!tenant) notFound();

  const usage: any = usageRes.data;
  const quota: any = quotaRes.data;
  const plans = (plansRes.data ?? []) as any[];
  const utenti = (utentiRes.data ?? []) as any[];
  const audit = (auditRes.data ?? []) as any[];

  const plan = plans.find((p) => p.id === tenant.plan_id);

  // Recupera email via auth.admin (per ogni user)
  let emailMap = new Map<string, string>();
  if (utenti.length > 0) {
    // batch via listUsers paginato — semplice fallback: page 1, 100 utenti
    const { data: authUsers } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    emailMap = new Map(
      (authUsers?.users ?? []).map((u) => [u.id, u.email ?? '']),
    );
  }

  const utentiConEmail = utenti.map((u) => ({
    ...u,
    email: emailMap.get(u.id) ?? '',
  }));

  // Computed quotas
  function effective(field: 'max_utenti' | 'max_commesse_anno' | 'max_storage_gb' | 'max_tickets_mese'): number | null {
    return (quota?.[field] ?? plan?.[field]) ?? null;
  }

  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div>
        <Link
          href="/admin/tenants"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Torna a Tenants
        </Link>
      </div>
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-soft">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"
            style={
              tenant.brand_color
                ? { backgroundColor: tenant.brand_color, color: '#fff' }
                : undefined
            }
          >
            <Building2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">
              {tenant.nome}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {tenant.slug}
              </span>
              {plan ? (
                <Badge variant="outline" className="text-[10px]">
                  {plan.nome} · € {Number(plan.prezzo_mensile_eur).toFixed(0)}/mese
                </Badge>
              ) : null}
              <TenantStatusBadge
                sospeso={tenant.sospeso}
                motivo={tenant.sospeso_motivo}
              />
            </div>
          </div>
        </div>
        <TenantDetailHeaderActions
          tenantId={tenant.id}
          slug={tenant.slug}
          nome={tenant.nome}
          sospeso={tenant.sospeso}
        />
      </header>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="utenti">Utenti</TabsTrigger>
          <TabsTrigger value="quote">Quote</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="note">Note interne</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        {/* ===== Overview ===== */}
        <TabsContent value="overview">
          <Card>
            <CardContent className="space-y-5 py-6">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Usage corrente
              </h2>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <UsageBar
                  label="Utenti attivi"
                  used={usage?.utenti_attivi ?? 0}
                  quota={effective('max_utenti')}
                />
                <UsageBar
                  label="Commesse anno corrente"
                  used={usage?.commesse_anno ?? 0}
                  quota={effective('max_commesse_anno')}
                />
                <UsageBar
                  label="Storage (GB)"
                  used={Number(usage?.storage_gb ?? 0)}
                  quota={effective('max_storage_gb')}
                  format={(v) => v.toFixed(2)}
                />
                <UsageBar
                  label="Tickets mese corrente"
                  used={usage?.tickets_mese ?? 0}
                  quota={effective('max_tickets_mese')}
                />
              </div>
              <p className="pt-3 font-mono text-[11px] text-muted-foreground">
                Snapshot: {usage?.snapshot_at
                  ? new Date(usage.snapshot_at).toLocaleString('it-IT')
                  : 'mai aggiornato'}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Utenti ===== */}
        <TabsContent value="utenti">
          <TabUtenti tenantId={tenant.id} utenti={utentiConEmail} />
        </TabsContent>

        {/* ===== Quote ===== */}
        <TabsContent value="quote">
          <TabQuote
            tenantId={tenant.id}
            quota={quota}
            plan={plan ?? null}
            plans={plans}
          />
        </TabsContent>

        {/* ===== Storage ===== */}
        <TabsContent value="storage">
          <TabStorage
            tenantId={tenant.id}
            storageProvider={tenant.storage_provider}
            storageConfig={tenant.storage_config ?? {}}
          />
        </TabsContent>

        {/* ===== Branding ===== */}
        <TabsContent value="branding">
          <TabBranding
            tenantId={tenant.id}
            nome={tenant.nome}
            brandColor={tenant.brand_color}
            logoUrl={tenant.logo_url}
            inboundEmail={(tenant.storage_config ?? {})?.inbound_email ?? null}
          />
        </TabsContent>

        {/* ===== Note interne ===== */}
        <TabsContent value="note">
          <TabNoteInterne
            tenantId={tenant.id}
            noteInterne={tenant.note_interne ?? ''}
          />
        </TabsContent>

        {/* ===== Audit ===== */}
        <TabsContent value="audit">
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {audit.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nessun audit event registrato per questo tenant.
                </p>
              ) : (
                audit.map((e: any) => (
                  <div
                    key={e.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {e.entity_type}
                    </span>
                    <span className="font-medium tracking-tight">{e.action}</span>
                    {e.metadata?.platform ? (
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
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
