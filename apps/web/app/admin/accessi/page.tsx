import { KeyRound, LogIn, LogOut } from 'lucide-react';
import { Badge, Card, CardContent } from '@kommessa/ui';

import { createServiceSupabase } from '@kommessa/api/service';
import { requirePlatformAdmin } from '../_lib/guard';
import { SectionHeader } from '../../_components/section-header';

export const metadata = { title: 'Platform · Accessi' };
export const dynamic = 'force-dynamic';

const fmt = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

type AccessoRow = {
  id: string;
  tenant_id: string | null;
  email: string | null;
  tipo: 'login' | 'logout';
  user_agent: string | null;
  ip: string | null;
  created_at: string;
};

/** Riassunto device dal user-agent (best-effort, leggibile). */
function device(ua: string | null): string {
  if (!ua) return '—';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Altro';
}

export default async function AccessiPage() {
  await requirePlatformAdmin();
  const sb = createServiceSupabase();

  const { data, error } = (await sb
    .from('auth_events' as never)
    .select('id, tenant_id, email, tipo, user_agent, ip, created_at')
    .order('created_at', { ascending: false })
    .limit(200)) as { data: AccessoRow[] | null; error: { message?: string } | null };

  const rows = data ?? [];

  // Nomi tenant
  const tenantIds = [...new Set(rows.map((r) => r.tenant_id).filter(Boolean))] as string[];
  const tenantMap = new Map<string, string>();
  if (tenantIds.length > 0) {
    const { data: tens } = await sb.from('tenants').select('id, nome').in('id', tenantIds);
    for (const t of (tens as { id: string; nome: string }[] | null) ?? []) tenantMap.set(t.id, t.nome);
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Platform · Sicurezza"
        title="Accessi"
        description="Login e logout degli utenti su tutti i tenant. Tracciamento best-effort."
        icon={<KeyRound />}
      />

      {error ? (
        <Card>
          <CardContent className="space-y-1 py-6 text-sm">
            <p className="font-medium text-amber-600">Tracciamento non ancora attivo</p>
            <p className="text-muted-foreground">
              La tabella <code className="font-mono">auth_events</code> non è ancora presente:
              applica la migration <code className="font-mono">20260625010000_auth_events.sql</code>{' '}
              (es. <code className="font-mono">supabase db push</code>). Da quel momento ogni
              login/logout verrà registrato qui.
            </p>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nessun accesso registrato finora.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">Quando</th>
                    <th className="px-3 py-2.5 font-medium">Evento</th>
                    <th className="px-3 py-2.5 font-medium">Utente</th>
                    <th className="px-3 py-2.5 font-medium">Tenant</th>
                    <th className="px-3 py-2.5 font-medium">Device</th>
                    <th className="px-3 py-2.5 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => {
                    const login = r.tipo === 'login';
                    return (
                      <tr key={r.id} className="transition-colors hover:bg-muted/20">
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">
                          {fmt.format(new Date(r.created_at))}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={
                              'inline-flex items-center gap-1 text-xs font-medium ' +
                              (login ? 'text-emerald-600' : 'text-muted-foreground')
                            }
                          >
                            {login ? <LogIn className="h-3.5 w-3.5" /> : <LogOut className="h-3.5 w-3.5" />}
                            {login ? 'Login' : 'Logout'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-medium tracking-tight">{r.email ?? '—'}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {r.tenant_id ? tenantMap.get(r.tenant_id) ?? '—' : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant="outline" className="font-normal text-muted-foreground">
                            {device(r.user_agent)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                          {r.ip ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-right font-mono text-[11px] text-muted-foreground">
        {rows.length} eventi{rows.length === 200 ? ' (cap 200)' : ''} ·{' '}
        {new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}
      </p>
    </div>
  );
}
