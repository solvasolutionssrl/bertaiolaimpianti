import { requirePlatformAdmin } from './_lib/guard';
import { AdminShellClient } from './_components/admin-shell-client';

/**
 * Layout dell'area `/admin/*` (SOLVA Platform).
 *
 * Identità visiva DELIBERATAMENTE distinta dalla UI tenant (`/office/*`):
 * niente TenantBranding, niente palette blu/arancio Bertaiola.
 * Usiamo invece una shell ink-near-black con accent arancio SOLVA per
 * comunicare "stai fuori dal tenant, sei a livello platform".
 *
 * Guard: `requirePlatformAdmin()` redireziona a:
 *   - `/login?next=/admin` se anonimo
 *   - `/office` se loggato come tenant user senza flag platform_admin
 */
export const metadata = { title: 'SOLVA · Platform' };
export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requirePlatformAdmin();

  return (
    <AdminShellClient
      user={{ name: ctx.email.split('@')[0] ?? 'admin', email: ctx.email }}
    >
      {children}
    </AdminShellClient>
  );
}
