import Link from 'next/link';
import { Building2, Plus, UserCheck } from 'lucide-react';
import { Badge, Button, Card, CardContent } from '@kommessa/ui';
import { createServiceSupabase } from '@kommessa/api/service';
import { requirePlatformAdmin } from '../_lib/guard';
import { TenantStatusBadge } from '../_components/tenant-status-badge';
import { SectionHeader } from '../../_components/section-header';
import { TenantsSearch } from './_components/tenants-search';
import { TenantRowActions } from './_components/tenant-row-actions';

export const metadata = { title: 'Platform · Tenants' };
export const dynamic = 'force-dynamic';

interface Props {
  searchParams: { q?: string; reason?: string };
}

export default async function TenantsListPage({ searchParams }: Props) {
  await requirePlatformAdmin();
  const supabase = createServiceSupabase();
  const q = (searchParams.q ?? '').trim();
  // Hint mostrato quando un platform_admin viene reindirizzato qui da
  // /office perché non ha un tenant nel proprio JWT — vedi office/layout.tsx.
  const pickTenantHint = searchParams.reason === 'pick_tenant';

  let query = supabase
    .from('tenants')
    .select(
      'id, slug, nome, sospeso, sospeso_motivo, plan_id, brand_color, created_at',
    )
    .order('nome');

  if (q) {
    // ilike OR su nome e slug
    query = query.or(`nome.ilike.%${q}%,slug.ilike.%${q}%`);
  }

  const [tenantsRes, usageRes, plansRes] = await Promise.all([
    query,
    supabase
      .from('tenant_usage_snapshot')
      .select(
        'tenant_id, utenti_attivi, commesse_anno, storage_gb, ultima_attivita',
      ),
    supabase.from('plans').select('id, code, nome, max_utenti'),
  ]);

  const tenants = (tenantsRes.data ?? []) as Array<{
    id: string;
    slug: string;
    nome: string;
    sospeso: boolean;
    sospeso_motivo: string | null;
    plan_id: string | null;
    brand_color: string | null;
    created_at: string;
  }>;

  const usageById = new Map(
    (usageRes.data ?? []).map((u: any) => [u.tenant_id, u]),
  );
  const planById = new Map(
    (plansRes.data ?? []).map((p: any) => [p.id, p]),
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Platform"
        title="Tenants"
        description={`${tenants.length} tenant${tenants.length === 1 ? '' : ' totali'} sulla platform.`}
        icon={<Building2 />}
        actions={
          <Button asChild>
            <Link href="/admin/tenants/nuovo">
              <Plus className="h-4 w-4" />
              Nuovo tenant
            </Link>
          </Button>
        }
      />

      {pickTenantHint ? (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <UserCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="flex-1">
            Non hai un tenant nel tuo JWT. Scegli un tenant qui sotto e clicca{' '}
            <strong>Impersona tenant</strong> nel menù delle azioni per
            entrare in <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-mono">/office</code>.
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <TenantsSearch />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">Slug</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Utenti</th>
                  <th className="px-4 py-3 font-medium">Commesse anno</th>
                  <th className="px-4 py-3 font-medium">Storage GB</th>
                  <th className="px-4 py-3 font-medium">Ultima attività</th>
                  <th className="px-4 py-3 font-medium">Stato</th>
                  <th className="px-4 py-3 text-right font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tenants.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                      {q
                        ? `Nessun tenant per “${q}”.`
                        : 'Nessun tenant. Crea il primo dal pulsante "Nuovo tenant".'}
                    </td>
                  </tr>
                ) : (
                  tenants.map((t) => {
                    const u: any = usageById.get(t.id);
                    const p: any = t.plan_id ? planById.get(t.plan_id) : null;
                    // Counter "ok" tone:
                    //  - Utenti attivi > 0 → verde (tenant vivo)
                    //  - Commesse anno > 0 → verde
                    //  - Storage > 0 → verde
                    //  - Ultima attività entro 7 giorni → verde
                    const utentiOk = (u?.utenti_attivi ?? 0) > 0 && !t.sospeso;
                    const commesseOk = (u?.commesse_anno ?? 0) > 0 && !t.sospeso;
                    const storageOk = Number(u?.storage_gb ?? 0) > 0 && !t.sospeso;
                    const lastAct = u?.ultima_attivita
                      ? new Date(u.ultima_attivita)
                      : null;
                    const isActive7d =
                      lastAct &&
                      Date.now() - lastAct.getTime() < 7 * 24 * 60 * 60 * 1000;
                    return (
                      <tr
                        key={t.id}
                        className="group transition-colors hover:bg-emerald-500/[0.02]"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/tenants/${t.id}`}
                            className="font-medium tracking-tight hover:text-primary"
                          >
                            {t.nome}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs">{t.slug}</span>
                        </td>
                        <td className="px-4 py-3">
                          {p ? (
                            <Badge variant="outline" className="text-[10px]">
                              {p.nome}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td
                          className={
                            'px-4 py-3 font-mono text-xs tabular-nums ' +
                            (utentiOk ? 'text-emerald-700 dark:text-emerald-400' : '')
                          }
                        >
                          {u?.utenti_attivi ?? 0}
                          {p ? (
                            <span className="text-muted-foreground"> / {p.max_utenti}</span>
                          ) : null}
                        </td>
                        <td
                          className={
                            'px-4 py-3 font-mono text-xs tabular-nums ' +
                            (commesseOk ? 'text-emerald-700 dark:text-emerald-400' : '')
                          }
                        >
                          {u?.commesse_anno ?? 0}
                        </td>
                        <td
                          className={
                            'px-4 py-3 font-mono text-xs tabular-nums ' +
                            (storageOk ? 'text-emerald-700 dark:text-emerald-400' : '')
                          }
                        >
                          {u?.storage_gb ? Number(u.storage_gb).toFixed(2) : '0.00'}
                        </td>
                        <td
                          className={
                            'px-4 py-3 font-mono text-xs ' +
                            (isActive7d
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-muted-foreground')
                          }
                        >
                          {lastAct
                            ? lastAct.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' })
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <TenantStatusBadge
                            sospeso={t.sospeso}
                            motivo={t.sospeso_motivo}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <TenantRowActions
                            tenantId={t.id}
                            tenantNome={t.nome}
                            slug={t.slug}
                            sospeso={t.sospeso}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
