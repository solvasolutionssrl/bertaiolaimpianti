import { Users } from 'lucide-react';
import { Badge, Card, CardContent } from '@impiantixplus/ui';
import { createServiceSupabase } from '@impiantixplus/api/service';
import { requirePlatformAdmin } from '../_lib/guard';
import { SectionHeader } from '../../_components/section-header';
import { UtentiToolbar } from './_components/toolbar';
import { UtentiRowActions } from './_components/row-actions';

export const metadata = { title: 'Platform · Utenti globali' };
export const dynamic = 'force-dynamic';

interface SP {
  q?: string;
  tenant?: string;
  role?: string;
}

export default async function UtentiPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  await requirePlatformAdmin();
  const supabase = createServiceSupabase();

  const [usersRes, tenantsRes, authRes] = await Promise.all([
    supabase
      .from('users')
      .select('id, display_name, role, attivo, tenant_id, is_platform_admin, created_at, tenant:tenants(nome, slug)')
      .order('display_name'),
    supabase.from('tenants').select('id, nome, slug').order('nome'),
    supabase.auth.admin.listUsers({ page: 1, perPage: 500 }),
  ]);

  const tenants = (tenantsRes.data ?? []) as Array<{
    id: string;
    nome: string;
    slug: string;
  }>;
  const users = (usersRes.data ?? []) as any[];
  const emailMap = new Map(
    (authRes.data?.users ?? []).map((u) => [u.id, u.email ?? '']),
  );
  const lastSignInMap = new Map(
    (authRes.data?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]),
  );

  const q = (searchParams.q ?? '').toLowerCase().trim();
  const filterTenant = searchParams.tenant ?? '';
  const filterRole = searchParams.role ?? '';

  const filtered = users.filter((u) => {
    const t = Array.isArray(u.tenant) ? u.tenant[0] : u.tenant;
    const email = emailMap.get(u.id) ?? '';
    if (filterTenant && (filterTenant === '__platform__' ? !u.is_platform_admin : t?.slug !== filterTenant))
      return false;
    if (filterRole && u.role !== filterRole) return false;
    if (q) {
      const hay = `${u.display_name ?? ''} ${email} ${t?.nome ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Platform"
        title="Utenti globali"
        description={`${filtered.length} utenti su ${users.length} totali (cross-tenant).`}
        icon={<Users />}
      />
      <UtentiToolbar tenants={tenants} />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Nome</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Tenant</th>
                  <th className="px-4 py-2 font-medium">Ruolo</th>
                  <th className="px-4 py-2 font-medium">Stato</th>
                  <th className="px-4 py-2 font-medium">Ultimo accesso</th>
                  <th className="px-4 py-2 text-right font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      Nessun utente corrispondente al filtro.
                    </td>
                  </tr>
                ) : (
                  filtered.map((u) => {
                    const t = Array.isArray(u.tenant) ? u.tenant[0] : u.tenant;
                    const email = emailMap.get(u.id) ?? '—';
                    const lastSignIn = lastSignInMap.get(u.id);
                    return (
                      <tr key={u.id}>
                        <td className="px-4 py-2 font-medium">
                          {u.display_name ?? '—'}
                          {u.is_platform_admin ? (
                            <Badge className="ml-2 border-transparent bg-accent text-accent-foreground text-[10px]">
                              PLATFORM
                            </Badge>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">{email}</td>
                        <td className="px-4 py-2 text-xs">
                          {t ? (
                            <span>
                              {t.nome}{' '}
                              <span className="font-mono text-muted-foreground">
                                ({t.slug})
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant="outline" className="text-[10px]">
                            {u.role}
                          </Badge>
                        </td>
                        <td className="px-4 py-2">
                          {u.attivo ? (
                            <Badge
                              variant="outline"
                              className="border-success/30 text-success"
                            >
                              Attivo
                            </Badge>
                          ) : (
                            <Badge variant="destructive">Disattivato</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                          {lastSignIn
                            ? new Date(lastSignIn).toLocaleDateString('it-IT')
                            : '—'}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <UtentiRowActions userId={u.id} attivo={u.attivo} />
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
