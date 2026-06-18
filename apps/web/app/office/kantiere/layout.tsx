import { redirect } from 'next/navigation';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '../../_lib/modules';
import { KantiereSubnav } from './_components/kantiere-subnav';

export default async function KantiereLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenantContext();
  if (!['admin', 'office'].includes(ctx.role)) redirect('/office');
  if (!(await tenantHasModule('kantiere'))) redirect('/office');
  return (
    <>
      <KantiereSubnav />
      {children}
    </>
  );
}
