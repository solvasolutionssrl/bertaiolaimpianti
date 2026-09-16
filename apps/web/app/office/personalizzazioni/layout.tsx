import { redirect } from 'next/navigation';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '../../_lib/modules';

/**
 * Area "Personalizzazioni": funzioni costruite su misura per un singolo
 * cliente. Gated dal modulo `paghe`; chi non ce l'ha non ha nemmeno la voce in
 * menu, ma la porta va chiusa anche qui perche' la sidebar nasconde, non
 * protegge. Solo admin e ufficio: qui dentro ci sono i dati di tutti.
 */
export default async function PersonalizzazioniLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireTenantContext();
  if (!['admin', 'office'].includes(ctx.role)) redirect('/office');
  if (!(await tenantHasModule('paghe'))) redirect('/office');
  return <>{children}</>;
}
