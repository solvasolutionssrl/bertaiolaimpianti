import { redirect } from 'next/navigation';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '../../_lib/modules';

/**
 * Area "Personale" del modulo Dipendenti: pianificazione settimanale, ferie e
 * permessi. Gated dal modulo `dipendenti` (Bertaiola spenta → redirect).
 * Solo admin/office; i tecnici operano dal mobile.
 */
export default async function PersonaleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireTenantContext();
  if (!['admin', 'office'].includes(ctx.role)) redirect('/office');
  if (!(await tenantHasModule('dipendenti'))) redirect('/office');
  return <>{children}</>;
}
